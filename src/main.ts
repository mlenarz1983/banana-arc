import './style.css';
import { soundEngine } from './audio';
import { CHARACTERS, CHARACTER_ORDER, DEFAULT_PLAYER_CHARACTERS } from './characters';
import {
  BANANA_RADIUS,
  CRATER_RADIUS,
  GORILLA_HAND_OFFSET_Y,
  GORILLA_HIT_CENTER_Y,
  GORILLA_HIT_RADIUS,
  LONG_SHOT_METERS,
  MAX_ANGLE,
  MAX_FLIGHT_SEC,
  MAX_MIRRORS_PER_ROUND,
  MAX_MIRROR_TILT,
  MAX_MOVES_PER_TURN,
  MAX_SPEED,
  MIN_ANGLE,
  MIN_MIRROR_TILT,
  MIN_SPEED,
  MIRROR_HALF_LENGTH,
  MOVE_STEP_PX,
  PIXELS_PER_METER,
  PLANETS,
  PLANET_ORDER,
  SCORE_BANK_SHOT_BONUS,
  SCORE_DIRECT_HIT,
  SCORE_FIRST_TRY_BONUS,
  SCORE_LONG_SHOT_BONUS,
  SCORE_SPLASH_HIT,
  SCORE_SUN_BONK,
  SELF_HIT_MIN_SEC,
  SPLASH_RADIUS,
  SUN_RADIUS,
  SUN_X,
  SUN_Y,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';
import { JackboxController, JackboxHost } from './jackbox';
import { LOCATION_META } from './locations';
import {
  clamp,
  computeAwards,
  computeVelocityComponents,
  findVerifiedSolution,
  generatePhysicsTip,
  radToDeg,
  solveBotShot,
  stepKinematicBody,
  theoreticalFlatRange,
} from './physics';
import { GameRenderer, renderCharacterAvatar } from './renderer';
import { generateSolvableRound, SkylineTerrain, tryMoveGorilla } from './skyline';
import type {
  AppMode,
  Banana,
  BotDifficulty,
  Cloud,
  ConcreteLocationId,
  ControllerCommand,
  ControllerStateSnapshot,
  FloatingText,
  GameConfig,
  GamePhase,
  LocationId,
  MirrorPanel,
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

class TouchSlider {
  private root: HTMLElement;
  private fill: HTMLElement;
  private thumb: HTMLElement;
  private min: number;
  private max: number;
  private value: number;
  private onChange: (val: number) => void;
  private dragging = false;

  constructor(
    root: HTMLElement,
    fill: HTMLElement,
    thumb: HTMLElement,
    min: number,
    max: number,
    initial: number,
    onChange: (val: number) => void,
  ) {
    this.root = root;
    this.fill = fill;
    this.thumb = thumb;
    this.min = min;
    this.max = max;
    this.value = initial;
    this.onChange = onChange;

    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('pointerdown', (e) => {
      if (this.root.classList.contains('disabled')) return;
      e.preventDefault();
      this.dragging = true;
      this.root.setPointerCapture(e.pointerId);
      this.updateFromClientX(e.clientX);
    });
    this.root.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      e.preventDefault();
      this.updateFromClientX(e.clientX);
    });
    const stop = () => {
      this.dragging = false;
    };
    this.root.addEventListener('pointerup', stop);
    this.root.addEventListener('pointercancel', stop);

    this.setValue(initial);
  }

  setDisabled(disabled: boolean): void {
    this.root.classList.toggle('disabled', disabled);
  }

  setValue(val: number): void {
    this.value = Math.round(clamp(val, this.min, this.max));
    const pct = ((this.value - this.min) / (this.max - this.min)) * 100;
    this.fill.style.width = `${pct}%`;
    this.thumb.style.left = `${pct}%`;
    this.root.setAttribute('aria-valuenow', String(this.value));
  }

  private updateFromClientX(clientX: number): void {
    const track = this.root.querySelector<HTMLElement>('.touch-slider-track') ?? this.root;
    const rect = track.getBoundingClientRect();
    const frac = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const nextVal = Math.round(this.min + frac * (this.max - this.min));
    if (nextVal !== this.value) {
      this.setValue(nextVal);
      this.onChange(nextVal);
    }
  }
}

class GorillaPhysicsGame {
  private appShell = byId<HTMLDivElement>('app');
  private controllerView = byId<HTMLDivElement>('controller-view');
  private canvas = byId<HTMLCanvasElement>('game-canvas');
  private ctx: CanvasRenderingContext2D;
  private renderer = new GameRenderer();

  // Header & HUD
  private roundBadge = byId<HTMLSpanElement>('round-badge');
  private planetBadge = byId<HTMLSpanElement>('planet-badge');
  private btnJackbox = byId<HTMLButtonElement>('btn-jackbox');
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

  // TV Host card
  private tvRoomCard = byId<HTMLElement>('tv-room-card');
  private tvRoomCodeEl = byId<HTMLElement>('tv-room-code');
  private tvClientBadge = byId<HTMLSpanElement>('tv-client-badge');
  private tvQrImg = byId<HTMLImageElement>('tv-qr-img');

  // Mirror placement bar (single-screen)
  private mirrorBar = byId<HTMLElement>('mirror-bar');
  private mirrorTiltVal = byId<HTMLElement>('mirror-tilt-val');
  private btnMirrorLock = byId<HTMLButtonElement>('btn-mirror-lock');
  private btnMirrorCancel = byId<HTMLButtonElement>('btn-mirror-cancel');
  private mirrorTiltSlider: TouchSlider;

  // Single-screen controls dock
  private controlsDock = byId<HTMLElement>('controls-dock');
  private moveLabel = byId<HTMLSpanElement>('move-label');
  private btnMoveLeft = byId<HTMLButtonElement>('btn-move-left');
  private btnMoveRight = byId<HTMLButtonElement>('btn-move-right');
  private btnDirLeft = byId<HTMLButtonElement>('btn-dir-left');
  private btnDirRight = byId<HTMLButtonElement>('btn-dir-right');
  private mirrorCountLabel = byId<HTMLSpanElement>('mirror-count-label');
  private btnPlaceMirror = byId<HTMLButtonElement>('btn-place-mirror');
  private angleValLabel = byId<HTMLElement>('angle-val-label');
  private speedValLabel = byId<HTMLElement>('speed-val-label');
  private btnThrow = byId<HTMLButtonElement>('btn-throw');
  private angleSlider: TouchSlider;
  private speedSlider: TouchSlider;

  // Physics Lab
  private physicsLabPanel = byId<HTMLElement>('physics-lab-panel');
  private labVx = byId<HTMLSpanElement>('lab-vx');
  private labVy = byId<HTMLSpanElement>('lab-vy');
  private labG = byId<HTMLSpanElement>('lab-g');
  private labWind = byId<HTMLSpanElement>('lab-wind');
  private labLast = byId<HTMLSpanElement>('lab-last');
  private labTip = byId<HTMLParagraphElement>('lab-tip');

  // Setup Modal
  private setupModal = byId<HTMLDivElement>('setup-modal');
  private setupPlayerCount = byId<HTMLDivElement>('setup-player-count');
  private setupRounds = byId<HTMLDivElement>('setup-rounds');
  private setupTries = byId<HTMLDivElement>('setup-tries');
  private botSkillRow = byId<HTMLDivElement>('bot-skill-row');
  private setupBotSkill = byId<HTMLDivElement>('setup-bot-skill');
  private setupNames = byId<HTMLDivElement>('setup-names');
  private avatarGalleryLabel = byId<HTMLLabelElement>('avatar-gallery-label');
  private setupAvatarGallery = byId<HTMLDivElement>('setup-avatar-gallery');
  private setupLocationSelect = byId<HTMLSelectElement>('setup-location-select');
  private setupPlanets = byId<HTMLDivElement>('setup-planets');
  private setupMirrorsCheck = byId<HTMLInputElement>('setup-mirrors-check');
  private setupHintCheck = byId<HTMLInputElement>('setup-hint-check');
  private setupLabCheck = byId<HTMLInputElement>('setup-lab-check');
  private setupRetroCheck = byId<HTMLInputElement>('setup-retro-check');
  private btnSetupJackbox = byId<HTMLButtonElement>('btn-setup-jackbox');
  private btnStartMatch = byId<HTMLButtonElement>('btn-start-match');

  // Jackbox Modal
  private jackboxModal = byId<HTMLDivElement>('jackbox-modal');
  private btnStartTvHost = byId<HTMLButtonElement>('btn-start-tv-host');
  private btnStopTvHost = byId<HTMLButtonElement>('btn-stop-tv-host');
  private tvHostStatus = byId<HTMLParagraphElement>('tv-host-status');
  private inputRoomCode = byId<HTMLInputElement>('input-room-code');
  private btnJoinController = byId<HTMLButtonElement>('btn-join-controller');
  private btnCloseJackbox = byId<HTMLButtonElement>('btn-close-jackbox');

  // Dedicated Controller View DOM
  private ctrlAvatarCanvas = byId<HTMLCanvasElement>('ctrl-avatar-canvas');
  private ctrlTurnHeading = byId<HTMLDivElement>('ctrl-turn-heading');
  private ctrlMetaLine = byId<HTMLDivElement>('ctrl-meta-line');
  private ctrlStatusBar = byId<HTMLDivElement>('ctrl-status-bar');
  private ctrlLocationChip = byId<HTMLSpanElement>('ctrl-location-chip');
  private ctrlWindChip = byId<HTMLSpanElement>('ctrl-wind-chip');
  private ctrlTriesChip = byId<HTMLSpanElement>('ctrl-tries-chip');
  private ctrlMirrorCard = byId<HTMLDivElement>('ctrl-mirror-card');
  private ctrlMirrorReadout = byId<HTMLElement>('ctrl-mirror-readout');
  private ctrlMirrorLock = byId<HTMLButtonElement>('ctrl-mirror-lock');
  private ctrlMirrorCancel = byId<HTMLButtonElement>('ctrl-mirror-cancel');
  private ctrlBtnMirror = byId<HTMLButtonElement>('ctrl-btn-mirror');
  private ctrlMoveLabel = byId<HTMLSpanElement>('ctrl-move-label');
  private ctrlMoveLeft = byId<HTMLButtonElement>('ctrl-move-left');
  private ctrlMoveRight = byId<HTMLButtonElement>('ctrl-move-right');
  private ctrlDirLeft = byId<HTMLButtonElement>('ctrl-dir-left');
  private ctrlDirRight = byId<HTMLButtonElement>('ctrl-dir-right');
  private ctrlAngleVal = byId<HTMLElement>('ctrl-angle-val');
  private ctrlSpeedVal = byId<HTMLElement>('ctrl-speed-val');
  private ctrlBtnThrow = byId<HTMLButtonElement>('ctrl-btn-throw');
  private ctrlBtnRematch = byId<HTMLButtonElement>('ctrl-btn-rematch');
  private ctrlToggleHint = byId<HTMLButtonElement>('ctrl-toggle-hint');
  private ctrlToggleSolution = byId<HTMLButtonElement>('ctrl-toggle-solution');
  private ctrlToggleTheme = byId<HTMLButtonElement>('ctrl-toggle-theme');
  private ctrlScores = byId<HTMLDivElement>('ctrl-scores');
  private btnCtrlExit = byId<HTMLButtonElement>('btn-ctrl-exit');
  private ctrlAngleSlider: TouchSlider;
  private ctrlSpeedSlider: TouchSlider;
  private ctrlMxSlider: TouchSlider;
  private ctrlMySlider: TouchSlider;
  private ctrlMtiltSlider: TouchSlider;

  // Game Over Modal
  private gameoverModal = byId<HTMLDivElement>('gameover-modal');
  private gameoverWinnerLine = byId<HTMLParagraphElement>('gameover-winner-line');
  private finalStandings = byId<HTMLDivElement>('final-standings');
  private awardsSection = byId<HTMLDivElement>('awards-section');
  private awardsGrid = byId<HTMLDivElement>('awards-grid');
  private btnRematch = byId<HTMLButtonElement>('btn-rematch');
  private btnChangeSetup = byId<HTMLButtonElement>('btn-change-setup');

  // Networking (Jackbox Mode)
  private appMode: AppMode = 'single';
  private jackboxHost: JackboxHost | null = null;
  private jackboxController: JackboxController | null = null;
  private ctrlAimAngle = 45;
  private ctrlAimSpeed = 40;
  private ctrlAimDir: ThrowDirection = 1;
  private ctrlMirrorX = 600;
  private ctrlMirrorY = 230;
  private ctrlMirrorTilt = -25;
  private lastCtrlSendMs = 0;

  // Setup editing slot
  private editingPlayerSlot = 0;

  // Game State
  private config: GameConfig = {
    humanCount: 2,
    rounds: 5,
    triesPerTurn: 3,
    planetId: 'earth',
    locationId: 'random',
    enableMirrors: true,
    botDifficulty: 'easy',
    playerNames: DEFAULT_PLAYER_CHARACTERS.map((id) => CHARACTERS[id].name),
    playerCharacters: [...DEFAULT_PLAYER_CHARACTERS],
  };

  private theme: ThemeMode = 'modern';
  private showAimHint = false;
  private showSolution = false;
  private showPhysicsLab = true;
  private phase: GamePhase = 'setup';

  private terrain: SkylineTerrain;
  private currentLocationId: ConcreteLocationId = 'chicago';
  private mirrors: MirrorPanel[] = [];
  private draftMirror: MirrorPanel | null = null;
  private mirrorPlacedThisTurn = false;
  private nextMirrorId = 1;

  private players: Player[] = [];
  private activePlayerIndex = 0;
  private currentRound = 1;
  private turnsTakenInRound = 0;

  private triesRemaining = 3;
  private movesRemaining = MAX_MOVES_PER_TURN;
  private turnEndedByHit = false;
  private verifiedSolution: VerifiedSolution | null = null;

  private windAccel = 0;
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
  private dragMode: 'none' | 'aim' | 'mirror' = 'none';

  constructor() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not supported');
    this.ctx = ctx;

    document.querySelectorAll('.no-touch-menu').forEach((el) => {
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    // Single-screen touch sliders
    this.angleSlider = new TouchSlider(
      byId('slider-angle'),
      byId('slider-angle-fill'),
      byId('slider-angle-thumb'),
      MIN_ANGLE,
      MAX_ANGLE,
      45,
      (v) => this.setAimAngle(v),
    );
    this.speedSlider = new TouchSlider(
      byId('slider-speed'),
      byId('slider-speed-fill'),
      byId('slider-speed-thumb'),
      MIN_SPEED,
      MAX_SPEED,
      40,
      (v) => this.setAimSpeed(v),
    );
    this.mirrorTiltSlider = new TouchSlider(
      byId('slider-mirror-tilt'),
      byId('slider-mirror-tilt-fill'),
      byId('slider-mirror-tilt-thumb'),
      MIN_MIRROR_TILT,
      MAX_MIRROR_TILT,
      -25,
      (v) => this.updateDraftMirror(undefined, undefined, v),
    );

    // Jackbox Tablet Controller touch sliders
    this.ctrlAngleSlider = new TouchSlider(
      byId('ctrl-slider-angle'),
      byId('ctrl-slider-angle-fill'),
      byId('ctrl-slider-angle-thumb'),
      MIN_ANGLE,
      MAX_ANGLE,
      45,
      (v) => {
        this.ctrlAimAngle = v;
        this.ctrlAngleVal.textContent = `${v}°`;
        this.sendControllerAimThrottled();
      },
    );
    this.ctrlSpeedSlider = new TouchSlider(
      byId('ctrl-slider-speed'),
      byId('ctrl-slider-speed-fill'),
      byId('ctrl-slider-speed-thumb'),
      MIN_SPEED,
      MAX_SPEED,
      40,
      (v) => {
        this.ctrlAimSpeed = v;
        this.ctrlSpeedVal.textContent = `${v} m/s`;
        this.sendControllerAimThrottled();
      },
    );
    this.ctrlMxSlider = new TouchSlider(
      byId('ctrl-slider-mx'),
      byId('ctrl-slider-mx-fill'),
      byId('ctrl-slider-mx-thumb'),
      110,
      WORLD_WIDTH - 110,
      600,
      (v) => {
        this.ctrlMirrorX = v;
        this.sendControllerMirrorThrottled();
      },
    );
    this.ctrlMySlider = new TouchSlider(
      byId('ctrl-slider-my'),
      byId('ctrl-slider-my-fill'),
      byId('ctrl-slider-my-thumb'),
      95,
      WORLD_HEIGHT - 160,
      230,
      (v) => {
        this.ctrlMirrorY = v;
        this.sendControllerMirrorThrottled();
      },
    );
    this.ctrlMtiltSlider = new TouchSlider(
      byId('ctrl-slider-mtilt'),
      byId('ctrl-slider-mtilt-fill'),
      byId('ctrl-slider-mtilt-thumb'),
      MIN_MIRROR_TILT,
      MAX_MIRROR_TILT,
      -25,
      (v) => {
        this.ctrlMirrorTilt = v;
        this.ctrlMirrorReadout.textContent = `${v >= 0 ? '+' : ''}${v}°`;
        this.sendControllerMirrorThrottled();
      },
    );

    const preview = generateSolvableRound(2, PLANETS.earth.gravity, true, 'chicago', 1991);
    this.terrain = preview.terrain;
    this.currentLocationId = preview.locationId;

    this.initAtmosphere();
    this.initSetupUI();
    this.bindEvents();
    this.syncToolbarUI();
    this.setupPreviewScene(preview);

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && roomParam.trim().length === 4) {
      this.enterControllerMode(roomParam.trim().toUpperCase());
    }

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
    this.currentLocationId = preview.locationId;
    this.mirrors = [];
    this.draftMirror = null;
    this.renderer.invalidateBuildings();
    this.windAccel = preview.windAccel;
    this.players = preview.spawnPositions.map((pos, i) => {
      const charId = DEFAULT_PLAYER_CHARACTERS[i];
      const ch = CHARACTERS[charId];
      return this.createPlayer(i, ch.name, charId, false, pos.x, pos.y, pos.zoneIndex);
    });
    this.activePlayerIndex = 0;
  }

  private createPlayer(
    id: number,
    name: string,
    characterId: Player['characterId'],
    isBot: boolean,
    x: number,
    y: number,
    zoneIndex: number,
  ): Player {
    const ch = CHARACTERS[characterId];
    const planet = PLANETS[this.config.planetId];
    return {
      id,
      name,
      characterId,
      color: ch.color,
      accentColor: ch.accentColor,
      isBot,
      botDifficulty: this.config.botDifficulty,
      x,
      y,
      zoneIndex,
      score: 0,
      hits: 0,
      splashHits: 0,
      bankShotHits: 0,
      sunBonks: 0,
      maxApexMeters: 0,
      blocksDestroyed: 0,
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
    this.setupLocationSelect.innerHTML = '';
    const randomOpt = document.createElement('option');
    randomOpt.value = 'random';
    randomOpt.textContent = 'Random World Tour (15 places)';
    this.setupLocationSelect.appendChild(randomOpt);

    const cityGroup = document.createElement('optgroup');
    cityGroup.label = 'Iconic World Cities (12 — Chicago, Atlanta, NYC…)';
    const wildGroup = document.createElement('optgroup');
    wildGroup.label = 'Wild Non-Building Terrains (3)';

    for (const loc of LOCATION_META) {
      const opt = document.createElement('option');
      opt.value = loc.id;
      opt.textContent = `${loc.name} (${loc.region})`;
      if (loc.category === 'city') cityGroup.appendChild(opt);
      else wildGroup.appendChild(opt);
    }
    this.setupLocationSelect.appendChild(cityGroup);
    this.setupLocationSelect.appendChild(wildGroup);
    this.setupLocationSelect.value = this.config.locationId;

    this.setupPlanets.innerHTML = '';
    for (const id of PLANET_ORDER) {
      const p = PLANETS[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `planet-btn${id === this.config.planetId ? ' active' : ''}`;
      btn.dataset.planet = id;
      btn.innerHTML = `<strong>${p.name}</strong><small>${p.gravity} m/s²</small>`;
      btn.addEventListener('click', () => {
        this.config.planetId = id;
        this.setupPlanets.querySelectorAll('.planet-btn').forEach((el) => {
          el.classList.toggle('active', (el as HTMLElement).dataset.planet === id);
        });
        this.planetBadge.textContent = `${p.name} · ${p.gravity} m/s²`;
      });
      this.setupPlanets.appendChild(btn);
    }

    this.renderSetupPlayersAndGallery();
  }

  /**
   * Renders visual player cards with live mini-canvas gorilla portraits +
   * the clickable 8-character visual avatar gallery underneath!
   */
  private renderSetupPlayersAndGallery(): void {
    const count = this.config.humanCount;
    if (this.editingPlayerSlot >= count) this.editingPlayerSlot = 0;
    this.botSkillRow.classList.toggle('hidden', count !== 1);

    this.setupNames.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const charId = this.config.playerCharacters[i] ?? DEFAULT_PLAYER_CHARACTERS[i];
      const ch = CHARACTERS[charId];
      const row = document.createElement('div');
      row.className = `name-input-row${i === this.editingPlayerSlot ? ' editing' : ''}`;
      row.innerHTML = `
        <canvas class="player-slot-avatar" width="60" height="60"></canvas>
        <div class="player-slot-info">
          <input type="text" maxlength="14" value="${this.config.playerNames[i] || ch.name}" aria-label="Player ${i + 1} name" />
          <span class="player-slot-sub">Player ${i + 1} · ${ch.name} (${ch.title})</span>
        </div>
      `;
      const avatarCanvas = row.querySelector<HTMLCanvasElement>('canvas')!;
      renderCharacterAvatar(avatarCanvas, charId, this.theme);

      const input = row.querySelector('input')!;
      input.addEventListener('focus', () => {
        if (this.editingPlayerSlot !== i) {
          this.editingPlayerSlot = i;
          this.renderSetupPlayersAndGallery();
        }
      });
      input.addEventListener('input', () => {
        this.config.playerNames[i] = input.value.trim() || CHARACTERS[this.config.playerCharacters[i]].name;
      });
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        this.editingPlayerSlot = i;
        this.renderSetupPlayersAndGallery();
        soundEngine.playTick();
      });
      this.setupNames.appendChild(row);
    }

    if (count === 1) {
      const botRow = document.createElement('div');
      botRow.className = 'name-input-row';
      botRow.innerHTML = `
        <canvas class="player-slot-avatar" width="60" height="60"></canvas>
        <div class="player-slot-info">
          <input type="text" value="Robo-Kong (Bot)" disabled aria-label="Bot player" />
          <span class="player-slot-sub">AI Opponent · Laser Visor</span>
        </div>
      `;
      renderCharacterAvatar(botRow.querySelector('canvas')!, 'robo-kong', this.theme);
      this.setupNames.appendChild(botRow);
    }

    // Visual 8-Gorilla Avatar Gallery for the selected player slot
    const editingName = this.config.playerNames[this.editingPlayerSlot] || `Player ${this.editingPlayerSlot + 1}`;
    this.avatarGalleryLabel.textContent = `2. Pick Gorilla Avatar for Player ${this.editingPlayerSlot + 1} (${editingName})`;
    this.setupAvatarGallery.innerHTML = '';
    const activeChar = this.config.playerCharacters[this.editingPlayerSlot];

    for (const charId of CHARACTER_ORDER) {
      const ch = CHARACTERS[charId];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `avatar-card${charId === activeChar ? ' selected' : ''}`;
      card.innerHTML = `
        <canvas width="72" height="72"></canvas>
        <strong>${ch.name}</strong>
        <small>${ch.title}</small>
      `;
      renderCharacterAvatar(card.querySelector('canvas')!, charId, this.theme);
      card.addEventListener('click', () => {
        const slot = this.editingPlayerSlot;
        const prevDefault = CHARACTERS[this.config.playerCharacters[slot]].name;
        this.config.playerCharacters[slot] = charId;
        if (!this.config.playerNames[slot] || this.config.playerNames[slot] === prevDefault) {
          this.config.playerNames[slot] = ch.name;
        }
        soundEngine.playTick();
        this.renderSetupPlayersAndGallery();
      });
      this.setupAvatarGallery.appendChild(card);
    }
  }

  private bindEvents(): void {
    this.setupPlayerCount.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-count]');
      if (!btn) return;
      this.config.humanCount = Number(btn.dataset.count);
      this.setupPlayerCount.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      this.renderSetupPlayersAndGallery();
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

    this.setupLocationSelect.addEventListener('change', () => {
      this.config.locationId = this.setupLocationSelect.value as LocationId;
    });

    this.btnStartMatch.addEventListener('click', () => {
      this.config.enableMirrors = this.setupMirrorsCheck.checked;
      this.showAimHint = this.setupHintCheck.checked;
      this.showPhysicsLab = this.setupLabCheck.checked;
      this.setTheme(this.setupRetroCheck.checked ? 'retro' : 'modern');
      this.syncToolbarUI();
      this.startMatch();
    });

    // Jackbox modal
    const openJackbox = () => this.jackboxModal.classList.remove('hidden');
    this.btnJackbox.addEventListener('click', openJackbox);
    this.btnSetupJackbox.addEventListener('click', openJackbox);
    this.btnCloseJackbox.addEventListener('click', () => this.jackboxModal.classList.add('hidden'));
    this.btnStartTvHost.addEventListener('click', () => this.startTvHostMode());
    this.btnStopTvHost.addEventListener('click', () => this.stopTvHostMode());
    this.btnJoinController.addEventListener('click', () => this.enterControllerMode(this.inputRoomCode.value));
    this.inputRoomCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.enterControllerMode(this.inputRoomCode.value);
    });

    // Toolbar toggles
    this.btnTheme.addEventListener('click', () => {
      this.setTheme(this.theme === 'modern' ? 'retro' : 'modern');
      this.renderSetupPlayersAndGallery();
      soundEngine.playTick();
      this.broadcastHostState();
    });
    this.btnHint.addEventListener('click', () => {
      this.showAimHint = !this.showAimHint;
      this.setupHintCheck.checked = this.showAimHint;
      this.syncToolbarUI();
      soundEngine.playTick();
      this.broadcastHostState();
    });
    this.btnSolution.addEventListener('click', () => {
      this.showSolution = !this.showSolution;
      if (this.showSolution) this.refreshVerifiedSolution();
      this.syncToolbarUI();
      soundEngine.playTick();
      this.broadcastHostState();
    });
    this.btnLab.addEventListener('click', () => {
      this.showPhysicsLab = !this.showPhysicsLab;
      this.setupLabCheck.checked = this.showPhysicsLab;
      this.syncToolbarUI();
      soundEngine.playTick();
      this.broadcastHostState();
    });
    this.btnSound.addEventListener('click', () => {
      soundEngine.toggleMute();
      this.syncToolbarUI();
      if (!soundEngine.isMuted()) soundEngine.playTick();
      this.broadcastHostState();
    });
    this.btnNewGame.addEventListener('click', () => {
      this.phase = 'setup';
      this.banana = null;
      this.draftMirror = null;
      this.syncMirrorUI();
      this.setupRetroCheck.checked = this.theme === 'retro';
      this.setupHintCheck.checked = this.showAimHint;
      this.setupLabCheck.checked = this.showPhysicsLab;
      this.setupMirrorsCheck.checked = this.config.enableMirrors;
      this.gameoverModal.classList.add('hidden');
      this.renderSetupPlayersAndGallery();
      this.setupModal.classList.remove('hidden');
      this.broadcastHostState();
    });

    // Mirror Placement bar (single-screen)
    this.btnPlaceMirror.addEventListener('click', () => {
      if (this.draftMirror) this.cancelDraftMirror();
      else this.startDraftMirror();
    });
    this.btnMirrorLock.addEventListener('click', () => this.lockDraftMirror());
    this.btnMirrorCancel.addEventListener('click', () => this.cancelDraftMirror());
    this.mirrorBar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mirror-tilt]');
      if (!btn || !this.draftMirror) return;
      this.updateDraftMirror(undefined, undefined, this.draftMirror.angleDeg + Number(btn.dataset.mirrorTilt));
      soundEngine.playTick();
    });

    // Single-screen controls dock
    this.btnMoveLeft.addEventListener('click', () => this.moveActiveGorilla(-1));
    this.btnMoveRight.addEventListener('click', () => this.moveActiveGorilla(1));
    this.btnDirLeft.addEventListener('click', () => this.setAimDirection(-1));
    this.btnDirRight.addEventListener('click', () => this.setAimDirection(1));

    this.controlsDock.addEventListener('click', (e) => {
      if (!this.canHumanControl()) return;
      const aBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-step-angle]');
      if (aBtn) {
        this.setAimAngle(this.aimAngle + Number(aBtn.dataset.stepAngle));
        soundEngine.playTick();
        return;
      }
      const sBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-step-speed]');
      if (sBtn) {
        this.setAimSpeed(this.aimSpeed + Number(sBtn.dataset.stepSpeed));
        soundEngine.playTick();
      }
    });

    this.btnThrow.addEventListener('click', () => {
      if (this.canHumanControl()) this.fireCurrentPlayerBanana();
    });

    // Dedicated Controller View events
    this.btnCtrlExit.addEventListener('click', () => this.exitControllerMode());
    this.ctrlMoveLeft.addEventListener('click', () => this.sendControllerCommand({ type: 'move', dir: -1 }));
    this.ctrlMoveRight.addEventListener('click', () => this.sendControllerCommand({ type: 'move', dir: 1 }));
    this.ctrlDirLeft.addEventListener('click', () => {
      this.ctrlAimDir = -1;
      this.ctrlDirLeft.classList.add('active');
      this.ctrlDirRight.classList.remove('active');
      this.sendControllerCommand({ type: 'aim', direction: -1 });
    });
    this.ctrlDirRight.addEventListener('click', () => {
      this.ctrlAimDir = 1;
      this.ctrlDirRight.classList.add('active');
      this.ctrlDirLeft.classList.remove('active');
      this.sendControllerCommand({ type: 'aim', direction: 1 });
    });

    this.ctrlBtnMirror.addEventListener('click', () => {
      this.sendControllerCommand({ type: 'mirror_start' });
    });
    this.ctrlMirrorLock.addEventListener('click', () => {
      this.sendControllerCommand({ type: 'mirror_lock' });
    });
    this.ctrlMirrorCancel.addEventListener('click', () => {
      this.sendControllerCommand({ type: 'mirror_cancel' });
    });

    this.controllerView.addEventListener('click', (e) => {
      const aBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-ctrl-angle]');
      if (aBtn) {
        this.ctrlAimAngle = clamp(this.ctrlAimAngle + Number(aBtn.dataset.ctrlAngle), MIN_ANGLE, MAX_ANGLE);
        this.ctrlAngleSlider.setValue(this.ctrlAimAngle);
        this.ctrlAngleVal.textContent = `${this.ctrlAimAngle}°`;
        this.sendControllerCommand({ type: 'aim', angle: this.ctrlAimAngle });
        return;
      }
      const sBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-ctrl-speed]');
      if (sBtn) {
        this.ctrlAimSpeed = clamp(this.ctrlAimSpeed + Number(sBtn.dataset.ctrlSpeed), MIN_SPEED, MAX_SPEED);
        this.ctrlSpeedSlider.setValue(this.ctrlAimSpeed);
        this.ctrlSpeedVal.textContent = `${this.ctrlAimSpeed} m/s`;
        this.sendControllerCommand({ type: 'aim', speed: this.ctrlAimSpeed });
        return;
      }
      const mBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-ctrl-mtilt]');
      if (mBtn) {
        this.ctrlMirrorTilt = clamp(
          this.ctrlMirrorTilt + Number(mBtn.dataset.ctrlMtilt),
          MIN_MIRROR_TILT,
          MAX_MIRROR_TILT,
        );
        this.ctrlMtiltSlider.setValue(this.ctrlMirrorTilt);
        this.ctrlMirrorReadout.textContent = `${this.ctrlMirrorTilt >= 0 ? '+' : ''}${this.ctrlMirrorTilt}°`;
        this.sendControllerCommand({ type: 'mirror_update', angleDeg: this.ctrlMirrorTilt });
      }
    });

    this.ctrlBtnThrow.addEventListener('click', () => this.sendControllerCommand({ type: 'throw' }));
    this.ctrlBtnRematch.addEventListener('click', () => this.sendControllerCommand({ type: 'rematch' }));
    this.ctrlToggleHint.addEventListener('click', () => this.sendControllerCommand({ type: 'toggle', key: 'hint' }));
    this.ctrlToggleSolution.addEventListener('click', () => this.sendControllerCommand({ type: 'toggle', key: 'solution' }));
    this.ctrlToggleTheme.addEventListener('click', () => this.sendControllerCommand({ type: 'toggle', key: 'theme' }));

    // Game Over modal
    this.btnRematch.addEventListener('click', () => {
      this.gameoverModal.classList.add('hidden');
      this.startMatch();
    });
    this.btnChangeSetup.addEventListener('click', () => {
      this.gameoverModal.classList.add('hidden');
      this.phase = 'setup';
      this.renderSetupPlayersAndGallery();
      this.setupModal.classList.remove('hidden');
      this.broadcastHostState();
    });

    // Canvas pointer drag: drag Draft Mirror if grabbing near it, otherwise aim gorilla!
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.canHumanControl()) return;
      e.preventDefault();
      const { px, py } = this.pointerToWorld(e);

      if (this.draftMirror && Math.hypot(px - this.draftMirror.x, py - this.draftMirror.y) <= MIRROR_HALF_LENGTH + 34) {
        this.dragMode = 'mirror';
        this.canvas.setPointerCapture(e.pointerId);
        this.updateDraftMirror(px, py, undefined);
      } else {
        this.dragMode = 'aim';
        this.canvas.setPointerCapture(e.pointerId);
        this.updateAimFromWorld(px, py);
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.dragMode === 'none' || !this.canHumanControl()) return;
      e.preventDefault();
      const { px, py } = this.pointerToWorld(e);
      if (this.dragMode === 'mirror') {
        this.updateDraftMirror(px, py, undefined);
      } else {
        this.updateAimFromWorld(px, py);
      }
    });

    const endDrag = () => {
      this.dragMode = 'none';
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!this.canHumanControl() || this.appMode === 'controller') return;

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
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        if (this.draftMirror) this.lockDraftMirror();
        else this.startDraftMirror();
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

  private pointerToWorld(e: PointerEvent): { px: number; py: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      px: ((e.clientX - rect.left) / rect.width) * WORLD_WIDTH,
      py: ((e.clientY - rect.top) / rect.height) * WORLD_HEIGHT,
    };
  }

  // ==================== Player-Placed Shared Round Mirrors ====================

  private canPlaceMirrorNow(): boolean {
    return this.canHumanControl() && this.config.enableMirrors && !this.mirrorPlacedThisTurn;
  }

  private startDraftMirror(): void {
    if (!this.canPlaceMirrorNow()) return;
    const active = this.players[this.activePlayerIndex];
    if (!active) return;

    // Position the initial draft mirror usefully in open sky between thrower and opponent
    const opp = this.players.find((p) => p.id !== active.id);
    const defaultX = opp ? Math.round((active.x + opp.x) / 2) : 600;
    const defaultY = 210;
    const defaultTilt = active.x < defaultX ? -25 : 25;

    this.draftMirror = {
      id: this.nextMirrorId++,
      x: clamp(defaultX, 120, WORLD_WIDTH - 120),
      y: clamp(defaultY, 100, WORLD_HEIGHT - 170),
      halfLength: MIRROR_HALF_LENGTH,
      angleDeg: defaultTilt,
      ownerId: active.id,
      ownerColor: active.color,
      locked: false,
      bounceAnim: 0,
    };

    this.mirrorTiltSlider.setValue(this.draftMirror.angleDeg);
    this.mirrorTiltVal.textContent = `${this.draftMirror.angleDeg >= 0 ? '+' : ''}${this.draftMirror.angleDeg}°`;
    this.syncMirrorUI();
    soundEngine.playTick();
    this.broadcastHostState();
  }

  private updateDraftMirror(x?: number, y?: number, angleDeg?: number): void {
    if (!this.draftMirror) return;
    if (x !== undefined) {
      this.draftMirror.x = Math.round(clamp(x, 90, WORLD_WIDTH - 90));
    }
    if (y !== undefined) {
      this.draftMirror.y = Math.round(clamp(y, 85, WORLD_HEIGHT - 130));
    }
    if (angleDeg !== undefined) {
      this.draftMirror.angleDeg = Math.round(clamp(angleDeg, MIN_MIRROR_TILT, MAX_MIRROR_TILT));
      this.mirrorTiltSlider.setValue(this.draftMirror.angleDeg);
      this.mirrorTiltVal.textContent = `${this.draftMirror.angleDeg >= 0 ? '+' : ''}${this.draftMirror.angleDeg}°`;
    }
    if (this.showSolution) this.refreshVerifiedSolution();
    this.broadcastHostState();
  }

  private lockDraftMirror(): void {
    if (!this.draftMirror) return;
    this.draftMirror.locked = true;
    this.mirrors.push(this.draftMirror);
    if (this.mirrors.length > MAX_MIRRORS_PER_ROUND) {
      this.mirrors.shift(); // keep up to 4 shared mirrors per round!
    }
    this.draftMirror = null;
    this.mirrorPlacedThisTurn = true;
    this.syncMirrorUI();
    soundEngine.playMirrorPing(1);
    this.showToast('Mirror locked! It stays for the whole round — aim a bank shot!', 2.2);
    if (this.showSolution) this.refreshVerifiedSolution();
    this.broadcastHostState();
  }

  private cancelDraftMirror(): void {
    this.draftMirror = null;
    this.syncMirrorUI();
    soundEngine.playTick();
    if (this.showSolution) this.refreshVerifiedSolution();
    this.broadcastHostState();
  }

  private syncMirrorUI(): void {
    this.mirrorBar.classList.toggle('hidden', !this.draftMirror || this.appMode === 'tv-host');
    this.mirrorCountLabel.textContent = `Mirror (${this.mirrors.length}/${MAX_MIRRORS_PER_ROUND})`;
    const canPlace = this.canPlaceMirrorNow();
    this.btnPlaceMirror.disabled = !canPlace && !this.draftMirror;
    this.btnPlaceMirror.textContent = this.draftMirror
      ? 'Cancel Mirror'
      : this.mirrorPlacedThisTurn
        ? 'Placed ✓'
        : '+ Mirror';
  }

  // ==================== Jackbox TV Host & Controller ====================

  private startTvHostMode(): void {
    this.appMode = 'tv-host';
    this.tvHostStatus.textContent = 'Opening TV room...';
    this.btnStartTvHost.disabled = true;

    this.jackboxHost?.destroy();
    this.jackboxHost = new JackboxHost({
      onReady: (code, qrDataUrl) => {
        this.btnStartTvHost.disabled = false;
        this.btnStartTvHost.classList.add('hidden');
        this.btnStopTvHost.classList.remove('hidden');
        this.tvRoomCodeEl.textContent = code;
        if (qrDataUrl) {
          this.tvQrImg.src = qrDataUrl;
          this.tvQrImg.classList.remove('hidden');
        } else {
          this.tvQrImg.classList.add('hidden');
        }
        this.tvRoomCard.classList.remove('hidden');
        this.tvHostStatus.textContent = `TV Room ${code} is live! Scan QR on your tablet or phone.`;
        this.btnJackbox.textContent = `TV: ${code}`;
        this.jackboxModal.classList.add('hidden');
        if (this.phase === 'setup') this.startMatch();
        else this.broadcastHostState();
      },
      onClientCountChange: (count) => {
        this.tvClientBadge.textContent = count === 1 ? '1 controller live' : `${count} controllers live`;
        this.controlsDock.classList.toggle('hidden', this.appMode === 'tv-host' && count > 0);
        this.mirrorBar.classList.toggle('hidden', !this.draftMirror || (this.appMode === 'tv-host' && count > 0));
        if (count > 0) {
          this.showToast('Tablet/Phone controller connected! Pass it around!', 2.6);
          this.broadcastHostState();
        }
      },
      onCommand: (cmd) => this.handleControllerCommand(cmd),
      onError: (msg) => {
        this.btnStartTvHost.disabled = false;
        this.tvHostStatus.textContent = msg;
      },
    });
    this.jackboxHost.start();
  }

  private stopTvHostMode(): void {
    this.jackboxHost?.destroy();
    this.jackboxHost = null;
    this.appMode = 'single';
    this.tvRoomCard.classList.add('hidden');
    this.controlsDock.classList.remove('hidden');
    this.syncMirrorUI();
    this.btnStartTvHost.classList.remove('hidden');
    this.btnStopTvHost.classList.add('hidden');
    this.tvHostStatus.textContent = 'TV Host Mode stopped.';
    this.btnJackbox.textContent = 'TV / Tablet';
  }

  private handleControllerCommand(cmd: ControllerCommand): void {
    if (cmd.type === 'hello') {
      this.broadcastHostState();
      return;
    }
    if (cmd.type === 'toggle') {
      if (cmd.key === 'theme') this.setTheme(this.theme === 'modern' ? 'retro' : 'modern');
      else if (cmd.key === 'hint') {
        this.showAimHint = !this.showAimHint;
        this.syncToolbarUI();
      } else if (cmd.key === 'solution') {
        this.showSolution = !this.showSolution;
        if (this.showSolution) this.refreshVerifiedSolution();
        this.syncToolbarUI();
      } else if (cmd.key === 'lab') {
        this.showPhysicsLab = !this.showPhysicsLab;
        this.syncToolbarUI();
      } else if (cmd.key === 'sound') {
        soundEngine.toggleMute();
        this.syncToolbarUI();
      }
      this.broadcastHostState();
      return;
    }
    if (cmd.type === 'rematch' && this.phase === 'game_over') {
      this.gameoverModal.classList.add('hidden');
      this.startMatch();
      return;
    }

    if (!this.canHumanControl()) return;

    if (cmd.type === 'aim') {
      if (cmd.direction !== undefined) this.setAimDirection(cmd.direction);
      if (cmd.angle !== undefined) this.setAimAngle(cmd.angle);
      if (cmd.speed !== undefined) this.setAimSpeed(cmd.speed);
    } else if (cmd.type === 'move') {
      this.moveActiveGorilla(cmd.dir);
    } else if (cmd.type === 'mirror_start') {
      if (!this.draftMirror) this.startDraftMirror();
    } else if (cmd.type === 'mirror_update') {
      this.updateDraftMirror(cmd.x, cmd.y, cmd.angleDeg);
    } else if (cmd.type === 'mirror_lock') {
      this.lockDraftMirror();
    } else if (cmd.type === 'mirror_cancel') {
      this.cancelDraftMirror();
    } else if (cmd.type === 'throw') {
      this.fireCurrentPlayerBanana();
    }
  }

  private broadcastHostState(): void {
    if (this.appMode !== 'tv-host' || !this.jackboxHost) return;
    const active = this.players[this.activePlayerIndex];
    const planet = PLANETS[this.config.planetId];
    const loc = this.terrain.location;

    const snapshot: ControllerStateSnapshot = {
      type: 'state',
      phase: this.phase,
      round: this.currentRound,
      totalRounds: this.config.rounds,
      locationName: `${loc.name}, ${loc.region}`,
      planetName: planet.name,
      gravity: planet.gravity,
      windAccel: this.windAccel,
      activePlayerName: active?.name ?? 'Player',
      activePlayerColor: active?.color ?? '#d95d39',
      activeCharacterId: active?.characterId ?? 'king-kong',
      activeIsBot: Boolean(active?.isBot),
      triesLeft: this.triesRemaining,
      triesTotal: this.config.triesPerTurn,
      movesLeft: this.movesRemaining,
      aimAngle: this.aimAngle,
      aimSpeed: this.aimSpeed,
      aimDirection: this.aimDirection,
      canControl: this.canHumanControl(),
      canPlaceMirror: this.canPlaceMirrorNow(),
      mirrorCount: this.mirrors.length,
      draftMirror: this.draftMirror
        ? { x: this.draftMirror.x, y: this.draftMirror.y, angleDeg: this.draftMirror.angleDeg }
        : null,
      showAimHint: this.showAimHint,
      showSolution: this.showSolution,
      showPhysicsLab: this.showPhysicsLab,
      theme: this.theme,
      muted: soundEngine.isMuted(),
      scores: this.players.map((p, idx) => ({
        name: p.name,
        color: p.color,
        score: p.score,
        active: idx === this.activePlayerIndex,
      })),
      lastTip: this.labTip.textContent ?? '',
      winnerText: this.phase === 'game_over' ? this.gameoverWinnerLine.textContent ?? '' : undefined,
    };
    this.jackboxHost.broadcast(snapshot);
  }

  private enterControllerMode(rawCode: string): void {
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (code.length !== 4) {
      this.inputRoomCode.focus();
      return;
    }

    this.jackboxHost?.destroy();
    this.jackboxHost = null;
    this.appMode = 'controller';

    this.setupModal.classList.add('hidden');
    this.jackboxModal.classList.add('hidden');
    this.gameoverModal.classList.add('hidden');
    this.appShell.classList.add('hidden');
    this.controllerView.classList.remove('hidden');

    this.jackboxController?.destroy();
    this.jackboxController = new JackboxController({
      onStatus: (_status, msg) => {
        this.ctrlStatusBar.textContent = msg;
      },
      onState: (snap) => this.applyControllerSnapshot(snap),
    });
    this.jackboxController.connect(code);
  }

  private exitControllerMode(): void {
    this.jackboxController?.destroy();
    this.jackboxController = null;
    this.appMode = 'single';
    this.controllerView.classList.add('hidden');
    this.appShell.classList.remove('hidden');
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  }

  private sendControllerCommand(cmd: ControllerCommand): void {
    this.jackboxController?.send(cmd);
  }

  private sendControllerAimThrottled(): void {
    const now = performance.now();
    if (now - this.lastCtrlSendMs < 35) return;
    this.lastCtrlSendMs = now;
    this.sendControllerCommand({
      type: 'aim',
      angle: this.ctrlAimAngle,
      speed: this.ctrlAimSpeed,
      direction: this.ctrlAimDir,
    });
  }

  private sendControllerMirrorThrottled(): void {
    const now = performance.now();
    if (now - this.lastCtrlSendMs < 35) return;
    this.lastCtrlSendMs = now;
    this.sendControllerCommand({
      type: 'mirror_update',
      x: this.ctrlMirrorX,
      y: this.ctrlMirrorY,
      angleDeg: this.ctrlMirrorTilt,
    });
  }

  private applyControllerSnapshot(snap: ControllerStateSnapshot): void {
    if (this.theme !== snap.theme) {
      document.documentElement.setAttribute('data-theme', snap.theme);
    }

    const ch = CHARACTERS[snap.activeCharacterId];
    renderCharacterAvatar(this.ctrlAvatarCanvas, snap.activeCharacterId, snap.theme);
    this.ctrlTurnHeading.textContent =
      snap.phase === 'game_over'
        ? 'Match Complete!'
        : snap.activeIsBot
          ? `${snap.activePlayerName} is aiming...`
          : `Pass to ${snap.activePlayerName}!`;
    this.ctrlMetaLine.textContent =
      snap.phase === 'game_over'
        ? snap.winnerText ?? 'See TV for full awards!'
        : `${ch.name} (${ch.title}) · Round ${snap.round}/${snap.totalRounds}`;

    this.ctrlLocationChip.textContent = snap.locationName;
    this.ctrlWindChip.textContent =
      Math.abs(snap.windAccel) < 0.2
        ? 'Calm Air'
        : `Wind ${snap.windAccel > 0 ? '→' : '←'} ${Math.abs(snap.windAccel).toFixed(1)}`;
    const tryNum = snap.triesTotal - snap.triesLeft + 1;
    this.ctrlTriesChip.textContent = `Try ${Math.min(tryNum, snap.triesTotal)} / ${snap.triesTotal}`;
    this.ctrlMoveLabel.textContent = `Walk (${snap.movesLeft} left)`;

    // Mirror placement card state
    const hasDraft = Boolean(snap.draftMirror);
    this.ctrlMirrorCard.classList.toggle('hidden', !hasDraft);
    if (snap.draftMirror) {
      this.ctrlMirrorX = snap.draftMirror.x;
      this.ctrlMirrorY = snap.draftMirror.y;
      this.ctrlMirrorTilt = snap.draftMirror.angleDeg;
      this.ctrlMxSlider.setValue(snap.draftMirror.x);
      this.ctrlMySlider.setValue(snap.draftMirror.y);
      this.ctrlMtiltSlider.setValue(snap.draftMirror.angleDeg);
      this.ctrlMirrorReadout.textContent = `${snap.draftMirror.angleDeg >= 0 ? '+' : ''}${snap.draftMirror.angleDeg}°`;
    }
    this.ctrlBtnMirror.disabled = !snap.canPlaceMirror || hasDraft;
    this.ctrlBtnMirror.textContent = hasDraft
      ? 'Placing Mirror…'
      : `+ Mirror (${snap.mirrorCount}/${MAX_MIRRORS_PER_ROUND})`;

    this.ctrlAimAngle = snap.aimAngle;
    this.ctrlAimSpeed = snap.aimSpeed;
    this.ctrlAimDir = snap.aimDirection;
    this.ctrlAngleSlider.setValue(snap.aimAngle);
    this.ctrlSpeedSlider.setValue(snap.aimSpeed);
    this.ctrlAngleVal.textContent = `${snap.aimAngle}°`;
    this.ctrlSpeedVal.textContent = `${snap.aimSpeed} m/s`;
    this.ctrlDirLeft.classList.toggle('active', snap.aimDirection === -1);
    this.ctrlDirRight.classList.toggle('active', snap.aimDirection === 1);

    const enabled = snap.canControl;
    this.ctrlAngleSlider.setDisabled(!enabled);
    this.ctrlSpeedSlider.setDisabled(!enabled);
    this.ctrlMoveLeft.disabled = !enabled || snap.movesLeft <= 0;
    this.ctrlMoveRight.disabled = !enabled || snap.movesLeft <= 0;
    this.ctrlDirLeft.disabled = !enabled;
    this.ctrlDirRight.disabled = !enabled;
    this.ctrlBtnThrow.disabled = !enabled;
    this.controllerView.querySelectorAll<HTMLButtonElement>('.ctrl-step-btn').forEach((b) => {
      b.disabled = !enabled;
    });

    const isOver = snap.phase === 'game_over';
    this.ctrlBtnThrow.classList.toggle('hidden', isOver);
    this.ctrlBtnRematch.classList.toggle('hidden', !isOver);

    this.ctrlToggleHint.textContent = `Aim Hint: ${snap.showAimHint ? 'On' : 'Off'}`;
    this.ctrlToggleSolution.textContent = `Solution: ${snap.showSolution ? 'On' : 'Off'}`;
    this.ctrlToggleTheme.textContent = snap.theme === 'modern' ? 'Theme: Modern' : "Theme: Retro '90s";

    this.ctrlScores.innerHTML = snap.scores
      .map(
        (s) =>
          `<div class="score-pill${s.active ? ' active' : ''}"><span class="score-swatch" style="background:${s.color}"></span><span>${s.name}</span><span>${s.score}</span></div>`,
      )
      .join('');
  }

  // ==================== Core Game Logic ====================

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
    const active = this.players[this.activePlayerIndex];
    if (!active) return;

    if (this.movesRemaining <= 0) {
      soundEngine.playBlocked();
      this.spawnFloatingText(active.x, active.y - 94, 'No steps left this turn!', '#fed7aa', 0.9);
      return;
    }

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
      this.spawnFloatingText(active.x, active.y - 94, reasonMsg, '#fca5a5', 0.9);
      return;
    }

    active.x = result.x;
    active.y = result.y;
    this.movesRemaining--;

    soundEngine.playStep(result.dropped);
    if (result.dropped) {
      this.spawnDustPuff(active.x, active.y);
      this.spawnFloatingText(active.x, active.y - 92, 'Dropped down!', '#bae6fd', 0.85);
    }

    this.updateMoveUI();
    if (this.showSolution) this.refreshVerifiedSolution();
    this.broadcastHostState();
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
    const ownerHit = { x: active.x, y: active.y - GORILLA_HIT_CENTER_Y };
    const activeMirrors = this.draftMirror ? [...this.mirrors, this.draftMirror] : this.mirrors;

    const opponents = this.players
      .filter((p) => p.id !== active.id)
      .sort((a, b) => {
        const aMatches = Math.sign(a.x - active.x) === this.aimDirection ? 0 : 1;
        const bMatches = Math.sign(b.x - active.x) === this.aimDirection ? 0 : 1;
        if (aMatches !== bMatches) return aMatches - bMatches;
        return Math.abs(a.x - active.x) - Math.abs(b.x - active.x);
      });

    for (const opp of opponents) {
      const target = { x: opp.x, y: opp.y - GORILLA_HIT_CENTER_Y };
      const sol = findVerifiedSolution(
        origin,
        target,
        planet.gravity,
        this.windAccel,
        (x, y) => this.terrain.isSolid(x, y),
        activeMirrors,
        ownerHit,
      );
      if (sol) {
        this.verifiedSolution = { ...sol, targetPlayerId: opp.id };
        return;
      }
    }

    this.verifiedSolution = null;
  }

  private updateAimFromWorld(px: number, py: number): void {
    const active = this.players[this.activePlayerIndex];
    if (!active) return;

    const originX = active.x;
    const originY = active.y - GORILLA_HAND_OFFSET_Y;

    const dx = px - originX;
    const dy = originY - py;

    const dir: ThrowDirection = dx >= 0 ? 1 : -1;
    const absDx = Math.max(4, Math.abs(dx));
    const angle = Math.round(clamp(radToDeg(Math.atan2(dy, absDx)), MIN_ANGLE, MAX_ANGLE));
    const distPx = Math.hypot(dx, dy);
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
    if (changed && this.showSolution) this.refreshVerifiedSolution();
    this.updatePhysicsLabReadout();
    this.broadcastHostState();
  }

  private setAimAngle(angle: number): void {
    const clamped = Math.round(clamp(Number.isFinite(angle) ? angle : 45, MIN_ANGLE, MAX_ANGLE));
    this.aimAngle = clamped;
    this.angleSlider.setValue(clamped);
    this.angleValLabel.textContent = `${clamped}°`;
    const active = this.players[this.activePlayerIndex];
    if (active) active.preferredAngle = clamped;
    this.updatePhysicsLabReadout();
    this.broadcastHostState();
  }

  private setAimSpeed(speed: number): void {
    const clamped = Math.round(clamp(Number.isFinite(speed) ? speed : 40, MIN_SPEED, MAX_SPEED));
    this.aimSpeed = clamped;
    this.speedSlider.setValue(clamped);
    this.speedValLabel.textContent = `${clamped} m/s`;
    const active = this.players[this.activePlayerIndex];
    if (active) active.preferredSpeed = clamped;
    this.updatePhysicsLabReadout();
    this.broadcastHostState();
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
    this.mirrors = [];
    this.draftMirror = null;

    const players: Player[] = [];
    for (let i = 0; i < this.config.humanCount; i++) {
      const charId = this.config.playerCharacters[i] ?? DEFAULT_PLAYER_CHARACTERS[i];
      const name = this.config.playerNames[i] || CHARACTERS[charId].name;
      players.push(this.createPlayer(i, name, charId, false, 100, 400, 0));
    }
    if (this.config.humanCount === 1) {
      players.push(this.createPlayer(1, 'Robo-Kong', 'robo-kong', true, 900, 400, 1));
    }
    this.players = players;

    this.setupRoundLocation(undefined);
    this.beginPlayerTurn();
  }

  private setupRoundLocation(excludeLoc?: ConcreteLocationId): void {
    const planet = PLANETS[this.config.planetId];
    const seed = Date.now() ^ (this.currentRound * 9973);
    const roundSetup = generateSolvableRound(
      this.players.length,
      planet.gravity,
      this.config.planetId !== 'moon',
      this.config.locationId,
      seed,
      excludeLoc,
    );

    this.terrain = roundSetup.terrain;
    this.currentLocationId = roundSetup.locationId;
    this.mirrors = []; // clean sky at start of every round!
    this.draftMirror = null;
    this.windAccel = roundSetup.windAccel;
    this.renderer.invalidateBuildings();
    this.sunShocked = false;

    this.players.forEach((p, idx) => {
      const pos = roundSetup.spawnPositions[idx];
      p.zoneIndex = pos.zoneIndex;
      p.x = pos.x;
      p.y = pos.y;
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

  private beginPlayerTurn(): void {
    this.triesRemaining = this.config.triesPerTurn;
    this.movesRemaining = MAX_MOVES_PER_TURN;
    this.mirrorPlacedThisTurn = false;
    this.draftMirror = null;
    this.turnEndedByHit = false;
    this.prepareAimStep(true);
  }

  private prepareAimStep(isFirstTry: boolean): void {
    const active = this.players[this.activePlayerIndex];
    if (!active) return;

    this.phase = 'aiming';
    this.banana = null;
    this.sunShocked = false;
    for (const p of this.players) p.animation = 'idle';

    this.setAimDirection(active.preferredDirection);
    this.setAimAngle(active.preferredAngle);
    this.setAimSpeed(active.preferredSpeed);

    const planet = PLANETS[this.config.planetId];
    const loc = this.terrain.location;
    const tryNum = this.config.triesPerTurn - this.triesRemaining + 1;
    this.roundBadge.textContent = `Round ${this.currentRound} / ${this.config.rounds} · ${loc.name}`;
    this.planetBadge.textContent = `${planet.name} · ${planet.gravity} m/s²`;
    this.triesBadge.textContent = `Try ${tryNum} / ${this.config.triesPerTurn}`;
    this.triesBadge.classList.toggle('hidden', this.config.triesPerTurn <= 1);

    this.turnDot.style.background = active.color;
    this.turnText.textContent = active.isBot
      ? `${active.name} is calculating try ${tryNum}...`
      : isFirstTry
        ? `${active.name}'s turn — move, place a mirror, or throw!`
        : `${active.name} — refine from your ghost trail!`;

    this.setControlsEnabled(!active.isBot);
    this.updateMoveUI();
    this.syncMirrorUI();
    this.renderScoreboardStrip();
    this.updatePhysicsLabReadout();

    if (this.showSolution) this.refreshVerifiedSolution();
    else this.verifiedSolution = null;

    this.broadcastHostState();

    if (active.isBot) {
      this.botThinkTimer = isFirstTry ? 0.85 : 0.6;
    }
  }

  private setControlsEnabled(enabled: boolean): void {
    this.btnMoveLeft.disabled = !enabled || this.movesRemaining <= 0;
    this.btnMoveRight.disabled = !enabled || this.movesRemaining <= 0;
    this.btnDirLeft.disabled = !enabled;
    this.btnDirRight.disabled = !enabled;
    this.btnPlaceMirror.disabled = !enabled || (!this.canPlaceMirrorNow() && !this.draftMirror);
    this.angleSlider.setDisabled(!enabled);
    this.speedSlider.setDisabled(!enabled);
    this.controlsDock.querySelectorAll<HTMLButtonElement>('.step-btn').forEach((b) => {
      b.disabled = !enabled;
    });
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
    this.labVy.textContent = `${vy >= 0 ? '+' : ''}${vy.toFixed(1)} m/s`;
    this.labG.textContent = `${planet.gravity} m/s²`;
    this.labWind.textContent =
      Math.abs(this.windAccel) < 0.1
        ? '0.0 m/s² (Calm)'
        : `${this.windAccel > 0 ? '+' : ''}${this.windAccel.toFixed(1)} m/s² (${this.windAccel > 0 ? 'Right' : 'Left'})`;

    const active = this.players[this.activePlayerIndex];
    if (active?.lastShot) {
      const s = active.lastShot;
      const bounceTag = s.bounces > 0 ? ` · ${s.bounces} mirror bounce` : '';
      this.labLast.textContent = `${s.flightTime.toFixed(1)}s · Peak ${Math.round(s.apexMeters)}m · Dist ${Math.round(s.distanceMeters)}m${bounceTag}`;
    } else if (this.aimAngle <= 0) {
      this.labLast.textContent = 'Downward / flat line drive';
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

    // Auto-lock any active draft mirror when throwing so players never lose their placement!
    if (this.draftMirror) {
      this.lockDraftMirror();
    }

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
      hasClearedOwner: false,
      bounces: 0,
      trail: [{ x: originX, y: originY }],
      maxApexMeters: Math.max(0, (WORLD_HEIGHT - originY) / PIXELS_PER_METER),
      hitSun: false,
    };

    this.phase = 'flying';
    this.setControlsEnabled(false);
    soundEngine.playThrow(this.theme);
    this.broadcastHostState();
  }

  private executeBotTurn(): void {
    const bot = this.players[this.activePlayerIndex];
    if (!bot || !bot.isBot) return;

    const opponents = this.players.filter((p) => p.id !== bot.id);
    const target = opponents[Math.floor(Math.random() * opponents.length)];
    if (!target) return;

    const origin = { x: bot.x, y: bot.y - GORILLA_HAND_OFFSET_Y };
    const targetCenter = { x: target.x, y: target.y - GORILLA_HIT_CENTER_Y };
    const planet = PLANETS[this.config.planetId];

    const solution = solveBotShot(
      origin,
      targetCenter,
      planet.gravity,
      this.windAccel,
      bot.botDifficulty,
      (x, y) => this.terrain.isSolid(x, y),
      this.mirrors,
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
    const owner = this.players.find((p) => p.id === b.ownerId);
    const ownerHit = owner ? { x: owner.x, y: owner.y - GORILLA_HIT_CENTER_Y } : null;

    const subSteps = Math.max(8, Math.ceil(dt / 0.005));
    const subDt = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      const { bouncedMirrorId } = stepKinematicBody(
        b,
        subDt,
        planet.gravity,
        this.windAccel,
        ownerHit,
        this.mirrors,
      );
      b.spin += subDt * 13 * (b.vx >= 0 ? 1 : -1);

      if (bouncedMirrorId !== null) {
        const mirror = this.mirrors.find((m) => m.id === bouncedMirrorId);
        if (mirror) {
          mirror.bounceAnim = 0.45;
          soundEngine.playMirrorPing(b.bounces);
          this.spawnFloatingText(
            b.x,
            b.y - 26,
            b.bounces > 1 ? `CHAIN ×${b.bounces}!` : 'REFLECT!',
            '#7dd3fc',
            1.1,
          );
          this.spawnExplosionParticles(b.x, b.y, '#7dd3fc', 14);
        }
      }

      const altMeters = (WORLD_HEIGHT - b.y) / PIXELS_PER_METER;
      if (altMeters > b.maxApexMeters) b.maxApexMeters = altMeters;

      const lastTrail = b.trail[b.trail.length - 1];
      if (
        bouncedMirrorId !== null ||
        !lastTrail ||
        Math.hypot(b.x - lastTrail.x, b.y - lastTrail.y) >= 8
      ) {
        b.trail.push({ x: b.x, y: b.y });
      }

      // Check Sun Bonk!
      if (!b.hitSun && Math.hypot(b.x - SUN_X, b.y - SUN_Y) <= SUN_RADIUS + BANANA_RADIUS) {
        b.hitSun = true;
        this.sunShocked = true;
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
        if (p.id === b.ownerId && (!b.hasClearedOwner || b.elapsed < SELF_HIT_MIN_SEC)) {
          continue;
        }
        if (
          Math.hypot(b.x - p.x, b.y - (p.y - GORILLA_HIT_CENTER_Y)) <=
          GORILLA_HIT_RADIUS + BANANA_RADIUS
        ) {
          this.resolveImpact(b.x, b.y, p);
          return;
        }
      }

      // Check Solid Terrain Collision
      if (b.y >= 0 && this.terrain.isSolid(b.x, b.y)) {
        this.resolveImpact(b.x, b.y, null);
        return;
      }

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
        bounces: b.bounces,
        outcome: 'out',
      };
      this.labTip.textContent = generatePhysicsTip(
        b.angleDeg,
        b.speed,
        b.direction,
        this.windAccel,
        planet,
        'out',
        b.bounces,
      );
    }

    this.triesRemaining--;
    const retryNote =
      this.triesRemaining > 0
        ? ` (${this.triesRemaining} ${this.triesRemaining === 1 ? 'try' : 'tries'} left!)`
        : '';
    this.showToast(
      (planet.id === 'moon' ? 'Banana floated into lunar orbit!' : 'Way over the skyline!') + retryNote,
      1.9,
    );
    this.updatePhysicsLabReadout();
    this.phase = 'exploding';
    this.postShotTimer = 0.85;
    this.broadcastHostState();
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

    const craterRadius = directTarget ? CRATER_RADIUS + 8 : CRATER_RADIUS;
    const pixelsDestroyed = this.terrain.carveCrater(ix, iy, craterRadius);
    owner.blocksDestroyed += pixelsDestroyed;

    for (const p of this.players) {
      const groundY = this.terrain.getSurfaceY(p.x, Math.max(0, p.y - 6));
      if (groundY > p.y && groundY < WORLD_HEIGHT) p.y = groundY;
    }

    let outcome: 'hit' | 'splash' | 'building' | 'self' = 'building';

    if (directTarget) {
      if (directTarget.id === owner.id) {
        outcome = 'self';
        this.triesRemaining--;
        directTarget.animation = 'ouch';
        soundEngine.playBuildingHit(this.theme);
        this.spawnExplosionParticles(ix, iy, '#f97316', 36);
        this.spawnFloatingText(ix, iy - 34, 'SELF-BONK!', '#fca5a5', 1.2);
        this.showToast(`Oops! ${owner.name} bonked themselves!`);
      } else {
        outcome = 'hit';
        this.turnEndedByHit = true;
        this.triesRemaining = 0;
        owner.hits++;

        let gained = SCORE_DIRECT_HIT;
        const bonuses: string[] = [];
        if (b.bounces > 0) {
          owner.bankShotHits++;
          const bankBonus = SCORE_BANK_SHOT_BONUS * b.bounces;
          gained += bankBonus;
          bonuses.push(`+${bankBonus} Mirror Bank!`);
        }
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
        this.spawnExplosionParticles(ix, iy, '#fde047', 56);
        this.spawnFloatingText(ix, iy - 38, `DIRECT HIT! +${gained}`, '#fde047', 1.3);
        const bonusStr = bonuses.length > 0 ? ` (${bonuses.join(' ')})` : '';
        this.showToast(`${owner.name} hit ${directTarget.name}! +${gained} pts${bonusStr}`, 2.5);
      }
    } else {
      this.triesRemaining--;
      let splashedPlayer: Player | null = null;
      for (const p of this.players) {
        if (p.id === owner.id) continue;
        if (Math.hypot(ix - p.x, iy - (p.y - GORILLA_HIT_CENTER_Y)) <= SPLASH_RADIUS) {
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
        this.spawnFloatingText(ix, iy - 28, `CLOSE CALL! +${SCORE_SPLASH_HIT}`, '#fed7aa', 1.15);
        const retryNote =
          this.triesRemaining > 0
            ? ` — ${this.triesRemaining} ${this.triesRemaining === 1 ? 'try' : 'tries'} left!`
            : '';
        this.showToast(`Close splash near ${splashedPlayer.name}! +${SCORE_SPLASH_HIT} pts${retryNote}`, 2.2);
      } else {
        soundEngine.playBuildingHit(this.theme);
        this.triggerShake(5, 0.24);
        this.spawnExplosionParticles(ix, iy, '#f97316', 28);
        if (this.triesRemaining > 0 && !owner.isBot) {
          this.showToast(
            `Impact! ${this.triesRemaining} ${this.triesRemaining === 1 ? 'try' : 'tries'} left — adjust or place a Mirror!`,
            1.7,
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
      bounces: b.bounces,
      outcome,
    };

    this.labTip.textContent = generatePhysicsTip(
      b.angleDeg,
      b.speed,
      b.direction,
      this.windAccel,
      planet,
      outcome,
      b.bounces,
    );

    this.renderScoreboardStrip();
    this.updatePhysicsLabReadout();
    this.phase = 'exploding';
    this.postShotTimer = outcome === 'hit' ? 1.5 : 0.8;
    this.broadcastHostState();
  }

  private respawnHitGorillas(): void {
    if (this.pendingRespawnIds.length === 0) return;

    const planet = PLANETS[this.config.planetId];
    const spots = this.terrain.location.spawnSpots;

    for (const id of this.pendingRespawnIds) {
      const p = this.players.find((pl) => pl.id === id);
      if (!p) continue;
      const others = this.players.filter((o) => o.id !== p.id);

      const candidates = spots
        .map((s, idx) => ({
          x: s.x,
          y: this.terrain.getSurfaceY(s.x, Math.max(0, s.y - 24)),
          idx,
        }))
        .filter(
          (c) =>
            c.y < WORLD_HEIGHT - 20 &&
            Math.abs(c.x - p.x) > 80 &&
            others.every((o) => Math.abs(c.x - o.x) > 95),
        )
        .sort(() => Math.random() - 0.5);

      let chosen = candidates[0];
      for (const c of candidates) {
        const origin = { x: c.x, y: c.y - GORILLA_HAND_OFFSET_Y };
        const ownerHit = { x: c.x, y: c.y - GORILLA_HIT_CENTER_Y };
        const solvable = others.some((o) =>
          Boolean(
            findVerifiedSolution(
              origin,
              { x: o.x, y: o.y - GORILLA_HIT_CENTER_Y },
              planet.gravity,
              this.windAccel,
              (x, y) => this.terrain.isSolid(x, y),
              this.mirrors,
              ownerHit,
            ),
          ),
        );
        if (solvable) {
          chosen = c;
          break;
        }
      }

      if (chosen) {
        p.x = chosen.x;
        p.y = chosen.y;
        p.zoneIndex = chosen.idx;
      }
      p.animation = 'idle';
      p.preferredDirection = this.pickDefaultDirectionFor(p);
      this.spawnFloatingText(p.x, p.y - 90, `${p.name} relocated!`, '#ffffff', 0.95);
    }

    this.pendingRespawnIds = [];
  }

  private afterShotComplete(): void {
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
      this.setupRoundLocation(this.currentLocationId);
      const loc = this.terrain.location;
      this.showToast(`Round ${this.currentRound}: Welcome to ${loc.name}, ${loc.region}!`, 2.6);
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
        : `${winners[0].name} wins the crown with ${topScore} points!`;

    this.finalStandings.innerHTML = '';
    sorted.forEach((p, idx) => {
      const ch = CHARACTERS[p.characterId];
      const row = document.createElement('div');
      row.className = `standing-row${p.score === topScore ? ' winner' : ''}`;
      row.innerHTML = `
        <div class="standing-left">
          <span class="standing-rank">#${idx + 1}</span>
          <span class="name-swatch" style="background:${p.color}"></span>
          <div>
            <div>${p.name} <span class="standing-meta">(${ch.name})</span></div>
            <div class="standing-meta">${p.hits} hit${p.hits === 1 ? '' : 's'} · ${p.splashHits} close call${p.splashHits === 1 ? '' : 's'}${p.bankShotHits > 0 ? ` · ${p.bankShotHits} mirror bank${p.bankShotHits === 1 ? '' : 's'}` : ''}</div>
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
    this.broadcastHostState();
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
        shape: this.theme === 'retro' ? 'square' : i % 5 === 0 ? 'peel' : 'circle',
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
    if (this.appMode === 'controller') return;
    this.timeSec += dt;

    for (const m of this.mirrors) {
      if (m.bounceAnim > 0) m.bounceAnim = Math.max(0, m.bounceAnim - dt);
    }

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
      if (this.toastTimer <= 0) this.toastBanner.classList.add('hidden');
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
        if (this.botThinkTimer <= 0) this.executeBotTurn();
      }
    } else if (this.phase === 'flying') {
      this.stepBanana(dt);
    } else if (this.phase === 'exploding') {
      this.postShotTimer -= dt;
      if (this.postShotTimer <= 0) this.afterShotComplete();
    }
  }

  private loop(nowMs: number): void {
    const dt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastFrameMs) / 1000));
    this.lastFrameMs = nowMs;

    this.update(dt);

    if (this.appMode !== 'controller') {
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
        mirrors: this.mirrors,
        draftMirror: this.draftMirror,
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
    }

    requestAnimationFrame((t) => this.loop(t));
  }
}

new GorillaPhysicsGame();
