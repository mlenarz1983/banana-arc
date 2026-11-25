import type { PlanetId, PlanetPreset, PlayerPreset } from './types';

export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 680;
export const PIXELS_PER_METER = 6; // 200m wide skyline, ~113m tall

export const GORILLA_WIDTH = 40;
export const GORILLA_HEIGHT = 44;
export const GORILLA_HIT_RADIUS = 23;
export const GORILLA_HAND_OFFSET_Y = 30;

export const BANANA_RADIUS = 7;
export const CRATER_RADIUS = 30;
export const SPLASH_RADIUS = 56;
export const SELF_HIT_GRACE_SEC = 0.28;
export const MAX_FLIGHT_SEC = 16;

export const SUN_X = WORLD_WIDTH / 2;
export const SUN_Y = 74;
export const SUN_RADIUS = 34;

export const MIN_ANGLE = 5;
export const MAX_ANGLE = 88;
export const MIN_SPEED = 8;
export const MAX_SPEED = 95;

export const SCORE_DIRECT_HIT = 100;
export const SCORE_SPLASH_HIT = 40;
export const SCORE_SUN_BONK = 15;
export const SCORE_LONG_SHOT_BONUS = 25;
export const LONG_SHOT_METERS = 95;

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

export const PLAYER_PRESETS: PlayerPreset[] = [
  {
    defaultName: 'Kong',
    color: '#d9534f',
    accentColor: '#ffd166',
    hatStyle: 'bandana',
  },
  {
    defaultName: 'Bongo',
    color: '#2a9d8f',
    accentColor: '#ffe066',
    hatStyle: 'cap',
  },
  {
    defaultName: 'Zuzu',
    color: '#e76f51',
    accentColor: '#ffffff',
    hatStyle: 'crown',
  },
  {
    defaultName: 'Momo',
    color: '#3b82f6',
    accentColor: '#fde047',
    hatStyle: 'beanie',
  },
];

export const BOT_PRESET: PlayerPreset = {
  defaultName: 'Robo-Kong',
  color: '#0ea5a4',
  accentColor: '#fde047',
  hatStyle: 'cap',
};
