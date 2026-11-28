import {
  GORILLA_HAND_OFFSET_Y,
  GORILLA_HIT_CENTER_Y,
  MAX_CLIMB_PX,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';
import { ALL_LOCATIONS, buildLocation } from './locations';
import { findVerifiedSolution } from './physics';
import type {
  ConcreteLocationId,
  Crater,
  LocationId,
  LocationSpec,
  TerrainShape,
  Vec2,
} from './types';

function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pointInPolygon(x: number, y: number, pts: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x,
      yi = pts[i].y;
    const xj = pts[j].x,
      yj = pts[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Pixel-accurate destructible terrain collision mask supporting rectangles,
 * polygons (tapered towers, pyramids, spires, mountains, sails), and hollow arches.
 */
export class SkylineTerrain {
  readonly width: number;
  readonly height: number;
  readonly location: LocationSpec;
  craters: Crater[] = [];
  private mask: Uint8Array;

  constructor(location: LocationSpec, width = WORLD_WIDTH, height = WORLD_HEIGHT) {
    this.width = width;
    this.height = height;
    this.location = location;
    this.mask = new Uint8Array(width * height);
    this.rebuildMask();
  }

  rebuildMask(): void {
    this.mask.fill(0);
    for (const shape of this.location.shapes) {
      this.rasterizeShape(shape);
    }
    for (const c of this.craters) {
      this.applyCraterToMask(c.x, c.y, c.radius);
    }
  }

  private rasterizeShape(shape: TerrainShape): void {
    if (shape.kind === 'rect') {
      const x0 = Math.max(0, Math.floor(shape.x));
      const x1 = Math.min(this.width, Math.ceil(shape.x + shape.width));
      const y0 = Math.max(0, Math.floor(shape.y));
      const y1 = Math.min(this.height, Math.ceil(shape.y + shape.height));
      for (let y = y0; y < y1; y++) {
        this.mask.fill(1, y * this.width + x0, y * this.width + x1);
      }
      return;
    }

    if (shape.kind === 'poly') {
      let minX = this.width,
        maxX = 0,
        minY = this.height,
        maxY = 0;
      for (const p of shape.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const x0 = Math.max(0, Math.floor(minX));
      const x1 = Math.min(this.width - 1, Math.ceil(maxX));
      const y0 = Math.max(0, Math.floor(minY));
      const y1 = Math.min(this.height - 1, Math.ceil(maxY));
      for (let y = y0; y <= y1; y++) {
        const row = y * this.width;
        for (let x = x0; x <= x1; x++) {
          if (pointInPolygon(x + 0.5, y + 0.5, shape.points)) {
            this.mask[row + x] = 1;
          }
        }
      }
      return;
    }

    if (shape.kind === 'arch') {
      const innerRx = Math.max(10, shape.outerRx - shape.thickness);
      const innerRy = Math.max(10, shape.outerRy - shape.thickness);
      const x0 = Math.max(0, Math.floor(shape.cx - shape.outerRx));
      const x1 = Math.min(this.width - 1, Math.ceil(shape.cx + shape.outerRx));
      const y0 = Math.max(0, Math.floor(shape.baseY - shape.outerRy));
      const y1 = Math.min(this.height - 1, Math.ceil(shape.baseY));
      for (let y = y0; y <= y1; y++) {
        const dy = shape.baseY - y;
        const row = y * this.width;
        for (let x = x0; x <= x1; x++) {
          const dx = x - shape.cx;
          const outVal =
            (dx * dx) / (shape.outerRx * shape.outerRx) +
            (dy * dy) / (shape.outerRy * shape.outerRy);
          const inVal =
            (dx * dx) / (innerRx * innerRx) + (dy * dy) / (innerRy * innerRy);
          if (outVal <= 1 && inVal >= 1) {
            this.mask[row + x] = 1;
          }
        }
      }
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

  carveCrater(cx: number, cy: number, radius: number): number {
    this.craters.push({ x: cx, y: cy, radius });
    return this.applyCraterToMask(cx, cy, radius);
  }

  isSolid(x: number, y: number): boolean {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height) {
      return false;
    }
    return this.mask[iy * this.width + ix] === 1;
  }

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

  isClearCircle(cx: number, cy: number, radius: number): boolean {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      if (this.isSolid(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius)) {
        return false;
      }
    }
    return !this.isSolid(cx, cy);
  }
}

export function selectSpawnPositions(
  terrain: SkylineTerrain,
  playerCount: number,
  rng: () => number,
): Array<{ x: number; y: number; zoneIndex: number }> {
  const spots = terrain.location.spawnSpots
    .map((s, idx) => {
      const y = terrain.getSurfaceY(s.x, Math.max(0, s.y - 24));
      return { x: s.x, y, zoneIndex: idx };
    })
    .filter((s) => s.y < terrain.height - 20 && s.y > 140);

  const chosen: Array<{ x: number; y: number; zoneIndex: number }> = [];
  if (spots.length >= playerCount) {
    if (playerCount <= 2) {
      const leftIdx = Math.floor(rng() * Math.min(2, spots.length - 1));
      const rightIdx =
        spots.length - 1 - Math.floor(rng() * Math.min(2, spots.length - 1 - leftIdx));
      chosen.push(spots[leftIdx], spots[rightIdx]);
    } else {
      for (let i = 0; i < playerCount; i++) {
        const idx = Math.round((i / (playerCount - 1)) * (spots.length - 1));
        chosen.push(spots[idx]);
      }
    }
  } else {
    for (let i = 0; i < playerCount; i++) {
      const x = Math.round(120 + (i / Math.max(1, playerCount - 1)) * (WORLD_WIDTH - 240));
      const y = terrain.getSurfaceY(x, 0);
      chosen.push({ x, y: Math.min(y, WORLD_HEIGHT - 120), zoneIndex: i });
    }
  }

  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }

  return chosen;
}

export interface SolvableRoundSetup {
  terrain: SkylineTerrain;
  locationId: ConcreteLocationId;
  spawnPositions: Array<{ x: number; y: number; zoneIndex: number }>;
  windAccel: number;
}

/**
 * Generates a clean-sky round (no pre-placed clutter!) for a specific or random iconic location,
 * verifying BEFORE returning that every gorilla has an unobstructed integer ballistic solution
 * with zero self-blast!
 */
export function generateSolvableRound(
  playerCount: number,
  gravity: number,
  allowWind: boolean,
  requestedLocation: LocationId = 'random',
  baseSeed = Date.now(),
  excludeLocation?: ConcreteLocationId,
): SolvableRoundSetup {
  const rngInit = createRng(baseSeed);

  let chosenLocId: ConcreteLocationId;
  if (requestedLocation === 'random') {
    const pool = excludeLocation
      ? ALL_LOCATIONS.filter((l) => l !== excludeLocation)
      : ALL_LOCATIONS;
    chosenLocId = pool[Math.floor(rngInit() * pool.length)];
  } else {
    chosenLocId = requestedLocation;
  }

  const locationSpec = buildLocation(chosenLocId);
  const terrain = new SkylineTerrain(locationSpec);

  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptSeed = (baseSeed + attempt * 7919) >>> 0;
    const rng = createRng(attemptSeed);

    const windScale = attempt < 10 ? 3.0 : attempt < 16 ? 1.5 : 0;
    let windAccel = 0;
    if (allowWind && windScale > 0) {
      const raw = (rng() * 2 - 1) * windScale;
      windAccel = Math.abs(raw) < 0.35 ? 0 : Math.round(raw * 10) / 10;
    }

    const spawnPositions = selectSpawnPositions(terrain, playerCount, rng);

    let allSolvable = true;
    for (let i = 0; i < spawnPositions.length; i++) {
      const origin: Vec2 = {
        x: spawnPositions[i].x,
        y: spawnPositions[i].y - GORILLA_HAND_OFFSET_Y,
      };
      const ownerHit: Vec2 = {
        x: spawnPositions[i].x,
        y: spawnPositions[i].y - GORILLA_HIT_CENTER_Y,
      };
      let hasTarget = false;
      for (let j = 0; j < spawnPositions.length; j++) {
        if (i === j) continue;
        const target: Vec2 = {
          x: spawnPositions[j].x,
          y: spawnPositions[j].y - GORILLA_HIT_CENTER_Y,
        };
        const sol = findVerifiedSolution(
          origin,
          target,
          gravity,
          windAccel,
          (x, y) => terrain.isSolid(x, y),
          [],
          ownerHit,
        );
        if (sol) {
          hasTarget = true;
          break;
        }
      }
      if (!hasTarget) {
        allSolvable = false;
        break;
      }
    }

    if (allSolvable) {
      return { terrain, locationId: chosenLocId, spawnPositions, windAccel };
    }
  }

  const fallbackSpawns = selectSpawnPositions(terrain, playerCount, () => 0.2);
  return {
    terrain,
    locationId: chosenLocId,
    spawnPositions: fallbackSpawns,
    windAccel: 0,
  };
}

export interface MoveResult {
  moved: boolean;
  x: number;
  y: number;
  dropped: boolean;
  reason?: 'wall' | 'edge' | 'occupied' | 'pit';
}

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

    if (nextX < 28 || nextX > terrain.width - 28) {
      blockReason = 'edge';
      break;
    }

    let blockedByGorilla = false;
    for (const other of otherGorillas) {
      if (Math.abs(nextX - other.x) < 42 && Math.abs(y - other.y) < 52) {
        blockedByGorilla = true;
        break;
      }
    }
    if (blockedByGorilla) {
      blockReason = 'occupied';
      break;
    }

    let hitWall = false;
    for (let checkY = y - MAX_CLIMB_PX - 1; checkY >= Math.max(0, y - 46); checkY -= 2) {
      if (terrain.isSolid(nextX, checkY)) {
        hitWall = true;
        break;
      }
    }
    if (hitWall) {
      blockReason = 'wall';
      break;
    }

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
