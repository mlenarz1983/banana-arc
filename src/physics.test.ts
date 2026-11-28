import { describe, expect, it } from 'vitest';
import {
  GORILLA_HAND_OFFSET_Y,
  GORILLA_HIT_CENTER_Y,
  MIRROR_HALF_LENGTH,
  PIXELS_PER_METER,
  PLANETS,
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
import type { LocationSpec, MirrorPanel, Player } from './types';

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

  it('never self-blasts on slow Moon throws with larger TV-readable avatars', () => {
    const ownerFeet = { x: 120, y: 480 };
    const origin = { x: ownerFeet.x, y: ownerFeet.y - GORILLA_HAND_OFFSET_Y };
    const ownerHit = { x: ownerFeet.x, y: ownerFeet.y - GORILLA_HIT_CENTER_Y };
    const target = { x: 960, y: 460 };

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

  it('reflects projectiles specularly (θ_in = θ_out) off a flat horizontal Mirror Panel', () => {
    const mirror: MirrorPanel = {
      id: 1,
      x: 400,
      y: 250,
      halfLength: MIRROR_HALF_LENGTH,
      angleDeg: 0, // horizontal ceiling mirror
      ownerId: 0,
      ownerColor: '#38bdf8',
      locked: true,
      bounceAnim: 0,
    };

    // Banana flying up-right into underside of horizontal mirror
    const body = {
      x: 380,
      y: 290,
      vx: 20,
      vy: 30, // upward
      elapsed: 0,
      hasClearedOwner: true,
      bounces: 0,
    };

    let bouncedId: number | null = null;
    for (let i = 0; i < 80; i++) {
      const res = stepKinematicBody(body, 0.005, 0, 0, null, [mirror]);
      if (res.bouncedMirrorId !== null) {
        bouncedId = res.bouncedMirrorId;
        break;
      }
    }

    expect(bouncedId).toBe(1);
    expect(body.bounces).toBe(1);
    expect(body.vx).toBeGreaterThan(18); // horizontal component preserved!
    expect(body.vy).toBeLessThan(-25); // vertical component cleanly inverted downward!
  });

  it('reflects projectiles 90 degrees off a 45°-tilted Mirror Panel', () => {
    const mirror: MirrorPanel = {
      id: 2,
      x: 400,
      y: 300,
      halfLength: MIRROR_HALF_LENGTH,
      angleDeg: 45, // tilted up-right at 45°
      ownerId: 0,
      ownerColor: '#38bdf8',
      locked: true,
      bounceAnim: 0,
    };

    // Flying straight right (+vx, vy=0) into a +45° (/) mirror -> bounces straight UP (vx≈0, vy=+29.4)!
    const body = {
      x: 350,
      y: 300,
      vx: 30,
      vy: 0,
      elapsed: 0,
      hasClearedOwner: true,
      bounces: 0,
    };

    let bounced = false;
    for (let i = 0; i < 100; i++) {
      const res = stepKinematicBody(body, 0.005, 0, 0, null, [mirror]);
      if (res.bouncedMirrorId === 2) {
        bounced = true;
        break;
      }
    }

    expect(bounced).toBe(true);
    expect(Math.abs(body.vx)).toBeLessThan(1.5);
    expect(body.vy).toBeGreaterThan(25);

    // And a -45° (\) mirror bounces right-moving projectile straight DOWN (vy < -25)!
    const downMirror: MirrorPanel = { ...mirror, id: 3, angleDeg: -45 };
    const body2 = { x: 350, y: 300, vx: 30, vy: 0, elapsed: 0, hasClearedOwner: true, bounces: 0 };
    for (let i = 0; i < 100; i++) {
      if (stepKinematicBody(body2, 0.005, 0, 0, null, [downMirror]).bouncedMirrorId === 3) break;
    }
    expect(Math.abs(body2.vx)).toBeLessThan(1.5);
    expect(body2.vy).toBeLessThan(-25);
  });
});

describe('15 Overhauled Iconic Locations & Clean-Sky Solvability', () => {
  it('includes Chicago and Atlanta and guarantees ALL 15 locations are solvable', () => {
    expect(ALL_LOCATIONS).toHaveLength(15);
    expect(ALL_LOCATIONS).toContain('chicago');
    expect(ALL_LOCATIONS).toContain('atlanta');

    for (const locId of ALL_LOCATIONS) {
      const round = generateSolvableRound(
        2,
        PLANETS.earth.gravity,
        true,
        locId,
        4200 + locId.length * 97,
      );
      expect(round.locationId).toBe(locId);
      expect(round.spawnPositions).toHaveLength(2);

      for (let i = 0; i < 2; i++) {
        const opp = 1 - i;
        const origin = {
          x: round.spawnPositions[i].x,
          y: round.spawnPositions[i].y - GORILLA_HAND_OFFSET_Y,
        };
        const ownerHit = {
          x: round.spawnPositions[i].x,
          y: round.spawnPositions[i].y - GORILLA_HIT_CENTER_Y,
        };
        const target = {
          x: round.spawnPositions[opp].x,
          y: round.spawnPositions[opp].y - GORILLA_HIT_CENTER_Y,
        };

        const sol = findVerifiedSolution(
          origin,
          target,
          PLANETS.earth.gravity,
          round.windAccel,
          (x, y) => round.terrain.isSolid(x, y),
          [],
          ownerHit,
        );
        expect(sol, `Location ${locId} player ${i} must be solvable`).not.toBeNull();
      }
    }
  });

  it('keeps the St. Louis Gateway Arch hollow underneath for threading shots', () => {
    const stLouis = buildLocation('st-louis');
    const terrain = new SkylineTerrain(stLouis);
    expect(terrain.isSolid(600, WORLD_HEIGHT - 220)).toBe(false);
    expect(terrain.isSolid(600, WORLD_HEIGHT - 120 - 260)).toBe(true);
  });
});

describe('Gorilla rooftop movement (downhill only)', () => {
  it('allows walking and dropping down onto lower roofs, but blocks climbing taller walls', () => {
    const testLoc: LocationSpec = {
      id: 'chicago',
      name: 'Test',
      region: 'Test',
      category: 'city',
      skyMood: 'twilight',
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
  it('awards Mirror Maestro for bank shot hits', () => {
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
    expect(awards.find((a) => a.id === 'bank-shot')?.title).toBe('Mirror Maestro');
    expect(awards.find((a) => a.id === 'bank-shot')?.winnerName).toBe('Maya');
  });
});
