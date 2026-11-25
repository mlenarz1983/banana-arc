import './style.css';
import { soundEngine } from './audio';
import {
  BANANA_RADIUS,
  BOT_PRESET,
  CRATER_RADIUS,
  GORILLA_HAND_OFFSET_Y,
  GORILLA_HIT_RADIUS,
  LONG_SHOT_METERS,
  MAX_ANGLE,
  MAX_FLIGHT_SEC,
  MAX_MOVES_PER_TURN,
  MAX_SPEED,
  MIN_ANGLE,
  MIN_SPEED,
  MOVE_STEP_PX,
  PIXELS_PER_METER,
  PLANETS,
  PLANET_ORDER,
  PLAYER_PRESETS,
  SCORE_DIRECT_HIT,
  SCORE_FIRST_TRY_BONUS,
  SCORE_LONG_SHOT_BONUS,
  SCORE_SPLASH_HIT,
  SCORE_SUN_BONK,
  SELF_HIT_GRACE_SEC,
  SPLASH_RADIUS,
  SUN_RADIUS,
  SUN_X,
  SUN_Y,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';
import {
  clamp,
  computeAwards,
  computeVelocityComponents,
  evaluateProjectilePosition,
  findVerifiedSolution,
  generatePhysicsTip,
  radToDeg,
  solveBotShot,
  theoreticalFlatRange,
} from './physics';
import { GameRenderer } from './renderer';
import {
  generateSolvableRound,
  SkylineTerrain,
  tryMoveGorilla,
} from './skyline';
import type {
  Banana,
  BotDifficulty,
  Cloud,
  FloatingText,
  GameConfig,
  GamePhase,
  Particle,
  Player,
  ThemeMode,
  ThrowDirection,
  VerifiedSolution,
  WindWisp,
} from './types';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

class GorillaPhysicsGame {
  private canvas = byId<HTMLCanvasElement>('game-canvas');
  private ctx: CanvasRenderingContext2D;
  private renderer = new GameRenderer();

  // DOM references
  private roundBadge = byId<HTMLSpanElement>('round-badge');
  private planetBadge = byId<HTMLSpanElement>('planet-badge');
  private btnTheme = byId<HTMLButtonElement>('btn-theme');
  private btnHint = byId<HTMLButtonElement>('btn-hint');
  private btnSolution = byId<HTMLButtonElement>('btn-solution');
  private btnLab = byId<HTMLButtonElement>('btn-lab');
  private btnSound = byId<HTMLButtonElement>('btn-sound');
  private btnNewGame = byId<HTMLButtonElement>('btn-new-game');

  private turnDot = byId<HTMLSpanElement>('turn-dot');
  private turnText = byId<HTMLSpanElement>('turn-text');
  private triesBadge = byId<HTMLSpanElement>('tries-badge');
  private scoreboardStrip = byId<HTMLDivElement>('scoreboard-strip');
  private toastBanner = byId<HTMLDivElement>('toast-banner');

  private moveLabel = byId<HTMLSpanElement>('move-label');
  private btnMoveLeft = byId<HTMLButtonElement>('btn-move-left');
  private btnMoveRight = byId<HTMLButtonElement>('btn-move-right');
  private btnDirLeft = byId<HTMLButtonElement>('btn-dir-left');
  private btnDirRight = byId<HTMLButtonElement>('btn-dir-right');
  private inputAngle = byId<HTMLInputElement>('input-angle');
  private inputAngleNum = byId<HTMLInputElement>('input-angle-num');
  private inputSpeed = byId<HTMLInputElement>('input-speed');
  private inputSpeedNum = byId<HTMLInputElement>('input-speed-num');
  private btnThrow = byId<HTMLButtonElement>('btn-throw');

  private physicsLabPanel = byId<HTMLElement>('physics-lab-panel');
  private labVx = byId<HTMLSpanElement>('lab-vx');
  private labVy = byId<HTMLSpanElement>('lab-vy');
  private labG = byId<HTMLSpanElement>('lab-g');
  private labWind = byId<HTMLSpanElement>('lab-wind');
  private labLast = byId<HTMLSpanElement>('lab-last');
  private labTip = byId<HTMLParagraphElement>('lab-tip');

  // Modals
  private setupModal = byId<HTMLDivElement>('setup-modal');
  private setupPlayerCount = byId<HTMLDivElement>('setup-player-count');
  private setupRounds = byId<HTMLDivElement>('setup-rounds');
  private setupTries = byId<HTMLDivElement>('setup-tries');
  private botSkillRow = byId<HTMLDivElement>('bot-skill-row');
  private setupBotSkill = byId<HTMLDivElement>('setup-bot-skill');
  private setupNames = byId<HTMLDivElement>('setup-names');
  private setupPlanets = byId<HTMLDivElement>('setup-planets');
  private setupHintCheck = byId<HTMLInputElement>('setup-hint-check');
  private setupLabCheck = byId<HTMLInputElement>('setup-lab-check');
  private setupRetroCheck = byId<HTMLInputElement>('setup-retro-check');
  private btnStartMatch = byId<HTMLButtonElement>('btn-start-match');

  private gameoverModal = byId<HTMLDivElement>('gameover-modal');
  private gameoverWinnerLine = byId<HTMLParagraphElement>('gameover-winner-line');
  private finalStandings = byId<HTMLDivElement>('final-standings');
  private awardsSection = byId<HTMLDivElement>('awards-section');
  private awardsGrid = byId<HTMLDivElement>('awards-grid');
  private btnRematch = byId<HTMLButtonElement>('btn-rematch');
  private btnChangeSetup = byId<HTMLButtonElement>('btn-change-setup');

  // Game state
  private config: GameConfig = {
    humanCount: 2,
    rounds: 5,
    triesPerTurn: 3,
    planetId: 'earth',
    botDifficulty: 'easy',
    playerNames: PLAYER_PRESETS.map((p) => p.defaultName),
  };

  private theme: ThemeMode = 'modern';
  private showAimHint = false;
  private showSolution = false; // Defaults to Off!
  private showPhysicsLab = true;
  private phase: GamePhase = 'setup';

  private terrain: SkylineTerrain;
  private players: Player[] = [];
  private activePlayerIndex = 0;
  private currentRound = 1;
  private turnsTakenInRound = 0;

  private triesRemaining = 3;
  private movesRemaining = MAX_MOVES_PER_TURN;
  private turnEndedByHit = false;
  private verifiedSolution: VerifiedSolution | null = null;

  private windAccel = 0; // m/s^2
  private aimAngle = 45;
  private aimSpeed = 40;
  private aimDirection: ThrowDirection = 1;

  private banana: Banana | null = null;
  private sunShocked = false;
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private clouds: Cloud[] = [];
  private windWisps: WindWisp[] = [];

  private timeSec = 0;
  private lastFrameMs = 0;
  private shakeTimer = 0;
  private shakeStrength = 0;
  private toastTimer = 0;
  private botThinkTimer = 0;
  private postShotTimer = 0;
  private pendingRespawnIds: number[] = [];

  private isDraggingAim = false;

  constructor() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not supported');
    this.ctx = ctx;

    const preview = generateSolvableRound(2, PLANETS.earth.gravity, true, 1991);
    this.terrain = preview.terrain;
    this.initAtmosphere();
    this.initSetupUI();
    this.bindEvents();
    this.syncToolbarUI();

    this.setupPreviewScene(preview);

    this.lastFrameMs = performance.now();
    requestAnimationFrame((now) => this.loop(now));
  }

  private initAtmosphere(): void {
    this.clouds = Array.from({ length: 6 }, (_, i) => ({
      x: i * 220 + Math.random() * 80,
      y: 75 + (i % 3) * 48 + Math.random() * 20,
      width: 95 + Math.random() * 65,
      height: 36 + Math.random() * 18,
      speedFactor: 0.4 + Math.random() * 0.6,
      opacity: 0.28 + Math.random() * 0.22,
    }));

    this.windWisps = Array.from({ length: 18 }, () => ({
      x: Math.random() * WORLD_WIDTH,
      y: 40 + Math.random() * (WORLD_HEIGHT * 0.62),
      length: 26 + Math.random() * 44,
      speedFactor: 0.8 + Math.random() * 0.8,
      alpha: 0.25 + Math.random() * 0.45,
    }));
  }

  private setupPreviewScene(preview: ReturnType<typeof generateSolvableRound>): void {
    this.terrain = preview.terrain;
    this.renderer.invalidateBuildings();
    this.windAccel = preview.windAccel;
    this.players = preview.spawnIndices.map((bIdx, i) => {
      const b = this.terrain.buildings[bIdx];
      const preset = PLAYER_PRESETS[i];
      return this.createPlayer(i, preset.defaultName, preset, false, b.x + b.width / 2, b.topY, bIdx);
    });
    this.activePlayerIndex = 0;
  }

  private createPlayer(
    id: number,
    name: string,
    preset: (typeof PLAYER_PRESETS)[number],
    isBot: boolean,
    x: number,
    y: number,
    buildingIndex: number,
  ): Player {
    const planet = PLANETS[this.config.planetId];
    return {
      id,
      name,
      color: preset.color,
      accentColor: preset.accentColor,
      hatStyle: preset.hatStyle,
      isBot,
      botDifficulty: this.config.botDifficulty,
      x,
      y,
      buildingIndex,
      score: 0,
      hits: 0,
      splashHits: 0,
      sunBonks: 0,
      maxApexMeters: 0,
      blocksDestroyed: 0,
      directSnipes: 0,
      shotsTaken: 0,
      lastShot: null,
      preferredAngle: 45,
      preferredSpeed: planet.defaultSpeed,
      preferredDirection: x < WORLD_WIDTH / 2 ? 1 : -1,
      animation: 'idle',
      animationTimer: 0,
    };
  }

  private initSetupUI(): void {
    this.setupPlanets.innerHTML = '';
    for (const id of PLANET_ORDER) {
      const p = PLANETS[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `planet-btn${id === this.config.planetId ? ' active' : ''}`;
      btn.dataset.planet = id;
      btn.innerHTML = `<strong>${p.name}</strong><small>${p.tagline}</small>`;
      btn.addEventListener('click', () => {
        this.config.planetId = id;
        this.setupPlanets.querySelectorAll('.planet-btn').forEach((el) => {
          el.classList.toggle('active', (el as HTMLElement).dataset.planet === id);
        });
        this.planetBadge.textContent = `${p.name} · ${p.gravity} m/s²`;
      });
      this.setupPlanets.appendChild(btn);
    }

    this.renderSetupNameInputs();
  }

  private renderSetupNameInputs(): void {
    this.setupNames.innerHTML = '';
    const count = this.config.humanCount;
    this.botSkillRow.classList.toggle('hidden', count !== 1);

    for (let i = 0; i < count; i++) {
      const preset = PLAYER_PRESETS[i];
      const row = document.createElement('div');
      row.className = 'name-input-row';
      row.innerHTML = `
        <span class="name-swatch" style="background:${preset.color}"></span>
        <input type="text" maxlength="14" value="${this.config.playerNames[i] || preset.defaultName}" aria-label="Player ${i + 1} name" />
      `;
      const input = row.querySelector('input')!;
      input.addEventListener('input', () => {
        this.config.playerNames[i] = input.value.trim() || preset.defaultName;
      });
      this.setupNames.appendChild(row);
    }

    if (count === 1) {
      const botRow = document.createElement('div');
      botRow.className = 'name-input-row';
      botRow.innerHTML = `
        <span class="name-swatch" style="background:${BOT_PRESET.color}"></span>
        <input type="text" value="Robo-Kong (Bot)" disabled aria-label="Bot player" />
      `;
      this.setupNames.appendChild(botRow);
    }
  }

  private bindEvents(): void {
    this.setupPlayerCount.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-count]');
      if (!btn) return;
      this.config.humanCount = Number(btn.dataset.count);
      this.setupPlayerCount.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      this.renderSetupNameInputs();
    });

    this.setupRounds.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-rounds]');
      if (!btn) return;
      this.config.rounds = Number(btn.dataset.rounds);
      this.setupRounds.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });

    this.setupTries.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tries]');
      if (!btn) return;
      this.config.triesPerTurn = Number(btn.dataset.tries);
      this.setupTries.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });

    this.setupBotSkill.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-skill]');
      if (!btn) return;
      this.config.botDifficulty = btn.dataset.skill as BotDifficulty;
      this.setupBotSkill.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });

    this.btnStartMatch.addEventListener('click', () => {
      this.showAimHint = this.setupHintCheck.checked;
      this.showPhysicsLab = this.setupLabCheck.checked;
      this.setTheme(this.setupRetroCheck.checked ? 'retro' : 'modern');
      this.syncToolbarUI();
      this.startMatch();
    });

    // Toolbar toggles
    this.btnTheme.addEventListener('click', () => {
      this.setTheme(this.theme === 'modern' ? 'retro' : 'modern');
      soundEngine.playTick();
    });

    this.btnHint.addEventListener('click', () => {
      this.showAimHint = !this.showAimHint;
      this.setupHintCheck.checked = this.showAimHint;
      this.syncToolbarUI();
      soundEngine.playTick();
    });

    this.btnSolution.addEventListener('click', () => {
      this.showSolution = !this.showSolution;
      if (this.showSolution) {
        this.refreshVerifiedSolution();
      }
      this.syncToolbarUI();
      soundEngine.playTick();
    });

    this.btnLab.addEventListener('click', () => {
      this.showPhysicsLab = !this.showPhysicsLab;
      this.setupLabCheck.checked = this.showPhysicsLab;
      this.syncToolbarUI();
      soundEngine.playTick();
    });

    this.btnSound.addEventListener('click', () => {
      soundEngine.toggleMute();
      this.syncToolbarUI();
      if (!soundEngine.isMuted()) soundEngine.playTick();
    });

    this.btnNewGame.addEventListener('click', () => {
      this.phase = 'setup';
      this.banana = null;
      this.setupRetroCheck.checked = this.theme === 'retro';
      this.setupHintCheck.checked = this.showAimHint;
      this.setupLabCheck.checked = this.showPhysicsLab;
      this.gameoverModal.classList.add('hidden');
      this.setupModal.classList.remove('hidden');
    });

    // Controls dock
    this.btnMoveLeft.addEventListener('click', () => this.moveActiveGorilla(-1));
    this.btnMoveRight.addEventListener('click', () => this.moveActiveGorilla(1));

    this.btnDirLeft.addEventListener('click', () => this.setAimDirection(-1));
    this.btnDirRight.addEventListener('click', () => this.setAimDirection(1));

    this.inputAngle.addEventListener('input', () => {
      this.setAimAngle(Number(this.inputAngle.value));
    });
    this.inputAngleNum.addEventListener('change', () => {
      this.setAimAngle(Number(this.inputAngleNum.value));
    });

    this.inputSpeed.addEventListener('input', () => {
      this.setAimSpeed(Number(this.inputSpeed.value));
    });
    this.inputSpeedNum.addEventListener('change', () => {
      this.setAimSpeed(Number(this.inputSpeedNum.value));
    });

    this.btnThrow.addEventListener('click', () => {
      if (this.canHumanControl()) {
        this.fireCurrentPlayerBanana();
      }
    });

    // Game Over modal buttons
    this.btnRematch.addEventListener('click', () => {
      this.gameoverModal.classList.add('hidden');
      this.startMatch();
    });

    this.btnChangeSetup.addEventListener('click', () => {
      this.gameoverModal.classList.add('hidden');
      this.phase = 'setup';
      this.setupModal.classList.remove('hidden');
    });

    // Canvas drag-to-aim (mouse + touch via Pointer Events)
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.canHumanControl()) return;
      this.isDraggingAim = true;
      this.canvas.setPointerCapture(e.pointerId);
      this.updateAimFromPointer(e);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.isDraggingAim || !this.canHumanControl()) return;
      this.updateAimFromPointer(e);
    });

    const endDrag = () => {
      this.isDraggingAim = false;
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!this.canHumanControl()) return;

      const step = e.shiftKey ? 5 : 1;
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        this.moveActiveGorilla(-1);
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        this.moveActiveGorilla(1);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        this.setAimDirection(this.aimDirection === 1 ? -1 : 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.setAimAngle(this.aimAngle + step);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.setAimAngle(this.aimAngle - step);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.setAimSpeed(this.aimSpeed + step);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.setAimSpeed(this.aimSpeed - step);
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this.fireCurrentPlayerBanana();
      }
    });
  }

  private setTheme(theme: ThemeMode): void {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    this.renderer.invalidateBuildings();
    this.syncToolbarUI();
  }

  private syncToolbarUI(): void {
    this.btnTheme.textContent = this.theme === 'modern' ? 'Theme: Modern' : "Theme: Retro '90s";
    this.btnHint.textContent = `Aim Hint: ${this.showAimHint ? 'On' : 'Off'}`;
    this.btnHint.setAttribute('aria-pressed', String(this.showAimHint));
    this.btnSolution.textContent = `Solution: ${this.showSolution ? 'On' : 'Off'}`;
    this.btnSolution.setAttribute('aria-pressed', String(this.showSolution));
    this.btnLab.textContent = `Physics Lab: ${this.showPhysicsLab ? 'On' : 'Off'}`;
    this.btnLab.setAttribute('aria-pressed', String(this.showPhysicsLab));
    this.physicsLabPanel.classList.toggle('hidden', !this.showPhysicsLab);
    const muted = soundEngine.isMuted();
    this.btnSound.textContent = muted ? 'Sound: Off' : 'Sound: On';
    this.btnSound.setAttribute('aria-pressed', String(!muted));
  }

  private canHumanControl(): boolean {
    const active = this.players[this.activePlayerIndex];
    return this.phase === 'aiming' && Boolean(active) && !active.isBot;
  }

  private moveActiveGorilla(dir: -1 | 1): void {
    if (!this.canHumanControl()) return;
    if (this.movesRemaining <= 0) {
      soundEngine.playBlocked();
      const active = this.players[this.activePlayerIndex];
      if (active) {
        this.spawnFloatingText(active.x, active.y - 68, 'No steps left this turn!', '#fed7aa', 0.9);
      }
      return;
    }

    const active = this.players[this.activePlayerIndex];
    if (!active) return;

    const others = this.players
      .filter((p) => p.id !== active.id)
      .map((p) => ({ x: p.x, y: p.y }));

    const result = tryMoveGorilla(
      this.terrain,
      active.x,
      active.y,
      dir * MOVE_STEP_PX,
      others,
    );

    if (!result.moved) {
      soundEngine.playBlocked();
      const reasonMsg =
        result.reason === 'wall'
          ? "Can't climb taller roof!"
          : result.reason === 'occupied'
            ? 'Gorilla in the way!'
            : 'Edge of skyline!';
      this.spawnFloatingText(active.x, active.y - 68, reasonMsg, '#fca5a5', 0.9);
      return;
    }

    active.x = result.x;
    active.y = result.y;
    active.buildingIndex = this.terrain.getBuildingIndexAt(active.x);
    this.movesRemaining--;

    soundEngine.playStep(result.dropped);
    if (result.dropped) {
      this.spawnDustPuff(active.x, active.y);
      this.spawnFloatingText(active.x, active.y - 66, 'Dropped down!', '#bae6fd', 0.85);
    }

    this.updateMoveUI();
    if (this.showSolution) {
      this.refreshVerifiedSolution();
    }
  }

  private spawnDustPuff(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 16,
        y: y - 2,
        vx: (Math.random() - 0.5) * 90,
        vy: -20 - Math.random() * 50,
        size: 3 + Math.random() * 4,
        color: this.theme === 'retro' ? '#cccccc' : '#e2e8f0',
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        shape: this.theme === 'retro' ? 'square' : 'circle',
        rotation: 0,
        vRot: 0,
        gravityScale: 0.3,
      });
    }
  }

  private updateMoveUI(): void {
    this.moveLabel.textContent = `Move (${this.movesRemaining} left)`;
    const canMove = this.canHumanControl() && this.movesRemaining > 0;
    this.btnMoveLeft.disabled = !canMove;
    this.btnMoveRight.disabled = !canMove;
  }

  private refreshVerifiedSolution(): void {
    const active = this.players[this.activePlayerIndex];
    if (!active || active.isBot) {
      this.verifiedSolution = null;
      return;
    }

    const planet = PLANETS[this.config.planetId];
    const origin = { x: active.x, y: active.y - GORILLA_HAND_OFFSET_Y };

    // Sort opponents so we check opponents in the active aim direction first
    const opponents = this.players
      .filter((p) => p.id !== active.id)
      .sort((a, b) => {
        const aMatches = Math.sign(a.x - active.x) === this.aimDirection ? 0 : 1;
        const bMatches = Math.sign(b.x - active.x) === this.aimDirection ? 0 : 1;
        if (aMatches !== bMatches) return aMatches - bMatches;
        return Math.abs(a.x - active.x) - Math.abs(b.x - active.x);
      });

    for (const opp of opponents) {
      const target = { x: opp.x, y: opp.y - 22 };
      const sol = findVerifiedSolution(
        origin,
        target,
        planet.gravity,
        this.windAccel,
        (x, y) => this.terrain.isSolid(x, y),
      );
      if (sol) {
        this.verifiedSolution = { ...sol, targetPlayerId: opp.id };
        return;
      }
    }

    this.verifiedSolution = null;
  }

  private updateAimFromPointer(e: PointerEvent): void {
    const active = this.players[this.activePlayerIndex];
    if (!active) return;

    const rect = this.canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * WORLD_WIDTH;
    const py = ((e.clientY - rect.top) / rect.height) * WORLD_HEIGHT;

    const originX = active.x;
    const originY = active.y - GORILLA_HAND_OFFSET_Y;

    const dx = px - originX;
    const dy = originY - py;

    const dir: ThrowDirection = dx >= 0 ? 1 : -1;
    const absDx = Math.max(4, Math.abs(dx));
    const clampedDy = Math.max(4, dy);
    const angle = Math.round(clamp(radToDeg(Math.atan2(clampedDy, absDx)), MIN_ANGLE, MAX_ANGLE));
    const distPx = Math.hypot(dx, Math.max(0, dy));
    const speed = Math.round(clamp(distPx / 2.2, MIN_SPEED, MAX_SPEED));

    this.setAimDirection(dir);
    this.setAimAngle(angle);
    this.setAimSpeed(speed);
  }

  private setAimDirection(dir: ThrowDirection): void {
    const changed = this.aimDirection !== dir;
    this.aimDirection = dir;
    this.btnDirLeft.classList.toggle('active', dir === -1);
    this.btnDirRight.classList.toggle('active', dir === 1);
    const active = this.players[this.activePlayerIndex];
    if (active) active.preferredDirection = dir;
    if (changed && this.showSolution) {
      this.refreshVerifiedSolution();
    }
    this.updatePhysicsLabReadout();
  }

  private setAimAngle(angle: number): void {
    const clamped = Math.round(clamp(Number.isFinite(angle) ? angle : 45, MIN_ANGLE, MAX_ANGLE));
    this.aimAngle = clamped;
    this.inputAngle.value = String(clamped);
    this.inputAngleNum.value = String(clamped);
    const active = this.players[this.activePlayerIndex];
    if (active) active.preferredAngle = clamped;
    this.updatePhysicsLabReadout();
  }

  private setAimSpeed(speed: number): void {
    const clamped = Math.round(clamp(Number.isFinite(speed) ? speed : 40, MIN_SPEED, MAX_SPEED));
    this.aimSpeed = clamped;
    this.inputSpeed.value = String(clamped);
    this.inputSpeedNum.value = String(clamped);
    const active = this.players[this.activePlayerIndex];
    if (active) active.preferredSpeed = clamped;
    this.updatePhysicsLabReadout();
  }

  private startMatch(): void {
    this.setupModal.classList.add('hidden');
    this.gameoverModal.classList.add('hidden');

    this.currentRound = 1;
    this.turnsTakenInRound = 0;
    this.activePlayerIndex = 0;
    this.particles = [];
    this.floatingTexts = [];
    this.banana = null;
    this.sunShocked = false;
    this.pendingRespawnIds = [];
    this.verifiedSolution = null;

    const players: Player[] = [];
    for (let i = 0; i < this.config.humanCount; i++) {
      const preset = PLAYER_PRESETS[i];
      const name = this.config.playerNames[i] || preset.defaultName;
      players.push(this.createPlayer(i, name, preset, false, 100, 400, 0));
    }
    if (this.config.humanCount === 1) {
      players.push(this.createPlayer(1, BOT_PRESET.defaultName, BOT_PRESET, true, 900, 400, 1));
    }
    this.players = players;

    this.setupRoundSkyline();
    this.beginPlayerTurn();
  }

  private setupRoundSkyline(): void {
    const planet = PLANETS[this.config.planetId];
    const seed = Date.now() ^ (this.currentRound * 9973);
    const roundSetup = generateSolvableRound(
      this.players.length,
      planet.gravity,
      this.config.planetId !== 'moon',
      seed,
    );

    this.terrain = roundSetup.terrain;
    this.windAccel = roundSetup.windAccel;
    this.renderer.invalidateBuildings();
    this.sunShocked = false;

    this.players.forEach((p, idx) => {
      const bIdx = roundSetup.spawnIndices[idx];
      const b = this.terrain.buildings[bIdx];
      p.buildingIndex = bIdx;
      p.x = Math.round(b.x + b.width / 2);
      p.y = b.topY;
      p.lastShot = null;
      p.animation = 'idle';
      p.preferredDirection = this.pickDefaultDirectionFor(p);
    });
  }

  private pickDefaultDirectionFor(player: Player): ThrowDirection {
    let nearestDist = Infinity;
    let dir: ThrowDirection = player.x < WORLD_WIDTH / 2 ? 1 : -1;
    for (const other of this.players) {
      if (other.id === player.id) continue;
      const dx = other.x - player.x;
      if (Math.abs(dx) < nearestDist) {
        nearestDist = Math.abs(dx);
        dir = dx >= 0 ? 1 : -1;
      }
    }
    return dir;
  }

  /**
   * Starts a fresh turn for the active player (resetting their tries & step budget).
   */
  private beginPlayerTurn(): void {
    this.triesRemaining = this.config.triesPerTurn;
    this.movesRemaining = MAX_MOVES_PER_TURN;
    this.turnEndedByHit = false;
    this.prepareAimStep(true);
  }

  /**
   * Prepares either the first try or a follow-up retry within the same player's turn.
   */
  private prepareAimStep(isFirstTry: boolean): void {
    const active = this.players[this.activePlayerIndex];
    if (!active) return;

    this.phase = 'aiming';
    this.banana = null;
    this.sunShocked = false;

    for (const p of this.players) {
      if (p.animation !== 'idle') {
        p.animation = 'idle';
      }
    }

    this.setAimDirection(active.preferredDirection);
    this.setAimAngle(active.preferredAngle);
    this.setAimSpeed(active.preferredSpeed);

    const planet = PLANETS[this.config.planetId];
    const tryNum = this.config.triesPerTurn - this.triesRemaining + 1;
    this.roundBadge.textContent = `Round ${this.currentRound} / ${this.config.rounds}`;
    this.planetBadge.textContent = `${planet.name} · ${planet.gravity} m/s²`;
    this.triesBadge.textContent = `Try ${tryNum} / ${this.config.triesPerTurn}`;
    this.triesBadge.classList.toggle('hidden', this.config.triesPerTurn <= 1);

    this.turnDot.style.background = active.color;
    this.turnText.textContent = active.isBot
      ? `${active.name} is calculating try ${tryNum}...`
      : isFirstTry
        ? `${active.name}'s turn — move (A/D) or aim & throw`
        : `${active.name} — adjust from your ghost trail & try again!`;

    this.setControlsEnabled(!active.isBot);
    this.updateMoveUI();
    this.renderScoreboardStrip();
    this.updatePhysicsLabReadout();

    if (this.showSolution) {
      this.refreshVerifiedSolution();
    } else {
      this.verifiedSolution = null;
    }

    if (active.isBot) {
      this.botThinkTimer = isFirstTry ? 0.85 : 0.6;
    }
  }

  private setControlsEnabled(enabled: boolean): void {
    this.btnMoveLeft.disabled = !enabled || this.movesRemaining <= 0;
    this.btnMoveRight.disabled = !enabled || this.movesRemaining <= 0;
    this.btnDirLeft.disabled = !enabled;
    this.btnDirRight.disabled = !enabled;
    this.inputAngle.disabled = !enabled;
    this.inputAngleNum.disabled = !enabled;
    this.inputSpeed.disabled = !enabled;
    this.inputSpeedNum.disabled = !enabled;
    this.btnThrow.disabled = !enabled;
  }

  private renderScoreboardStrip(): void {
    this.scoreboardStrip.innerHTML = '';
    this.players.forEach((p, idx) => {
      const pill = document.createElement('div');
      pill.className = `score-pill${idx === this.activePlayerIndex ? ' active' : ''}`;
      pill.innerHTML = `
        <span class="score-swatch" style="background:${p.color}"></span>
        <span>${p.name}</span>
        <span>${p.score}</span>
      `;
      this.scoreboardStrip.appendChild(pill);
    });
  }

  private updatePhysicsLabReadout(): void {
    const planet = PLANETS[this.config.planetId];
    const { vx, vy } = computeVelocityComponents(this.aimAngle, this.aimSpeed, this.aimDirection);
    const flatRange = theoreticalFlatRange(this.aimAngle, this.aimSpeed, planet.gravity);

    this.labVx.textContent = `${vx >= 0 ? '+' : ''}${vx.toFixed(1)} m/s`;
    this.labVy.textContent = `+${vy.toFixed(1)} m/s`;
    this.labG.textContent = `${planet.gravity} m/s²`;
    this.labWind.textContent =
      Math.abs(this.windAccel) < 0.1
        ? '0.0 m/s² (Calm)'
        : `${this.windAccel > 0 ? '+' : ''}${this.windAccel.toFixed(1)} m/s² (${this.windAccel > 0 ? 'Right' : 'Left'})`;

    const active = this.players[this.activePlayerIndex];
    if (active?.lastShot) {
      const s = active.lastShot;
      this.labLast.textContent = `${s.flightTime.toFixed(1)}s · Peak ${Math.round(s.apexMeters)}m · Dist ${Math.round(s.distanceMeters)}m`;
    } else {
      this.labLast.textContent = `Est. calm flat range ~${Math.round(flatRange)}m`;
    }
  }

  private showToast(msg: string, duration = 2.2): void {
    this.toastBanner.textContent = msg;
    this.toastBanner.classList.remove('hidden');
    this.toastTimer = duration;
  }

  private fireCurrentPlayerBanana(): void {
    const active = this.players[this.activePlayerIndex];
    if (!active) return;

    const originX = active.x;
    const originY = active.y - GORILLA_HAND_OFFSET_Y;
    const { vx, vy } = computeVelocityComponents(this.aimAngle, this.aimSpeed, this.aimDirection);

    active.shotsTaken++;
    active.animation = 'throwing';
    active.animationTimer = 0.45;

    this.banana = {
      active: true,
      x: originX,
      y: originY,
      vx,
      vy,
      originX,
      originY,
      angleDeg: this.aimAngle,
      speed: this.aimSpeed,
      direction: this.aimDirection,
      elapsed: 0,
      spin: 0,
      ownerId: active.id,
      trail: [{ x: originX, y: originY }],
      maxApexMeters: Math.max(0, (WORLD_HEIGHT - originY) / PIXELS_PER_METER),
      hitSun: false,
    };

    this.phase = 'flying';
    this.setControlsEnabled(false);
    soundEngine.playThrow(this.theme);
  }

  private executeBotTurn(): void {
    const bot = this.players[this.activePlayerIndex];
    if (!bot || !bot.isBot) return;

    const opponents = this.players.filter((p) => p.id !== bot.id);
    const target = opponents[Math.floor(Math.random() * opponents.length)];
    if (!target) return;

    const origin = { x: bot.x, y: bot.y - GORILLA_HAND_OFFSET_Y };
    const targetCenter = { x: target.x, y: target.y - 22 };
    const planet = PLANETS[this.config.planetId];

    const solution = solveBotShot(
      origin,
      targetCenter,
      planet.gravity,
      this.windAccel,
      bot.botDifficulty,
      (x, y) => this.terrain.isSolid(x, y),
    );

    this.setAimDirection(solution.direction);
    this.setAimAngle(solution.angleDeg);
    this.setAimSpeed(solution.speed);
    this.turnText.textContent = `${bot.name} throws at ${solution.angleDeg}° · ${solution.speed} m/s!`;
    this.fireCurrentPlayerBanana();
  }

  private stepBanana(dt: number): void {
    const b = this.banana;
    if (!b || !b.active) return;

    const planet = PLANETS[this.config.planetId];
    const subSteps = 8;
    const subDt = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      b.elapsed += subDt;
      const pt = evaluateProjectilePosition(
        { x: b.originX, y: b.originY },
        b.vx,
        b.vy,
        planet.gravity,
        this.windAccel,
        b.elapsed,
      );
      b.x = pt.x;
      b.y = pt.y;
      b.spin += subDt * 13 * b.direction;

      const altMeters = (WORLD_HEIGHT - b.y) / PIXELS_PER_METER;
      if (altMeters > b.maxApexMeters) {
        b.maxApexMeters = altMeters;
      }

      const lastTrail = b.trail[b.trail.length - 1];
      if (!lastTrail || Math.hypot(b.x - lastTrail.x, b.y - lastTrail.y) >= 8) {
        b.trail.push({ x: b.x, y: b.y });
      }

      // Check Sun Bonk!
      if (!b.hitSun && Math.hypot(b.x - SUN_X, b.y - SUN_Y) <= SUN_RADIUS + BANANA_RADIUS) {
        b.hitSun = true;
        this.sunShocked = true;
        const owner = this.players.find((p) => p.id === b.ownerId);
        if (owner) {
          owner.sunBonks++;
          owner.score += SCORE_SUN_BONK;
        }
        soundEngine.playSunBonk();
        this.spawnFloatingText(SUN_X, SUN_Y + 42, `SUN BONK! +${SCORE_SUN_BONK}`, '#fde047', 1.1);
        this.renderScoreboardStrip();
      }

      // Check Gorilla Direct Hits
      for (const p of this.players) {
        if (p.id === b.ownerId && b.elapsed < SELF_HIT_GRACE_SEC) continue;
        const gx = p.x;
        const gy = p.y - 22;
        if (Math.hypot(b.x - gx, b.y - gy) <= GORILLA_HIT_RADIUS + BANANA_RADIUS) {
          this.resolveImpact(b.x, b.y, p);
          return;
        }
      }

      // Check Building Collision
      if (b.y >= 0 && this.terrain.isSolid(b.x, b.y)) {
        this.resolveImpact(b.x, b.y, null);
        return;
      }

      // Out of Bounds
      if (
        b.x < -140 ||
        b.x > WORLD_WIDTH + 140 ||
        b.y > WORLD_HEIGHT + 30 ||
        b.elapsed > MAX_FLIGHT_SEC
      ) {
        this.resolveOutOfBounds();
        return;
      }
    }
  }

  private resolveOutOfBounds(): void {
    const b = this.banana;
    if (!b) return;
    b.active = false;

    const owner = this.players.find((p) => p.id === b.ownerId);
    const planet = PLANETS[this.config.planetId];

    if (owner) {
      owner.maxApexMeters = Math.max(owner.maxApexMeters, b.maxApexMeters);
      owner.lastShot = {
        originX: b.originX,
        originY: b.originY,
        angleDeg: b.angleDeg,
        speed: b.speed,
        direction: b.direction,
        points: b.trail,
        apexMeters: b.maxApexMeters,
        distanceMeters: Math.abs(b.x - b.originX) / PIXELS_PER_METER,
        flightTime: b.elapsed,
        outcome: 'out',
      };
      this.labTip.textContent = generatePhysicsTip(
        b.angleDeg,
        b.speed,
        b.direction,
        this.windAccel,
        planet,
        'out',
      );
    }

    this.triesRemaining--;
    const retryNote = this.triesRemaining > 0 ? ` (${this.triesRemaining} ${this.triesRemaining === 1 ? 'try' : 'tries'} left!)` : '';
    this.showToast(
      (planet.id === 'moon' ? 'Banana floated into lunar orbit!' : 'Way over the skyline!') + retryNote,
      1.9,
    );
    this.updatePhysicsLabReadout();
    this.phase = 'exploding';
    this.postShotTimer = 0.85;
  }

  private resolveImpact(ix: number, iy: number, directTarget: Player | null): void {
    const b = this.banana;
    if (!b) return;
    b.active = false;

    const owner = this.players.find((p) => p.id === b.ownerId)!;
    const planet = PLANETS[this.config.planetId];
    const distanceMeters = Math.abs(ix - b.originX) / PIXELS_PER_METER;
    const isFirstTryOfTurn = this.triesRemaining === this.config.triesPerTurn;

    owner.maxApexMeters = Math.max(owner.maxApexMeters, b.maxApexMeters);

    // Carve crater into skyscrapers
    const craterRadius = directTarget ? CRATER_RADIUS + 8 : CRATER_RADIUS;
    const pixelsDestroyed = this.terrain.carveCrater(ix, iy, craterRadius);
    owner.blocksDestroyed += pixelsDestroyed;

    // Settle any gorillas whose footing got blasted
    for (const p of this.players) {
      const groundY = this.terrain.getSurfaceY(p.x, Math.max(0, p.y - 6));
      if (groundY > p.y && groundY < WORLD_HEIGHT) {
        p.y = groundY;
      }
    }

    let outcome: 'hit' | 'splash' | 'building' | 'self' = 'building';

    if (directTarget) {
      if (directTarget.id === owner.id) {
        outcome = 'self';
        this.triesRemaining--;
        directTarget.animation = 'ouch';
        soundEngine.playBuildingHit(this.theme);
        this.spawnExplosionParticles(ix, iy, '#f97316', 36);
        this.spawnFloatingText(ix, iy - 28, 'SELF-BONK!', '#fca5a5', 1.2);
        this.showToast(`Oops! ${owner.name} bonked themselves!`);
      } else {
        outcome = 'hit';
        this.turnEndedByHit = true;
        this.triesRemaining = 0;
        owner.hits++;

        let gained = SCORE_DIRECT_HIT;
        const bonuses: string[] = [];
        if (this.config.triesPerTurn > 1 && isFirstTryOfTurn) {
          gained += SCORE_FIRST_TRY_BONUS;
          bonuses.push(`+${SCORE_FIRST_TRY_BONUS} First Try!`);
        }
        if (distanceMeters >= LONG_SHOT_METERS) {
          gained += SCORE_LONG_SHOT_BONUS;
          bonuses.push(`+${SCORE_LONG_SHOT_BONUS} Long Shot!`);
        }
        owner.score += gained;
        owner.animation = 'celebrate';
        directTarget.animation = 'ouch';
        this.pendingRespawnIds.push(directTarget.id);

        soundEngine.playGorillaHit(this.theme);
        this.triggerShake(10, 0.45);
        this.spawnExplosionParticles(ix, iy, '#fde047', 54);
        this.spawnFloatingText(ix, iy - 34, `DIRECT HIT! +${gained}`, '#fde047', 1.3);
        const bonusStr = bonuses.length > 0 ? ` (${bonuses.join(' ')})` : '';
        this.showToast(`${owner.name} hit ${directTarget.name}! +${gained} pts${bonusStr}`, 2.4);
      }
    } else {
      this.triesRemaining--;
      let splashedPlayer: Player | null = null;
      for (const p of this.players) {
        if (p.id === owner.id) continue;
        const dist = Math.hypot(ix - p.x, iy - (p.y - 22));
        if (dist <= SPLASH_RADIUS) {
          splashedPlayer = p;
          break;
        }
      }

      if (splashedPlayer) {
        outcome = 'splash';
        owner.splashHits++;
        owner.score += SCORE_SPLASH_HIT;
        splashedPlayer.animation = 'ouch';
        soundEngine.playBuildingHit(this.theme);
        this.triggerShake(7, 0.32);
        this.spawnExplosionParticles(ix, iy, '#fb923c', 38);
        this.spawnFloatingText(ix, iy - 26, `CLOSE CALL! +${SCORE_SPLASH_HIT}`, '#fed7aa', 1.15);
        const retryNote = this.triesRemaining > 0 ? ` — ${this.triesRemaining} ${this.triesRemaining === 1 ? 'try' : 'tries'} left to dial it in!` : '';
        this.showToast(`Close splash near ${splashedPlayer.name}! +${SCORE_SPLASH_HIT} pts${retryNote}`, 2.2);
      } else {
        soundEngine.playBuildingHit(this.theme);
        this.triggerShake(5, 0.24);
        this.spawnExplosionParticles(ix, iy, '#f97316', 28);
        if (this.triesRemaining > 0 && !owner.isBot) {
          this.showToast(
            `Building blasted! ${this.triesRemaining} ${this.triesRemaining === 1 ? 'try' : 'tries'} left — adjust using your ghost trail.`,
            1.8,
          );
        }
      }
    }

    owner.lastShot = {
      originX: b.originX,
      originY: b.originY,
      angleDeg: b.angleDeg,
      speed: b.speed,
      direction: b.direction,
      points: b.trail,
      apexMeters: b.maxApexMeters,
      distanceMeters,
      flightTime: b.elapsed,
      outcome,
    };

    this.labTip.textContent = generatePhysicsTip(
      b.angleDeg,
      b.speed,
      b.direction,
      this.windAccel,
      planet,
      outcome,
    );

    this.renderScoreboardStrip();
    this.updatePhysicsLabReadout();
    this.phase = 'exploding';
    this.postShotTimer = outcome === 'hit' ? 1.5 : 0.8;
  }

  private respawnHitGorillas(): void {
    if (this.pendingRespawnIds.length === 0) return;

    const planet = PLANETS[this.config.planetId];
    const occupied = new Set(
      this.players
        .filter((p) => !this.pendingRespawnIds.includes(p.id))
        .map((p) => p.buildingIndex),
    );

    for (const id of this.pendingRespawnIds) {
      const p = this.players.find((pl) => pl.id === id);
      if (!p) continue;

      const others = this.players.filter((o) => o.id !== p.id);
      const candidates = this.terrain.buildings
        .map((_, idx) => idx)
        .filter((idx) => !occupied.has(idx) && idx !== p.buildingIndex)
        .sort(() => Math.random() - 0.5);

      // Prefer a rooftop that has a verified unobstructed shot to an opponent
      let chosenIdx = candidates[0] ?? p.buildingIndex;
      for (const idx of candidates) {
        const b = this.terrain.buildings[idx];
        const rx = Math.round(b.x + b.width / 2);
        const ry = this.terrain.getSurfaceY(rx, Math.max(0, b.topY - 4));
        if (ry >= WORLD_HEIGHT - 20) continue;
        const origin = { x: rx, y: ry - GORILLA_HAND_OFFSET_Y };
        const hasShot = others.some((o) =>
          Boolean(
            findVerifiedSolution(
              origin,
              { x: o.x, y: o.y - 22 },
              planet.gravity,
              this.windAccel,
              (x, y) => this.terrain.isSolid(x, y),
            ),
          ),
        );
        if (hasShot) {
          chosenIdx = idx;
          break;
        }
      }

      const b = this.terrain.buildings[chosenIdx];
      p.buildingIndex = chosenIdx;
      p.x = Math.round(b.x + b.width / 2);
      p.y = this.terrain.getSurfaceY(p.x, Math.max(0, b.topY - 4));
      p.animation = 'idle';
      p.preferredDirection = this.pickDefaultDirectionFor(p);
      occupied.add(chosenIdx);
      this.spawnFloatingText(p.x, p.y - 60, `${p.name} hopped rooftops!`, '#ffffff', 0.95);
    }

    this.pendingRespawnIds = [];
  }

  private afterShotComplete(): void {
    // If the active player still has tries left and didn't already score a direct hit, stay on their turn!
    if (!this.turnEndedByHit && this.triesRemaining > 0) {
      this.prepareAimStep(false);
      return;
    }

    this.respawnHitGorillas();
    this.turnsTakenInRound++;
    this.activePlayerIndex = (this.activePlayerIndex + 1) % this.players.length;

    if (this.turnsTakenInRound >= this.players.length) {
      this.turnsTakenInRound = 0;
      this.currentRound++;
      if (this.currentRound > this.config.rounds) {
        this.finishMatch();
        return;
      }
      this.setupRoundSkyline();
      this.showToast(`Round ${this.currentRound} — New solvable skyline & fresh wind!`, 2.4);
    }

    this.beginPlayerTurn();
  }

  private finishMatch(): void {
    this.phase = 'game_over';
    this.setControlsEnabled(false);
    soundEngine.playVictoryFanfare(this.theme);

    const sorted = [...this.players].sort((a, b) => b.score - a.score || b.hits - a.hits);
    const topScore = sorted[0]?.score ?? 0;
    const winners = sorted.filter((p) => p.score === topScore);

    this.gameoverWinnerLine.textContent =
      winners.length > 1
        ? `It's a tie between ${winners.map((w) => w.name).join(' & ')} with ${topScore} points!`
        : `${winners[0].name} wins the skyline crown with ${topScore} points!`;

    this.finalStandings.innerHTML = '';
    sorted.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = `standing-row${p.score === topScore ? ' winner' : ''}`;
      row.innerHTML = `
        <div class="standing-left">
          <span class="standing-rank">#${idx + 1}</span>
          <span class="name-swatch" style="background:${p.color}"></span>
          <div>
            <div>${p.name}</div>
            <div class="standing-meta">${p.hits} direct hit${p.hits === 1 ? '' : 's'} · ${p.splashHits} close call${p.splashHits === 1 ? '' : 's'}</div>
          </div>
        </div>
        <span class="standing-score">${p.score} pts</span>
      `;
      this.finalStandings.appendChild(row);
    });

    const awards = computeAwards(this.players);
    this.awardsSection.classList.toggle('hidden', awards.length === 0);
    this.awardsGrid.innerHTML = '';
    for (const a of awards) {
      const card = document.createElement('div');
      card.className = 'award-card';
      card.innerHTML = `
        <span class="award-badge">${a.badge}</span>
        <span class="award-title">${a.title}</span>
        <span class="award-winner" style="color:${a.winnerColor}">${a.winnerName}</span>
        <span class="award-val">${a.valueLabel}</span>
      `;
      this.awardsGrid.appendChild(card);
    }

    this.gameoverModal.classList.remove('hidden');
  }

  private triggerShake(strength: number, duration: number): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  private spawnExplosionParticles(x: number, y: number, primary: string, count: number): void {
    const palette = [primary, '#fef08a', '#fb923c', '#ef4444', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 45 + Math.random() * 240;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        size: 4 + Math.random() * 8,
        color: palette[Math.floor(Math.random() * palette.length)],
        life: 0.45 + Math.random() * 0.65,
        maxLife: 1.1,
        shape:
          this.theme === 'retro'
            ? 'square'
            : i % 5 === 0
              ? 'peel'
              : 'circle',
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 10,
        gravityScale: 0.5 + Math.random() * 0.7,
      });
    }
  }

  private spawnFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    scale = 1,
  ): void {
    this.floatingTexts.push({
      x: clamp(x, 100, WORLD_WIDTH - 100),
      y: clamp(y, 40, WORLD_HEIGHT - 40),
      vy: -36,
      text,
      color,
      life: 1.45,
      maxLife: 1.45,
      scale,
    });
  }

  private update(dt: number): void {
    this.timeSec += dt;

    const windSpeedPx = this.windAccel * 24;
    for (const c of this.clouds) {
      c.x += (windSpeedPx * c.speedFactor + (Math.abs(this.windAccel) < 0.2 ? 6 : 0)) * dt;
      if (c.x > WORLD_WIDTH + 140) c.x = -c.width - 40;
      if (c.x < -c.width - 140) c.x = WORLD_WIDTH + 40;
    }

    for (const w of this.windWisps) {
      w.x += windSpeedPx * 2.2 * w.speedFactor * dt;
      if (w.x > WORLD_WIDTH + 60) w.x = -60;
      if (w.x < -60) w.x = WORLD_WIDTH + 60;
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.toastBanner.classList.add('hidden');
      }
    }

    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 320 * pt.gravityScale * dt;
      pt.rotation += pt.vRot * dt;
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ft.y += ft.vy * dt;
    }

    if (this.phase === 'aiming') {
      const active = this.players[this.activePlayerIndex];
      if (active?.isBot) {
        this.botThinkTimer -= dt;
        if (this.botThinkTimer <= 0) {
          this.executeBotTurn();
        }
      }
    } else if (this.phase === 'flying') {
      this.stepBanana(dt);
    } else if (this.phase === 'exploding') {
      this.postShotTimer -= dt;
      if (this.postShotTimer <= 0) {
        this.afterShotComplete();
      }
    }
  }

  private loop(nowMs: number): void {
    const dt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = nowMs;

    this.update(dt);

    const shakeMag = this.shakeTimer > 0 ? this.shakeStrength * (this.shakeTimer / 0.45) : 0;
    const shakeOffset =
      shakeMag > 0.2
        ? { x: (Math.random() * 2 - 1) * shakeMag, y: (Math.random() * 2 - 1) * shakeMag }
        : { x: 0, y: 0 };

    const planet = PLANETS[this.config.planetId];
    this.renderer.render(this.ctx, {
      theme: this.theme,
      planetId: this.config.planetId,
      gravity: planet.gravity,
      windAccel: this.windAccel,
      terrain: this.terrain,
      players: this.players,
      activePlayerIndex: this.activePlayerIndex,
      aimAngle: this.aimAngle,
      aimSpeed: this.aimSpeed,
      aimDirection: this.aimDirection,
      showAimHint: this.showAimHint,
      showPhysicsLab: this.showPhysicsLab,
      showSolution: this.showSolution,
      verifiedSolution: this.verifiedSolution,
      showAimingGuides: this.phase === 'aiming',
      banana: this.banana,
      sunShocked: this.sunShocked,
      particles: this.particles,
      floatingTexts: this.floatingTexts,
      clouds: this.clouds,
      windWisps: this.windWisps,
      timeSec: this.timeSec,
      shakeOffset,
    });

    requestAnimationFrame((t) => this.loop(t));
  }
}

new GorillaPhysicsGame();
