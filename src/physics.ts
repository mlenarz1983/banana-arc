import {
  BANANA_RADIUS,
  GORILLA_HAND_OFFSET_Y,
  GORILLA_HIT_CENTER_Y,
  GORILLA_HIT_RADIUS,
  MAX_ANGLE,
  MAX_FLIGHT_SEC,
  MAX_MIRROR_BOUNCES,
  MAX_SPEED,
  MIN_ANGLE,
  MIN_SPEED,
  MIRROR_HALF_THICKNESS,
  MIRROR_RESTITUTION,
  OWNER_CLEARANCE_RADIUS,
  PIXELS_PER_METER,
  SELF_HIT_MIN_SEC,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';
import type {
  Award,
  BotDifficulty,
  MirrorPanel,
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
 * Analytical projectile position at time t (seconds) with no intermediate bounces.
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
 * Computes the two endpoints (A, B) of a flat MirrorPanel in canvas coordinates.
 * angleDeg = 0 is horizontal; positive angle tilts up-right (counter-clockwise in physics).
 */
export function getMirrorEndpoints(mirror: MirrorPanel): { a: Vec2; b: Vec2; tx: number; ty: number } {
  const rad = degToRad(mirror.angleDeg);
  const tx = Math.cos(rad);
  const ty = -Math.sin(rad); // canvas Y is downward
  return {
    a: { x: mirror.x - tx * mirror.halfLength, y: mirror.y - ty * mirror.halfLength },
    b: { x: mirror.x + tx * mirror.halfLength, y: mirror.y + ty * mirror.halfLength },
    tx,
    ty,
  };
}

export interface KinematicBody {
  x: number;
  y: number;
  vx: number; // m/s right+
  vy: number; // m/s up+
  elapsed: number;
  hasClearedOwner: boolean;
  bounces: number;
}

/**
 * Exact constant-acceleration kinematic sub-step with specular reflection (θ_i = θ_r)
 * against flat Physics Lab Mirror Panels.
 * Shared by live gameplay, Aim Hint preview, and the Solution Verifier so all three agree 100%.
 */
export function stepKinematicBody(
  body: KinematicBody,
  dt: number,
  gravity: number,
  windAccel: number,
  ownerHitCenter: Vec2 | null,
  mirrors: readonly MirrorPanel[],
): { bouncedMirrorId: number | null } {
  body.elapsed += dt;
  body.x += (body.vx * dt + 0.5 * windAccel * dt * dt) * PIXELS_PER_METER;
  body.y -= (body.vy * dt - 0.5 * gravity * dt * dt) * PIXELS_PER_METER;
  body.vx += windAccel * dt;
  body.vy -= gravity * dt;

  // Arm self-hit ONLY after banana cleanly exits thrower's clearance radius
  if (!body.hasClearedOwner && ownerHitCenter) {
    if (Math.hypot(body.x - ownerHitCenter.x, body.y - ownerHitCenter.y) >= OWNER_CLEARANCE_RADIUS) {
      body.hasClearedOwner = true;
    }
  }

  // Specular reflection against flat Mirror Panels (capsule segment collision)
  let bouncedMirrorId: number | null = null;
  if (body.bounces < MAX_MIRROR_BOUNCES) {
    const hitDist = MIRROR_HALF_THICKNESS + BANANA_RADIUS;
    for (const mirror of mirrors) {
      const { a, b, tx, ty } = getMirrorEndpoints(mirror);
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const abLenSq = abx * abx + aby * aby;
      if (abLenSq < 1e-4) continue;

      const tProj = clamp(((body.x - a.x) * abx + (body.y - a.y) * aby) / abLenSq, 0, 1);
      const closestX = a.x + tProj * abx;
      const closestY = a.y + tProj * aby;

      const dx = body.x - closestX;
      const dy = body.y - closestY;
      const dist = Math.hypot(dx, dy);

      if (dist <= hitDist) {
        // Use clean flat plane normal along the mirror face (and radial normal only on rounded caps)
        let nx: number;
        let ny: number;
        if (tProj > 0.02 && tProj < 0.98) {
          // Perpendicular to mirror tangent (tx, ty)
          const px = -ty;
          const py = tx;
          const side = dx * px + dy * py >= 0 ? 1 : -1;
          nx = px * side;
          ny = py * side;
        } else if (dist > 0.001) {
          nx = dx / dist;
          ny = dy / dist;
        } else {
          nx = -ty;
          ny = tx;
        }

        // Convert canvas normal (y-down) to physics normal (y-up)
        const pnx = nx;
        const pny = -ny;
        const dot = body.vx * pnx + body.vy * pny;

        if (dot < 0) {
          body.vx = (body.vx - 2 * dot * pnx) * MIRROR_RESTITUTION;
          body.vy = (body.vy - 2 * dot * pny) * MIRROR_RESTITUTION;
          body.x = closestX + nx * (hitDist + 1.5);
          body.y = closestY + ny * (hitDist + 1.5);
          body.bounces++;
          body.hasClearedOwner = true;
          bouncedMirrorId = mirror.id;
          break;
        }
      }
    }
  }

  return { bouncedMirrorId };
}

/**
 * Samples a trajectory curve (including mirror bank-shot reflections!) for Aim Hint previews.
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
  mirrors: readonly MirrorPanel[] = [],
  isSolidPixel?: (x: number, y: number) => boolean,
): Vec2[] {
  const { vx, vy } = computeVelocityComponents(angleDeg, speed, direction);
  const body: KinematicBody = {
    x: origin.x,
    y: origin.y,
    vx,
    vy,
    elapsed: 0,
    hasClearedOwner: false,
    bounces: 0,
  };
  const points: Vec2[] = [{ x: origin.x, y: origin.y }];
  const subDt = 0.006;
  let accum = 0;

  while (body.elapsed < durationSec) {
    const dt = Math.min(subDt, durationSec - body.elapsed);
    const { bouncedMirrorId } = stepKinematicBody(body, dt, gravity, windAccel, null, mirrors);
    accum += dt;

    if (bouncedMirrorId !== null) {
      points.push({ x: body.x, y: body.y });
      accum = 0;
    }

    if (isSolidPixel && body.y >= 0 && isSolidPixel(body.x, body.y)) {
      points.push({ x: body.x, y: body.y });
      break;
    }
    if (body.y > WORLD_HEIGHT + 40 || body.x < -120 || body.x > WORLD_WIDTH + 120) {
      break;
    }
    if (accum >= stepSec) {
      points.push({ x: body.x, y: body.y });
      accum = 0;
    }
  }
  return points;
}

export function theoreticalFlatRange(
  angleDeg: number,
  speed: number,
  gravity: number,
): number {
  if (angleDeg <= 0) return 0;
  const rad = degToRad(angleDeg);
  return (speed * speed * Math.sin(2 * rad)) / gravity;
}

/**
 * Simulates an exact (angleDeg, speed, direction) launch using the exact same
 * kinematic stepper, self-hit clearance check, mirror bounces, and terrain checks
 * as live gameplay.
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
  mirrors: readonly MirrorPanel[] = [],
  ownerHitCenter: Vec2 | null = {
    x: origin.x,
    y: origin.y + (GORILLA_HAND_OFFSET_Y - GORILLA_HIT_CENTER_Y),
  },
  hitRadius = GORILLA_HIT_RADIUS + BANANA_RADIUS - 3,
): { hit: boolean; selfHit: boolean; flightTime: number; bounces: number; points: Vec2[] } {
  const { vx, vy } = computeVelocityComponents(angleDeg, speed, direction);
  const body: KinematicBody = {
    x: origin.x,
    y: origin.y,
    vx,
    vy,
    elapsed: 0,
    hasClearedOwner: false,
    bounces: 0,
  };

  const dt = 0.006;
  const points: Vec2[] = [{ x: origin.x, y: origin.y }];
  let lastRecorded = points[0];

  while (body.elapsed < MAX_FLIGHT_SEC) {
    const { bouncedMirrorId } = stepKinematicBody(
      body,
      dt,
      gravity,
      windAccel,
      ownerHitCenter,
      mirrors,
    );

    if (
      bouncedMirrorId !== null ||
      Math.hypot(body.x - lastRecorded.x, body.y - lastRecorded.y) >= 8
    ) {
      points.push({ x: body.x, y: body.y });
      lastRecorded = points[points.length - 1];
    }

    if (
      ownerHitCenter &&
      body.hasClearedOwner &&
      body.elapsed >= SELF_HIT_MIN_SEC &&
      Math.hypot(body.x - ownerHitCenter.x, body.y - ownerHitCenter.y) <=
        GORILLA_HIT_RADIUS + BANANA_RADIUS
    ) {
      return { hit: false, selfHit: true, flightTime: body.elapsed, bounces: body.bounces, points };
    }

    if (Math.hypot(body.x - target.x, body.y - target.y) <= hitRadius) {
      points.push({ x: body.x, y: body.y });
      return { hit: true, selfHit: false, flightTime: body.elapsed, bounces: body.bounces, points };
    }

    if (body.y >= 0 && isSolidPixel(body.x, body.y)) {
      return { hit: false, selfHit: false, flightTime: body.elapsed, bounces: body.bounces, points };
    }

    if (body.x < -120 || body.x > WORLD_WIDTH + 120 || body.y > WORLD_HEIGHT + 20) {
      return { hit: false, selfHit: false, flightTime: body.elapsed, bounces: body.bounces, points };
    }
  }

  return { hit: false, selfHit: false, flightTime: MAX_FLIGHT_SEC, bounces: body.bounces, points };
}

/**
 * Searches for a verified unobstructed integer (angleDeg, speed, direction) launch
 * that hits `target` from `origin` under gravity, wind, terrain, and any placed mirrors.
 */
export function findVerifiedSolution(
  origin: Vec2,
  target: Vec2,
  gravity: number,
  windAccel: number,
  isSolidPixel: (x: number, y: number) => boolean,
  mirrors: readonly MirrorPanel[] = [],
  ownerHitCenter: Vec2 | null = {
    x: origin.x,
    y: origin.y + (GORILLA_HAND_OFFSET_Y - GORILLA_HIT_CENTER_Y),
  },
): VerifiedSolution | null {
  const dxMeters = (target.x - origin.x) / PIXELS_PER_METER;
  const dyMeters = (origin.y - target.y) / PIXELS_PER_METER;

  const maxT = gravity < 3 ? 14.5 : gravity < 6 ? 10.5 : 8.0;
  const tried = new Set<string>();

  interface ScoredCandidate {
    angleDeg: number;
    speed: number;
    direction: ThrowDirection;
    prefScore: number;
  }

  const candidates: ScoredCandidate[] = [];

  for (let i = 0; i <= 125; i++) {
    const T = 0.45 + (i / 125) * (maxT - 0.45);
    const vx = (dxMeters - 0.5 * windAccel * T * T) / T;
    const vy = (dyMeters + 0.5 * gravity * T * T) / T;

    const rawSpeed = Math.hypot(vx, vy);
    if (rawSpeed < MIN_SPEED || rawSpeed > MAX_SPEED) continue;

    const direction: ThrowDirection = vx >= 0 ? 1 : -1;
    const rawAngle = radToDeg(Math.atan2(vy, Math.abs(vx)));
    if (rawAngle < MIN_ANGLE || rawAngle > MAX_ANGLE) continue;

    const baseA = Math.round(rawAngle);
    const baseS = Math.round(rawSpeed);

    for (const da of [0, 1, -1]) {
      for (const ds of [0, 1, -1]) {
        const a = clamp(baseA + da, MIN_ANGLE, MAX_ANGLE);
        const s = clamp(baseS + ds, MIN_SPEED, MAX_SPEED);
        const key = `${direction}:${a}:${s}`;
        if (tried.has(key)) continue;
        tried.add(key);

        const prefScore =
          Math.abs(a - 46) * 0.4 + s * 0.12 + (Math.abs(da) + Math.abs(ds)) * 2;
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
      mirrors,
      ownerHitCenter,
    );
    if (sim.hit && !sim.selfHit) {
      return {
        angleDeg: cand.angleDeg,
        speed: cand.speed,
        direction: cand.direction,
        flightTime: sim.flightTime,
        bounces: sim.bounces,
        points: sim.points,
      };
    }
  }

  // Fallback: check bank shots aimed at any player-placed Mirror Panels!
  for (const mirror of mirrors) {
    const mdx = (mirror.x - origin.x) / PIXELS_PER_METER;
    const mdy = (origin.y - mirror.y) / PIXELS_PER_METER;
    for (let i = 0; i <= 26; i++) {
      const T = 0.35 + (i / 26) * 3.8;
      const vx = (mdx - 0.5 * windAccel * T * T) / T;
      const vy = (mdy + 0.5 * gravity * T * T) / T;
      const s = Math.round(Math.hypot(vx, vy));
      if (s < MIN_SPEED || s > MAX_SPEED) continue;
      const direction: ThrowDirection = vx >= 0 ? 1 : -1;
      const a = Math.round(radToDeg(Math.atan2(vy, Math.abs(vx))));
      if (a < MIN_ANGLE || a > MAX_ANGLE) continue;
      const key = `${direction}:${a}:${s}`;
      if (tried.has(key)) continue;
      tried.add(key);

      const sim = simulateVerifiedShot(
        origin,
        target,
        a,
        s,
        direction,
        gravity,
        windAccel,
        isSolidPixel,
        mirrors,
        ownerHitCenter,
      );
      if (sim.hit && !sim.selfHit) {
        return {
          angleDeg: a,
          speed: s,
          direction,
          flightTime: sim.flightTime,
          bounces: sim.bounces,
          points: sim.points,
        };
      }
    }
  }

  return null;
}

export interface BotSolution {
  angleDeg: number;
  speed: number;
  direction: ThrowDirection;
}

export function solveBotShot(
  origin: Vec2,
  target: Vec2,
  gravity: number,
  windAccel: number,
  difficulty: BotDifficulty,
  isSolidPixel: (x: number, y: number) => boolean,
  mirrors: readonly MirrorPanel[] = [],
  rng: () => number = Math.random,
): BotSolution {
  const verified = findVerifiedSolution(origin, target, gravity, windAccel, isSolidPixel, mirrors);

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

export function generatePhysicsTip(
  angleDeg: number,
  speed: number,
  direction: ThrowDirection,
  windAccel: number,
  planet: PlanetPreset,
  outcome: 'hit' | 'splash' | 'building' | 'self' | 'out',
  bounces = 0,
): string {
  const isTailwind = windAccel * direction > 0.8;
  const isHeadwind = windAccel * direction < -0.8;

  if (outcome === 'hit' && bounces > 0) {
    return bounces > 1
      ? `Incredible ${bounces}-mirror chain reaction! Each flat mirror reflected the banana at θ_out = θ_in.`
      : 'Awesome mirror bank shot! Flat mirrors reflect projectiles at the exact angle they arrive (θ_in = θ_out).';
  }
  if (outcome === 'self') {
    return 'Straight-up throws go up and come right back down onto your own head thanks to gravity!';
  }
  if (outcome === 'out' && planet.id === 'moon') {
    return `On the Moon (g = ${planet.gravity} m/s²), low gravity lets bananas soar over 6× farther than on Earth!`;
  }
  if (outcome === 'out') {
    return 'Whoa, over the skyline! Reducing launch speed cuts range fast—doubling speed makes distance 4× farther.';
  }
  if (outcome === 'hit') {
    if (angleDeg <= 0) {
      return `Laser line drive (${angleDeg}°)! Throwing flat or downward from high ground uses gravity to drop onto lower targets.`;
    }
    if (angleDeg >= 65) {
      return `Awesome high lob (${angleDeg}°)! Steep angles trade Vx for height (Vy) to clear tall landmarks.`;
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
    return 'So close! Watch your dotted ghost trail and nudge angle or speed by just 2–3 units.';
  }
  if (bounces > 0) {
    return 'Nice mirror deflection! Try tilting a placed mirror by ±5°–15° to steer the bank angle right onto your target.';
  }
  if (angleDeg < 15) {
    return `Flat ${angleDeg}° shots have lots of Vx and little upward lift—try aiming higher or placing an angled Mirror Panel!`;
  }
  if (isHeadwind) {
    return 'Watch that headwind! Wind pushes backward on Vx every second, so try a little more speed or a flatter arc.';
  }
  if (planet.id === 'jupiter') {
    return `Jupiter's gravity (${planet.gravity} m/s²) pulls bananas down 2.5× faster than Earth—crank up the speed!`;
  }
  return 'Stuck behind a tall tower? Tap "+ Place Mirror" to angle a flat Physics Lab Mirror in the sky for a bank shot!';
}

export function computeAwards(players: Player[]): Award[] {
  const awards: Award[] = [];
  if (players.length === 0) return awards;

  const topBank = [...players].sort((a, b) => b.bankShotHits - a.bankShotHits)[0];
  if (topBank && topBank.bankShotHits > 0) {
    awards.push({
      id: 'bank-shot',
      title: 'Mirror Maestro',
      subtitle: 'Landed a flat-mirror bank shot!',
      badge: 'OPTICS',
      winnerName: topBank.name,
      winnerColor: topBank.color,
      valueLabel: `${topBank.bankShotHits} bank hit${topBank.bankShotHits > 1 ? 's' : ''}`,
    });
  }

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

  const topDemo = [...players].sort((a, b) => b.blocksDestroyed - a.blocksDestroyed)[0];
  if (topDemo && topDemo.blocksDestroyed > 0) {
    awards.push({
      id: 'demolition',
      title: 'Demolition Crew',
      subtitle: 'Most terrain chunks blasted',
      badge: 'BOOM',
      winnerName: topDemo.name,
      winnerColor: topDemo.color,
      valueLabel: `${Math.max(1, Math.round(topDemo.blocksDestroyed / 150))} chunks`,
    });
  }

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
