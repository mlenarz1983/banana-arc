import { describe, expect, it } from 'vitest';
import { PIXELS_PER_METER, PLANETS, WORLD_HEIGHT, WORLD_WIDTH } from './constants';
import {
  computeAwards,
  computeVelocityComponents,
  evaluateProjectilePosition,
  solveBotShot,
  theoreticalFlatRange,
} from './physics';
import { generateSkyline, selectSpawnBuildings, SkylineTerrain } from './skyline';
import type { Building, Player } from './types';

describe('Projectile physics', () => {
  it('matches the analytical flat-ground range formula R = v^2 * sin(2θ) / g', () => {
    const origin = { x: 100, y: 500 };
    const angle = 45;
    const speed = 35;
    const g = PLANETS.earth.gravity;
    const { vx, vy } = computeVelocityComponents(angle, speed, 1);

    const flightTime = (2 * vy) / g;
    const landing = evaluateProjectilePosition(origin, vx, vy, g, 0, flightTime);

    const simulatedRangeMeters = (landing.x - origin.x) / PIXELS_PER_METER;
    const expectedRangeMeters = theoreticalFlatRange(angle, speed, g);

    expect(landing.y).toBeCloseTo(origin.y, 4);
    expect(simulatedRangeMeters).toBeCloseTo(expectedRangeMeters, 4);
  });

  it('produces ~6x greater range on the Moon than on Earth for the same launch', () => {
    const earthRange = theoreticalFlatRange(45, 25, PLANETS.earth.gravity);
    const moonRange = theoreticalFlatRange(45, 25, PLANETS.moon.gravity);
    expect(moonRange / earthRange).toBeCloseTo(
      PLANETS.earth.gravity / PLANETS.moon.gravity,
      3,
    );
  });

  it('applies horizontal wind acceleration accurately', () => {
    const origin = { x: 200, y: 400 };
    const { vx, vy } = computeVelocityComponents(45, 30, 1);
    const t = 2.0;
    const calm = evaluateProjectilePosition(origin, vx, vy, 9.8, 0, t);
    const tailwind = evaluateProjectilePosition(origin, vx, vy, 9.8, 3.0, t);

    // Δx = 0.5 * a_w * t^2 = 0.5 * 3.0 * 4 = 6.0 meters = 36 pixels
    expect(tailwind.x - calm.x).toBeCloseTo(6.0 * PIXELS_PER_METER, 4);
    expect(tailwind.y).toBeCloseTo(calm.y, 4);
  });
});

describe('Bot ballistic solver', () => {
  it('solves an unobstructed shot that lands near the target with wind and gravity', () => {
    const origin = { x: 150, y: 460 };
    const target = { x: 960, y: 420 };
    const gravity = PLANETS.earth.gravity;
    const wind = -1.8;

    // Put a tall skyscraper right in the middle between origin and target
    const wall: Building = {
      x: 520,
      width: 110,
      height: 390,
      topY: WORLD_HEIGHT - 390,
      colorIndex: 0,
      windowCols: 4,
      windowRows: 12,
      windowSeed: 1,
      roofStyle: 'flat',
    };
    const terrain = new SkylineTerrain([wall]);

    // Use deterministic zero-noise rng (0.5 -> tri() = 0)
    const shot = solveBotShot(
      origin,
      target,
      gravity,
      wind,
      'clever',
      (x, y) => terrain.isSolid(x, y),
      () => 0.5,
    );

    const { vx, vy } = computeVelocityComponents(shot.angleDeg, shot.speed, shot.direction);

    // Simulate the shot and check minimum distance to target + wall clearance
    let minDist = Infinity;
    let hitWall = false;
    for (let t = 0.05; t < 10; t += 0.01) {
      const pt = evaluateProjectilePosition(origin, vx, vy, gravity, wind, t);
      if (terrain.isSolid(pt.x, pt.y)) {
        hitWall = true;
        break;
      }
      const d = Math.hypot(pt.x - target.x, pt.y - target.y);
      if (d < minDist) minDist = d;
      if (pt.y > WORLD_HEIGHT) break;
    }

    expect(hitWall).toBe(false);
    expect(minDist).toBeLessThan(28); // within gorilla hit radius
  });
});

describe('Destructible skyline terrain', () => {
  it('generates full-width buildings and carves circular craters cleanly', () => {
    const buildings = generateSkyline(WORLD_WIDTH, WORLD_HEIGHT, 42);
    expect(buildings.length).toBeGreaterThanOrEqual(10);
    const totalWidth = buildings.reduce((acc, b) => acc + b.width, 0);
    expect(totalWidth).toBe(WORLD_WIDTH);

    const terrain = new SkylineTerrain(buildings);
    const targetB = buildings[4];
    const sampleX = targetB.x + Math.floor(targetB.width / 2);
    const sampleY = targetB.topY + 25;

    expect(terrain.isSolid(sampleX, sampleY)).toBe(true);
    expect(terrain.isSolid(sampleX, targetB.topY - 10)).toBe(false);

    const destroyed = terrain.carveCrater(sampleX, sampleY, 24);
    expect(destroyed).toBeGreaterThan(500);
    expect(terrain.isSolid(sampleX, sampleY)).toBe(false);
  });

  it('spaces 2, 3, and 4 players across distinct buildings', () => {
    const buildings = generateSkyline(WORLD_WIDTH, WORLD_HEIGHT, 7);
    for (const count of [2, 3, 4]) {
      const indices = selectSpawnBuildings(buildings, count, () => 0.25);
      expect(indices).toHaveLength(count);
      expect(new Set(indices).size).toBe(count);
    }
  });
});

describe('End-of-game awards', () => {
  it('awards Sun Bonker, Sky-High Lobber, Demolition Crew, and Banana Sniper accurately', () => {
    const makePlayer = (id: number, name: string, overrides: Partial<Player>): Player => ({
      id,
      name,
      color: '#f00',
      accentColor: '#ff0',
      hatStyle: 'cap',
      isBot: false,
      botDifficulty: 'normal',
      x: 100,
      y: 400,
      buildingIndex: 1,
      score: 0,
      hits: 0,
      splashHits: 0,
      sunBonks: 0,
      maxApexMeters: 0,
      blocksDestroyed: 0,
      directSnipes: 0,
      shotsTaken: 1,
      lastShot: null,
      preferredAngle: 45,
      preferredSpeed: 40,
      preferredDirection: 1,
      animation: 'idle',
      animationTimer: 0,
      ...overrides,
    });

    const players = [
      makePlayer(0, 'Maya', { sunBonks: 2, maxApexMeters: 62, hits: 1, blocksDestroyed: 900 }),
      makePlayer(1, 'Leo', { sunBonks: 0, maxApexMeters: 95, hits: 3, blocksDestroyed: 2400 }),
    ];

    const awards = computeAwards(players);
    expect(awards.find((a) => a.id === 'sun-bonker')?.winnerName).toBe('Maya');
    expect(awards.find((a) => a.id === 'sky-high')?.winnerName).toBe('Leo');
    expect(awards.find((a) => a.id === 'demolition')?.winnerName).toBe('Leo');
    expect(awards.find((a) => a.id === 'sharpshooter')?.winnerName).toBe('Leo');
  });
});
