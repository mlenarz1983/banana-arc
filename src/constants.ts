import type { PlanetId, PlanetPreset } from './types';

export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 680;
export const PIXELS_PER_METER = 6; // 200m wide stage, ~113m tall

// Bigger, TV-readable gorillas (~1.45x larger!)
export const GORILLA_SCALE = 1.42;
export const GORILLA_WIDTH = 56;
export const GORILLA_HEIGHT = 64;
export const GORILLA_HIT_RADIUS = 28;
export const GORILLA_HIT_CENTER_Y = 31;
export const GORILLA_HAND_OFFSET_Y = 52; // launch cleanly above shoulder/head
export const OWNER_CLEARANCE_RADIUS = 58; // banana must clear this before self-hit arms

export const BANANA_RADIUS = 7;
export const CRATER_RADIUS = 30;
export const SPLASH_RADIUS = 60;
export const SELF_HIT_MIN_SEC = 0.36;
export const MAX_FLIGHT_SEC = 16;

// Physics Lab Mirror Panel constants
export const MIRROR_HALF_LENGTH = 48; // 96 px wide flat reflective mirror!
export const MIRROR_HALF_THICKNESS = 6;
export const MIRROR_RESTITUTION = 0.98;
export const MAX_MIRROR_BOUNCES = 6;
export const MAX_MIRRORS_PER_ROUND = 4;
export const MIN_MIRROR_TILT = -80;
export const MAX_MIRROR_TILT = 80;

export const SUN_X = WORLD_WIDTH / 2;
export const SUN_Y = 72;
export const SUN_RADIUS = 32;

// Full angle range: flat (0°) and downward (-30°) throws from high towers!
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
