import {
  BANANA_RADIUS,
  GORILLA_HIT_RADIUS,
  MAX_ANGLE,
  MAX_FLIGHT_SEC,
  MAX_SPEED,
  MIN_ANGLE,
  MIN_SPEED,
  PIXELS_PER_METER,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';
import type {
  Award,
  BotDifficulty,
  PlanetPreset,
  Player,
  ThrowDirection,
  Vec2,
  VerifiedSolution,
} from './types';

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Computes initial horizontal (vx) and vertical (vy, upward positive) velocity in m/s.
 */
export function computeVelocityComponents(
  angleDeg: number,
  speed: number,
  direction: ThrowDirection,
): { vx: number; vy: number } {
  const rad = degToRad(angleDeg);
  return {
    vx: Math.cos(rad) * speed * direction,
    vy: Math.sin(rad) * speed,
  };
}

/**
 * Computes exact projectile position in canvas pixels at time t (seconds).
 * Canvas Y increases downward, while physics vy and gravity use upward-positive Y.
 */
export function evaluateProjectilePosition(
  origin: Vec2,
  vx: number,
  vy: number,
  gravity: number,
  windAccel: number,
  t: number,
): Vec2 {
  const dxMeters = vx * t + 0.5 * windAccel * t * t;
  const dyMeters = vy * t - 0.5 * gravity * t * t;
  return {
    x: origin.x + dxMeters * PIXELS_PER_METER,
    y: origin.y - dyMeters * PIXELS_PER_METER,
  };
}

/**
 * Samples a trajectory curve for Aim Hint previews or trajectory verification.
 */
export function sampleTrajectory(
  origin: Vec2,
  angleDeg: number,
  speed: number,
  direction: ThrowDirection,
  gravity: number,
  windAccel: number,
  durationSec: number,
  stepSec = 0.04,
): Vec2[] {
  const { vx, vy } = computeVelocityComponents(angleDeg, speed, direction);
  const points: Vec2[] = [];
  for (let t = 0; t <= durationSec + 1e-6; t += stepSec) {
    const pt = evaluateProjectilePosition(origin, vx, vy, gravity, windAccel, t);
    points.push(pt);
    if (pt.y > WORLD_HEIGHT + 40 || pt.x < -120 || pt.x > WORLD_WIDTH + 120) {
      break;
    }
  }
  return points;
}

/**
 * Computes theoretical flat-ground range (no wind) in meters for educational display.
 */
export function theoreticalFlatRange(
  angleDeg: number,
  speed: number,
  gravity: number,
): number {
  const rad = degToRad(angleDeg);
  return (speed * speed * Math.sin(2 * rad)) / gravity;
}

/**
 * Simulates an exact (angleDeg, speed, direction) launch with fine sub-steps to verify
 * whether it hits the target hitbox cleanly without colliding with any solid building pixel.
 */
export function simulateVerifiedShot(
  origin: Vec2,
  target: Vec2,
  angleDeg: number,
  speed: number,
  direction: ThrowDirection,
  gravity: number,
  windAccel: number,
  isSolidPixel: (x: number, y: number) => boolean,
  hitRadius = GORILLA_HIT_RADIUS + BANANA_RADIUS - 3,
): { hit: boolean; flightTime: number; points: Vec2[] } {
  const { vx, vy } = computeVelocityComponents(angleDeg, speed, direction);
  const dt = 0.012;
  const points: Vec2[] = [{ x: origin.x, y: origin.y }];
  let lastRecorded = points[0];

  for (let t = dt; t <= MAX_FLIGHT_SEC; t += dt) {
    const pt = evaluateProjectilePosition(origin, vx, vy, gravity, windAccel, t);

    if (Math.hypot(pt.x - lastRecorded.x, pt.y - lastRecorded.y) >= 8) {
      points.push(pt);
      lastRecorded = pt;
    }

    // Check target hit first (matches game simulation order)
    if (t >= 0.12 && Math.hypot(pt.x - target.x, pt.y - target.y) <= hitRadius) {
      points.push(pt);
      return { hit: true, flightTime: t, points };
    }

    // Check building collision (allow tiny launch grace right near gorilla's hand)
    if (t >= 0.04 && pt.y >= 0 && isSolidPixel(pt.x, pt.y)) {
      return { hit: false, flightTime: t, points };
    }

    // Out of bounds
    if (pt.x < -120 || pt.x > WORLD_WIDTH + 120 || pt.y > WORLD_HEIGHT + 20) {
      return { hit: false, flightTime: t, points };
    }
  }

  return { hit: false, flightTime: MAX_FLIGHT_SEC, points };
}

/**
 * Searches for a verified unobstructed integer (angleDeg, speed, direction) launch
 * that hits `target` from `origin` under the given gravity and wind.
 * Returns null if no unobstructed integer solution exists.
 */
export function findVerifiedSolution(
  origin: Vec2,
  target: Vec2,
  gravity: number,
  windAccel: number,
  isSolidPixel: (x: number, y: number) => boolean,
): VerifiedSolution | null {
  const dxMeters = (target.x - origin.x) / PIXELS_PER_METER;
  const dyMeters = (origin.y - target.y) / PIXELS_PER_METER; // upward positive

  const maxT = gravity < 3 ? 14.5 : gravity < 6 ? 10.5 : 8.0;
  const tried = new Set<string>();

  interface ScoredCandidate {
    angleDeg: number;
    speed: number;
    direction: ThrowDirection;
    prefScore: number;
  }

  const candidates: ScoredCandidate[] = [];

  for (let i = 0; i <= 120; i++) {
    const T = 0.65 + (i / 120) * (maxT - 0.65);
    const vx = (dxMeters - 0.5 * windAccel * T * T) / T;
    const vy = (dyMeters + 0.5 * gravity * T * T) / T;
    if (vy <= 1) continue;

    const rawSpeed = Math.hypot(vx, vy);
    if (rawSpeed < MIN_SPEED || rawSpeed > MAX_SPEED) continue;

    const direction: ThrowDirection = vx >= 0 ? 1 : -1;
    const rawAngle = radToDeg(Math.atan2(vy, Math.abs(vx)));
    if (rawAngle < MIN_ANGLE || rawAngle > MAX_ANGLE) continue;

    // Test nearest integer pairs around the analytical solution
    const baseA = Math.round(rawAngle);
    const baseS = Math.round(rawSpeed);

    for (const da of [0, 1, -1]) {
      for (const ds of [0, 1, -1]) {
        const a = clamp(baseA + da, MIN_ANGLE, MAX_ANGLE);
        const s = clamp(baseS + ds, MIN_SPEED, MAX_SPEED);
        const key = `${direction}:${a}:${s}`;
        if (tried.has(key)) continue;
        tried.add(key);

        // Prefer natural playable arcs (around 42-62 degrees, moderate speed)
        const prefScore = Math.abs(a - 50) * 0.45 + s * 0.12 + (Math.abs(da) + Math.abs(ds)) * 2;
        candidates.push({ angleDeg: a, speed: s, direction, prefScore });
      }
    }
  }

  candidates.sort((a, b) => a.prefScore - b.prefScore);

  for (const cand of candidates) {
    const sim = simulateVerifiedShot(
      origin,
      target,
      cand.angleDeg,
      cand.speed,
      cand.direction,
      gravity,
      windAccel,
      isSolidPixel,
    );
    if (sim.hit) {
      return {
        angleDeg: cand.angleDeg,
        speed: cand.speed,
        direction: cand.direction,
        flightTime: sim.flightTime,
        points: sim.points,
      };
    }
  }

  return null;
}

export interface BotSolution {
  angleDeg: number;
  speed: number;
  direction: ThrowDirection;
}

/**
 * Solves a realistic ballistic trajectory from origin to target under gravity & wind,
 * checking that the arc clears intervening buildings, then adds difficulty-scaled noise.
 */
export function solveBotShot(
  origin: Vec2,
  target: Vec2,
  gravity: number,
  windAccel: number,
  difficulty: BotDifficulty,
  isSolidPixel: (x: number, y: number) => boolean,
  rng: () => number = Math.random,
): BotSolution {
  const verified = findVerifiedSolution(origin, target, gravity, windAccel, isSolidPixel);

  const dxMeters = (target.x - origin.x) / PIXELS_PER_METER;
  const defaultDir: ThrowDirection = dxMeters >= 0 ? 1 : -1;

  const best: BotSolution = verified
    ? {
        angleDeg: verified.angleDeg,
        speed: verified.speed,
        direction: verified.direction,
      }
    : {
        angleDeg: 52,
        speed: clamp(Math.sqrt(Math.abs(dxMeters) * gravity), MIN_SPEED, MAX_SPEED),
        direction: defaultDir,
      };

  // Apply human-like imperfection based on difficulty
  const spread =
    difficulty === 'easy'
      ? { angle: 7.0, speed: 7.0 }
      : difficulty === 'normal'
        ? { angle: 3.0, speed: 3.2 }
        : { angle: 0.9, speed: 1.0 };

  const tri = () => rng() + rng() - 1;

  return {
    angleDeg: Math.round(clamp(best.angleDeg + tri() * spread.angle, MIN_ANGLE, MAX_ANGLE)),
    speed: Math.round(clamp(best.speed + tri() * spread.speed, MIN_SPEED, MAX_SPEED)),
    direction: best.direction,
  };
}

/**
 * Generates a short, kid-friendly physics tip explaining what just happened on a shot.
 */
export function generatePhysicsTip(
  angleDeg: number,
  speed: number,
  direction: ThrowDirection,
  windAccel: number,
  planet: PlanetPreset,
  outcome: 'hit' | 'splash' | 'building' | 'self' | 'out',
): string {
  const isTailwind = windAccel * direction > 0.8;
  const isHeadwind = windAccel * direction < -0.8;

  if (outcome === 'self') {
    return 'Straight-up throws (near 90°) go up and come right back down thanks to gravity!';
  }
  if (outcome === 'out' && planet.id === 'moon') {
    return `On the Moon (g = ${planet.gravity} m/s²), low gravity lets bananas soar over 6× farther than on Earth!`;
  }
  if (outcome === 'out') {
    return 'Whoa, over the city! Reducing launch speed cuts range fast—doubling speed makes distance 4× farther.';
  }
  if (outcome === 'hit') {
    if (angleDeg >= 65) {
      return `Awesome high lob (${angleDeg}°)! Steep angles trade horizontal speed (Vx) for height (Vy) to clear skyscrapers.`;
    }
    if (angleDeg >= 40 && angleDeg <= 50) {
      return `Textbook ${angleDeg}° launch! Near 45° balances Vx and Vy for maximum distance in calm air.`;
    }
    if (isTailwind) {
      return 'Great wind reading! The tailwind added horizontal acceleration, carrying your banana farther.';
    }
    if (isHeadwind) {
      return 'Bullseye into a headwind! You gave it enough extra speed to push against the opposing wind force.';
    }
    return `Direct hit at ${speed} m/s! Every throw follows a parabola shaped by gravity (${planet.gravity} m/s²).`;
  }
  if (outcome === 'splash') {
    return 'So close! Watch your dotted ghost trail next turn and nudge angle or speed by just 2–3 units.';
  }
  if (angleDeg < 32) {
    return `Low ${angleDeg}° shots have lots of forward speed (Vx) but little lift (Vy)—try a higher angle to clear tall towers!`;
  }
  if (isHeadwind) {
    return 'Watch that headwind! Wind pushes backward on Vx every second, so try a little more speed or a flatter arc.';
  }
  if (planet.id === 'jupiter') {
    return `Jupiter's gravity (${planet.gravity} m/s²) pulls bananas down 2.5× faster than Earth—crank up the speed!`;
  }
  return 'Misses blast craters in buildings—next turn you can use your ghost trail to adjust, or tunnel right through!';
}

/**
 * Computes fun end-of-game awards from match statistics.
 */
export function computeAwards(players: Player[]): Award[] {
  const awards: Award[] = [];
  if (players.length === 0) return awards;

  // 1. Sun Bonker
  const topSun = [...players].sort((a, b) => b.sunBonks - a.sunBonks)[0];
  if (topSun && topSun.sunBonks > 0) {
    awards.push({
      id: 'sun-bonker',
      title: 'Sun Bonker',
      subtitle: 'Gave the smiling sun a surprise!',
      badge: 'SUN',
      winnerName: topSun.name,
      winnerColor: topSun.color,
      valueLabel: `${topSun.sunBonks} bonk${topSun.sunBonks > 1 ? 's' : ''}`,
    });
  }

  // 2. Sky-High Lobber
  const topApex = [...players].sort((a, b) => b.maxApexMeters - a.maxApexMeters)[0];
  if (topApex && topApex.maxApexMeters > 0) {
    awards.push({
      id: 'sky-high',
      title: 'Sky-High Lobber',
      subtitle: 'Highest banana apex in the clouds',
      badge: 'APEX',
      winnerName: topApex.name,
      winnerColor: topApex.color,
      valueLabel: `${Math.round(topApex.maxApexMeters)} m peak`,
    });
  }

  // 3. Demolition Crew
  const topDemo = [...players].sort((a, b) => b.blocksDestroyed - a.blocksDestroyed)[0];
  if (topDemo && topDemo.blocksDestroyed > 0) {
    awards.push({
      id: 'demolition',
      title: 'Demolition Crew',
      subtitle: 'Most skyscraper chunks blasted',
      badge: 'BOOM',
      winnerName: topDemo.name,
      winnerColor: topDemo.color,
      valueLabel: `${Math.max(1, Math.round(topDemo.blocksDestroyed / 150))} chunks`,
    });
  }

  // 4. Sharpshooter
  const topHits = [...players].sort((a, b) => b.hits - a.hits || b.score - a.score)[0];
  if (topHits && topHits.hits > 0) {
    awards.push({
      id: 'sharpshooter',
      title: 'Banana Sniper',
      subtitle: 'Most direct hits landed',
      badge: 'BULLSEYE',
      winnerName: topHits.name,
      winnerColor: topHits.color,
      valueLabel: `${topHits.hits} direct hit${topHits.hits > 1 ? 's' : ''}`,
    });
  }

  return awards;
}
