export type ThemeMode = 'modern' | 'retro';

export type PlanetId = 'earth' | 'moon' | 'mars' | 'jupiter';

export type BotDifficulty = 'easy' | 'normal' | 'clever';

export type ThrowDirection = 1 | -1;

export type CharacterId =
  | 'king-kong'
  | 'astro-ape'
  | 'prof-peel'
  | 'capt-bongo'
  | 'dj-kong'
  | 'chef-nana'
  | 'ninja-chimp'
  | 'robo-kong';

export type LocationId =
  | 'random'
  | 'nyc'
  | 'chicago'
  | 'san-francisco'
  | 'seattle'
  | 'atlanta'
  | 'st-louis'
  | 'paris'
  | 'london'
  | 'tokyo'
  | 'sydney'
  | 'cairo'
  | 'rio'
  | 'jungle'
  | 'volcano'
  | 'alps';

export type ConcreteLocationId = Exclude<LocationId, 'random'>;

export type GorillaAnimation = 'idle' | 'aiming' | 'throwing' | 'celebrate' | 'ouch';

export type GamePhase =
  | 'setup'
  | 'aiming'
  | 'flying'
  | 'exploding'
  | 'round_summary'
  | 'game_over';

export type AppMode = 'single' | 'tv-host' | 'controller';

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

export interface CharacterDef {
  id: CharacterId;
  name: string;
  title: string;
  color: string;
  accentColor: string;
  furColor: string;
  chestColor: string;
}

export interface BouncyTire {
  id: number;
  x: number;
  y: number;
  radius: number;
  balloonColor: string;
  phaseOffset: number;
  bounceAnim: number; // >0 briefly after impact
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
  bounces: number;
  outcome: 'hit' | 'splash' | 'building' | 'self' | 'out';
}

export interface Player {
  id: number;
  name: string;
  characterId: CharacterId;
  color: string;
  accentColor: string;
  isBot: boolean;
  botDifficulty: BotDifficulty;
  x: number;
  y: number; // feet Y position on terrain surface
  zoneIndex: number;
  score: number;
  hits: number;
  splashHits: number;
  bankShotHits: number;
  sunBonks: number;
  maxApexMeters: number;
  blocksDestroyed: number;
  shotsTaken: number;
  lastShot: ShotRecord | null;
  preferredAngle: number;
  preferredSpeed: number;
  preferredDirection: ThrowDirection;
  animation: GorillaAnimation;
  animationTimer: number;
}

export interface Crater {
  x: number;
  y: number;
  radius: number;
}

export type TerrainShape =
  | {
      kind: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
      colorIndex: number;
      style?:
        | 'building'
        | 'spire'
        | 'trunk'
        | 'bridge-tower'
        | 'bridge-deck'
        | 'clock'
        | 'dome'
        | 'cylinder'
        | 'xbrace'
        | 'deck';
      windowSeed?: number;
      accent?: string;
    }
  | {
      kind: 'poly';
      points: Vec2[];
      colorIndex: number;
      style?: 'pyramid' | 'mountain' | 'snow-peak' | 'volcano' | 'sail' | 'canopy' | 'landmark' | 'spire';
      accent?: string;
    }
  | {
      kind: 'arch';
      cx: number;
      baseY: number;
      outerRx: number;
      outerRy: number;
      thickness: number;
      colorIndex: number;
      style?: 'gateway-arch' | 'harbour-bridge';
    };

export interface LocationSpec {
  id: ConcreteLocationId;
  name: string;
  region: string;
  category: 'city' | 'wild';
  skyMood: 'sunset' | 'twilight' | 'desert' | 'tropical' | 'volcanic' | 'alpine';
  shapes: TerrainShape[];
  spawnSpots: Vec2[]; // candidate rooftop/ledge landing spots (x, approxTopY)
  backdrop?: 'mt-fuji' | 'mt-rainier' | 'lava-glow' | 'bay-water' | 'jungle-mist' | 'alpine-peaks';
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
  hasClearedOwner: boolean;
  bounces: number;
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

export interface VerifiedSolution {
  angleDeg: number;
  speed: number;
  direction: ThrowDirection;
  flightTime: number;
  bounces: number;
  targetPlayerId?: number;
  points: Vec2[];
}

export interface GameConfig {
  humanCount: number; // 1..4 (when 1, Robo-Kong joins as Player 2)
  rounds: number;
  triesPerTurn: number; // 1, 3, or 4
  planetId: PlanetId;
  locationId: LocationId;
  enableTires: boolean;
  botDifficulty: BotDifficulty;
  playerNames: string[];
  playerCharacters: CharacterId[];
}

export interface ControllerStateSnapshot {
  type: 'state';
  phase: GamePhase;
  round: number;
  totalRounds: number;
  locationName: string;
  planetName: string;
  gravity: number;
  windAccel: number;
  activePlayerName: string;
  activePlayerColor: string;
  activeCharacterId: CharacterId;
  activeIsBot: boolean;
  triesLeft: number;
  triesTotal: number;
  movesLeft: number;
  aimAngle: number;
  aimSpeed: number;
  aimDirection: ThrowDirection;
  canControl: boolean;
  showAimHint: boolean;
  showSolution: boolean;
  showPhysicsLab: boolean;
  theme: ThemeMode;
  muted: boolean;
  scores: Array<{ name: string; color: string; score: number; active: boolean }>;
  lastTip: string;
  winnerText?: string;
}

export type ControllerCommand =
  | { type: 'hello'; deviceName?: string }
  | { type: 'aim'; angle?: number; speed?: number; direction?: ThrowDirection }
  | { type: 'move'; dir: -1 | 1 }
  | { type: 'throw' }
  | { type: 'toggle'; key: 'theme' | 'hint' | 'solution' | 'lab' | 'sound' }
  | { type: 'rematch' };
