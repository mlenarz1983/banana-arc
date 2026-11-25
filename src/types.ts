export type ThemeMode = 'modern' | 'retro';

export type PlanetId = 'earth' | 'moon' | 'mars' | 'jupiter';

export type BotDifficulty = 'easy' | 'normal' | 'clever';

export type ThrowDirection = 1 | -1;

export type HatStyle = 'bandana' | 'cap' | 'crown' | 'beanie';

export type GorillaAnimation = 'idle' | 'aiming' | 'throwing' | 'celebrate' | 'ouch';

export type GamePhase =
  | 'setup'
  | 'aiming'
  | 'flying'
  | 'exploding'
  | 'round_summary'
  | 'game_over';

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlanetPreset {
  id: PlanetId;
  name: string;
  gravity: number; // m/s^2
  tagline: string;
  defaultSpeed: number;
}

export interface ShotRecord {
  originX: number;
  originY: number;
  angleDeg: number;
  speed: number;
  direction: ThrowDirection;
  points: Vec2[];
  apexMeters: number;
  distanceMeters: number;
  flightTime: number;
  outcome: 'hit' | 'splash' | 'building' | 'self' | 'out';
}

export interface Player {
  id: number;
  name: string;
  color: string;
  accentColor: string;
  hatStyle: HatStyle;
  isBot: boolean;
  botDifficulty: BotDifficulty;
  x: number;
  y: number; // feet Y position on rooftop
  buildingIndex: number;
  score: number;
  hits: number;
  splashHits: number;
  sunBonks: number;
  maxApexMeters: number;
  blocksDestroyed: number;
  directSnipes: number;
  shotsTaken: number;
  lastShot: ShotRecord | null;
  preferredAngle: number;
  preferredSpeed: number;
  preferredDirection: ThrowDirection;
  animation: GorillaAnimation;
  animationTimer: number;
}

export interface Building {
  x: number;
  width: number;
  height: number;
  topY: number;
  colorIndex: number;
  windowCols: number;
  windowRows: number;
  windowSeed: number;
  roofStyle: 'flat' | 'antenna' | 'watertower' | 'stepped';
}

export interface Crater {
  x: number;
  y: number;
  radius: number;
}

export interface Banana {
  active: boolean;
  x: number;
  y: number;
  vx: number; // m/s (right is +)
  vy: number; // m/s (up is +)
  originX: number;
  originY: number;
  angleDeg: number;
  speed: number;
  direction: ThrowDirection;
  elapsed: number;
  spin: number;
  ownerId: number;
  trail: Vec2[];
  maxApexMeters: number;
  hitSun: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  shape: 'circle' | 'square' | 'peel' | 'spark';
  rotation: number;
  vRot: number;
  gravityScale: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export interface Cloud {
  x: number;
  y: number;
  width: number;
  height: number;
  speedFactor: number;
  opacity: number;
}

export interface WindWisp {
  x: number;
  y: number;
  length: number;
  speedFactor: number;
  alpha: number;
}

export interface Award {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  winnerName: string;
  winnerColor: string;
  valueLabel: string;
}

export interface GameConfig {
  humanCount: number; // 1..4 (when 1, Robo-Kong joins as Player 2)
  rounds: number;
  planetId: PlanetId;
  botDifficulty: BotDifficulty;
  playerNames: string[];
}

export interface PlayerPreset {
  defaultName: string;
  color: string;
  accentColor: string;
  hatStyle: HatStyle;
}
