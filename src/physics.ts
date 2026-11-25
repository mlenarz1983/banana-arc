import {
  MAX_ANGLE,
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
  const dxMeters = (target.x - origin.x) / PIXELS_PER_METER;
  const dyMeters = (origin.y - target.y) / PIXELS_PER_METER; // upward positive
  const defaultDir: ThrowDirection = dxMeters >= 0 ? 1 : -1;

  interface Candidate {
    angleDeg: number;
    speed: number;
    direction: ThrowDirection;
    clear: boolean;
    score: number;
  }

  const candidates: Candidate[] = [];
  const maxT = gravity < 3 ? 13 : gravity < 6 ? 9.5 : 7.5;

  for (let i = 0; i <= 75; i++) {
    const T = 0.7 + (i / 75) * (maxT - 0.7);
    const vx = (dxMeters - 0.5 * windAccel * T * T) / T;
    const vy = (dyMeters + 0.5 * gravity * T * T) / T;

    if (vy <= 1) continue;
    const speed = Math.hypot(vx, vy);
    if (speed < MIN_SPEED || speed > MAX_SPEED) continue;

    const direction: ThrowDirection = vx >= 0 ? 1 : -1;
    const angleDeg = radToDeg(Math.atan2(vy, Math.abs(vx)));
    if (angleDeg < MIN_ANGLE + 4 || angleDeg > MAX_ANGLE - 3) continue;

    // Check clearance along the arc (ignoring very start & very end near gorillas)
    let clear = true;
    const steps = Math.max(24, Math.ceil(T * 45));
    for (let s = 2; s < steps - 2; s++) {
      const t = (s / steps) * T;
      const pt = evaluateProjectilePosition(origin, vx, vy, gravity, windAccel, t);
      if (pt.x < -80 || pt.x > WORLD_WIDTH + 80 || pt.y > WORLD_HEIGHT) {
        clear = false;
        break;
      }
      if (pt.y >= 0 && isSolidPixel(pt.x, pt.y)) {
        clear = false;
        break;
      }
    }

    // Prefer natural arcs around 40-65 degrees with moderate speed
    const anglePenalty = Math.abs(angleDeg - 52) * 0.4;
    const speedPenalty = speed * 0.15;
    candidates.push({
      angleDeg,
      speed,
      direction,
      clear,
      score: (clear ? 0 : 1000) + anglePenalty + speedPenalty,
    });
  }

  candidates.sort((a, b) => a.score - b.score);

  let best: BotSolution;
  if (candidates.length > 0) {
    // Pick among the top 3 clean arcs for variety
    const clearPool = candidates.filter((c) => c.clear);
    const pool = clearPool.length > 0 ? clearPool.slice(0, 4) : candidates.slice(0, 3);
    const chosen = pool[Math.floor(rng() * pool.length)];
    best = {
      angleDeg: chosen.angleDeg,
      speed: chosen.speed,
      direction: chosen.direction,
    };
  } else {
    best = {
      angleDeg: 52,
      speed: clamp(Math.sqrt(Math.abs(dxMeters) * gravity), MIN_SPEED, MAX_SPEED),
      direction: defaultDir,
    };
  }

  // Apply human-like imperfection based on difficulty
  const spread =
    difficulty === 'easy'
      ? { angle: 7.5, speed: 7.5 }
      : difficulty === 'normal'
        ? { angle: 3.2, speed: 3.4 }
        : { angle: 1.0, speed: 1.2 };

  // Triangular distribution centered on 0 (feels more natural than uniform noise)
  const tri = () => (rng() + rng() - 1);

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
