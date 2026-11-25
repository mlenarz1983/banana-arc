import { WORLD_HEIGHT, WORLD_WIDTH } from './constants';
import type { Building, Crater } from './types';

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
    let maxH = 340;

    if (profile === 0) {
      // Taller in the middle (classic Gorillas arch challenge)
      const centerBoost = Math.sin(t * Math.PI) * 110;
      minH = 130 + centerBoost * 0.55;
      maxH = 265 + centerBoost;
    } else if (profile === 1) {
      // Stepped valley
      const edgeBoost = Math.abs(t - 0.5) * 140;
      minH = 135 + edgeBoost * 0.4;
      maxH = 260 + edgeBoost;
    } else {
      // Varied skyline
      minH = 135;
      maxH = 360;
    }

    // Keep outer edge buildings slightly below extreme height so spawns feel open
    if (i === 0 || i === targetCount - 1) {
      maxH = Math.min(maxH, 290);
    }

    const bHeight = Math.round(minH + rng() * (maxH - minH));
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
}
