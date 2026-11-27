import { CHARACTERS } from './characters';
import {
  GORILLA_HAND_OFFSET_Y,
  PIXELS_PER_METER,
  SUN_RADIUS,
  SUN_X,
  SUN_Y,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';
import { computeVelocityComponents, sampleTrajectory } from './physics';
import type { SkylineTerrain } from './skyline';
import type {
  Banana,
  BouncyTire,
  Cloud,
  FloatingText,
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
  tires: BouncyTire[];
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
  { body: '#2c3e55', shade: '#1f2d40', trim: '#466080', winLit: '#ffd97d', winOff: '#1a2534' },
  { body: '#4a4054', shade: '#372e40', trim: '#665975', winLit: '#ffe29a', winOff: '#292230' },
  { body: '#2f5259', shade: '#213c42', trim: '#46747d', winLit: '#ffdf85', winOff: '#192e33' },
  { body: '#63443c', shade: '#4a322c', trim: '#825a50', winLit: '#ffd573', winOff: '#36231e' },
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

export class GameRenderer {
  private terrainCanvas: HTMLCanvasElement;
  private terrainCtx: CanvasRenderingContext2D;
  private cachedTheme: ThemeMode | null = null;
  private cachedCraterCount = -1;
  private cachedTerrainRef: SkylineTerrain | null = null;

  constructor() {
    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = WORLD_WIDTH;
    this.terrainCanvas.height = WORLD_HEIGHT;
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

      if (style === 'trunk') {
        ctx.fillStyle = theme === 'retro' ? '#aa5500' : '#6b4226';
        ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        ctx.fillStyle = theme === 'retro' ? '#552200' : '#4f2f1a';
        ctx.fillRect(shape.x + shape.width - 14, shape.y, 14, shape.height);
        // Bark lines
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
        // Top grass/snow/wood ledge
        ctx.fillStyle =
          isJungle
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
        // Roadway railing stripe on bridge deck
        if (style === 'bridge-deck') {
          ctx.fillStyle = theme === 'retro' ? '#ffff55' : '#e2e8f0';
          ctx.fillRect(shape.x, shape.y, shape.width, 4);
        }
        return;
      }

      if (style === 'spire') {
        ctx.fillStyle = theme === 'retro' ? '#ffffff' : shape.accent ?? '#cbd5e1';
        ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        return;
      }

      // Standard skyscraper / landmark tower
      ctx.fillStyle = colors.body;
      ctx.fillRect(shape.x, shape.y, shape.width, shape.height);

      const shadeW = theme === 'retro' ? 8 : Math.max(10, Math.floor(shape.width * 0.18));
      ctx.fillStyle = colors.shade;
      ctx.fillRect(shape.x + shape.width - shadeW, shape.y, shadeW, shape.height);

      ctx.fillStyle = colors.trim;
      ctx.fillRect(shape.x, shape.y, shape.width, theme === 'retro' ? 4 : 5);

      if (theme === 'retro') {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(shape.x + 1, shape.y + 1, shape.width - 2, shape.height);
      }

      // Windows grid (skip narrow spires)
      if (shape.width >= 38 && shape.height >= 60) {
        const cols = Math.max(2, Math.floor((shape.width - 18) / 18));
        const rows = Math.max(3, Math.floor((shape.height - 24) / 22));
        const usableW = shape.width - 22 - (theme === 'retro' ? 4 : 6);
        const colStep = usableW / cols;
        const winW = Math.max(6, Math.floor(colStep * 0.52));
        const winH = theme === 'retro' ? 9 : 11;
        const seed = shape.windowSeed ?? shape.x * 7 + shape.height;

        for (let r = 0; r < rows; r++) {
          const wy = shape.y + 16 + r * 21;
          if (wy + winH > WORLD_HEIGHT - 10) break;
          for (let c = 0; c < cols; c++) {
            const wx = Math.round(shape.x + 11 + c * colStep + (colStep - winW) * 0.5);
            const lit = hash2d(seed, c, r) > 0.38;
            ctx.fillStyle = lit ? colors.winLit : colors.winOff;
            ctx.fillRect(wx, wy, winW, winH);
          }
        }
      }

      // Special architectural accents
      if (style === 'xbrace') {
        ctx.strokeStyle = theme === 'retro' ? '#55ffff' : 'rgba(203, 213, 225, 0.35)';
        ctx.lineWidth = 3;
        for (let y = shape.y + 10; y < WORLD_HEIGHT - 40; y += 75) {
          ctx.beginPath();
          ctx.moveTo(shape.x + 4, y);
          ctx.lineTo(shape.x + shape.width - 4, y + 70);
          ctx.moveTo(shape.x + shape.width - 4, y);
          ctx.lineTo(shape.x + 4, y + 70);
          ctx.stroke();
        }
      } else if (style === 'clock') {
        // Big Ben clock face
        const cx = shape.x + shape.width / 2;
        const cy = shape.y + 38;
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, cy - 11);
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + 8, cy + 3);
        ctx.stroke();
      } else if (style === 'dome') {
        ctx.fillStyle = colors.trim;
        ctx.beginPath();
        ctx.arc(shape.x + shape.width / 2, shape.y + 8, shape.width * 0.42, Math.PI, 0);
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

      if (shape.style === 'pyramid') {
        ctx.fillStyle = theme === 'retro' ? '#cc9933' : shape.accent ?? '#d9a05b';
        ctx.fill();
        // Right shaded face of pyramid
        if (shape.points.length === 3) {
          ctx.fillStyle = theme === 'retro' ? '#885511' : 'rgba(92, 56, 18, 0.34)';
          ctx.beginPath();
          ctx.moveTo(shape.points[1].x, shape.points[1].y);
          ctx.lineTo(shape.points[2].x, shape.points[2].y);
          ctx.lineTo(shape.points[1].x + (shape.points[2].x - shape.points[1].x) * 0.35, shape.points[2].y);
          ctx.closePath();
          ctx.fill();
        }
      } else if (shape.style === 'snow-peak') {
        ctx.fillStyle = theme === 'retro' ? '#778899' : '#4b6075';
        ctx.fill();
        // Crisp snow cap on upper 38%
        let minY = WORLD_HEIGHT;
        let maxY = 0;
        for (const p of shape.points) {
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        ctx.clip();
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, minY, WORLD_WIDTH, (maxY - minY) * 0.38);
      } else if (shape.style === 'volcano') {
        ctx.fillStyle = theme === 'retro' ? '#442222' : '#332626';
        ctx.fill();
        ctx.strokeStyle = theme === 'retro' ? '#ff5555' : '#f97316';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (shape.style === 'sail') {
        ctx.fillStyle = theme === 'retro' ? '#ffffff' : shape.accent ?? '#f8fafc';
        ctx.fill();
        ctx.strokeStyle = 'rgba(100,116,139,0.4)';
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
            : '#d6dee8'
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

  render(ctx: CanvasRenderingContext2D, state: RenderState): void {
    ctx.save();
    ctx.translate(state.shakeOffset.x, state.shakeOffset.y);

    // 1. Sky + location backdrop
    this.drawSky(ctx, state);

    // 2. Clouds & wind wisps
    this.drawAtmosphere(ctx, state);

    // 3. Classic Sun
    this.drawSun(ctx, state.theme, state.sunShocked, state.timeSec);

    // 4. Wind indicator under sun
    this.drawWindBanner(ctx, state.theme, state.windAccel);

    // 5. Destructible terrain layer
    this.ensureTerrainLayer(state.terrain, state.theme);
    ctx.drawImage(this.terrainCanvas, 0, 0);

    // 6. Floating DK Bouncy Tires!
    this.drawBouncyTires(ctx, state.tires, state.theme, state.timeSec);

    // 7. Ghost trail of active player's previous shot
    const activePlayer = state.players[state.activePlayerIndex];
    if (activePlayer?.lastShot && activePlayer.lastShot.points.length > 1) {
      this.drawGhostTrail(ctx, activePlayer, state.theme);
    }

    // 8. Verified Solution overlay (when toggled On)
    if (state.showAimingGuides && state.showSolution && activePlayer && !activePlayer.isBot) {
      this.drawSolutionOverlay(ctx, state);
    }

    // 9. Aiming guides (vector, Vx/Vy, optional aim hint with tire bounce preview!)
    if (state.showAimingGuides && activePlayer && !activePlayer.isBot) {
      this.drawAimingGuides(ctx, activePlayer, state);
    }

    // 10. Gorillas (all 8 custom characters!)
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      const isActive = i === state.activePlayerIndex;
      this.drawGorilla(ctx, p, isActive, state.theme, state.timeSec);
    }

    // 11. Active flying banana & trail
    if (state.banana && state.banana.active) {
      this.drawBanana(ctx, state.banana, state.theme);
    }

    // 12. Particles & floating callouts
    this.drawParticles(ctx, state.particles);
    this.drawFloatingTexts(ctx, state.floatingTexts, state.theme);

    // 13. Postcard Location Badge (bottom-left)
    this.drawLocationBadge(ctx, state.terrain, state.theme);

    ctx.restore();
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
            Math.floor(hash2d(101, i, 2) * (WORLD_HEIGHT * 0.65)),
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
      grad.addColorStop(0, '#102a43');
      grad.addColorStop(0.5, '#335c81');
      grad.addColorStop(0.82, '#c97b63');
      grad.addColorStop(1, '#f0b878');
    } else {
      grad.addColorStop(0, '#18446c');
      grad.addColorStop(0.45, '#3b7499');
      grad.addColorStop(0.78, '#de8b63');
      grad.addColorStop(1, '#f4c678');
    }

    ctx.fillStyle = grad;
    ctx.fillRect(-20, -20, WORLD_WIDTH + 40, WORLD_HEIGHT + 40);

    // Twinkling stars
    if (planetId === 'moon' || planetId === 'earth') {
      const starCount = planetId === 'moon' ? 75 : 18;
      const maxY = planetId === 'moon' ? WORLD_HEIGHT * 0.72 : WORLD_HEIGHT * 0.3;
      for (let i = 0; i < starCount; i++) {
        const sx = hash2d(99, i, 1) * WORLD_WIDTH;
        const sy = hash2d(99, i, 2) * maxY;
        const twinkle = 0.45 + 0.55 * Math.sin(timeSec * 2.2 + i * 1.7);
        ctx.fillStyle = `rgba(255, 252, 235, ${twinkle * (planetId === 'moon' ? 0.9 : 0.4)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Location signature scenic backdrop (purely atmospheric behind terrain)
    const bd = terrain.location.backdrop;
    if (bd === 'mt-fuji' || bd === 'mt-rainier') {
      ctx.save();
      ctx.fillStyle = 'rgba(30, 58, 95, 0.32)';
      ctx.beginPath();
      ctx.moveTo(260, WORLD_HEIGHT);
      ctx.lineTo(600, 230);
      ctx.lineTo(940, WORLD_HEIGHT);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.moveTo(520, 335);
      ctx.lineTo(600, 230);
      ctx.lineTo(680, 335);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (bd === 'lava-glow') {
      const lava = ctx.createRadialGradient(600, WORLD_HEIGHT - 160, 20, 600, WORLD_HEIGHT - 160, 320);
      lava.addColorStop(0, 'rgba(251, 146, 60, 0.55)');
      lava.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = lava;
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    } else if (bd === 'alpine-peaks') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(0, WORLD_HEIGHT);
      ctx.lineTo(190, 280);
      ctx.lineTo(390, WORLD_HEIGHT);
      ctx.lineTo(610, 240);
      ctx.lineTo(860, WORLD_HEIGHT);
      ctx.lineTo(1060, 290);
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

  private drawBouncyTires(
    ctx: CanvasRenderingContext2D,
    tires: BouncyTire[],
    theme: ThemeMode,
    timeSec: number,
  ): void {
    for (const tire of tires) {
      const bob = Math.sin(timeSec * 2.4 + tire.phaseOffset) * 3;
      const squash = tire.bounceAnim > 0 ? 1 + Math.sin(tire.bounceAnim * 26) * 0.18 : 1;

      ctx.save();
      ctx.translate(tire.x, tire.y + bob);

      // Suspension string & balloon holding the DK Tire aloft
      ctx.strokeStyle = theme === 'retro' ? '#ffffff' : 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -tire.radius);
      ctx.lineTo(0, -tire.radius - 24);
      ctx.stroke();

      ctx.fillStyle = tire.balloonColor;
      ctx.beginPath();
      ctx.ellipse(0, -tire.radius - 36, 12, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(-4, -tire.radius - 40, 3.5, 5, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // Tire body with bounce scale
      ctx.scale(squash, 2 - squash);

      // Outer rubber tread
      ctx.fillStyle = theme === 'retro' ? '#222222' : '#1f2937';
      ctx.beginPath();
      ctx.arc(0, 0, tire.radius, 0, Math.PI * 2);
      ctx.fill();

      // Tread notches around rim
      ctx.strokeStyle = theme === 'retro' ? '#55ffff' : '#fbbf24';
      ctx.lineWidth = 2.6;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, tire.radius - 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Inner sidewall ring
      ctx.fillStyle = theme === 'retro' ? '#555555' : '#374151';
      ctx.beginPath();
      ctx.arc(0, 0, tire.radius * 0.66, 0, Math.PI * 2);
      ctx.fill();

      // Classic DK yellow hub center
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(0, 0, tire.radius * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#92400e';
      ctx.font = '900 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DK', 0, 0.5);

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

  private drawWindBanner(ctx: CanvasRenderingContext2D, theme: ThemeMode, windAccel: number): void {
    const cx = SUN_X;
    const cy = SUN_Y + SUN_RADIUS + 26;
    const absWind = Math.abs(windAccel);

    ctx.save();
    ctx.font = theme === 'retro' ? 'bold 13px "Courier New", monospace' : '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const label =
      absWind < 0.25
        ? 'CALM AIR'
        : `WIND ${windAccel > 0 ? '→' : '←'} ${absWind.toFixed(1)} m/s²`;

    const pillW = Math.max(126, ctx.measureText(label).width + 26);
    const pillH = 24;

    if (theme === 'retro') {
      ctx.fillStyle = '#000055';
      ctx.fillRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH);
      ctx.strokeStyle = '#55ffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH);
      ctx.fillStyle = '#ffff55';
      ctx.fillText(label, cx, cy + 1);
    } else {
      ctx.fillStyle = 'rgba(17, 24, 39, 0.58)';
      this.roundRect(ctx, cx - pillW / 2, cy - pillH / 2, pillW, pillH, 12);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.fillText(label, cx, cy);
    }

    if (absWind >= 0.25) {
      const barY = cy + 18;
      const barLen = Math.min(82, absWind * 22);
      const dir = Math.sign(windAccel);
      const tipX = cx + (barLen * dir) / 2;
      ctx.strokeStyle = theme === 'retro' ? '#ff5555' : '#fde68a';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - (barLen * dir) / 2, barY);
      ctx.lineTo(tipX, barY);
      ctx.moveTo(tipX, barY);
      ctx.lineTo(tipX - 8 * dir, barY - 5);
      ctx.moveTo(tipX, barY);
      ctx.lineTo(tipX - 8 * dir, barY + 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawLocationBadge(
    ctx: CanvasRenderingContext2D,
    terrain: SkylineTerrain,
    theme: ThemeMode,
  ): void {
    const loc = terrain.location;
    const text = `${loc.name} · ${loc.region}`;
    ctx.save();
    ctx.font = theme === 'retro' ? 'bold 12px "Courier New", monospace' : '700 12px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 20;
    const x = 14;
    const y = WORLD_HEIGHT - 36;
    ctx.fillStyle = theme === 'retro' ? '#000055' : 'rgba(15, 23, 42, 0.72)';
    this.roundRect(ctx, x, y, w, 24, theme === 'retro' ? 0 : 12);
    ctx.fill();
    if (theme === 'retro') {
      ctx.strokeStyle = '#55ffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = theme === 'retro' ? '#ffff55' : '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 10, y + 12);
    ctx.restore();
  }

  private drawGhostTrail(ctx: CanvasRenderingContext2D, player: Player, theme: ThemeMode): void {
    const shot = player.lastShot;
    if (!shot || shot.points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.48)';
    ctx.lineWidth = theme === 'retro' ? 2 : 2.2;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(shot.points[0].x, shot.points[0].y);
    for (let i = 1; i < shot.points.length; i++) {
      ctx.lineTo(shot.points[i].x, shot.points[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    let peakPt = shot.points[0];
    for (const pt of shot.points) {
      if (pt.y < peakPt.y && pt.y > 26 && pt.x > 60 && pt.x < WORLD_WIDTH - 60) {
        peakPt = pt;
      }
    }
    if (peakPt) {
      const arrow = shot.direction > 0 ? '→' : '←';
      const txt = `Last: ${shot.angleDeg}° · ${shot.speed} m/s ${arrow}`;
      ctx.font = theme === 'retro' ? '11px "Courier New", monospace' : '600 11px system-ui, sans-serif';
      const w = ctx.measureText(txt).width + 14;
      const lx = Math.max(w / 2 + 8, Math.min(WORLD_WIDTH - w / 2 - 8, peakPt.x));
      const ly = Math.max(22, peakPt.y - 14);
      ctx.fillStyle = theme === 'retro' ? 'rgba(0,0,0,0.75)' : 'rgba(15, 23, 42, 0.62)';
      this.roundRect(ctx, lx - w / 2, ly - 10, w, 20, theme === 'retro' ? 0 : 10);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, lx, ly);
    }
    ctx.restore();
  }

  private drawSolutionOverlay(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const sol = state.verifiedSolution;
    const theme = state.theme;
    ctx.save();

    if (!sol || sol.points.length < 2) {
      const msg = 'No direct arc from this spot — step left/right or blast a tunnel!';
      ctx.font = theme === 'retro' ? 'bold 12px "Courier New", monospace' : '700 12px system-ui, sans-serif';
      const w = ctx.measureText(msg).width + 20;
      ctx.fillStyle = theme === 'retro' ? '#550000' : 'rgba(127, 29, 29, 0.85)';
      this.roundRect(ctx, WORLD_WIDTH / 2 - w / 2, 175, w, 26, theme === 'retro' ? 0 : 12);
      ctx.fill();
      ctx.fillStyle = '#fecaca';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(msg, WORLD_WIDTH / 2, 188);
      ctx.restore();
      return;
    }

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
    ctx.arc(last.x, last.y, 18 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    let labelPt = sol.points[Math.floor(sol.points.length / 2)];
    for (const pt of sol.points) {
      if (pt.y < labelPt.y && pt.y > 42 && pt.x > 110 && pt.x < WORLD_WIDTH - 110) {
        labelPt = pt;
      }
    }
    const dirLabel = sol.direction > 0 ? 'Right →' : '← Left';
    const bankTag = sol.bounces > 0 ? ' [Bank!]' : '';
    const text = `Solution: ${sol.angleDeg}° · ${sol.speed} m/s (${dirLabel})${bankTag}`;
    ctx.font = theme === 'retro' ? 'bold 12px "Courier New", monospace' : '700 12px system-ui, sans-serif';
    const w = ctx.measureText(text).width + 20;
    const lx = Math.max(w / 2 + 12, Math.min(WORLD_WIDTH - w / 2 - 12, labelPt.x));
    const ly = Math.max(36, Math.min(WORLD_HEIGHT - 120, labelPt.y - 16));

    ctx.fillStyle = theme === 'retro' ? '#003300' : 'rgba(6, 78, 59, 0.88)';
    this.roundRect(ctx, lx - w / 2, ly - 13, w, 26, theme === 'retro' ? 0 : 12);
    ctx.fill();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = '#ecfdf5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, lx, ly);
    ctx.restore();
  }

  private drawAimingGuides(
    ctx: CanvasRenderingContext2D,
    player: Player,
    state: RenderState,
  ): void {
    const origin = { x: player.x, y: player.y - GORILLA_HAND_OFFSET_Y };
    const { aimAngle, aimSpeed, aimDirection, gravity, windAccel, theme, tires, terrain } = state;
    const { vx, vy } = computeVelocityComponents(aimAngle, aimSpeed, aimDirection);

    ctx.save();

    if (state.showAimHint) {
      const hintDuration = gravity < 3 ? 1.55 : gravity < 6 ? 1.15 : 0.9;
      const pts = sampleTrajectory(
        origin,
        aimAngle,
        aimSpeed,
        aimDirection,
        gravity,
        windAccel,
        hintDuration,
        0.045,
        tires,
        (x, y) => terrain.isSolid(x, y),
      );
      for (let i = 1; i < pts.length; i++) {
        const tFrac = 1 - i / pts.length;
        ctx.fillStyle =
          theme === 'retro'
            ? `rgba(255, 255, 85, ${0.25 + tFrac * 0.7})`
            : `rgba(254, 240, 138, ${0.2 + tFrac * 0.75})`;
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, theme === 'retro' ? 2.5 : 3.2 * (0.6 + tFrac * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const scale = 1.65;
    const endX = origin.x + vx * scale;
    const endY = origin.y - vy * scale;

    if (state.showPhysicsLab) {
      ctx.strokeStyle = theme === 'retro' ? '#55ffff' : '#38bdf8';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(endX, origin.y);
      ctx.stroke();

      ctx.strokeStyle = theme === 'retro' ? '#ff5555' : '#fb923c';
      ctx.beginPath();
      ctx.moveTo(endX, origin.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = theme === 'retro' ? 'bold 11px "Courier New", monospace' : '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = theme === 'retro' ? '#55ffff' : '#bae6fd';
      ctx.fillText(`Vx ${vx >= 0 ? '+' : ''}${vx.toFixed(1)}`, (origin.x + endX) / 2, origin.y + 14);

      ctx.fillStyle = theme === 'retro' ? '#ff7777' : '#fed7aa';
      ctx.textAlign = aimDirection > 0 ? 'left' : 'right';
      ctx.fillText(`Vy ${vy >= 0 ? '+' : ''}${vy.toFixed(1)}`, endX + aimDirection * 8, (origin.y + endY) / 2);
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
        ? Math.abs(Math.sin(timeSec * 12)) * 9
        : isActive
          ? Math.sin(timeSec * 4) * 1.5
          : 0;

    ctx.save();
    ctx.translate(p.x, p.y - bounce);

    const armsUp = p.animation === 'celebrate' || p.animation === 'throwing';
    if (theme === 'retro') {
      this.drawRetroGorilla(ctx, p, armsUp, timeSec);
    } else {
      this.drawModernGorilla(ctx, p, armsUp, timeSec);
    }

    const labelY = -62;
    if (isActive) {
      const bob = Math.sin(timeSec * 6) * 3;
      ctx.fillStyle = theme === 'retro' ? '#ffff55' : '#fde047';
      ctx.beginPath();
      ctx.moveTo(0, labelY - 12 + bob);
      ctx.lineTo(-7, labelY - 22 + bob);
      ctx.lineTo(7, labelY - 22 + bob);
      ctx.closePath();
      ctx.fill();
    }

    ctx.font = theme === 'retro' ? 'bold 12px "Courier New", monospace' : '700 12px system-ui, sans-serif';
    const tag = `${p.name} · ${p.score}`;
    const tagW = ctx.measureText(tag).width + 14;
    ctx.fillStyle = isActive ? p.color : 'rgba(15, 23, 42, 0.78)';
    this.roundRect(ctx, -tagW / 2, labelY - 9, tagW, 20, theme === 'retro' ? 0 : 10);
    ctx.fill();

    if (isActive && theme === 'retro') {
      ctx.strokeStyle = '#ffff55';
      ctx.lineWidth = 2;
      ctx.strokeRect(-tagW / 2, labelY - 9, tagW, 20);
    }

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, 0, labelY + 1);
    ctx.restore();
  }

  private drawRetroGorilla(
    ctx: CanvasRenderingContext2D,
    p: Player,
    armsUp: boolean,
    timeSec: number,
  ): void {
    const ch = CHARACTERS[p.characterId];
    const fur = p.characterId === 'robo-kong' ? '#888888' : '#cc7a33';
    const chest = p.characterId === 'astro-ape' ? '#ffffff' : p.characterId === 'robo-kong' ? '#cccccc' : '#e6a15c';

    ctx.fillStyle = fur;
    ctx.fillRect(-13, -12, 10, 12);
    ctx.fillRect(3, -12, 10, 12);
    ctx.fillRect(-15, -30, 30, 20);
    ctx.fillStyle = chest;
    ctx.fillRect(-9, -27, 18, 13);
    ctx.fillStyle = fur;
    ctx.fillRect(-9, -41, 18, 12);

    // Character-specific pixel headgear
    if (p.characterId === 'king-kong') {
      ctx.fillStyle = '#ffff55';
      ctx.fillRect(-9, -47, 18, 6);
      ctx.fillRect(-9, -50, 4, 3);
      ctx.fillRect(-2, -51, 4, 4);
      ctx.fillRect(5, -50, 4, 3);
    } else if (p.characterId === 'astro-ape') {
      ctx.strokeStyle = '#55ffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(-12, -45, 24, 17);
    } else if (p.characterId === 'chef-nana') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-10, -52, 20, 11);
    } else if (p.characterId === 'dj-kong') {
      ctx.fillStyle = '#55ffff';
      ctx.fillRect(-12, -41, 4, 9);
      ctx.fillRect(8, -41, 4, 9);
      ctx.fillRect(-10, -45, 20, 4);
    } else {
      ctx.fillStyle = ch.color;
      ctx.fillRect(-10, -44, 20, 5);
    }

    ctx.fillStyle = p.characterId === 'robo-kong' ? '#55ffff' : '#000000';
    ctx.fillRect(-6, -37, 4, 3);
    ctx.fillRect(2, -37, 4, 3);

    ctx.fillStyle = fur;
    const alt = p.animation === 'celebrate' && Math.floor(timeSec * 8) % 2 === 0;
    if (armsUp) {
      ctx.fillRect(-22, alt ? -42 : -38, 8, 16);
      ctx.fillRect(14, alt ? -38 : -42, 8, 16);
    } else {
      ctx.fillRect(-22, -28, 7, 16);
      ctx.fillRect(15, -28, 7, 16);
    }
  }

  private drawModernGorilla(
    ctx: CanvasRenderingContext2D,
    p: Player,
    armsUp: boolean,
    timeSec: number,
  ): void {
    const ch = CHARACTERS[p.characterId];
    const fur = ch.furColor;
    const chest = ch.chestColor;
    const skin = p.characterId === 'robo-kong' ? '#cbd5e1' : '#c89b7b';

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Arms
    ctx.strokeStyle = fur;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    const wave = p.animation === 'celebrate' ? Math.sin(timeSec * 14) * 5 : 0;
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

    // Wristbands
    ctx.strokeStyle = ch.color;
    ctx.lineWidth = 4;
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

    // Legs & torso
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.roundRect(-12, -12, 9, 12, 4);
    ctx.roundRect(3, -12, 9, 12, 4);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, -21, 16, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = chest;
    ctx.beginPath();
    ctx.ellipse(0, -20, 10, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head & face
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.arc(0, -35, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(0, -33, 7.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes / visor
    if (p.characterId === 'robo-kong') {
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(-7, -37, 14, 4.5);
      ctx.fillStyle = '#ecfeff';
      ctx.fillRect(-5, -36, 5, 2);
    } else if (p.animation === 'ouch') {
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
      ctx.arc(-3.5, -34.5, 1.8, 0, Math.PI * 2);
      ctx.arc(3.5, -34.5, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1f1a18';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, -31.5, 3.5, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }

    // 8 Distinct Character Accessories!
    switch (p.characterId) {
      case 'king-kong': {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(-9, -43);
        ctx.lineTo(-9, -52);
        ctx.lineTo(-3, -47);
        ctx.lineTo(0, -54);
        ctx.lineTo(3, -47);
        ctx.lineTo(9, -52);
        ctx.lineTo(9, -43);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(-10, -44, 20, 3.5);
        break;
      }
      case 'astro-ape': {
        ctx.strokeStyle = '#93c5fd';
        ctx.fillStyle = 'rgba(147, 197, 253, 0.24)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, -35, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Helmet gleam
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath();
        ctx.arc(0, -35, 12, -2.5, -1.7);
        ctx.stroke();
        break;
      }
      case 'prof-peel': {
        // Round physics spectacles + bowtie
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(-3.8, -34.5, 3.5, 0, Math.PI * 2);
        ctx.arc(3.8, -34.5, 3.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(-5, -26);
        ctx.lineTo(0, -24);
        ctx.lineTo(-5, -22);
        ctx.moveTo(5, -26);
        ctx.lineTo(0, -24);
        ctx.lineTo(5, -22);
        ctx.fill();
        // Wild Einstein hair tufts
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(-9, -42, 4, 0, Math.PI * 2);
        ctx.arc(9, -42, 4, 0, Math.PI * 2);
        ctx.arc(0, -46, 4.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'capt-bongo': {
        // Pirate hat + eyepatch
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(-14, -42);
        ctx.quadraticCurveTo(0, -56, 14, -42);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        // Eyepatch
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(3.5, -34.5, 3.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'dj-kong': {
        // Cool shades + oversized headphones
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-8, -37, 16, 4.5);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, -35, 13, Math.PI, 0);
        ctx.stroke();
        ctx.fillStyle = '#0ea5e9';
        ctx.fillRect(-15, -39, 5, 9);
        ctx.fillRect(10, -39, 5, 9);
        break;
      }
      case 'chef-nana': {
        // Puffy white chef toque + red neckerchief
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-9, -49, 18, 8);
        ctx.beginPath();
        ctx.arc(-6, -50, 5.5, 0, Math.PI * 2);
        ctx.arc(0, -53, 6.5, 0, Math.PI * 2);
        ctx.arc(6, -50, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(-7, -26, 14, 3.5);
        break;
      }
      case 'ninja-chimp': {
        // Stealth headband with fluttering scarf tail
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(-11, -43, 22, 4.5);
        const flutter = Math.sin(timeSec * 8) * 3;
        ctx.beginPath();
        ctx.moveTo(10, -41);
        ctx.lineTo(20, -43 + flutter);
        ctx.lineTo(18, -37 + flutter);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'robo-kong': {
        // Antenna with blinking LED
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -45);
        ctx.lineTo(0, -54);
        ctx.stroke();
        ctx.fillStyle = Math.sin(timeSec * 8) > 0 ? '#22d3ee' : '#f43f5e';
        ctx.beginPath();
        ctx.arc(0, -55, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }

  private drawBanana(ctx: CanvasRenderingContext2D, banana: Banana, theme: ThemeMode): void {
    if (banana.trail.length > 1) {
      ctx.save();
      ctx.strokeStyle =
        banana.bounces > 0
          ? '#6ee7b7'
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
