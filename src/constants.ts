import type { PlanetId, PlanetPreset } from './types';

export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 680;
export const PIXELS_PER_METER = 6; // 200m wide stage, ~113m tall

export const GORILLA_WIDTH = 40;
export const GORILLA_HEIGHT = 44;
export const GORILLA_HIT_RADIUS = 22;
export const GORILLA_HAND_OFFSET_Y = 38; // launch cleanly above shoulder/head
export const OWNER_CLEARANCE_RADIUS = 46; // banana must clear this before self-hit arms

export const BANANA_RADIUS = 7;
export const CRATER_RADIUS = 30;
export const SPLASH_RADIUS = 56;
export const SELF_HIT_MIN_SEC = 0.36;
export const MAX_FLIGHT_SEC = 16;

export const TIRE_RADIUS = 24;
export const TIRE_RESTITUTION = 0.94;
export const MAX_TIRE_BOUNCES = 5;

export const SUN_X = WORLD_WIDTH / 2;
export const SUN_Y = 72;
export const SUN_RADIUS = 32;

// Expanded angle range: flat (0°) and downward (-30°) throws from high roofs!
export const MIN_ANGLE = -30;
export const MAX_ANGLE = 89;
export const MIN_SPEED = 8;
export const MAX_SPEED = 95;

export const SCORE_DIRECT_HIT = 100;
export const SCORE_SPLASH_HIT = 40;
export const SCORE_SUN_BONK = 15;
export const SCORE_LONG_SHOT_BONUS = 25;
export const SCORE_FIRST_TRY_BONUS = 25;
export const SCORE_BANK_SHOT_BONUS = 20;
export const LONG_SHOT_METERS = 95;

export const MOVE_STEP_PX = 18;
export const MAX_MOVES_PER_TURN = 8;
export const MAX_CLIMB_PX = 4;

export const PLANETS: Record<PlanetId, PlanetPreset> = {
  earth: {
    id: 'earth',
    name: 'Earth',
    gravity: 9.8,
    tagline: 'Classic 9.8 m/s² gravity',
    defaultSpeed: 40,
  },
  moon: {
    id: 'moon',
    name: 'Moon',
    gravity: 1.62,
    tagline: 'Floaty 1.6 m/s² giant arcs!',
    defaultSpeed: 18,
  },
  mars: {
    id: 'mars',
    name: 'Mars',
    gravity: 3.71,
    tagline: 'High-flying 3.7 m/s² hops',
    defaultSpeed: 26,
  },
  jupiter: {
    id: 'jupiter',
    name: 'Jupiter',
    gravity: 24.8,
    tagline: 'Heavy 24.8 m/s² fastballs!',
    defaultSpeed: 64,
  },
};

export const PLANET_ORDER: PlanetId[] = ['earth', 'moon', 'mars', 'jupiter'];
