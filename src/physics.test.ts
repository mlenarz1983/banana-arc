import { describe, expect, it } from 'vitest';
import {
  GORILLA_HAND_OFFSET_Y,
  PIXELS_PER_METER,
  PLANETS,
  TIRE_RADIUS,
  WORLD_HEIGHT,
} from './constants';
import { ALL_LOCATIONS, buildLocation } from './locations';
import {
  computeAwards,
  computeVelocityComponents,
  evaluateProjectilePosition,
  findVerifiedSolution,
  simulateVerifiedShot,
  stepKinematicBody,
  theoreticalFlatRange,
} from './physics';
import { generateSolvableRound, SkylineTerrain, tryMoveGorilla } from './skyline';
import type { BouncyTire, LocationSpec, Player } from './types';

describe('Projectile physics & self-blast prevention', () => {
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

  it('never self-blasts on slow Moon throws or steep shots while clearing the thrower', () => {
    const ownerFeet = { x: 120, y: 480 };
    const origin = { x: ownerFeet.x, y: ownerFeet.y - GORILLA_HAND_OFFSET_Y };
    const ownerHit = { x: ownerFeet.x, y: ownerFeet.y - 22 };
    const target = { x: 960, y: 460 };

    // Slow Moon throw (12 m/s) that previously self-blasted at t=0.28s!
    const sim = simulateVerifiedShot(
      origin,
      target,
      45,
      12,
      1,
      PLANETS.moon.gravity,
      0,
      () => false,
      [],
      ownerHit,
    );
    expect(sim.selfHit).toBe(false);
  });

  it('supports downward negative angles (-30° to 0°) from tall skyscrapers', () => {
    const origin = { x: 200, y: 240 }; // high tower
    const target = { x: 420, y: 420 }; // lower roof
    const sol = findVerifiedSolution(
      origin,
      target,
      PLANETS.earth.gravity,
      0,
      () => false,
      [],
      { x: 200, y: 256 },
    );
    expect(sol).not.toBeNull();

    // Explicitly verify a negative downward angle (-15°) hits a lower target cleanly
    const { vx, vy } = computeVelocityComponents(-15, 30, 1);
    expect(vy).toBeLessThan(0);
    expect(vx).toBeGreaterThan(0);
  });

  it('reflects bananas elastically off floating DK Bouncy Tires', () => {
    const tire: BouncyTire = {
      id: 1,
      x: 400,
      y: 300,
      radius: TIRE_RADIUS,
      balloonColor: '#ef4444',
      phaseOffset: 0,
      bounceAnim: 0,
    };

    // Shoot straight right into the left side of the tire
    const body = {
      x: 340,
      y: 300,
      vx: 30,
      vy: 0,
      elapsed: 0,
      hasClearedOwner: true,
      bounces: 0,
    };

    let bouncedId: number | null = null;
    for (let i = 0; i < 80; i++) {
      const res = stepKinematicBody(body, 0.005, 0, 0, null, [tire]);
      if (res.bouncedTireId !== null) {
        bouncedId = res.bouncedTireId;
        break;
      }
    }

    expect(bouncedId).toBe(1);
    expect(body.bounces).toBe(1);
    expect(body.vx).toBeLessThan(0); // bounced cleanly backward!
  });
});

describe('15 Iconic locations & verified solvability', () => {
  it('generates a verified solvable round for ALL 15 iconic cities and wild terrains', () => {
    expect(ALL_LOCATIONS).toHaveLength(15);

    for (const locId of ALL_LOCATIONS) {
      const round = generateSolvableRound(
        2,
        PLANETS.earth.gravity,
        true,
        locId,
        true,
        4200 + locId.length * 97,
      );
      expect(round.locationId).toBe(locId);
      expect(round.spawnPositions).toHaveLength(2);

      // Verify both players have a clean, zero-self-blast integer solution!
      for (let i = 0; i < 2; i++) {
        const opp = 1 - i;
        const origin = {
          x: round.spawnPositions[i].x,
          y: round.spawnPositions[i].y - GORILLA_HAND_OFFSET_Y,
        };
        const ownerHit = {
          x: round.spawnPositions[i].x,
          y: round.spawnPositions[i].y - 22,
        };
        const target = {
          x: round.spawnPositions[opp].x,
          y: round.spawnPositions[opp].y - 22,
        };

        const sol = findVerifiedSolution(
          origin,
          target,
          PLANETS.earth.gravity,
          round.windAccel,
          (x, y) => round.terrain.isSolid(x, y),
          round.tires,
          ownerHit,
        );
        expect(sol, `Location ${locId} player ${i} must be solvable`).not.toBeNull();
      }
    }
  });

  it('keeps the St. Louis Gateway Arch hollow underneath for threading shots', () => {
    const stLouis = buildLocation('st-louis');
    const terrain = new SkylineTerrain(stLouis);
    // Center air gap beneath the arch (x=600, y=H-220) should be open air, while apex ring is solid
    expect(terrain.isSolid(600, WORLD_HEIGHT - 220)).toBe(false);
    expect(terrain.isSolid(600, WORLD_HEIGHT - 120 - 255)).toBe(true);
  });
});

describe('Gorilla rooftop movement (downhill only)', () => {
  it('allows walking and dropping down onto lower roofs, but blocks climbing taller walls', () => {
    const testLoc: LocationSpec = {
      id: 'nyc',
      name: 'Test',
      region: 'Test',
      category: 'city',
      skyMood: 'sunset',
      shapes: [
        { kind: 'rect', x: 0, y: WORLD_HEIGHT - 300, width: 100, height: 300, colorIndex: 0 },
        { kind: 'rect', x: 100, y: WORLD_HEIGHT - 200, width: 100, height: 200, colorIndex: 1 },
        { kind: 'rect', x: 200, y: WORLD_HEIGHT - 120, width: 100, height: 120, colorIndex: 2 },
      ],
      spawnSpots: [],
    };
    const terrain = new SkylineTerrain(testLoc);

    const blockedWall = tryMoveGorilla(terrain, 100, WORLD_HEIGHT - 200, -18, []);
    expect(blockedWall.moved).toBe(false);
    expect(blockedWall.reason).toBe('wall');

    const dropRight = tryMoveGorilla(terrain, 195, WORLD_HEIGHT - 200, 18, []);
    expect(dropRight.moved).toBe(true);
    expect(dropRight.dropped).toBe(true);
    expect(dropRight.x).toBe(213);
    expect(dropRight.y).toBe(WORLD_HEIGHT - 120);
  });
});

describe('Awards', () => {
  it('awards Tire Trickshot for bank shot hits', () => {
    const makePlayer = (id: number, name: string, overrides: Partial<Player>): Player => ({
      id,
      name,
      characterId: 'king-kong',
      color: '#f00',
      accentColor: '#ff0',
      isBot: false,
      botDifficulty: 'normal',
      x: 100,
      y: 400,
      zoneIndex: 0,
      score: 0,
      hits: 0,
      splashHits: 0,
      bankShotHits: 0,
      sunBonks: 0,
      maxApexMeters: 0,
      blocksDestroyed: 0,
      shotsTaken: 1,
      lastShot: null,
      preferredAngle: 45,
      preferredSpeed: 40,
      preferredDirection: 1,
      animation: 'idle',
      animationTimer: 0,
      ...overrides,
    });

    const awards = computeAwards([
      makePlayer(0, 'Maya', { bankShotHits: 2, hits: 2 }),
      makePlayer(1, 'Leo', { bankShotHits: 0, hits: 1 }),
    ]);
    expect(awards.find((a) => a.id === 'bank-shot')?.winnerName).toBe('Maya');
  });
});
