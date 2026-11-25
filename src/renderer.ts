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
  Building,
  Cloud,
  FloatingText,
  Particle,
  PlanetId,
  Player,
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

const MODERN_BUILDING_PALETTE = [
  { body: '#2c3e55', shade: '#213044', trim: '#3f5673', winLit: '#ffd97d', winOff: '#1c2838' },
  { body: '#4a4054', shade: '#393042', trim: '#635670', winLit: '#ffe29a', winOff: '#2b2433' },
  { body: '#2f5259', shade: '#223d42', trim: '#416d75', winLit: '#ffdf85', winOff: '#1b3136' },
  { body: '#5c403c', shade: '#47302d', trim: '#785550', winLit: '#ffd573', winOff: '#362422' },
];

const RETRO_BUILDING_PALETTE = [
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
  private buildingCanvas: HTMLCanvasElement;
  private buildingCtx: CanvasRenderingContext2D;
  private cachedTheme: ThemeMode | null = null;
  private cachedCraterCount = -1;
  private cachedTerrainRef: SkylineTerrain | null = null;

  constructor() {
    this.buildingCanvas = document.createElement('canvas');
    this.buildingCanvas.width = WORLD_WIDTH;
    this.buildingCanvas.height = WORLD_HEIGHT;
    const ctx = this.buildingCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not initialize offscreen building canvas');
    this.buildingCtx = ctx;
  }

  invalidateBuildings(): void {
    this.cachedTerrainRef = null;
  }

  private ensureBuildingLayer(terrain: SkylineTerrain, theme: ThemeMode): void {
    if (
      this.cachedTerrainRef === terrain &&
      this.cachedTheme === theme &&
      this.cachedCraterCount === terrain.craters.length
    ) {
      return;
    }

    const ctx = this.buildingCtx;
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const palette = theme === 'retro' ? RETRO_BUILDING_PALETTE : MODERN_BUILDING_PALETTE;

    for (const b of terrain.buildings) {
      this.drawBuilding(ctx, b, palette[b.colorIndex % palette.length], theme);
    }

    // Punch craters out with charred rims
    for (const crater of terrain.craters) {
      // Charred rim slightly larger than crater, clipped to existing building pixels
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = theme === 'retro' ? '#222222' : 'rgba(18, 16, 20, 0.72)';
      ctx.beginPath();
      ctx.arc(crater.x, crater.y, crater.radius + (theme === 'retro' ? 4 : 6), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Carve the crater opening cleanly
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

  private drawBuilding(
    ctx: CanvasRenderingContext2D,
    b: Building,
    colors: { body: string; shade: string; trim: string; winLit: string; winOff: string },
    theme: ThemeMode,
  ): void {
    // Main facade
    ctx.fillStyle = colors.body;
    ctx.fillRect(b.x, b.topY, b.width, b.height);

    // Side shadow depth
    const shadeW = theme === 'retro' ? 8 : Math.max(10, Math.floor(b.width * 0.18));
    ctx.fillStyle = colors.shade;
    ctx.fillRect(b.x + b.width - shadeW, b.topY, shadeW, b.height);

    // Roof cornice
    ctx.fillStyle = colors.trim;
    ctx.fillRect(b.x, b.topY, b.width, theme === 'retro' ? 4 : 5);

    if (theme === 'retro') {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.topY + 1, b.width - 2, b.height);
    } else {
      // Subtle rooftop architectural detail (purely decorative above topY? Keep below or subtle)
      if (b.roofStyle === 'stepped') {
        ctx.fillStyle = colors.trim;
        ctx.fillRect(b.x + 8, b.topY + 5, b.width - 16, 4);
      }
    }

    // Windows grid
    const padX = 11;
    const padY = 16;
    const usableW = b.width - padX * 2 - (theme === 'retro' ? 4 : 6);
    const colStep = usableW / Math.max(1, b.windowCols);
    const winW = theme === 'retro' ? Math.max(6, Math.floor(colStep * 0.56)) : Math.max(6, Math.floor(colStep * 0.52));
    const winH = theme === 'retro' ? 10 : 12;
    const rowStep = 21;

    for (let r = 0; r < b.windowRows; r++) {
      const wy = b.topY + padY + r * rowStep;
      if (wy + winH > WORLD_HEIGHT - 10) break;
      for (let c = 0; c < b.windowCols; c++) {
        const wx = Math.round(b.x + padX + c * colStep + (colStep - winW) * 0.5);
        const lit = hash2d(b.windowSeed, c, r) > 0.36;
        ctx.fillStyle = lit ? colors.winLit : colors.winOff;
        ctx.fillRect(wx, wy, winW, winH);
        if (theme === 'modern' && lit) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.fillRect(wx, wy, winW, 3);
        }
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, state: RenderState): void {
    ctx.save();
    ctx.translate(state.shakeOffset.x, state.shakeOffset.y);

    // 1. Sky backdrop
    this.drawSky(ctx, state);

    // 2. Clouds & wind wisps
    this.drawAtmosphere(ctx, state);

    // 3. Classic Sun
    this.drawSun(ctx, state.theme, state.sunShocked, state.timeSec);

    // 4. Wind indicator under sun
    this.drawWindBanner(ctx, state.theme, state.windAccel);

    // 5. Destructible skyline layer
    this.ensureBuildingLayer(state.terrain, state.theme);
    ctx.drawImage(this.buildingCanvas, 0, 0);

    // 6. Ghost trail of active player's previous shot
    const activePlayer = state.players[state.activePlayerIndex];
    if (activePlayer?.lastShot && activePlayer.lastShot.points.length > 1) {
      this.drawGhostTrail(ctx, activePlayer, state.theme);
    }

    // 6b. Verified Solution trajectory overlay (when toggled On)
    if (state.showAimingGuides && state.showSolution && activePlayer && !activePlayer.isBot) {
      this.drawSolutionOverlay(ctx, state);
    }

    // 7. Aiming guides (vector, Vx/Vy, optional aim hint)
    if (state.showAimingGuides && activePlayer && !activePlayer.isBot) {
      this.drawAimingGuides(ctx, activePlayer, state);
    }

    // 8. Gorillas
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[i];
      const isActive = i === state.activePlayerIndex;
      this.drawGorilla(ctx, p, isActive, state.theme, state.timeSec);
    }

    // 9. Active flying banana & trail
    if (state.banana && state.banana.active) {
      this.drawBanana(ctx, state.banana, state.theme);
    }

    // 10. Explosion & celebration particles
    this.drawParticles(ctx, state.particles);

    // 11. Floating score/event callouts
    this.drawFloatingTexts(ctx, state.floatingTexts, state.theme);

    ctx.restore();
  }

  private drawSky(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const { theme, planetId, timeSec } = state;

    if (theme === 'retro') {
      const retroSky: Record<PlanetId, string> = {
        earth: '#0000aa',
        moon: '#06081a',
        mars: '#6e2310',
        jupiter: '#4f270c',
      };
      ctx.fillStyle = retroSky[planetId];
      ctx.fillRect(-20, -20, WORLD_WIDTH + 40, WORLD_HEIGHT + 40);

      if (planetId === 'moon') {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 42; i++) {
          const sx = Math.floor(hash2d(101, i, 1) * WORLD_WIDTH);
          const sy = Math.floor(hash2d(101, i, 2) * (WORLD_HEIGHT * 0.65));
          ctx.fillRect(sx, sy, 3, 3);
        }
      }
      return;
    }

    // Modern rich gradients per planet
    const grad = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
    if (planetId === 'earth') {
      grad.addColorStop(0, '#18446c');
      grad.addColorStop(0.45, '#3b7499');
      grad.addColorStop(0.78, '#de8b63');
      grad.addColorStop(1, '#f4c678');
    } else if (planetId === 'moon') {
      grad.addColorStop(0, '#09111f');
      grad.addColorStop(0.65, '#132238');
      grad.addColorStop(1, '#26384d');
    } else if (planetId === 'mars') {
      grad.addColorStop(0, '#6b2a1e');
      grad.addColorStop(0.55, '#b85a3a');
      grad.addColorStop(1, '#e8a878');
    } else {
      grad.addColorStop(0, '#4a2515');
      grad.addColorStop(0.35, '#8c4e2a');
      grad.addColorStop(0.7, '#cc8448');
      grad.addColorStop(1, '#e6b87a');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(-20, -20, WORLD_WIDTH + 40, WORLD_HEIGHT + 40);

    // Subtle stars on Moon or upper Earth dusk
    if (planetId === 'moon' || planetId === 'earth') {
      const starCount = planetId === 'moon' ? 75 : 22;
      const maxY = planetId === 'moon' ? WORLD_HEIGHT * 0.72 : WORLD_HEIGHT * 0.34;
      for (let i = 0; i < starCount; i++) {
        const sx = hash2d(99, i, 1) * WORLD_WIDTH;
        const sy = hash2d(99, i, 2) * maxY;
        const twinkle = 0.45 + 0.55 * Math.sin(timeSec * 2.2 + i * 1.7);
        const r = hash2d(99, i, 3) > 0.8 ? 1.8 : 1.1;
        ctx.fillStyle = `rgba(255, 252, 235, ${twinkle * (planetId === 'moon' ? 0.9 : 0.45)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Subtle distant skyline silhouette for Modern depth
    ctx.fillStyle =
      planetId === 'moon'
        ? 'rgba(12, 24, 42, 0.55)'
        : planetId === 'mars'
          ? 'rgba(110, 44, 28, 0.32)'
          : 'rgba(30, 52, 74, 0.25)';
    for (let i = 0; i < 18; i++) {
      const bx = i * 70 - 10;
      const bh = 130 + hash2d(55, i, 4) * 180;
      ctx.fillRect(bx, WORLD_HEIGHT - bh, 64, bh);
    }
  }

  private drawAtmosphere(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const { theme, clouds, windWisps, windAccel, planetId } = state;

    // Clouds (not on airless Moon unless slight cosmic haze)
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
          ctx.fillStyle =
            planetId === 'mars'
              ? `rgba(255, 210, 175, ${c.opacity * 0.55})`
              : `rgba(255, 247, 232, ${c.opacity})`;
          ctx.beginPath();
          ctx.ellipse(c.x + c.width * 0.5, c.y, c.width * 0.48, c.height * 0.38, 0, 0, Math.PI * 2);
          ctx.ellipse(c.x + c.width * 0.3, c.y - c.height * 0.15, c.width * 0.3, c.height * 0.34, 0, 0, Math.PI * 2);
          ctx.ellipse(c.x + c.width * 0.7, c.y - c.height * 0.1, c.width * 0.28, c.height * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Wind streaks when wind is noticeable
    if (Math.abs(windAccel) > 0.35) {
      ctx.save();
      ctx.strokeStyle =
        theme === 'retro'
          ? 'rgba(255, 255, 255, 0.35)'
          : 'rgba(255, 250, 235, 0.34)';
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
      // Classic QBasic blocky sun rays
      ctx.strokeStyle = '#ffff55';
      ctx.lineWidth = 3;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (SUN_RADIUS + 2), Math.sin(a) * (SUN_RADIUS + 2));
        ctx.lineTo(Math.cos(a) * (SUN_RADIUS + 14), Math.sin(a) * (SUN_RADIUS + 14));
        ctx.stroke();
      }
      ctx.fillStyle = '#ffff55';
      ctx.beginPath();
      ctx.arc(0, 0, SUN_RADIUS - 3, 0, Math.PI * 2);
      ctx.fill();

      // Eyes & mouth
      ctx.fillStyle = '#0000aa';
      ctx.fillRect(-12, -10, 6, 6);
      ctx.fillRect(6, -10, 6, 6);

      if (shocked) {
        ctx.strokeStyle = '#0000aa';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 10, 8, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#0000aa';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 4, 12, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    // Modern glowing sun
    const halo = ctx.createRadialGradient(0, 0, SUN_RADIUS * 0.6, 0, 0, SUN_RADIUS * 2.1);
    halo.addColorStop(0, 'rgba(255, 224, 102, 0.55)');
    halo.addColorStop(1, 'rgba(255, 224, 102, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, SUN_RADIUS * 2.1, 0, Math.PI * 2);
    ctx.fill();

    // Gently rotating rays
    ctx.save();
    ctx.rotate(timeSec * 0.25);
    ctx.strokeStyle = '#ffd966';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (SUN_RADIUS + 4), Math.sin(a) * (SUN_RADIUS + 4));
      ctx.lineTo(Math.cos(a) * (SUN_RADIUS + 13), Math.sin(a) * (SUN_RADIUS + 13));
      ctx.stroke();
    }
    ctx.restore();

    // Sun body
    const bodyGrad = ctx.createRadialGradient(-8, -8, 4, 0, 0, SUN_RADIUS);
    bodyGrad.addColorStop(0, '#fff4b8');
    bodyGrad.addColorStop(0.6, '#ffd24c');
    bodyGrad.addColorStop(1, '#f4a236');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, SUN_RADIUS - 2, 0, Math.PI * 2);
    ctx.fill();

    // Expressive face
    ctx.fillStyle = '#472c1b';
    if (shocked) {
      // Wide surprised eyes + "O" mouth
      ctx.beginPath();
      ctx.arc(-10, -7, 4.5, 0, Math.PI * 2);
      ctx.arc(10, -7, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-11, -8, 1.6, 0, Math.PI * 2);
      ctx.arc(9, -8, 1.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#472c1b';
      ctx.beginPath();
      ctx.ellipse(0, 10, 7, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Rosy cheeks + cheerful smile
      ctx.fillStyle = 'rgba(232, 93, 74, 0.35)';
      ctx.beginPath();
      ctx.arc(-16, 4, 5, 0, Math.PI * 2);
      ctx.arc(16, 4, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#472c1b';
      ctx.beginPath();
      ctx.arc(-10, -6, 3.4, 0, Math.PI * 2);
      ctx.arc(10, -6, 3.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#472c1b';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 3, 11, 0.16 * Math.PI, 0.84 * Math.PI);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawWindBanner(
    ctx: CanvasRenderingContext2D,
    theme: ThemeMode,
    windAccel: number,
  ): void {
    const cx = SUN_X;
    const cy = SUN_Y + SUN_RADIUS + 28;
    const absWind = Math.abs(windAccel);

    ctx.save();
    ctx.font = theme === 'retro' ? 'bold 13px "Courier New", monospace' : '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const label =
      absWind < 0.25
        ? 'CALM AIR'
        : `WIND ${windAccel > 0 ? '→' : '←'} ${absWind.toFixed(1)} m/s²`;

    const pillW = Math.max(128, ctx.measureText(label).width + 28);
    const pillH = 26;

    if (theme === 'retro') {
      ctx.fillStyle = '#000055';
      ctx.fillRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH);
      ctx.strokeStyle = '#55ffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH);
      ctx.fillStyle = '#ffff55';
      ctx.fillText(label, cx, cy + 1);
    } else {
      ctx.fillStyle = 'rgba(17, 24, 39, 0.56)';
      this.roundRect(ctx, cx - pillW / 2, cy - pillH / 2, pillW, pillH, 13);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.fillText(label, cx, cy);
    }

    // Visual wind bar beneath label
    if (absWind >= 0.25) {
      const barY = cy + 19;
      const barLen = Math.min(84, absWind * 22);
      const dir = Math.sign(windAccel);
      ctx.strokeStyle = theme === 'retro' ? '#ff5555' : '#fde68a';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - (barLen * dir) / 2, barY);
      ctx.lineTo(cx + (barLen * dir) / 2, barY);
      ctx.stroke();

      // Arrowhead
      const tipX = cx + (barLen * dir) / 2;
      ctx.beginPath();
      ctx.moveTo(tipX, barY);
      ctx.lineTo(tipX - 8 * dir, barY - 5);
      ctx.moveTo(tipX, barY);
      ctx.lineTo(tipX - 8 * dir, barY + 5);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawGhostTrail(
    ctx: CanvasRenderingContext2D,
    player: Player,
    theme: ThemeMode,
  ): void {
    const shot = player.lastShot;
    if (!shot || shot.points.length < 2) return;

    ctx.save();
    ctx.strokeStyle =
      theme === 'retro' ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.48)';
    ctx.lineWidth = theme === 'retro' ? 2 : 2.2;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(shot.points[0].x, shot.points[0].y);
    for (let i = 1; i < shot.points.length; i++) {
      ctx.lineTo(shot.points[i].x, shot.points[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Find highest visible point for a neat label
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

  private drawAimingGuides(
    ctx: CanvasRenderingContext2D,
    player: Player,
    state: RenderState,
  ): void {
    const origin = { x: player.x, y: player.y - GORILLA_HAND_OFFSET_Y };
    const { aimAngle, aimSpeed, aimDirection, gravity, windAccel, theme } = state;
    const { vx, vy } = computeVelocityComponents(aimAngle, aimSpeed, aimDirection);

    ctx.save();

    // 1. Optional Aim Hint (first 0.9s of trajectory for younger kids)
    if (state.showAimHint) {
      const hintDuration = gravity < 3 ? 1.55 : gravity < 6 ? 1.15 : 0.85;
      const pts = sampleTrajectory(
        origin,
        aimAngle,
        aimSpeed,
        aimDirection,
        gravity,
        windAccel,
        hintDuration,
        0.045,
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

    // 2. Launch Vector Arrow
    const scale = 1.65; // pixels per m/s for arrow length
    const endX = origin.x + vx * scale;
    const endY = origin.y - vy * scale;

    // Angle arc at base
    const arcRadius = 30;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (aimDirection === 1) {
      ctx.arc(origin.x, origin.y, arcRadius, -((aimAngle * Math.PI) / 180), 0, false);
    } else {
      ctx.arc(origin.x, origin.y, arcRadius, Math.PI, Math.PI + (aimAngle * Math.PI) / 180, false);
    }
    ctx.stroke();

    // Optional Vx & Vy component decomposition (Physics Lab!)
    if (state.showPhysicsLab) {
      // Horizontal Vx arrow
      ctx.strokeStyle = theme === 'retro' ? '#55ffff' : '#38bdf8';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(endX, origin.y);
      ctx.stroke();

      // Vertical Vy arrow
      ctx.strokeStyle = theme === 'retro' ? '#ff5555' : '#fb923c';
      ctx.beginPath();
      ctx.moveTo(endX, origin.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Component labels
      ctx.font = theme === 'retro' ? 'bold 11px "Courier New", monospace' : '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = theme === 'retro' ? '#55ffff' : '#bae6fd';
      ctx.fillText(`Vx ${vx >= 0 ? '+' : ''}${vx.toFixed(1)}`, (origin.x + endX) / 2, origin.y + 14);

      ctx.fillStyle = theme === 'retro' ? '#ff7777' : '#fed7aa';
      ctx.textAlign = aimDirection > 0 ? 'left' : 'right';
      ctx.fillText(`Vy +${vy.toFixed(1)}`, endX + aimDirection * 8, (origin.y + endY) / 2);
    }

    // Main resultant vector line
    ctx.strokeStyle = theme === 'retro' ? '#ffff55' : '#fef08a';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Arrowhead
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

    // Active turn indicator + player name tag
    const labelY = -56;
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
    // Classic 1991 QBasic blocky tan/brown gorilla silhouette
    const fur = '#cc7a33';
    const chest = '#e6a15c';

    // Legs
    ctx.fillStyle = fur;
    ctx.fillRect(-13, -12, 10, 12);
    ctx.fillRect(3, -12, 10, 12);

    // Torso
    ctx.fillRect(-15, -30, 30, 20);
    ctx.fillStyle = chest;
    ctx.fillRect(-9, -27, 18, 13);

    // Head
    ctx.fillStyle = fur;
    ctx.fillRect(-9, -41, 18, 12);

    // Colored player bandana/hat bar so 2-4 players are distinct
    ctx.fillStyle = p.color;
    ctx.fillRect(-10, -43, 20, 5);

    // Eyes
    ctx.fillStyle = '#000000';
    ctx.fillRect(-6, -37, 3, 3);
    ctx.fillRect(3, -37, 3, 3);

    // Arms
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
    const fur = '#3b3332';
    const furLight = '#574b49';
    const skin = '#c89b7b';

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

    // Colored wristbands
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 4;
    if (armsUp) {
      ctx.beginPath();
      ctx.moveTo(-21, -37 + wave);
      ctx.lineTo(-17, -37 + wave);
      ctx.moveTo(17, -37 - wave);
      ctx.lineTo(21, -37 - wave);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-20, -11);
      ctx.lineTo(-16, -11);
      ctx.moveTo(16, -11);
      ctx.lineTo(20, -11);
      ctx.stroke();
    }

    // Legs
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.roundRect(-12, -12, 9, 12, 4);
    ctx.roundRect(3, -12, 9, 12, 4);
    ctx.fill();

    // Broad chest / torso
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.ellipse(0, -21, 16, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Chest patch
    ctx.fillStyle = furLight;
    ctx.beginPath();
    ctx.ellipse(0, -20, 10, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.arc(0, -35, 11, 0, Math.PI * 2);
    ctx.fill();

    // Face oval
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(0, -33, 7.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    if (p.animation === 'ouch') {
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

      // Friendly grin
      ctx.strokeStyle = '#1f1a18';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, -31.5, 3.5, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }

    // Distinct Player Hat / Accessory
    ctx.fillStyle = p.color;
    if (p.hatStyle === 'bandana') {
      ctx.fillRect(-10, -43, 20, 4.5);
      // Little bandana tail
      ctx.beginPath();
      ctx.moveTo(10, -41);
      ctx.lineTo(16, -44);
      ctx.lineTo(15, -38);
      ctx.closePath();
      ctx.fill();
    } else if (p.hatStyle === 'cap') {
      ctx.beginPath();
      ctx.arc(0, -41, 10, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-10, -42, 24, 3.5);
    } else if (p.hatStyle === 'crown') {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-9, -42);
      ctx.lineTo(-9, -50);
      ctx.lineTo(-3, -45);
      ctx.lineTo(0, -52);
      ctx.lineTo(3, -45);
      ctx.lineTo(9, -50);
      ctx.lineTo(9, -42);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // Beanie
      ctx.beginPath();
      ctx.arc(0, -41, 10, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = p.accentColor;
      ctx.beginPath();
      ctx.arc(0, -51, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBanana(
    ctx: CanvasRenderingContext2D,
    banana: Banana,
    theme: ThemeMode,
  ): void {
    // Flight trail
    if (banana.trail.length > 1) {
      ctx.save();
      ctx.strokeStyle = theme === 'retro' ? '#ffff55' : 'rgba(254, 240, 138, 0.85)';
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

    // Off-screen high-altitude tracker
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
      // Chunky yellow pixel banana
      ctx.fillStyle = '#ffff55';
      ctx.fillRect(-7, -3, 14, 5);
      ctx.fillRect(-9, 0, 5, 4);
      ctx.fillRect(4, 0, 5, 4);
      ctx.fillStyle = '#aa5500';
      ctx.fillRect(-10, 2, 3, 3);
      ctx.fillRect(7, 2, 3, 3);
    } else {
      // Smooth crescent banana
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#ca8a04';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 2, 10, Math.PI * 1.15, Math.PI * 1.85);
      ctx.arc(0, 7, 10, Math.PI * 1.85, Math.PI * 1.15, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Stem tip
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

  private drawSolutionOverlay(ctx: CanvasRenderingContext2D, state: RenderState): void {
    const sol = state.verifiedSolution;
    const theme = state.theme;
    ctx.save();

    if (!sol || sol.points.length < 2) {
      // Explain clearly if player walked into an obstructed spot
      const msg = 'No direct arc from this spot — step left/right or blast a tunnel!';
      ctx.font =
        theme === 'retro'
          ? 'bold 12px "Courier New", monospace'
          : '700 12px system-ui, sans-serif';
      const w = ctx.measureText(msg).width + 20;
      const cx = WORLD_WIDTH / 2;
      const cy = 190;
      ctx.fillStyle = theme === 'retro' ? '#550000' : 'rgba(127, 29, 29, 0.85)';
      this.roundRect(ctx, cx - w / 2, cy - 13, w, 26, theme === 'retro' ? 0 : 12);
      ctx.fill();
      ctx.fillStyle = '#fecaca';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(msg, cx, cy);
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

    // Pulsing target ring at impact point
    const last = sol.points[sol.points.length - 1];
    const pulse = 1 + Math.sin(state.timeSec * 6) * 0.14;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 18 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    // Label near highest visible point on arc
    let labelPt = sol.points[Math.floor(sol.points.length / 2)];
    for (const pt of sol.points) {
      if (pt.y < labelPt.y && pt.y > 42 && pt.x > 110 && pt.x < WORLD_WIDTH - 110) {
        labelPt = pt;
      }
    }
    const dirLabel = sol.direction > 0 ? 'Right →' : '← Left';
    const text = `Solution: ${sol.angleDeg}° · ${sol.speed} m/s (${dirLabel})`;
    ctx.font =
      theme === 'retro'
        ? 'bold 12px "Courier New", monospace'
        : '700 12px system-ui, sans-serif';
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

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    if (r <= 0) {
      ctx.rect(x, y, w, h);
    } else {
      ctx.roundRect(x, y, w, h, r);
    }
  }
}
