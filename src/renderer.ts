import { CHARACTERS } from './characters';
import {
  GORILLA_HAND_OFFSET_Y,
  GORILLA_SCALE,
  PIXELS_PER_METER,
  SUN_RADIUS,
  SUN_X,
  SUN_Y,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';
import { computeVelocityComponents, degToRad, sampleTrajectory } from './physics';
import type { SkylineTerrain } from './skyline';
import type {
  Banana,
  CableSpan,
  CharacterId,
  Cloud,
  FloatingText,
  MirrorPanel,
  Particle,
  PlanetId,
  Player,
  TerrainShape,
  ThemeMode,
  ThrowDirection,
  VerifiedSolution,
  WindWisp,
} from './types';

export interface RenderState {
  theme: ThemeMode;
  planetId: PlanetId;
  gravity: number;
  windAccel: number;
  terrain: SkylineTerrain;
  mirrors: MirrorPanel[];
  draftMirror: MirrorPanel | null;
  players: Player[];
  activePlayerIndex: number;
  aimAngle: number;
  aimSpeed: number;
  aimDirection: ThrowDirection;
  showAimHint: boolean;
  showPhysicsLab: boolean;
  showSolution: boolean;
  verifiedSolution: VerifiedSolution | null;
  showAimingGuides: boolean;
  banana: Banana | null;
  sunShocked: boolean;
  particles: Particle[];
  floatingTexts: FloatingText[];
  clouds: Cloud[];
  windWisps: WindWisp[];
  timeSec: number;
  shakeOffset: { x: number; y: number };
}

const MODERN_PALETTE = [
  { body: '#26364a', shade: '#1a2636', trim: '#466182', winLit: '#ffd97d', winOff: '#16202e' },
  { body: '#453c52', shade: '#332b3d', trim: '#665a78', winLit: '#ffe29a', winOff: '#26202e' },
  { body: '#2c4f57', shade: '#1e3940', trim: '#4a7a85', winLit: '#ffdf85', winOff: '#162c30' },
  { body: '#5f4038', shade: '#462e28', trim: '#875c51', winLit: '#ffd573', winOff: '#33201b' },
];

const RETRO_PALETTE = [
  { body: '#00aaaa', shade: '#007777', trim: '#55ffff', winLit: '#ffff55', winOff: '#004444' },
  { body: '#aa0000', shade: '#770000', trim: '#ff5555', winLit: '#ffff55', winOff: '#440000' },
  { body: '#aaaaaa', shade: '#777777', trim: '#ffffff', winLit: '#ffff55', winOff: '#444444' },
  { body: '#008888', shade: '#005555', trim: '#55ffff', winLit: '#ffff55', winOff: '#003333' },
];

function hash2d(seed: number, x: number, y: number): number {
  let h = (seed ^ (x * 374761393) ^ (y * 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Shared character body/headgear drawing helper used BOTH in-game (at GORILLA_SCALE)
 * and in the Setup modal's visual avatar portrait cards!
 */
export function drawGorillaCharacter(
  ctx: CanvasRenderingContext2D,
  characterId: CharacterId,
  animation: Player['animation'],
  theme: ThemeMode,
  timeSec: number,
): void {
  const ch = CHARACTERS[characterId];
  const armsUp = animation === 'celebrate' || animation === 'throwing';

  if (theme === 'retro') {
    const fur = characterId === 'robo-kong' ? '#888888' : '#cc7a33';
    const chest =
      characterId === 'astro-ape'
        ? '#ffffff'
        : characterId === 'robo-kong'
          ? '#cccccc'
          : '#e6a15c';

    ctx.fillStyle = fur;
    ctx.fillRect(-13, -12, 10, 12);
    ctx.fillRect(3, -12, 10, 12);
    ctx.fillRect(-15, -30, 30, 20);
    ctx.fillStyle = chest;
    ctx.fillRect(-9, -27, 18, 13);
    ctx.fillStyle = fur;
    ctx.fillRect(-9, -41, 18, 12);

    if (characterId === 'king-kong') {
      ctx.fillStyle = '#ffff55';
      ctx.fillRect(-9, -48, 18, 7);
      ctx.fillRect(-9, -51, 4, 3);
      ctx.fillRect(-2, -52, 4, 4);
      ctx.fillRect(5, -51, 4, 3);
    } else if (characterId === 'astro-ape') {
      ctx.strokeStyle = '#55ffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(-12, -45, 24, 17);
    } else if (characterId === 'chef-nana') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-10, -53, 20, 12);
    } else if (characterId === 'dj-kong') {
      ctx.fillStyle = '#55ffff';
      ctx.fillRect(-12, -41, 4, 9);
      ctx.fillRect(8, -41, 4, 9);
      ctx.fillRect(-10, -45, 20, 4);
    } else if (characterId === 'capt-bongo') {
      ctx.fillStyle = '#222222';
      ctx.fillRect(-12, -47, 24, 7);
      ctx.fillStyle = '#ffff55';
      ctx.fillRect(-10, -43, 20, 2);
    } else if (characterId === 'prof-peel') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-10, -45, 20, 4);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-8, -39, 6, 5);
      ctx.strokeRect(2, -39, 6, 5);
    } else {
      ctx.fillStyle = ch.color;
      ctx.fillRect(-10, -44, 20, 5);
    }

    ctx.fillStyle = characterId === 'robo-kong' ? '#55ffff' : '#000000';
    ctx.fillRect(-6, -37, 4, 3);
    ctx.fillRect(2, -37, 4, 3);

    ctx.fillStyle = fur;
    const alt = animation === 'celebrate' && Math.floor(timeSec * 8) % 2 === 0;
    if (armsUp) {
      ctx.fillRect(-22, alt ? -42 : -38, 8, 16);
      ctx.fillRect(14, alt ? -38 : -42, 8, 16);
    } else {
      ctx.fillRect(-22, -28, 7, 16);
      ctx.fillRect(15, -28, 7, 16);
    }
    return;
  }

  // Modern detailed gorilla with crisp contrast outline for TV visibility
  const fur = ch.furColor;
  const chest = ch.chestColor;
  const skin = characterId === 'robo-kong' ? '#cbd5e1' : '#d2a684';

  // Ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 19, 4.8, 0, 0, Math.PI * 2);
  ctx.fill();

  const wave = animation === 'celebrate' ? Math.sin(timeSec * 14) * 5 : 0;

  // Arms (with dark contrast halo)
  ctx.lineCap = 'round';
  for (const [stroke, width] of [
    ['rgba(15,23,42,0.75)', 11],
    [fur, 8.2],
  ] as const) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    if (armsUp) {
      ctx.moveTo(-13, -24);
      ctx.quadraticCurveTo(-24, -32, -19, -42 + wave);
      ctx.moveTo(13, -24);
      ctx.quadraticCurveTo(24, -32, 19, -42 - wave);
    } else {
      ctx.moveTo(-13, -24);
      ctx.quadraticCurveTo(-22, -16, -18, -8);
      ctx.moveTo(13, -24);
      ctx.quadraticCurveTo(22, -16, 18, -8);
    }
    ctx.stroke();
  }

  // Colored wristbands
  ctx.strokeStyle = ch.color;
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  if (armsUp) {
    ctx.moveTo(-21, -37 + wave);
    ctx.lineTo(-17, -37 + wave);
    ctx.moveTo(17, -37 - wave);
    ctx.lineTo(21, -37 - wave);
  } else {
    ctx.moveTo(-20, -11);
    ctx.lineTo(-16, -11);
    ctx.moveTo(16, -11);
    ctx.lineTo(20, -11);
  }
  ctx.stroke();

  // Legs
  ctx.fillStyle = fur;
  ctx.strokeStyle = 'rgba(15,23,42,0.72)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(-12, -12, 9, 12, 4);
  ctx.roundRect(3, -12, 9, 12, 4);
  ctx.fill();
  ctx.stroke();

  // Torso
  ctx.beginPath();
  ctx.ellipse(0, -21, 16, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = chest;
  ctx.beginPath();
  ctx.ellipse(0, -20, 10, 8.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.arc(0, -35, 11.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Face oval
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(0, -33, 7.8, 6.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes / Visor
  if (characterId === 'robo-kong') {
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(-7.5, -37.2, 15, 4.8);
    ctx.fillStyle = '#ecfeff';
    ctx.fillRect(-5.5, -36.2, 5.5, 2.2);
  } else if (animation === 'ouch') {
    ctx.strokeStyle = '#1f1a18';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-5, -36);
    ctx.lineTo(-1, -32);
    ctx.moveTo(-1, -36);
    ctx.lineTo(-5, -32);
    ctx.moveTo(1, -36);
    ctx.lineTo(5, -32);
    ctx.moveTo(5, -36);
    ctx.lineTo(1, -32);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#1f1a18';
    ctx.beginPath();
    ctx.arc(-3.6, -34.5, 1.9, 0, Math.PI * 2);
    ctx.arc(3.6, -34.5, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f1a18';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, -31.5, 3.6, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  }

  // Distinct Character Headgear (bold & unmistakable on TV!)
  switch (characterId) {
    case 'king-kong': {
      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-10, -43);
      ctx.lineTo(-10, -53);
      ctx.lineTo(-4, -47);
      ctx.lineTo(0, -55);
      ctx.lineTo(4, -47);
      ctx.lineTo(10, -53);
      ctx.lineTo(10, -43);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-10.5, -44, 21, 4);
      break;
    }
    case 'astro-ape': {
      ctx.strokeStyle = '#93c5fd';
      ctx.fillStyle = 'rgba(147, 197, 253, 0.28)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, -35, 15.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -35, 12.2, -2.5, -1.65);
      ctx.stroke();
      break;
    }
    case 'prof-peel': {
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.arc(-10, -42, 4.5, 0, Math.PI * 2);
      ctx.arc(10, -42, 4.5, 0, Math.PI * 2);
      ctx.arc(0, -47, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-3.8, -34.5, 3.8, 0, Math.PI * 2);
      ctx.arc(3.8, -34.5, 3.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(-6, -26);
      ctx.lineTo(0, -23.5);
      ctx.lineTo(-6, -21);
      ctx.moveTo(6, -26);
      ctx.lineTo(0, -23.5);
      ctx.lineTo(6, -21);
      ctx.fill();
      break;
    }
    case 'capt-bongo': {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(-16, -42);
      ctx.quadraticCurveTo(0, -58, 16, -42);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Skull dot + eyepatch
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -47, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(3.6, -34.5, 3.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'dj-kong': {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-8.5, -37.2, 17, 4.8);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(0, -35, 13.5, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(-16, -40, 5.5, 10);
      ctx.fillRect(10.5, -40, 5.5, 10);
      break;
    }
    case 'chef-nana': {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.2;
      ctx.fillRect(-9.5, -50, 19, 8.5);
      ctx.beginPath();
      ctx.arc(-6.5, -51, 6, 0, Math.PI * 2);
      ctx.arc(0, -54.5, 7, 0, Math.PI * 2);
      ctx.arc(6.5, -51, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(-8, -26, 16, 4);
      break;
    }
    case 'ninja-chimp': {
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(-11.5, -43.5, 23, 5);
      const flutter = Math.sin(timeSec * 8) * 3;
      ctx.beginPath();
      ctx.moveTo(10.5, -41);
      ctx.lineTo(22, -44 + flutter);
      ctx.lineTo(19, -37 + flutter);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'robo-kong': {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(0, -46);
      ctx.lineTo(0, -55);
      ctx.stroke();
      ctx.fillStyle = Math.sin(timeSec * 8) > 0 ? '#22d3ee' : '#f43f5e';
      ctx.beginPath();
      ctx.arc(0, -56, 3.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

/**
 * Renders a crisp visual portrait of any gorilla character onto a small Setup modal <canvas>.
 */
export function renderCharacterAvatar(
  canvas: HTMLCanvasElement,
  characterId: CharacterId,
  theme: ThemeMode = 'modern',
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const ch = CHARACTERS[characterId];
  const grad = ctx.createRadialGradient(w / 2, h * 0.4, 4, w / 2, h / 2, w * 0.65);
  grad.addColorStop(0, `${ch.color}38`);
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2, h * 0.91);
  const scale = (h / 72) * 1.05;
  ctx.scale(scale, scale);
  drawGorillaCharacter(ctx, characterId, 'idle', theme, 0.4);
  ctx.restore();
}

export class GameRenderer {
  private static readonly TERRAIN_DPR = 2;
  private terrainCanvas: HTMLCanvasElement;
  private terrainCtx: CanvasRenderingContext2D;
  private cachedTheme: ThemeMode | null = null;
  private cachedCraterCount = -1;
  private cachedTerrainRef: SkylineTerrain | null = null;

  constructor() {
    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = WORLD_WIDTH * GameRenderer.TERRAIN_DPR;
    this.terrainCanvas.height = WORLD_HEIGHT * GameRenderer.TERRAIN_DPR;
    const ctx = this.terrainCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not initialize offscreen terrain canvas');
    this.terrainCtx = ctx;
  }

  invalidateBuildings(): void {
    this.cachedTerrainRef = null;
  }

  private ensureTerrainLayer(terrain: SkylineTerrain, theme: ThemeMode): void {
    if (
      this.cachedTerrainRef === terrain &&
      this.cachedTheme === theme &&
      this.cachedCraterCount === terrain.craters.length
    ) {
      return;
    }

    const ctx = this.terrainCtx;
    ctx.setTransform(GameRenderer.TERRAIN_DPR, 0, 0, GameRenderer.TERRAIN_DPR, 0, 0);
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const palette = theme === 'retro' ? RETRO_PALETTE : MODERN_PALETTE;
    const loc = terrain.location;

    for (const shape of loc.shapes) {
      this.drawTerrainShape(ctx, shape, palette[shape.colorIndex % palette.length], theme, loc.id);
    }

    // Punch blast craters with charred rims
    for (const crater of terrain.craters) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = theme === 'retro' ? '#222222' : 'rgba(18, 16, 20, 0.72)';
      ctx.beginPath();
      ctx.arc(crater.x, crater.y, crater.radius + (theme === 'retro' ? 4 : 6), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(crater.x, crater.y, crater.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    this.cachedTerrainRef = terrain;
    this.cachedTheme = theme;
    this.cachedCraterCount = terrain.craters.length;
  }

  private drawTerrainShape(
    ctx: CanvasRenderingContext2D,
    shape: TerrainShape,
    colors: { body: string; shade: string; trim: string; winLit: string; winOff: string },
    theme: ThemeMode,
    locId: string,
  ): void {
    if (shape.kind === 'rect') {
      const style = shape.style ?? 'building';

      if (style === 'bean') {
        // Chicago Cloud Gate ("The Bean") gleaming mirrored sculpture!
        ctx.save();
        const cx = shape.x + shape.width / 2;
        const cy = shape.y + shape.height * 0.58;
        const g = ctx.createLinearGradient(shape.x, shape.y, shape.x, shape.y + shape.height);
        g.addColorStop(0, '#f8fafc');
        g.addColorStop(0.5, '#94a3b8');
        g.addColorStop(1, '#334155');
        ctx.fillStyle = theme === 'retro' ? '#cccccc' : g;
        ctx.beginPath();
        ctx.ellipse(cx, cy, shape.width * 0.5, shape.height * 0.52, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath();
        ctx.ellipse(cx - 8, cy - 6, shape.width * 0.24, shape.height * 0.16, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }

      if (style === 'trunk') {
        ctx.fillStyle = theme === 'retro' ? '#aa5500' : '#6b4226';
        ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        ctx.fillStyle = theme === 'retro' ? '#552200' : '#4f2f1a';
        ctx.fillRect(shape.x + shape.width - 14, shape.y, 14, shape.height);
        ctx.strokeStyle = theme === 'retro' ? '#331100' : 'rgba(40,20,8,0.35)';
        ctx.lineWidth = 2;
        for (let bx = shape.x + 12; bx < shape.x + shape.width - 12; bx += 14) {
          ctx.beginPath();
          ctx.moveTo(bx, shape.y + 8);
          ctx.lineTo(bx, shape.y + shape.height);
          ctx.stroke();
        }
        return;
      }

      if (style === 'deck') {
        const isJungle = locId === 'jungle';
        const isCairo = locId === 'cairo';
        const isAlps = locId === 'alps';
        const isVolcano = locId === 'volcano';
        const body =
          theme === 'retro'
            ? isJungle
              ? '#00aa00'
              : isCairo
                ? '#aa7700'
                : isAlps
                  ? '#aaaaaa'
                  : colors.body
            : shape.accent ??
              (isJungle
                ? '#2f6f3e'
                : isCairo
                  ? '#c69353'
                  : isAlps
                    ? '#475569'
                    : isVolcano
                      ? '#2d2424'
                      : colors.body);
        ctx.fillStyle = body;
        ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        ctx.fillStyle = isJungle
          ? theme === 'retro'
            ? '#55ff55'
            : '#4ade80'
          : isAlps
            ? '#f8fafc'
            : isCairo
              ? '#e5b97a'
              : isVolcano
                ? '#57403b'
                : colors.trim;
        ctx.fillRect(shape.x, shape.y, shape.width, theme === 'retro' ? 6 : 9);
        return;
      }

      if (style === 'bridge-tower' || style === 'bridge-deck') {
        const bridgeColor =
          theme === 'retro'
            ? shape.accent
              ? '#ff5555'
              : '#aa5500'
            : shape.accent ?? '#9a5b42';
        ctx.fillStyle = bridgeColor;
        ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(shape.x + shape.width - 7, shape.y, 7, shape.height);
        if (style === 'bridge-tower') {
          // Cross-braced Art Deco tower struts scaled to tower height
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.fillRect(shape.x, shape.y + shape.height * 0.14, shape.width, 4);
          ctx.fillRect(shape.x, shape.y + shape.height * 0.36, shape.width, 4);
          ctx.fillRect(shape.x, shape.y + shape.height * 0.58, shape.width, 4);
        } else {
          ctx.fillStyle = theme === 'retro' ? '#ffff55' : '#e2e8f0';
          ctx.fillRect(shape.x, shape.y, shape.width, 3);
        }
        return;
      }

      if (style === 'spire' || style === 'beacon-spire') {
        ctx.fillStyle = theme === 'retro' ? '#ffffff' : shape.accent ?? '#e2e8f0';
        ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        return;
      }

      if (style === 'corncob') {
        // Chicago Marina City scalloped cylindrical balcony rings
        ctx.fillStyle = theme === 'retro' ? '#aaaaaa' : shape.accent ?? '#cbd5e1';
        ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
        ctx.fillRect(shape.x + shape.width - 10, shape.y, 10, shape.height);
        for (let y = shape.y + 6; y < WORLD_HEIGHT - 8; y += 9) {
          ctx.fillStyle = theme === 'retro' ? '#444444' : '#334155';
          ctx.fillRect(shape.x + 2, y, shape.width - 4, 3.5);
          ctx.fillStyle = theme === 'retro' ? '#ffffff' : '#f1f5f9';
          ctx.fillRect(shape.x, y + 3.5, shape.width, 2);
        }
        return;
      }

      if (style === 'glass-cylinder') {
        // Reflective glass curtain wall (Atlanta Westin Peachtree, Chicago Aon, SF Salesforce)
        const baseColor = theme === 'retro' ? '#00aaaa' : shape.accent ?? '#3b6e8c';
        ctx.fillStyle = baseColor;
        ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        if (theme === 'modern') {
          const g = ctx.createLinearGradient(shape.x, 0, shape.x + shape.width, 0);
          g.addColorStop(0, 'rgba(15,23,42,0.35)');
          g.addColorStop(0.32, 'rgba(255,255,255,0.28)');
          g.addColorStop(0.65, 'rgba(15,23,42,0.08)');
          g.addColorStop(1, 'rgba(15,23,42,0.45)');
          ctx.fillStyle = g;
          ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1.2;
        for (let vx = shape.x + 8; vx < shape.x + shape.width - 5; vx += 9) {
          ctx.beginPath();
          ctx.moveTo(vx, shape.y);
          ctx.lineTo(vx, WORLD_HEIGHT);
          ctx.stroke();
        }
        for (let wy = shape.y + 10; wy < WORLD_HEIGHT - 8; wy += 11) {
          ctx.fillStyle =
            hash2d(shape.windowSeed ?? 7, wy, 1) > 0.4
              ? 'rgba(254, 240, 138, 0.55)'
              : 'rgba(15,23,42,0.24)';
          ctx.fillRect(shape.x + 5, wy, shape.width - 10, 3);
        }
        return;
      }

      // Standard skyscraper / landmark tower
      const bodyCol = theme === 'retro' ? colors.body : shape.accent ?? colors.body;
      ctx.fillStyle = bodyCol;
      ctx.fillRect(shape.x, shape.y, shape.width, shape.height);

      const shadeW = theme === 'retro' ? 6 : Math.max(8, Math.floor(shape.width * 0.17));
      ctx.fillStyle = theme === 'retro' ? colors.shade : 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(shape.x + shape.width - shadeW, shape.y, shadeW, shape.height);

      ctx.fillStyle = style === 'gold-crown' ? '#fbbf24' : colors.trim;
      ctx.fillRect(shape.x, shape.y, shape.width, style === 'gold-crown' ? 6 : theme === 'retro' ? 3 : 4);

      if (style === 'twin-crown') {
        // Atlanta 191 Peachtree twin illuminated Gothic crowns
        const cw = Math.min(24, Math.max(14, Math.round(shape.width * 0.26)));
        const ch = 8;
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(shape.x + 7, shape.y - ch, cw, ch);
        ctx.fillRect(shape.x + shape.width - cw - 7, shape.y - ch, cw, ch);
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(shape.x + 7, shape.y - ch, cw, ch);
        ctx.strokeRect(shape.x + shape.width - cw - 7, shape.y - ch, cw, ch);
      }

      if (theme === 'retro') {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(shape.x + 1, shape.y + 1, shape.width - 2, shape.height);
      }

      if (shape.width >= 34 && shape.height >= 36) {
        const cols = Math.max(2, Math.floor((shape.width - 14) / 14));
        const rowStep = 12;
        const rows = Math.max(2, Math.floor((shape.height - 14) / rowStep));
        const usableW = shape.width - 18 - (theme === 'retro' ? 3 : 5);
        const colStep = usableW / cols;
        const winW = Math.max(5, Math.floor(colStep * 0.54));
        const winH = theme === 'retro' ? 5 : 6;
        const seed = shape.windowSeed ?? shape.x * 7 + shape.height;

        for (let r = 0; r < rows; r++) {
          const wy = shape.y + 10 + r * rowStep;
          if (wy + winH > WORLD_HEIGHT - 6) break;
          for (let c = 0; c < cols; c++) {
            const wx = Math.round(shape.x + 9 + c * colStep + (colStep - winW) * 0.5);
            const lit = hash2d(seed, c, r) > 0.38;
            ctx.fillStyle = lit ? colors.winLit : colors.winOff;
            ctx.fillRect(wx, wy, winW, winH);
          }
        }
      }

      if (style === 'clock') {
        const cx = shape.x + shape.width / 2;
        const radius = Math.min(14, shape.width * 0.34, shape.height * 0.16);
        const cy = shape.y + radius + 8;
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, cy - radius * 0.62);
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + radius * 0.45, cy + radius * 0.18);
        ctx.stroke();
      } else if (style === 'dome') {
        ctx.fillStyle = shape.accent ?? colors.trim;
        ctx.beginPath();
        ctx.arc(shape.x + shape.width / 2, shape.y + 6, shape.width * 0.44, Math.PI, 0);
        ctx.fill();
      }
      return;
    }

    if (shape.kind === 'poly') {
      if (shape.points.length < 3) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
      ctx.closePath();

      const style = shape.style ?? 'landmark';

      if (style === 'xbrace-taper') {
        // Chicago John Hancock Center — dark steel trapezoid + 5-tier diagonal X-bracing scaled to actual bounds
        let minX = WORLD_WIDTH,
          maxX = 0,
          minY = WORLD_HEIGHT,
          maxY = 0;
        for (const p of shape.points) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        const topPts = shape.points.filter((p) => Math.abs(p.y - minY) < 4);
        const topLeftX = topPts.length >= 2 ? Math.min(...topPts.map((p) => p.x)) : minX + 14;
        const topRightX = topPts.length >= 2 ? Math.max(...topPts.map((p) => p.x)) : maxX - 14;

        ctx.fillStyle = theme === 'retro' ? '#222222' : shape.accent ?? '#1e242b';
        ctx.fill();
        ctx.clip();

        for (let y = minY + 8; y < maxY - 8; y += 10) {
          ctx.fillStyle =
            hash2d(875, Math.round(y), 2) > 0.3
              ? 'rgba(254, 240, 138, 0.48)'
              : 'rgba(15,23,42,0.4)';
          ctx.fillRect(minX, y, maxX - minX, 3);
        }

        ctx.strokeStyle = theme === 'retro' ? '#55ffff' : '#94a3b8';
        ctx.lineWidth = 2.4;
        const tiers = 5;
        const spanY = Math.max(20, maxY - minY);
        const tierH = spanY / tiers;
        for (let t = 0; t < tiers; t++) {
          const y1 = minY + t * tierH;
          const y2 = y1 + tierH;
          const f1 = t / tiers;
          const f2 = (t + 1) / tiers;
          const xl1 = topLeftX + (minX - topLeftX) * f1;
          const xr1 = topRightX + (maxX - topRightX) * f1;
          const xl2 = topLeftX + (minX - topLeftX) * f2;
          const xr2 = topRightX + (maxX - topRightX) * f2;
          ctx.beginPath();
          ctx.moveTo(xl1, y1);
          ctx.lineTo(xr2, y2);
          ctx.moveTo(xr1, y1);
          ctx.lineTo(xl2, y2);
          ctx.moveTo(xl1, y1);
          ctx.lineTo(xr1, y1);
          ctx.stroke();
        }
      } else if (style === 'gold-lattice') {
        // Atlanta Bank of America Plaza & One Atlantic Center glowing gilded open-lattice spire
        ctx.fillStyle = theme === 'retro' ? '#aa7700' : 'rgba(251, 191, 36, 0.36)';
        ctx.fill();
        ctx.strokeStyle = theme === 'retro' ? '#ffff55' : shape.accent ?? '#fbbf24';
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.clip();
        const [p0, apex, p2] = shape.points;
        for (let k = 1; k <= 4; k++) {
          const f = k / 5;
          const ly = p0.y + (apex.y - p0.y) * f;
          ctx.beginPath();
          ctx.moveTo(p0.x, ly);
          ctx.lineTo(p2.x, ly);
          ctx.stroke();
        }
      } else if (style === 'eiffel-lattice') {
        // Paris Eiffel Tower & Tokyo Tower crisp open truss lattice
        ctx.fillStyle = theme === 'retro' ? '#aa5500' : shape.accent ?? '#8c6248';
        ctx.fill();
        ctx.clip();
        let minY = WORLD_HEIGHT,
          maxY = 0,
          minX = WORLD_WIDTH,
          maxX = 0;
        for (const p of shape.points) {
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
        }
        const step = Math.max(12, (maxY - minY) / 7);
        ctx.strokeStyle = theme === 'retro' ? '#ffff55' : 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.6;
        for (let y = minY; y < maxY; y += step) {
          ctx.beginPath();
          ctx.moveTo(minX, y);
          ctx.lineTo(maxX, y + step);
          ctx.moveTo(maxX, y);
          ctx.lineTo(minX, y + step);
          ctx.stroke();
        }
        ctx.fillStyle = theme === 'retro' ? '#ffffff' : 'rgba(255, 255, 255, 0.6)';
        ctx.fillRect(minX, minY + (maxY - minY) * 0.45, maxX - minX, 4);
        ctx.fillRect(minX, minY + (maxY - minY) * 0.78, maxX - minX, 5);
      } else if (style === 'diamond-roof' || style === 'shard' || style === 'transamerica') {
        ctx.fillStyle = theme === 'retro' ? '#cccccc' : shape.accent ?? '#e2e8f0';
        ctx.fill();
        ctx.strokeStyle = theme === 'retro' ? '#000000' : 'rgba(30, 41, 59, 0.45)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        if (shape.points.length >= 3) {
          ctx.fillStyle = 'rgba(255,255,255,0.34)';
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          ctx.lineTo(shape.points[1].x, shape.points[1].y);
          ctx.lineTo((shape.points[0].x + shape.points[shape.points.length - 1].x) / 2, shape.points[0].y);
          ctx.closePath();
          ctx.fill();
        }
      } else if (style === 'gherkin') {
        let minX = WORLD_WIDTH,
          maxX = 0,
          minY = WORLD_HEIGHT,
          maxY = 0;
        for (const p of shape.points) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        ctx.fillStyle = theme === 'retro' ? '#00aaaa' : shape.accent ?? '#2c5e63';
        ctx.fill();
        ctx.clip();
        ctx.strokeStyle = 'rgba(186, 230, 253, 0.48)';
        ctx.lineWidth = 1.4;
        for (let y = minY - 30; y < maxY + 30; y += 14) {
          ctx.beginPath();
          ctx.moveTo(minX - 6, y);
          ctx.lineTo(maxX + 6, y + 34);
          ctx.moveTo(maxX + 6, y);
          ctx.lineTo(minX - 6, y + 34);
          ctx.stroke();
        }
      } else if (style === 'pyramid') {
        ctx.fillStyle = theme === 'retro' ? '#cc9933' : shape.accent ?? '#d9a05b';
        ctx.fill();
        if (shape.points.length === 3) {
          ctx.fillStyle = theme === 'retro' ? '#885511' : 'rgba(92, 56, 18, 0.34)';
          ctx.beginPath();
          ctx.moveTo(shape.points[1].x, shape.points[1].y);
          ctx.lineTo(shape.points[2].x, shape.points[2].y);
          ctx.lineTo(
            shape.points[1].x + (shape.points[2].x - shape.points[1].x) * 0.35,
            shape.points[2].y,
          );
          ctx.closePath();
          ctx.fill();
        }
      } else if (style === 'snow-peak') {
        ctx.fillStyle = theme === 'retro' ? '#778899' : '#4b6075';
        ctx.fill();
        let minY = WORLD_HEIGHT,
          maxY = 0;
        for (const p of shape.points) {
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        ctx.clip();
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, minY, WORLD_WIDTH, (maxY - minY) * 0.38);
      } else if (style === 'volcano') {
        ctx.fillStyle = theme === 'retro' ? '#442222' : '#332626';
        ctx.fill();
        ctx.strokeStyle = theme === 'retro' ? '#ff5555' : '#f97316';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (style === 'sail') {
        ctx.fillStyle = theme === 'retro' ? '#ffffff' : shape.accent ?? '#f8fafc';
        ctx.fill();
        ctx.strokeStyle = 'rgba(100,116,139,0.45)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = theme === 'retro' ? colors.body : shape.accent ?? colors.body;
        ctx.fill();
        ctx.strokeStyle = theme === 'retro' ? '#000000' : 'rgba(15, 23, 42, 0.28)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    if (shape.kind === 'arch') {
      const innerRx = Math.max(10, shape.outerRx - shape.thickness);
      const innerRy = Math.max(10, shape.outerRy - shape.thickness);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(shape.cx, shape.baseY, shape.outerRx, shape.outerRy, 0, Math.PI, 0, false);
      ctx.ellipse(shape.cx, shape.baseY, innerRx, innerRy, 0, 0, Math.PI, true);
      ctx.closePath();
      ctx.fillStyle =
        shape.style === 'gateway-arch'
          ? theme === 'retro'
            ? '#cccccc'
            : '#dbe4ef'
          : shape.style === 'eiffel-base'
            ? theme === 'retro'
              ? '#aa5500'
              : '#8c6248'
            : theme === 'retro'
              ? '#888888'
              : '#64748b';
      ctx.fill();
      ctx.strokeStyle = theme === 'retro' ? '#000000' : 'rgba(30, 41, 59, 0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawBridgeCables(ctx: CanvasRenderingContext2D, cables: CableSpan[], theme: ThemeMode): void {
    ctx.save();
    for (const c of cables) {
      const mx = (c.x1 + c.x2) / 2;
      const my = Math.max(c.y1, c.y2) + c.sag;
      ctx.strokeStyle = theme === 'retro' ? '#ffff55' : c.color;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(c.x1, c.y1);
      ctx.quadraticCurveTo(mx, my, c.x2, c.y2);
      ctx.stroke();

      if (c.suspenderCount && c.deckY !== undefined) {
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.7;
        for (let i = 1; i <= c.suspenderCount; i++) {
          const t = i / (c.suspenderCount + 1);
          const u = 1 - t;
          const sx = u * u * c.x1 + 2 * u * t * mx + t * t * c.x2;
          const sy = u * u * c.y1 + 2 * u * t * my + t * t * c.y2;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx, c.deckY);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  private drawSpireBeacons(ctx: CanvasRenderingContext2D, terrain: SkylineTerrain, timeSec: number): void {
    const pulse = 0.45 + 0.55 * Math.sin(timeSec * 4.5);
    ctx.save();
    for (const s of terrain.location.shapes) {
      if (s.kind === 'rect' && s.style === 'beacon-spire') {
        const bx = s.x + s.width / 2;
        const by = s.y;
        ctx.fillStyle = `rgba(239, 68, 68, ${pulse * 0.45})`;
        ctx.beginPath();
        ctx.arc(bx, by, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(254, 202, 202, ${0.5 + pulse * 0.5})`;
        ctx.beginPath();
        ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  render(ctx: CanvasRenderingContext2D, state: RenderState): void {
    ctx.save();
    ctx.translate(state.shakeOffset.x, state.shakeOffset.y);

    // 1. Sky & atmospheric depth backdrop
    this.drawSky(ctx, state);

    // 2. Clouds & wind wisps
    this.drawAtmosphere(ctx, state);

    // 3. Classic Sun
    this.drawSun(ctx, state.theme, state.sunShocked, state.timeSec);

    // 4. Subtle pure-vector wind arrow under sun (no text box in sky)
    this.drawWindVane(ctx, state.theme, state.windAccel);

    // 5. Bridge suspension cables (behind/integrated with terrain)
    if (state.terrain.location.cables) {
      this.drawBridgeCables(ctx, state.terrain.location.cables, state.theme);
    }

    // 6. High-DPI destructible terrain layer + blinking aviation beacons
    this.ensureTerrainLayer(state.terrain, state.theme);
    ctx.drawImage(this.terrainCanvas, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.drawSpireBeacons(ctx, state.terrain, state.timeSec);

    // 7. Player-Placed Mirror Panels (locked + live draft)
    this.drawMirrors(ctx, state.mirrors, state.draftMirror, state.theme, state.timeSec);

    // 8. Ghost trail of active player's previous shot (pure dashed curve)
    const activePlayer = state.players[state.activePlayerIndex];
    if (activePlayer?.lastShot && activePlayer.lastShot.points.length > 1) {
      this.drawGhostTrail(ctx, activePlayer, state.theme);
    }

    // 9. Verified Solution curve (when toggled On)
    if (state.showAimingGuides && state.showSolution && activePlayer && !activePlayer.isBot) {
      this.drawSolutionOverlay(ctx, state);
    }

    // 10. Aiming guides (vector, optional Vx/Vy arrows, optional aim hint with mirror bounce preview)
    if (state.showAimingGuides && activePlayer && !activePlayer.isBot) {
      this.drawAimingGuides(ctx, activePlayer, state);
    }

    // 11. TV-Readable Gorillas
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      const isActive = i === state.activePlayerIndex;
      this.drawGorilla(ctx, p, isActive, state.theme, state.timeSec);
    }

    // 12. Active flying banana & trail
    if (state.banana && state.banana.active) {
      this.drawBanana(ctx, state.banana, state.theme);
    }

    // 13. Particles & brief impact callouts
    this.drawParticles(ctx, state.particles);
    this.drawFloatingTexts(ctx, state.floatingTexts, state.theme);

    ctx.restore();
  }

  private drawMirrors(
    ctx: CanvasRenderingContext2D,
    mirrors: MirrorPanel[],
    draftMirror: MirrorPanel | null,
    theme: ThemeMode,
    timeSec: number,
  ): void {
    const all = draftMirror ? [...mirrors, draftMirror] : mirrors;
    for (const m of all) {
      const isDraft = !m.locked;
      const flash = m.bounceAnim > 0 ? m.bounceAnim / 0.45 : 0;

      ctx.save();
      ctx.translate(m.x, m.y);

      if (isDraft) {
        // Pulsing circular drag handle halo (no floating text over sky)
        const pulse = 1 + Math.sin(timeSec * 6) * 0.05;
        ctx.strokeStyle = theme === 'retro' ? '#ffff55' : 'rgba(56, 189, 248, 0.9)';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, (m.halfLength + 12) * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.rotate(-degToRad(m.angleDeg)); // canvas Y-down

      // Subtle perpendicular normal line (visualizes θ_i = θ_r reflection axis)
      ctx.strokeStyle = isDraft
        ? 'rgba(254, 240, 138, 0.8)'
        : 'rgba(186, 230, 253, 0.45)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(0, 24);
      ctx.stroke();
      ctx.setLineDash([]);

      // Brushed metal housing frame
      const len = m.halfLength * 2;
      ctx.fillStyle = theme === 'retro' ? '#555555' : '#1e293b';
      this.roundRect(ctx, -m.halfLength - 3, -7, len + 6, 14, theme === 'retro' ? 0 : 7);
      ctx.fill();

      // Glowing mirror glass face (double-sided reflective)
      const grad = ctx.createLinearGradient(-m.halfLength, -5, m.halfLength, 5);
      if (flash > 0.1) {
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.5, '#a5f3fc');
        grad.addColorStop(1, '#ffffff');
      } else if (theme === 'retro') {
        grad.addColorStop(0, '#55ffff');
        grad.addColorStop(0.5, '#ffffff');
        grad.addColorStop(1, '#55ffff');
      } else {
        grad.addColorStop(0, '#38bdf8');
        grad.addColorStop(0.35, '#e0f2fe');
        grad.addColorStop(0.65, '#7dd3fc');
        grad.addColorStop(1, '#0ea5e9');
      }
      ctx.fillStyle = grad;
      this.roundRect(ctx, -m.halfLength, -4.5, len, 9, theme === 'retro' ? 0 : 4);
      ctx.fill();

      // Endcap owner color dots
      ctx.fillStyle = m.ownerColor;
      ctx.beginPath();
      ctx.arc(-m.halfLength, 0, 4.5, 0, Math.PI * 2);
      ctx.arc(m.halfLength, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private drawSky(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const { theme, planetId, timeSec, terrain } = state;
    const mood = terrain.location.skyMood;

    if (theme === 'retro') {
      const retroSky: Record<PlanetId, string> = {
        earth: mood === 'volcanic' ? '#550000' : mood === 'desert' ? '#003388' : '#0000aa',
        moon: '#06081a',
        mars: '#6e2310',
        jupiter: '#4f270c',
      };
      ctx.fillStyle = retroSky[planetId];
      ctx.fillRect(-20, -20, WORLD_WIDTH + 40, WORLD_HEIGHT + 40);

      if (planetId === 'moon') {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 42; i++) {
          ctx.fillRect(
            Math.floor(hash2d(101, i, 1) * WORLD_WIDTH),
            Math.floor(hash2d(101, i, 2) * (WORLD_HEIGHT * 0.68)),
            3,
            3,
          );
        }
      }
      return;
    }

    const grad = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    if (planetId === 'moon') {
      grad.addColorStop(0, '#09111f');
      grad.addColorStop(0.65, '#132238');
      grad.addColorStop(1, '#26384d');
    } else if (planetId === 'mars') {
      grad.addColorStop(0, '#6b2a1e');
      grad.addColorStop(0.55, '#b85a3a');
      grad.addColorStop(1, '#e8a878');
    } else if (planetId === 'jupiter') {
      grad.addColorStop(0, '#4a2515');
      grad.addColorStop(0.35, '#8c4e2a');
      grad.addColorStop(0.7, '#cc8448');
      grad.addColorStop(1, '#e6b87a');
    } else if (mood === 'volcanic') {
      grad.addColorStop(0, '#2a1215');
      grad.addColorStop(0.55, '#7c2d12');
      grad.addColorStop(1, '#ea580c');
    } else if (mood === 'alpine') {
      grad.addColorStop(0, '#1e4b7a');
      grad.addColorStop(0.55, '#60a5fa');
      grad.addColorStop(1, '#dbeafe');
    } else if (mood === 'desert') {
      grad.addColorStop(0, '#1e5b8c');
      grad.addColorStop(0.55, '#e09f5a');
      grad.addColorStop(1, '#f6d594');
    } else if (mood === 'tropical') {
      grad.addColorStop(0, '#0f5c73');
      grad.addColorStop(0.55, '#38a3a5');
      grad.addColorStop(1, '#c7f9cc');
    } else if (mood === 'twilight') {
      grad.addColorStop(0, '#0f253d');
      grad.addColorStop(0.48, '#2d5378');
      grad.addColorStop(0.8, '#c97b63');
      grad.addColorStop(1, '#f0b878');
    } else {
      grad.addColorStop(0, '#18446c');
      grad.addColorStop(0.45, '#3b7499');
      grad.addColorStop(0.78, '#de8b63');
      grad.addColorStop(1, '#f4c678');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(-20, -20, WORLD_WIDTH + 40, WORLD_HEIGHT + 40);

    // Stars
    if (planetId === 'moon' || planetId === 'earth') {
      const starCount = planetId === 'moon' ? 75 : 22;
      const maxY = planetId === 'moon' ? WORLD_HEIGHT * 0.72 : WORLD_HEIGHT * 0.34;
      for (let i = 0; i < starCount; i++) {
        const sx = hash2d(99, i, 1) * WORLD_WIDTH;
        const sy = hash2d(99, i, 2) * maxY;
        const twinkle = 0.45 + 0.55 * Math.sin(timeSec * 2.2 + i * 1.7);
        ctx.fillStyle = `rgba(255, 252, 235, ${twinkle * (planetId === 'moon' ? 0.9 : 0.42)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Distant mid-ground silhouette scaled cleanly behind the 25% foreground skylines
    const bd = terrain.location.backdrop;
    if (bd === 'city-depth' || bd === 'lake-michigan' || bd === 'bay-water') {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
      for (let i = 0; i < 24; i++) {
        const bx = i * 52 - 8;
        const bh = 52 + hash2d(313 + terrain.location.id.length, i, 2) * 72;
        ctx.fillRect(bx, WORLD_HEIGHT - bh, 46, bh);
      }
    }

    if (bd === 'mt-fuji' || bd === 'mt-rainier') {
      ctx.save();
      ctx.fillStyle = 'rgba(30, 58, 95, 0.32)';
      ctx.beginPath();
      ctx.moveTo(280, WORLD_HEIGHT);
      ctx.lineTo(600, WORLD_HEIGHT - 235);
      ctx.lineTo(920, WORLD_HEIGHT);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.52)';
      ctx.beginPath();
      ctx.moveTo(528, WORLD_HEIGHT - 182);
      ctx.lineTo(600, WORLD_HEIGHT - 235);
      ctx.lineTo(672, WORLD_HEIGHT - 182);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (bd === 'lava-glow') {
      const lava = ctx.createRadialGradient(600, WORLD_HEIGHT - 85, 16, 600, WORLD_HEIGHT - 85, 220);
      lava.addColorStop(0, 'rgba(251, 146, 60, 0.52)');
      lava.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = lava;
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    } else if (bd === 'alpine-peaks') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(0, WORLD_HEIGHT);
      ctx.lineTo(190, WORLD_HEIGHT - 210);
      ctx.lineTo(390, WORLD_HEIGHT);
      ctx.lineTo(610, WORLD_HEIGHT - 230);
      ctx.lineTo(860, WORLD_HEIGHT);
      ctx.lineTo(1060, WORLD_HEIGHT - 205);
      ctx.lineTo(WORLD_WIDTH, WORLD_HEIGHT);
      ctx.fill();
    }
  }

  private drawAtmosphere(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const { theme, clouds, windWisps, windAccel, planetId } = state;

    if (planetId !== 'moon') {
      for (const c of clouds) {
        if (theme === 'retro') {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
          ctx.fillRect(Math.round(c.x), Math.round(c.y), Math.round(c.width), Math.round(c.height * 0.55));
          ctx.fillRect(
            Math.round(c.x + c.width * 0.18),
            Math.round(c.y - c.height * 0.35),
            Math.round(c.width * 0.55),
            Math.round(c.height * 0.45),
          );
        } else {
          ctx.fillStyle = `rgba(255, 247, 232, ${c.opacity})`;
          ctx.beginPath();
          ctx.ellipse(c.x + c.width * 0.5, c.y, c.width * 0.48, c.height * 0.38, 0, 0, Math.PI * 2);
          ctx.ellipse(c.x + c.width * 0.3, c.y - c.height * 0.15, c.width * 0.3, c.height * 0.34, 0, 0, Math.PI * 2);
          ctx.ellipse(c.x + c.width * 0.7, c.y - c.height * 0.1, c.width * 0.28, c.height * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (Math.abs(windAccel) > 0.35) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 250, 235, 0.34)';
      ctx.lineWidth = theme === 'retro' ? 2 : 1.8;
      ctx.lineCap = 'round';
      for (const w of windWisps) {
        const dir = Math.sign(windAccel);
        ctx.globalAlpha = w.alpha * Math.min(1, Math.abs(windAccel) / 2.2);
        ctx.beginPath();
        ctx.moveTo(w.x, w.y);
        ctx.lineTo(w.x + w.length * dir, w.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawSun(
    ctx: CanvasRenderingContext2D,
    theme: ThemeMode,
    shocked: boolean,
    timeSec: number,
  ): void {
    ctx.save();
    ctx.translate(SUN_X, SUN_Y);

    if (theme === 'retro') {
      ctx.strokeStyle = '#ffff55';
      ctx.lineWidth = 3;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (SUN_RADIUS + 2), Math.sin(a) * (SUN_RADIUS + 2));
        ctx.lineTo(Math.cos(a) * (SUN_RADIUS + 13), Math.sin(a) * (SUN_RADIUS + 13));
        ctx.stroke();
      }
      ctx.fillStyle = '#ffff55';
      ctx.beginPath();
      ctx.arc(0, 0, SUN_RADIUS - 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0000aa';
      ctx.fillRect(-11, -9, 6, 6);
      ctx.fillRect(5, -9, 6, 6);
      ctx.strokeStyle = '#0000aa';
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (shocked) ctx.arc(0, 9, 8, 0, Math.PI * 2);
      else ctx.arc(0, 4, 11, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const halo = ctx.createRadialGradient(0, 0, SUN_RADIUS * 0.6, 0, 0, SUN_RADIUS * 2.0);
    halo.addColorStop(0, 'rgba(255, 224, 102, 0.52)');
    halo.addColorStop(1, 'rgba(255, 224, 102, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, SUN_RADIUS * 2.0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.rotate(timeSec * 0.25);
    ctx.strokeStyle = '#ffd966';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (SUN_RADIUS + 4), Math.sin(a) * (SUN_RADIUS + 4));
      ctx.lineTo(Math.cos(a) * (SUN_RADIUS + 12), Math.sin(a) * (SUN_RADIUS + 12));
      ctx.stroke();
    }
    ctx.restore();

    const bodyGrad = ctx.createRadialGradient(-7, -7, 4, 0, 0, SUN_RADIUS);
    bodyGrad.addColorStop(0, '#fff4b8');
    bodyGrad.addColorStop(0.6, '#ffd24c');
    bodyGrad.addColorStop(1, '#f4a236');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, SUN_RADIUS - 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#472c1b';
    if (shocked) {
      ctx.beginPath();
      ctx.arc(-9, -6, 4.2, 0, Math.PI * 2);
      ctx.arc(9, -6, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 9, 6.5, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(232, 93, 74, 0.35)';
      ctx.beginPath();
      ctx.arc(-15, 4, 4.5, 0, Math.PI * 2);
      ctx.arc(15, 4, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#472c1b';
      ctx.beginPath();
      ctx.arc(-9, -5, 3.2, 0, Math.PI * 2);
      ctx.arc(9, -5, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#472c1b';
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 3, 10, 0.16 * Math.PI, 0.84 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawWindVane(ctx: CanvasRenderingContext2D, theme: ThemeMode, windAccel: number): void {
    const absWind = Math.abs(windAccel);
    if (absWind < 0.25) return;

    const cx = SUN_X;
    const barY = SUN_Y + SUN_RADIUS + 20;
    const barLen = Math.min(86, Math.max(24, absWind * 22));
    const dir = Math.sign(windAccel);
    const startX = cx - (barLen * dir) / 2;
    const tipX = cx + (barLen * dir) / 2;

    ctx.save();
    ctx.strokeStyle = theme === 'retro' ? '#ff5555' : 'rgba(254, 240, 138, 0.9)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, barY);
    ctx.lineTo(tipX, barY);
    ctx.moveTo(tipX, barY);
    ctx.lineTo(tipX - 8 * dir, barY - 5);
    ctx.moveTo(tipX, barY);
    ctx.lineTo(tipX - 8 * dir, barY + 5);
    ctx.stroke();
    ctx.restore();
  }

  private drawGhostTrail(ctx: CanvasRenderingContext2D, player: Player, theme: ThemeMode): void {
    const shot = player.lastShot;
    if (!shot || shot.points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.44)';
    ctx.lineWidth = theme === 'retro' ? 2 : 2.2;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(shot.points[0].x, shot.points[0].y);
    for (let i = 1; i < shot.points.length; i++) {
      ctx.lineTo(shot.points[i].x, shot.points[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawSolutionOverlay(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const sol = state.verifiedSolution;
    if (!sol || sol.points.length < 2) return;
    const theme = state.theme;
    ctx.save();

    const lineColor = theme === 'retro' ? '#55ff55' : '#34d399';
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = theme === 'retro' ? 2.6 : 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(sol.points[0].x, sol.points[0].y);
    for (let i = 1; i < sol.points.length; i++) {
      ctx.lineTo(sol.points[i].x, sol.points[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const last = sol.points[sol.points.length - 1];
    const pulse = 1 + Math.sin(state.timeSec * 6) * 0.14;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 22 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawAimingGuides(
    ctx: CanvasRenderingContext2D,
    player: Player,
    state: RenderState,
  ): void {
    const origin = { x: player.x, y: player.y - GORILLA_HAND_OFFSET_Y };
    const { aimAngle, aimSpeed, aimDirection, gravity, windAccel, theme, mirrors, draftMirror, terrain } = state;
    const { vx, vy } = computeVelocityComponents(aimAngle, aimSpeed, aimDirection);
    const activeMirrors = draftMirror ? [...mirrors, draftMirror] : mirrors;

    ctx.save();

    if (state.showAimHint || draftMirror) {
      const hintDuration = draftMirror ? 2.2 : gravity < 3 ? 1.55 : gravity < 6 ? 1.15 : 0.95;
      const pts = sampleTrajectory(
        origin,
        aimAngle,
        aimSpeed,
        aimDirection,
        gravity,
        windAccel,
        hintDuration,
        0.045,
        activeMirrors,
        (x, y) => terrain.isSolid(x, y),
      );
      for (let i = 1; i < pts.length; i++) {
        const tFrac = 1 - i / pts.length;
        ctx.fillStyle = draftMirror
          ? `rgba(125, 211, 252, ${0.25 + tFrac * 0.72})`
          : theme === 'retro'
            ? `rgba(255, 255, 85, ${0.25 + tFrac * 0.7})`
            : `rgba(254, 240, 138, ${0.22 + tFrac * 0.75})`;
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, theme === 'retro' ? 2.5 : 3.2 * (0.6 + tFrac * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const scale = 1.65;
    const endX = origin.x + vx * scale;
    const endY = origin.y - vy * scale;

    if (state.showPhysicsLab) {
      // Visual-only Vx (cyan) and Vy (orange) component arrows — no floating text clutter
      const vxColor = theme === 'retro' ? '#55ffff' : '#38bdf8';
      const vyColor = theme === 'retro' ? '#ff5555' : '#fb923c';

      ctx.strokeStyle = vxColor;
      ctx.lineWidth = 2.4;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(endX, origin.y);
      ctx.stroke();

      ctx.strokeStyle = vyColor;
      ctx.beginPath();
      ctx.moveTo(endX, origin.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Small arrowheads for Vx and Vy
      if (Math.abs(endX - origin.x) > 10) {
        const dx = Math.sign(endX - origin.x);
        ctx.fillStyle = vxColor;
        ctx.beginPath();
        ctx.moveTo(endX, origin.y);
        ctx.lineTo(endX - 7 * dx, origin.y - 4);
        ctx.lineTo(endX - 7 * dx, origin.y + 4);
        ctx.closePath();
        ctx.fill();
      }
      if (Math.abs(endY - origin.y) > 10) {
        const dy = Math.sign(endY - origin.y);
        ctx.fillStyle = vyColor;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - 4, endY - 7 * dy);
        ctx.lineTo(endX + 4, endY - 7 * dy);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.strokeStyle = theme === 'retro' ? '#ffff55' : '#fef08a';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    const vecAngle = Math.atan2(endY - origin.y, endX - origin.x);
    ctx.fillStyle = theme === 'retro' ? '#ffff55' : '#fef08a';
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - 11 * Math.cos(vecAngle - 0.42), endY - 11 * Math.sin(vecAngle - 0.42));
    ctx.lineTo(endX - 11 * Math.cos(vecAngle + 0.42), endY - 11 * Math.sin(vecAngle + 0.42));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawGorilla(
    ctx: CanvasRenderingContext2D,
    p: Player,
    isActive: boolean,
    theme: ThemeMode,
    timeSec: number,
  ): void {
    const bounce =
      p.animation === 'celebrate'
        ? Math.abs(Math.sin(timeSec * 12)) * 12
        : isActive
          ? Math.sin(timeSec * 4) * 1.8
          : 0;

    ctx.save();
    ctx.translate(p.x, p.y - bounce);

    ctx.save();
    ctx.scale(GORILLA_SCALE, GORILLA_SCALE);
    drawGorillaCharacter(ctx, p.characterId, p.animation, theme, timeSec);
    ctx.restore();

    // Compact active pointer & minimal name pill tucked right above the gorilla
    const labelY = -84;
    if (isActive) {
      const bob = Math.sin(timeSec * 6) * 3;
      ctx.fillStyle = theme === 'retro' ? '#ffff55' : '#fde047';
      ctx.beginPath();
      ctx.moveTo(0, labelY - 11 + bob);
      ctx.lineTo(-7, labelY - 21 + bob);
      ctx.lineTo(7, labelY - 21 + bob);
      ctx.closePath();
      ctx.fill();
    }

    ctx.font = theme === 'retro' ? 'bold 11px "Courier New", monospace' : '800 11px system-ui, sans-serif';
    const tag = p.name;
    const tagW = ctx.measureText(tag).width + 12;
    ctx.fillStyle = isActive ? p.color : 'rgba(15, 23, 42, 0.72)';
    this.roundRect(ctx, -tagW / 2, labelY - 9, tagW, 18, theme === 'retro' ? 0 : 9);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, 0, labelY);
    ctx.restore();
  }

  private drawBanana(ctx: CanvasRenderingContext2D, banana: Banana, theme: ThemeMode): void {
    if (banana.trail.length > 1) {
      ctx.save();
      ctx.strokeStyle =
        banana.bounces > 0
          ? '#7dd3fc'
          : theme === 'retro'
            ? '#ffff55'
            : 'rgba(254, 240, 138, 0.85)';
      ctx.lineWidth = theme === 'retro' ? 2.5 : 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(banana.trail[0].x, banana.trail[0].y);
      for (let i = 1; i < banana.trail.length; i++) {
        ctx.lineTo(banana.trail[i].x, banana.trail[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (banana.y < -4) {
      const altMeters = Math.round((WORLD_HEIGHT - banana.y) / PIXELS_PER_METER);
      const tx = Math.max(46, Math.min(WORLD_WIDTH - 46, banana.x));
      ctx.save();
      ctx.fillStyle = theme === 'retro' ? '#ffff55' : '#facc15';
      ctx.beginPath();
      ctx.moveTo(tx, 6);
      ctx.lineTo(tx - 8, 18);
      ctx.lineTo(tx + 8, 18);
      ctx.closePath();
      ctx.fill();
      ctx.font = theme === 'retro' ? 'bold 12px "Courier New", monospace' : '700 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${altMeters} m`, tx, 31);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(banana.x, banana.y);
    ctx.rotate(banana.spin);
    if (theme === 'retro') {
      ctx.fillStyle = '#ffff55';
      ctx.fillRect(-7, -3, 14, 5);
      ctx.fillRect(-9, 0, 5, 4);
      ctx.fillRect(4, 0, 5, 4);
      ctx.fillStyle = '#aa5500';
      ctx.fillRect(-10, 2, 3, 3);
      ctx.fillRect(7, 2, 3, 3);
    } else {
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 2, 10, Math.PI * 1.15, Math.PI * 1.85);
      ctx.arc(0, 7, 10, Math.PI * 1.85, Math.PI * 1.15, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#713f12';
      ctx.fillRect(-10, -3, 3, 3);
    }
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
    for (const pt of particles) {
      const alpha = Math.max(0, pt.life / pt.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rotation);
      ctx.fillStyle = pt.color;
      if (pt.shape === 'square') {
        ctx.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size);
      } else if (pt.shape === 'peel') {
        ctx.beginPath();
        ctx.ellipse(0, 0, pt.size, pt.size * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, pt.size * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawFloatingTexts(
    ctx: CanvasRenderingContext2D,
    texts: FloatingText[],
    theme: ThemeMode,
  ): void {
    for (const ft of texts) {
      const alpha = Math.min(1, (ft.life / ft.maxLife) * 1.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font =
        theme === 'retro'
          ? `bold ${Math.round(16 * ft.scale)}px "Courier New", monospace`
          : `800 ${Math.round(17 * ft.scale)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    if (r <= 0) ctx.rect(x, y, w, h);
    else ctx.roundRect(x, y, w, h, r);
  }
}
