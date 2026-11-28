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

/**
 * A player-placed flat Physics Lab Mirror Panel for elastic bank shots (θ_i = θ_r).
 */
export interface MirrorPanel {
  id: number;
  x: number; // center X in world px
  y: number; // center Y in world px
  halfLength: number; // half width along surface
  angleDeg: number; // tilt in degrees (-80..80, 0 = horizontal flat mirror)
  ownerId: number;
  ownerColor: string;
  locked: boolean; // false while player is positioning/tilting it
  bounceAnim: number; // >0 briefly after impact flash
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

export type RectStyle =
  | 'building'
  | 'spire'
  | 'beacon-spire'
  | 'trunk'
  | 'bridge-tower'
  | 'bridge-deck'
  | 'clock'
  | 'dome'
  | 'cylinder'
  | 'glass-cylinder'
  | 'corncob'
  | 'xbrace'
  | 'twin-crown'
  | 'gold-crown'
  | 'deck'
  | 'bean';

export type PolyStyle =
  | 'pyramid'
  | 'mountain'
  | 'snow-peak'
  | 'volcano'
  | 'sail'
  | 'canopy'
  | 'landmark'
  | 'spire'
  | 'xbrace-taper'
  | 'gold-lattice'
  | 'eiffel-lattice'
  | 'diamond-roof'
  | 'shard'
  | 'gherkin'
  | 'transamerica';

export type TerrainShape =
  | {
      kind: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
      colorIndex: number;
      style?: RectStyle;
      windowSeed?: number;
      accent?: string;
    }
  | {
      kind: 'poly';
      points: Vec2[];
      colorIndex: number;
      style?: PolyStyle;
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
      style?: 'gateway-arch' | 'harbour-bridge' | 'eiffel-base';
    };

export interface CableSpan {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  sag: number;
  color: string;
  suspenderCount?: number;
  deckY?: number;
}

export interface LocationSpec {
  id: ConcreteLocationId;
  name: string;
  region: string;
  category: 'city' | 'wild';
  skyMood: 'sunset' | 'twilight' | 'desert' | 'tropical' | 'volcanic' | 'alpine';
  shapes: TerrainShape[];
  cables?: CableSpan[]; // decorative bridge suspension cables (non-colliding)
  spawnSpots: Vec2[];
  backdrop?: 'mt-fuji' | 'mt-rainier' | 'lava-glow' | 'bay-water' | 'jungle-mist' | 'alpine-peaks' | 'lake-michigan' | 'city-depth';
}

export interface Banana {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
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
  humanCount: number;
  rounds: number;
  triesPerTurn: number;
  planetId: PlanetId;
  locationId: LocationId;
  enableMirrors: boolean;
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
  canPlaceMirror: boolean;
  mirrorCount: number;
  draftMirror: { x: number; y: number; angleDeg: number } | null;
  showAimHint: boolean;
  showSolution: boolean;
  showPhysicsLab: boolean;
  theme: ThemeMode;
  muted: boolean;
  scores: Array<{ name: string; color: string; score: number; active: boolean }>;
  solutionSummary?: string;
  winnerText?: string;
}

export type ControllerCommand =
  | { type: 'hello'; deviceName?: string }
  | { type: 'aim'; angle?: number; speed?: number; direction?: ThrowDirection }
  | { type: 'move'; dir: -1 | 1 }
  | { type: 'mirror_start' }
  | { type: 'mirror_update'; x?: number; y?: number; angleDeg?: number }
  | { type: 'mirror_lock' }
  | { type: 'mirror_cancel' }
  | { type: 'throw' }
  | { type: 'toggle'; key: 'theme' | 'hint' | 'solution' | 'lab' | 'sound' }
  | { type: 'rematch' };
