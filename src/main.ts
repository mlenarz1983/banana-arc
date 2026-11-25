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
  MAX_SPEED,
  MIN_ANGLE,
  MIN_SPEED,
  PIXELS_PER_METER,
  PLANETS,
  PLANET_ORDER,
  PLAYER_PRESETS,
  SCORE_DIRECT_HIT,
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
  generatePhysicsTip,
  radToDeg,
  solveBotShot,
  theoreticalFlatRange,
} from './physics';
import { GameRenderer } from './renderer';
import { generateSkyline, selectSpawnBuildings, SkylineTerrain } from './skyline';
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
  private btnLab = byId<HTMLButtonElement>('btn-lab');
  private btnSound = byId<HTMLButtonElement>('btn-sound');
  private btnNewGame = byId<HTMLButtonElement>('btn-new-game');

  private turnDot = byId<HTMLSpanElement>('turn-dot');
  private turnText = byId<HTMLSpanElement>('turn-text');
  private scoreboardStrip = byId<HTMLDivElement>('scoreboard-strip');
  private toastBanner = byId<HTMLDivElement>('toast-banner');

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
    planetId: 'earth',
    botDifficulty: 'easy',
    playerNames: PLAYER_PRESETS.map((p) => p.defaultName),
  };

  private theme: ThemeMode = 'modern';
  private showAimHint = false;
  private showPhysicsLab = true;
  private phase: GamePhase = 'setup';

  private terrain: SkylineTerrain;
  private players: Player[] = [];
  private activePlayerIndex = 0;
  private currentRound = 1;
  private turnsTakenInRound = 0;

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

    this.terrain = new SkylineTerrain(generateSkyline(WORLD_WIDTH, WORLD_HEIGHT, 1991));
    this.initAtmosphere();
    this.initSetupUI();
    this.bindEvents();
    this.syncToolbarUI();

    // Render an attractive background skyline behind the setup modal right away
    this.setupPreviewScene();

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

  private setupPreviewScene(): void {
    const buildings = generateSkyline(WORLD_WIDTH, WORLD_HEIGHT, 1991);
    this.terrain = new SkylineTerrain(buildings);
    this.renderer.invalidateBuildings();
    this.windAccel = 1.2;
    const spawns = selectSpawnBuildings(buildings, 2, () => 0.2);
    this.players = spawns.map((bIdx, i) => {
      const b = buildings[bIdx];
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
    // Populate planet buttons
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
    // Setup segmented buttons
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
      if (e.key === 'ArrowUp') {
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
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        this.setAimDirection(this.aimDirection === 1 ? -1 : 1);
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

  private updateAimFromPointer(e: PointerEvent): void {
    const active = this.players[this.activePlayerIndex];
    if (!active) return;

    const rect = this.canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * WORLD_WIDTH;
    const py = ((e.clientY - rect.top) / rect.height) * WORLD_HEIGHT;

    const originX = active.x;
    const originY = active.y - GORILLA_HAND_OFFSET_Y;

    const dx = px - originX;
    const dy = originY - py; // upward positive

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
    this.aimDirection = dir;
    this.btnDirLeft.classList.toggle('active', dir === -1);
    this.btnDirRight.classList.toggle('active', dir === 1);
    const active = this.players[this.activePlayerIndex];
    if (active) active.preferredDirection = dir;
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

    // Build player list
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
    this.beginTurn();
  }

  private setupRoundSkyline(): void {
    const seed = Date.now() ^ (this.currentRound * 9973);
    const buildings = generateSkyline(WORLD_WIDTH, WORLD_HEIGHT, seed);
    this.terrain = new SkylineTerrain(buildings);
    this.renderer.invalidateBuildings();
    this.sunShocked = false;

    // Pick wind acceleration (calm on Moon; realistic breeze/gusts on planets with atmospheres)
    if (this.config.planetId === 'moon') {
      this.windAccel = 0;
    } else {
      const raw = (Math.random() * 2 - 1) * 3.4;
      this.windAccel = Math.abs(raw) < 0.35 ? 0 : Math.round(raw * 10) / 10;
    }

    // Place all gorillas on distinct rooftops
    const spawnIndices = selectSpawnBuildings(buildings, this.players.length);
    // Shuffle which player gets which building each round so matchups stay fresh
    const shuffled = [...spawnIndices].sort(() => Math.random() - 0.5);

    this.players.forEach((p, idx) => {
      const bIdx = shuffled[idx];
      const b = buildings[bIdx];
      p.buildingIndex = bIdx;
      p.x = Math.round(b.x + b.width / 2);
      p.y = b.topY;
      p.lastShot = null; // fresh skyline -> fresh ghost trail
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

  private beginTurn(): void {
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

    // Load active player's saved aim preferences
    this.setAimDirection(active.preferredDirection);
    this.setAimAngle(active.preferredAngle);
    this.setAimSpeed(active.preferredSpeed);

    const planet = PLANETS[this.config.planetId];
    this.roundBadge.textContent = `Round ${this.currentRound} / ${this.config.rounds}`;
    this.planetBadge.textContent = `${planet.name} · ${planet.gravity} m/s²`;

    this.turnDot.style.background = active.color;
    this.turnText.textContent = active.isBot
      ? `${active.name} is calculating a parabolic arc...`
      : `${active.name}'s turn — drag in sky or adjust angle & speed`;

    this.setControlsEnabled(!active.isBot);
    this.renderScoreboardStrip();
    this.updatePhysicsLabReadout();

    if (active.isBot) {
      this.botThinkTimer = 0.95;
    }
  }

  private setControlsEnabled(enabled: boolean): void {
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

  private showToast(msg: string, duration = 2.4): void {
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

      // Record trail smoothly
      const lastTrail = b.trail[b.trail.length - 1];
      if (!lastTrail || Math.hypot(b.x - lastTrail.x, b.y - lastTrail.y) >= 8) {
        b.trail.push({ x: b.x, y: b.y });
      }

      // Check Sun Bonk! (classic QBasic Easter egg)
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

      // Check Out of Bounds (off sides, bottom, or too long in orbit)
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

    this.showToast(
      planet.id === 'moon' ? 'Banana floated into lunar orbit!' : 'Way over the skyline!',
      2.0,
    );
    this.updatePhysicsLabReadout();
    this.phase = 'exploding';
    this.postShotTimer = 1.05;
  }

  private resolveImpact(ix: number, iy: number, directTarget: Player | null): void {
    const b = this.banana;
    if (!b) return;
    b.active = false;

    const owner = this.players.find((p) => p.id === b.ownerId)!;
    const planet = PLANETS[this.config.planetId];
    const distanceMeters = Math.abs(ix - b.originX) / PIXELS_PER_METER;

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

    // Determine hit outcome
    let outcome: 'hit' | 'splash' | 'building' | 'self' = 'building';

    if (directTarget) {
      if (directTarget.id === owner.id) {
        outcome = 'self';
        directTarget.animation = 'ouch';
        soundEngine.playBuildingHit(this.theme);
        this.spawnExplosionParticles(ix, iy, '#f97316', 36);
        this.spawnFloatingText(ix, iy - 28, 'SELF-BONK!', '#fca5a5', 1.2);
        this.showToast(`Oops! ${owner.name} bonked themselves!`);
      } else {
        outcome = 'hit';
        owner.hits++;
        let gained = SCORE_DIRECT_HIT;
        let bonusText = '';
        if (distanceMeters >= LONG_SHOT_METERS) {
          gained += SCORE_LONG_SHOT_BONUS;
          bonusText = ` +${SCORE_LONG_SHOT_BONUS} Long Shot!`;
        }
        owner.score += gained;
        owner.animation = 'celebrate';
        directTarget.animation = 'ouch';
        this.pendingRespawnIds.push(directTarget.id);

        soundEngine.playGorillaHit(this.theme);
        this.triggerShake(10, 0.45);
        this.spawnExplosionParticles(ix, iy, '#fde047', 54);
        this.spawnFloatingText(ix, iy - 34, `DIRECT HIT! +${gained}`, '#fde047', 1.3);
        this.showToast(`${owner.name} hit ${directTarget.name}! +${gained} pts${bonusText}`, 2.4);
      }
    } else {
      // Check splash damage on opponents
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
        this.showToast(`Close splash near ${splashedPlayer.name}! +${SCORE_SPLASH_HIT} pts`, 2.2);
      } else {
        soundEngine.playBuildingHit(this.theme);
        this.triggerShake(5, 0.24);
        this.spawnExplosionParticles(ix, iy, '#f97316', 28);
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
    this.postShotTimer = outcome === 'hit' ? 1.55 : 0.95;
  }

  private respawnHitGorillas(): void {
    if (this.pendingRespawnIds.length === 0) return;

    const occupied = new Set(
      this.players
        .filter((p) => !this.pendingRespawnIds.includes(p.id))
        .map((p) => p.buildingIndex),
    );

    for (const id of this.pendingRespawnIds) {
      const p = this.players.find((pl) => pl.id === id);
      if (!p) continue;
      const candidates = this.terrain.buildings
        .map((_, idx) => idx)
        .filter((idx) => !occupied.has(idx) && idx !== p.buildingIndex);
      const chosenIdx =
        candidates.length > 0
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : p.buildingIndex;
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

  private advanceTurn(): void {
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
      this.showToast(`Round ${this.currentRound} — New skyline & fresh wind!`, 2.4);
    }

    this.beginTurn();
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

    // Drift clouds & wind wisps
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

    // Toast timer
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.toastBanner.classList.add('hidden');
      }
    }

    // Screen shake decay
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }

    // Particles
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

    // Floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ft.y += ft.vy * dt;
    }

    // Phase-specific logic
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
        this.advanceTurn();
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
