import {
  GORILLA_HAND_OFFSET_Y,
  MAX_CLIMB_PX,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';
import { findVerifiedSolution } from './physics';
import type { Building, Crater, Vec2 } from './types';

function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ROOF_STYLES: Building['roofStyle'][] = ['flat', 'antenna', 'watertower', 'stepped'];

/**
 * Generates a balanced procedural skyscraper skyline spanning [0, width].
 */
export function generateSkyline(
  width = WORLD_WIDTH,
  height = WORLD_HEIGHT,
  seed = Date.now(),
  maxHeightCap = 365,
): Building[] {
  const rng = createRng(seed);
  const buildings: Building[] = [];

  const targetCount = 12;
  const avgWidth = width / targetCount;
  let cursorX = 0;

  // Choose an interesting skyline silhouette pattern (valley, hill, or classic city)
  const profile = Math.floor(rng() * 3);

  for (let i = 0; i < targetCount; i++) {
    const remaining = targetCount - i;
    const isLast = remaining === 1;
    const rawWidth = isLast
      ? width - cursorX
      : Math.round(avgWidth * (0.78 + rng() * 0.44));
    const clampedWidth = isLast
      ? width - cursorX
      : Math.min(rawWidth, width - cursorX - (remaining - 1) * 68);

    const t = i / (targetCount - 1); // 0..1 across screen
    let minH = 140;
    let maxH = Math.min(340, maxHeightCap);

    if (profile === 0) {
      // Taller in the middle (classic Gorillas arch challenge)
      const centerBoost = Math.sin(t * Math.PI) * 105;
      minH = 130 + centerBoost * 0.5;
      maxH = Math.min(maxHeightCap, 260 + centerBoost);
    } else if (profile === 1) {
      // Stepped valley
      const edgeBoost = Math.abs(t - 0.5) * 135;
      minH = 135 + edgeBoost * 0.4;
      maxH = Math.min(maxHeightCap, 255 + edgeBoost);
    } else {
      // Varied skyline
      minH = 135;
      maxH = Math.min(maxHeightCap, 350);
    }

    // Keep outer edge buildings slightly below extreme height so spawns feel open
    if (i === 0 || i === targetCount - 1) {
      maxH = Math.min(maxH, 285);
    }

    const effectiveMin = Math.min(minH, maxH - 20);
    const bHeight = Math.round(effectiveMin + rng() * Math.max(1, maxH - effectiveMin));
    const topY = height - bHeight;

    const windowCols = Math.max(2, Math.floor((clampedWidth - 18) / 18));
    const windowRows = Math.max(4, Math.floor((bHeight - 24) / 22));

    buildings.push({
      x: Math.round(cursorX),
      width: Math.round(clampedWidth),
      height: bHeight,
      topY,
      colorIndex: i % 4,
      windowCols,
      windowRows,
      windowSeed: Math.floor(rng() * 100000),
      roofStyle: ROOF_STYLES[Math.floor(rng() * ROOF_STYLES.length)],
    });

    cursorX += Math.round(clampedWidth);
  }

  return buildings;
}

/**
 * Picks well-spaced building indices for 2-4 gorillas so everyone has room.
 */
export function selectSpawnBuildings(
  buildings: Building[],
  playerCount: number,
  rng: () => number = Math.random,
): number[] {
  const n = buildings.length;
  if (playerCount <= 2) {
    const leftIdx = 1 + Math.floor(rng() * 2); // building 1 or 2
    const rightIdx = n - 2 - Math.floor(rng() * 2); // building n-2 or n-3
    return [leftIdx, rightIdx];
  }
  if (playerCount === 3) {
    const leftIdx = 1;
    const midIdx = Math.floor(n / 2) + (rng() < 0.5 ? -1 : 0);
    const rightIdx = n - 2;
    return [leftIdx, midIdx, rightIdx];
  }
  // 4 players: spread across 4 zones
  const step = (n - 2) / 3;
  return [
    1,
    Math.round(1 + step),
    Math.round(1 + step * 2),
    n - 2,
  ];
}

/**
 * Pixel-accurate destructible terrain collision mask backed by a Uint8Array.
 * Independent of Canvas DOM so it can be unit-tested in Node and shared across themes.
 */
export class SkylineTerrain {
  readonly width: number;
  readonly height: number;
  buildings: Building[];
  craters: Crater[] = [];
  private mask: Uint8Array;

  constructor(
    buildings: Building[],
    width = WORLD_WIDTH,
    height = WORLD_HEIGHT,
  ) {
    this.width = width;
    this.height = height;
    this.buildings = buildings;
    this.mask = new Uint8Array(width * height);
    this.rebuildMask();
  }

  rebuildMask(): void {
    this.mask.fill(0);
    for (const b of this.buildings) {
      const startX = Math.max(0, Math.floor(b.x));
      const endX = Math.min(this.width, Math.ceil(b.x + b.width));
      const startY = Math.max(0, Math.floor(b.topY));
      for (let y = startY; y < this.height; y++) {
        const rowOffset = y * this.width;
        this.mask.fill(1, rowOffset + startX, rowOffset + endX);
      }
    }
    for (const c of this.craters) {
      this.applyCraterToMask(c.x, c.y, c.radius);
    }
  }

  private applyCraterToMask(cx: number, cy: number, radius: number): number {
    const r2 = radius * radius;
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + radius));

    let destroyed = 0;
    for (let y = minY; y <= maxY; y++) {
      const dy = y - cy;
      const dy2 = dy * dy;
      const rowOffset = y * this.width;
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        if (dx * dx + dy2 <= r2) {
          const idx = rowOffset + x;
          if (this.mask[idx] === 1) {
            this.mask[idx] = 0;
            destroyed++;
          }
        }
      }
    }
    return destroyed;
  }

  /**
   * Carves a circular crater into the skyline and returns the number of solid pixels destroyed.
   */
  carveCrater(cx: number, cy: number, radius: number): number {
    this.craters.push({ x: cx, y: cy, radius });
    return this.applyCraterToMask(cx, cy, radius);
  }

  /**
   * Returns true if the world pixel (x, y) is currently solid skyscraper masonry.
   */
  isSolid(x: number, y: number): boolean {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height) {
      return false;
    }
    return this.mask[iy * this.width + ix] === 1;
  }

  /**
   * Finds the highest solid Y pixel at column x (or height if completely destroyed).
   */
  getSurfaceY(x: number, startY = 0): number {
    const ix = Math.max(0, Math.min(this.width - 1, Math.round(x)));
    const sy = Math.max(0, Math.floor(startY));
    for (let y = sy; y < this.height; y++) {
      if (this.mask[y * this.width + ix] === 1) {
        return y;
      }
    }
    return this.height;
  }

  /**
   * Finds the building index covering horizontal coordinate x.
   */
  getBuildingIndexAt(x: number): number {
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (x >= b.x && x < b.x + b.width) {
        return i;
      }
    }
    return Math.max(0, Math.min(this.buildings.length - 1, x < 0 ? 0 : this.buildings.length - 1));
  }
}

export interface SolvableRoundSetup {
  terrain: SkylineTerrain;
  spawnIndices: number[];
  windAccel: number;
}

/**
 * Generates a skyline, spawn positions, and wind acceleration, verifying BEFORE returning
 * that every spawned gorilla has at least one unobstructed integer ballistic solution to an opponent.
 */
export function generateSolvableRound(
  playerCount: number,
  gravity: number,
  allowWind: boolean,
  baseSeed = Date.now(),
): SolvableRoundSetup {
  const maxAttempts = 30;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptSeed = (baseSeed + attempt * 7919) >>> 0;
    const rng = createRng(attemptSeed);

    // Gradually relax max building height & wind if earlier rolls were too extreme
    const heightCap = attempt < 12 ? 360 : attempt < 22 ? 285 : 225;
    const windScale = attempt < 15 ? 3.2 : attempt < 24 ? 1.8 : 0;

    const buildings = generateSkyline(WORLD_WIDTH, WORLD_HEIGHT, attemptSeed, heightCap);
    const terrain = new SkylineTerrain(buildings);

    let windAccel = 0;
    if (allowWind && windScale > 0) {
      const raw = (rng() * 2 - 1) * windScale;
      windAccel = Math.abs(raw) < 0.35 ? 0 : Math.round(raw * 10) / 10;
    }

    const baseSpawns = selectSpawnBuildings(buildings, playerCount, rng);
    // Shuffle spawns deterministically using rng
    const spawnIndices = [...baseSpawns];
    for (let i = spawnIndices.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [spawnIndices[i], spawnIndices[j]] = [spawnIndices[j], spawnIndices[i]];
    }

    const positions = spawnIndices.map((bIdx) => {
      const b = buildings[bIdx];
      return {
        x: Math.round(b.x + b.width / 2),
        y: b.topY,
      };
    });

    // Verify that EVERY gorilla has a verified unobstructed integer shot to at least one opponent
    let allSolvable = true;
    for (let i = 0; i < positions.length; i++) {
      const origin: Vec2 = { x: positions[i].x, y: positions[i].y - GORILLA_HAND_OFFSET_Y };
      let hasAnyTarget = false;
      for (let j = 0; j < positions.length; j++) {
        if (i === j) continue;
        const target: Vec2 = { x: positions[j].x, y: positions[j].y - 22 };
        const sol = findVerifiedSolution(
          origin,
          target,
          gravity,
          windAccel,
          (x, y) => terrain.isSolid(x, y),
        );
        if (sol) {
          hasAnyTarget = true;
          break;
        }
      }
      if (!hasAnyTarget) {
        allSolvable = false;
        break;
      }
    }

    if (allSolvable) {
      return { terrain, spawnIndices, windAccel };
    }
  }

  // Deterministic guaranteed-solvable fallback (flat moderate rooftops, zero wind)
  const fallbackBuildings = generateSkyline(WORLD_WIDTH, WORLD_HEIGHT, baseSeed, 200);
  const terrain = new SkylineTerrain(fallbackBuildings);
  const spawnIndices = selectSpawnBuildings(fallbackBuildings, playerCount, () => 0.25);
  return { terrain, spawnIndices, windAccel: 0 };
}

export interface MoveResult {
  moved: boolean;
  x: number;
  y: number;
  dropped: boolean;
  reason?: 'wall' | 'edge' | 'occupied' | 'pit';
}

/**
 * Moves a gorilla horizontally by `deltaX` pixels under the downhill-only rule:
 * - Cannot climb up a building wall (blocked if solid terrain rises > MAX_CLIMB_PX above feet)
 * - Can walk freely across flat rooftops and drop down onto lower roofs or crater floors
 * - Cannot walk off screen edges, into another gorilla, or into a bottomless pit
 */
export function tryMoveGorilla(
  terrain: SkylineTerrain,
  currentX: number,
  currentY: number,
  deltaX: number,
  otherGorillas: Vec2[],
): MoveResult {
  const dir = Math.sign(deltaX);
  const steps = Math.abs(Math.round(deltaX));
  if (dir === 0 || steps === 0) {
    return { moved: false, x: currentX, y: currentY, dropped: false };
  }

  let x = currentX;
  let y = currentY;
  let movedAny = false;
  let droppedAny = false;
  let blockReason: MoveResult['reason'];

  for (let s = 0; s < steps; s++) {
    const nextX = x + dir;

    if (nextX < 24 || nextX > terrain.width - 24) {
      blockReason = 'edge';
      break;
    }

    // Prevent stepping onto another gorilla
    let blockedByGorilla = false;
    for (const other of otherGorillas) {
      if (Math.abs(nextX - other.x) < 34 && Math.abs(y - other.y) < 40) {
        blockedByGorilla = true;
        break;
      }
    }
    if (blockedByGorilla) {
      blockReason = 'occupied';
      break;
    }

    // Check if there is a wall rising higher than MAX_CLIMB_PX above our feet (no climbing!)
    let hitWall = false;
    for (let checkY = y - MAX_CLIMB_PX - 1; checkY >= Math.max(0, y - 34); checkY -= 2) {
      if (terrain.isSolid(nextX, checkY)) {
        hitWall = true;
        break;
      }
    }
    if (hitWall) {
      blockReason = 'wall';
      break;
    }

    // Find ground directly at or below feet (allowing up to MAX_CLIMB_PX smoothness for tiny crater edges)
    const groundY = terrain.getSurfaceY(nextX, Math.max(0, y - MAX_CLIMB_PX));
    if (groundY >= terrain.height - 4) {
      blockReason = 'pit';
      break;
    }

    if (groundY > y + 6) {
      droppedAny = true;
    }

    x = nextX;
    y = groundY;
    movedAny = true;
  }

  return {
    moved: movedAny,
    x,
    y,
    dropped: droppedAny,
    reason: movedAny ? undefined : blockReason,
  };
}

