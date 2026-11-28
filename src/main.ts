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
import { LOCATION_META } from './locations';
import {
  clamp,
  computeAwards,
  computeVelocityComponents,
  findVerifiedSolution,
  radToDeg,
  solveBotShot,
  stepKinematicBody,
} from './physics';
import { RemoteController, TvDisplayHost } from './remote';
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

type ActionTab = 'throw' | 'move' | 'mirror';

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
  private workspace = document.querySelector<HTMLElement>('.workspace')!;
  private canvasFrame = byId<HTMLDivElement>('canvas-frame');
  private controllerView = byId<HTMLDivElement>('controller-view');
  private canvas = byId<HTMLCanvasElement>('game-canvas');
  private ctx: CanvasRenderingContext2D;
  private renderer = new GameRenderer();
  private canvasScaleX = 1;
  private canvasScaleY = 1;

  // TV Display Status Strip (outside the sky)
  private tvStatusStrip = byId<HTMLElement>('tv-status-strip');
  private tvTurnDot = byId<HTMLSpanElement>('tv-turn-dot');
  private tvTurnName = byId<HTMLElement>('tv-turn-name');
  private tvTriesChip = byId<HTMLSpanElement>('tv-tries-chip');
  private tvRoundChip = byId<HTMLSpanElement>('tv-round-chip');
  private tvWindChip = byId<HTMLSpanElement>('tv-wind-chip');
  private tvScoresRow = byId<HTMLDivElement>('tv-scores-row');
  private tvCodePill = byId<HTMLSpanElement>('tv-code-pill');
  private btnTvQrToggle = byId<HTMLButtonElement>('btn-tv-qr-toggle');
  private btnTvSettings = byId<HTMLButtonElement>('btn-tv-settings');

  // TV Room QR Card & Stage Toast
  private tvRoomCard = byId<HTMLElement>('tv-room-card');
  private tvRoomCodeEl = byId<HTMLElement>('tv-room-code');
  private tvClientBadge = byId<HTMLSpanElement>('tv-client-badge');
  private tvQrImg = byId<HTMLImageElement>('tv-qr-img');
  private toastBanner = byId<HTMLDivElement>('toast-banner');

  // Focused Control Panel
  private controlPanel = byId<HTMLElement>('control-panel');
  private btnPanelCollapse = byId<HTMLButtonElement>('btn-panel-collapse');
  private btnPanelExpand = byId<HTMLButtonElement>('btn-panel-expand');
  private btnSettings = byId<HTMLButtonElement>('btn-settings');
  private turnDot = byId<HTMLSpanElement>('turn-dot');
  private turnPlayerName = byId<HTMLElement>('turn-player-name');
  private triesBadge = byId<HTMLSpanElement>('tries-badge');
  private panelMetaLine = byId<HTMLDivElement>('panel-meta-line');
  private scoreboardStrip = byId<HTMLDivElement>('scoreboard-strip');

  // 3-Tab Mode Panel
  private modeTabs = byId<HTMLDivElement>('mode-tabs');
  private mirrorTabBadge = byId<HTMLSpanElement>('mirror-tab-badge');
  private paneThrow = byId<HTMLDivElement>('pane-throw');
  private paneMove = byId<HTMLDivElement>('pane-move');
  private paneMirror = byId<HTMLDivElement>('pane-mirror');
  private activeTab: ActionTab = 'throw';

  // Throw Pane
  private btnDirLeft = byId<HTMLButtonElement>('btn-dir-left');
  private btnDirRight = byId<HTMLButtonElement>('btn-dir-right');
  private panelSolutionPill = byId<HTMLDivElement>('panel-solution-pill');
  private angleValLabel = byId<HTMLElement>('angle-val-label');
  private speedValLabel = byId<HTMLElement>('speed-val-label');
  private btnThrow = byId<HTMLButtonElement>('btn-throw');
  private angleSlider: TouchSlider;
  private speedSlider: TouchSlider;

  // Move Pane
  private moveLabel = byId<HTMLElement>('move-label');
  private btnMoveLeft = byId<HTMLButtonElement>('btn-move-left');
  private btnMoveRight = byId<HTMLButtonElement>('btn-move-right');

  // Mirror Pane
  private mirrorCountLabel = byId<HTMLElement>('mirror-count-label');
  private mirrorIdleBox = byId<HTMLDivElement>('mirror-idle-box');
  private mirrorDraftBox = byId<HTMLDivElement>('mirror-draft-box');
  private btnPlaceMirror = byId<HTMLButtonElement>('btn-place-mirror');
  private mirrorTiltVal = byId<HTMLElement>('mirror-tilt-val');
  private btnMirrorLock = byId<HTMLButtonElement>('btn-mirror-lock');
  private btnMirrorCancel = byId<HTMLButtonElement>('btn-mirror-cancel');
  private mirrorTiltSlider: TouchSlider;

  // Settings Slide-Over Drawer
  private settingsBackdrop = byId<HTMLDivElement>('settings-backdrop');
  private btnCloseSettings = byId<HTMLButtonElement>('btn-close-settings');
  private btnOpenRemote = byId<HTMLButtonElement>('btn-open-remote');
  private drawerTvVal = byId<HTMLSpanElement>('drawer-tv-val');
  private btnTheme = byId<HTMLButtonElement>('btn-theme');
  private drawerThemeVal = byId<HTMLSpanElement>('drawer-theme-val');
  private btnHint = byId<HTMLButtonElement>('btn-hint');
  private drawerHintVal = byId<HTMLSpanElement>('drawer-hint-val');
  private btnSolution = byId<HTMLButtonElement>('btn-solution');
  private drawerSolutionVal = byId<HTMLSpanElement>('drawer-solution-val');
  private drawerSolutionReadout = byId<HTMLDivElement>('drawer-solution-readout');
  private btnLab = byId<HTMLButtonElement>('btn-lab');
  private drawerLabVal = byId<HTMLSpanElement>('drawer-lab-val');
  private btnSound = byId<HTMLButtonElement>('btn-sound');
  private drawerSoundVal = byId<HTMLSpanElement>('drawer-sound-val');
  private btnNewGame = byId<HTMLButtonElement>('btn-new-game');

  // Setup Modal (Collapsible Player Accordions + Collapsed More Options)
  private setupModal = byId<HTMLDivElement>('setup-modal');
  private setupPlayerCount = byId<HTMLDivElement>('setup-player-count');
  private setupPlayersEl = byId<HTMLDivElement>('setup-players');
  private setupLocationSelect = byId<HTMLSelectElement>('setup-location-select');
  private moreOptionsPreview = byId<HTMLSpanElement>('more-options-preview');
  private setupPlanets = byId<HTMLDivElement>('setup-planets');
  private setupRounds = byId<HTMLDivElement>('setup-rounds');
  private setupTries = byId<HTMLDivElement>('setup-tries');
  private botSkillRow = byId<HTMLDivElement>('bot-skill-row');
  private setupBotSkill = byId<HTMLDivElement>('setup-bot-skill');
  private setupMirrorsCheck = byId<HTMLInputElement>('setup-mirrors-check');
  private setupHintCheck = byId<HTMLInputElement>('setup-hint-check');
  private setupLabCheck = byId<HTMLInputElement>('setup-lab-check');
  private setupRetroCheck = byId<HTMLInputElement>('setup-retro-check');
  private btnSetupRemote = byId<HTMLButtonElement>('btn-setup-remote');
  private btnStartMatch = byId<HTMLButtonElement>('btn-start-match');
  private openPlayerAccordion = 0;

  // TV & Remote Modal
  private remoteModal = byId<HTMLDivElement>('remote-modal');
  private btnStartTvHost = byId<HTMLButtonElement>('btn-start-tv-host');
  private btnStopTvHost = byId<HTMLButtonElement>('btn-stop-tv-host');
  private tvHostStatus = byId<HTMLParagraphElement>('tv-host-status');
  private inputRoomCode = byId<HTMLInputElement>('input-room-code');
  private btnJoinController = byId<HTMLButtonElement>('btn-join-controller');
  private btnCloseRemote = byId<HTMLButtonElement>('btn-close-remote');

  // Dedicated Remote Controller DOM
  private ctrlAvatarCanvas = byId<HTMLCanvasElement>('ctrl-avatar-canvas');
  private ctrlTurnHeading = byId<HTMLDivElement>('ctrl-turn-heading');
  private ctrlMetaLine = byId<HTMLDivElement>('ctrl-meta-line');
  private ctrlStatusBar = byId<HTMLDivElement>('ctrl-status-bar');
  private btnCtrlSettings = byId<HTMLButtonElement>('btn-ctrl-settings');
  private ctrlOptionsBar = byId<HTMLDivElement>('ctrl-options-bar');
  private ctrlLocationChip = byId<HTMLSpanElement>('ctrl-location-chip');
  private ctrlWindChip = byId<HTMLSpanElement>('ctrl-wind-chip');
  private ctrlTriesChip = byId<HTMLSpanElement>('ctrl-tries-chip');
  private ctrlScores = byId<HTMLDivElement>('ctrl-scores');
  private ctrlModeTabs = byId<HTMLDivElement>('ctrl-mode-tabs');
  private ctrlMirrorBadge = byId<HTMLSpanElement>('ctrl-mirror-badge');
  private ctrlPaneThrow = byId<HTMLDivElement>('ctrl-pane-throw');
  private ctrlPaneMove = byId<HTMLDivElement>('ctrl-pane-move');
  private ctrlPaneMirror = byId<HTMLDivElement>('ctrl-pane-mirror');
  private ctrlSolutionPill = byId<HTMLDivElement>('ctrl-solution-pill');
  private ctrlMirrorIdle = byId<HTMLDivElement>('ctrl-mirror-idle');
  private ctrlMirrorCard = byId<HTMLDivElement>('ctrl-mirror-card');
  private ctrlMirrorReadout = byId<HTMLElement>('ctrl-mirror-readout');
  private ctrlMirrorLock = byId<HTMLButtonElement>('ctrl-mirror-lock');
  private ctrlMirrorCancel = byId<HTMLButtonElement>('ctrl-mirror-cancel');
  private ctrlBtnMirror = byId<HTMLButtonElement>('ctrl-btn-mirror');
  private ctrlMoveLabel = byId<HTMLElement>('ctrl-move-label');
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
  private ctrlToggleLab = byId<HTMLButtonElement>('ctrl-toggle-lab');
  private ctrlToggleTheme = byId<HTMLButtonElement>('ctrl-toggle-theme');
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

  // TV & Remote Networking
  private appMode: AppMode = 'single';
  private tvHost: TvDisplayHost | null = null;
  private remoteController: RemoteController | null = null;
  private ctrlAimAngle = 45;
  private ctrlAimSpeed = 40;
  private ctrlAimDir: ThrowDirection = 1;
  private ctrlMirrorX = 600;
  private ctrlMirrorY = 230;
  private ctrlMirrorTilt = -25;
  private lastCtrlSendMs = 0;

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
  private showPhysicsVectors = false; // Default Off per v4 ergonomics
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

    // Single-screen sliders
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

    // Remote controller sliders
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
    this.syncOptionsUI();
    this.setupPreviewScene(preview);

    // High-DPI responsive canvas sizing
    const ro = new ResizeObserver(() => this.resizeCanvas());
    ro.observe(this.canvasFrame);
    window.addEventListener('resize', () => this.resizeCanvas());
    this.resizeCanvas();

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && roomParam.trim().length === 4) {
      this.enterControllerMode(roomParam.trim().toUpperCase());
    }

    this.lastFrameMs = performance.now();
    requestAnimationFrame((now) => this.loop(now));
  }

  private resizeCanvas(): void {
    const rect = this.canvasFrame.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;

    const aspect = WORLD_WIDTH / WORLD_HEIGHT;
    let cssW = rect.width;
    let cssH = cssW / aspect;
    if (cssH > rect.height) {
      cssH = rect.height;
      cssW = cssH * aspect;
    }

    cssW = Math.floor(cssW);
    cssH = Math.floor(cssH);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const pixelW = Math.max(320, Math.round(cssW * dpr));
    const pixelH = Math.max(180, Math.round(cssH * dpr));

    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    if (this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas.width = pixelW;
      this.canvas.height = pixelH;
    }
    this.canvasScaleX = pixelW / WORLD_WIDTH;
    this.canvasScaleY = pixelH / WORLD_HEIGHT;
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

  // ==================== Setup Screen (Collapsible Per-Player Accordions) ====================

  private initSetupUI(): void {
    this.setupLocationSelect.innerHTML = '';
    const randomOpt = document.createElement('option');
    randomOpt.value = 'random';
    randomOpt.textContent = 'Random World Tour (15 locations)';
    this.setupLocationSelect.appendChild(randomOpt);

    const cityGroup = document.createElement('optgroup');
    cityGroup.label = 'Iconic Cities (Chicago, Atlanta, NYC…)';
    const wildGroup = document.createElement('optgroup');
    wildGroup.label = 'Natural Terrains';

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
        this.updateMoreOptionsPreview();
      });
      this.setupPlanets.appendChild(btn);
    }

    this.updateMoreOptionsPreview();
    this.renderSetupAccordions();
  }

  private updateMoreOptionsPreview(): void {
    const p = PLANETS[this.config.planetId];
    this.moreOptionsPreview.textContent = `${p.name} · ${this.config.rounds} rounds · ${this.config.triesPerTurn} ${this.config.triesPerTurn === 1 ? 'try' : 'tries'}`;
  }

  private renderSetupAccordions(): void {
    const count = this.config.humanCount;
    if (this.openPlayerAccordion >= count) this.openPlayerAccordion = 0;
    this.botSkillRow.classList.toggle('hidden', count !== 1);

    this.setupPlayersEl.innerHTML = '';

    for (let i = 0; i < count; i++) {
      const charId = this.config.playerCharacters[i] ?? DEFAULT_PLAYER_CHARACTERS[i];
      const ch = CHARACTERS[charId];
      const nameVal = this.config.playerNames[i] || ch.name;
      const isOpen = this.openPlayerAccordion === i;

      const card = document.createElement('div');
      card.className = `player-acc${isOpen ? ' open' : ''}`;

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'player-acc-header';
      header.setAttribute('aria-expanded', String(isOpen));
      header.innerHTML = `
        <canvas class="player-acc-avatar" width="56" height="56"></canvas>
        <div class="player-acc-title-wrap">
          <span class="player-acc-name"></span>
          <span class="player-acc-sub">Player ${i + 1} · ${ch.name} (${ch.title})</span>
        </div>
        <svg class="ui-ico player-acc-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      `;
      header.querySelector<HTMLSpanElement>('.player-acc-name')!.textContent = nameVal;
      renderCharacterAvatar(header.querySelector('canvas')!, charId, this.theme);

      header.addEventListener('click', () => {
        this.openPlayerAccordion = this.openPlayerAccordion === i ? -1 : i;
        this.renderSetupAccordions();
        soundEngine.playTick();
      });

      card.appendChild(header);

      if (isOpen) {
        const body = document.createElement('div');
        body.className = 'player-acc-body';

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 14;
        input.className = 'player-name-input';
        input.value = nameVal;
        input.placeholder = `Player ${i + 1} name`;
        input.setAttribute('aria-label', `Player ${i + 1} name`);
        input.addEventListener('input', () => {
          const clean = input.value.trim() || CHARACTERS[this.config.playerCharacters[i]].name;
          this.config.playerNames[i] = clean;
          header.querySelector<HTMLSpanElement>('.player-acc-name')!.textContent = clean;
        });
        body.appendChild(input);

        const grid = document.createElement('div');
        grid.className = 'avatar-grid';
        for (const cid of CHARACTER_ORDER) {
          const cDef = CHARACTERS[cid];
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `avatar-card${cid === charId ? ' selected' : ''}`;
          btn.innerHTML = `
            <canvas width="64" height="64"></canvas>
            <strong>${cDef.name}</strong>
            <small>${cDef.title}</small>
          `;
          renderCharacterAvatar(btn.querySelector('canvas')!, cid, this.theme);
          btn.addEventListener('click', () => {
            const prevDefault = CHARACTERS[this.config.playerCharacters[i]].name;
            this.config.playerCharacters[i] = cid;
            if (!this.config.playerNames[i] || this.config.playerNames[i] === prevDefault) {
              this.config.playerNames[i] = cDef.name;
            }
            soundEngine.playTick();
            this.renderSetupAccordions();
          });
          grid.appendChild(btn);
        }
        body.appendChild(grid);
        card.appendChild(body);
      }

      this.setupPlayersEl.appendChild(card);
    }

    if (count === 1) {
      const botCard = document.createElement('div');
      botCard.className = 'player-acc';
      botCard.innerHTML = `
        <div class="player-acc-header player-acc-header--static">
          <canvas class="player-acc-avatar" width="56" height="56"></canvas>
          <div class="player-acc-title-wrap">
            <span class="player-acc-name">Robo-Kong</span>
            <span class="player-acc-sub">AI Opponent</span>
          </div>
        </div>
      `;
      renderCharacterAvatar(botCard.querySelector('canvas')!, 'robo-kong', this.theme);
      this.setupPlayersEl.appendChild(botCard);
    }
  }

  // ==================== Mode Tabs & Settings Drawer ====================

  private setActiveTab(tab: ActionTab): void {
    this.activeTab = tab;
    this.modeTabs.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
      const isActive = btn.dataset.mode === tab;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
    this.paneThrow.classList.toggle('hidden', tab !== 'throw');
    this.paneMove.classList.toggle('hidden', tab !== 'move');
    this.paneMirror.classList.toggle('hidden', tab !== 'mirror');
  }

  private setCtrlActiveTab(tab: ActionTab): void {
    this.ctrlModeTabs.querySelectorAll<HTMLButtonElement>('[data-ctrl-mode]').forEach((btn) => {
      const isActive = btn.dataset.ctrlMode === tab;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
    this.ctrlPaneThrow.classList.toggle('hidden', tab !== 'throw');
    this.ctrlPaneMove.classList.toggle('hidden', tab !== 'move');
    this.ctrlPaneMirror.classList.toggle('hidden', tab !== 'mirror');
  }

  private openSettingsDrawer(): void {
    this.syncOptionsUI();
    this.settingsBackdrop.classList.remove('hidden');
    this.settingsBackdrop.setAttribute('aria-hidden', 'false');
  }

  private closeSettingsDrawer(): void {
    this.settingsBackdrop.classList.add('hidden');
    this.settingsBackdrop.setAttribute('aria-hidden', 'true');
  }

  // ==================== Event Bindings ====================

  private bindEvents(): void {
    // Setup modal
    this.setupPlayerCount.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-count]');
      if (!btn) return;
      this.config.humanCount = Number(btn.dataset.count);
      this.setupPlayerCount.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      this.renderSetupAccordions();
    });

    this.setupRounds.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-rounds]');
      if (!btn) return;
      this.config.rounds = Number(btn.dataset.rounds);
      this.setupRounds.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      this.updateMoreOptionsPreview();
    });

    this.setupTries.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tries]');
      if (!btn) return;
      this.config.triesPerTurn = Number(btn.dataset.tries);
      this.setupTries.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      this.updateMoreOptionsPreview();
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
      this.showPhysicsVectors = this.setupLabCheck.checked;
      this.setTheme(this.setupRetroCheck.checked ? 'retro' : 'modern');
      this.syncOptionsUI();
      this.startMatch();
    });

    // Landscape panel collapse / expand
    this.btnPanelCollapse.addEventListener('click', () => {
      this.workspace.classList.add('panel-collapsed');
      this.btnPanelExpand.classList.remove('hidden');
      this.resizeCanvas();
    });
    this.btnPanelExpand.addEventListener('click', () => {
      this.workspace.classList.remove('panel-collapsed');
      this.btnPanelExpand.classList.add('hidden');
      this.resizeCanvas();
    });

    // Settings Drawer
    this.btnSettings.addEventListener('click', () => this.openSettingsDrawer());
    this.btnTvSettings.addEventListener('click', () => this.openSettingsDrawer());
    this.btnCloseSettings.addEventListener('click', () => this.closeSettingsDrawer());
    this.settingsBackdrop.addEventListener('click', (e) => {
      if (e.target === this.settingsBackdrop) this.closeSettingsDrawer();
    });

    // TV & Remote Modal
    const openRemoteModal = () => {
      this.closeSettingsDrawer();
      this.remoteModal.classList.remove('hidden');
    };
    this.btnOpenRemote.addEventListener('click', openRemoteModal);
    this.btnSetupRemote.addEventListener('click', openRemoteModal);
    this.btnCloseRemote.addEventListener('click', () => this.remoteModal.classList.add('hidden'));
    this.btnStartTvHost.addEventListener('click', () => this.startTvHostMode());
    this.btnStopTvHost.addEventListener('click', () => this.stopTvHostMode());
    this.btnTvQrToggle.addEventListener('click', () => {
      this.tvRoomCard.classList.toggle('hidden');
    });
    this.btnJoinController.addEventListener('click', () => this.enterControllerMode(this.inputRoomCode.value));
    this.inputRoomCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.enterControllerMode(this.inputRoomCode.value);
    });

    // Settings Drawer Toggles
    this.btnTheme.addEventListener('click', () => {
      this.setTheme(this.theme === 'modern' ? 'retro' : 'modern');
      this.renderSetupAccordions();
      soundEngine.playTick();
      this.broadcastHostState();
    });
    this.btnHint.addEventListener('click', () => {
      this.showAimHint = !this.showAimHint;
      this.setupHintCheck.checked = this.showAimHint;
      this.syncOptionsUI();
      soundEngine.playTick();
      this.broadcastHostState();
    });
    this.btnSolution.addEventListener('click', () => {
      this.showSolution = !this.showSolution;
      if (this.showSolution) this.refreshVerifiedSolution();
      this.syncOptionsUI();
      soundEngine.playTick();
      this.broadcastHostState();
    });
    this.btnLab.addEventListener('click', () => {
      this.showPhysicsVectors = !this.showPhysicsVectors;
      this.setupLabCheck.checked = this.showPhysicsVectors;
      this.syncOptionsUI();
      soundEngine.playTick();
      this.broadcastHostState();
    });
    this.btnSound.addEventListener('click', () => {
      soundEngine.toggleMute();
      this.syncOptionsUI();
      if (!soundEngine.isMuted()) soundEngine.playTick();
      this.broadcastHostState();
    });
    this.btnNewGame.addEventListener('click', () => {
      this.closeSettingsDrawer();
      this.phase = 'setup';
      this.banana = null;
      this.draftMirror = null;
      this.syncMirrorUI();
      this.setupRetroCheck.checked = this.theme === 'retro';
      this.setupHintCheck.checked = this.showAimHint;
      this.setupLabCheck.checked = this.showPhysicsVectors;
      this.setupMirrorsCheck.checked = this.config.enableMirrors;
      this.gameoverModal.classList.add('hidden');
      this.renderSetupAccordions();
      this.setupModal.classList.remove('hidden');
      this.broadcastHostState();
    });

    // 3-Tab Mode Bar (single-screen)
    this.modeTabs.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mode]');
      if (!btn) return;
      this.setActiveTab(btn.dataset.mode as ActionTab);
      soundEngine.playTick();
    });

    // Throw / Move / Mirror buttons
    this.btnMoveLeft.addEventListener('click', () => this.moveActiveGorilla(-1));
    this.btnMoveRight.addEventListener('click', () => this.moveActiveGorilla(1));
    this.btnDirLeft.addEventListener('click', () => this.setAimDirection(-1));
    this.btnDirRight.addEventListener('click', () => this.setAimDirection(1));

    this.btnPlaceMirror.addEventListener('click', () => this.startDraftMirror());
    this.btnMirrorLock.addEventListener('click', () => {
      this.lockDraftMirror();
      this.setActiveTab('throw');
    });
    this.btnMirrorCancel.addEventListener('click', () => this.cancelDraftMirror());

    this.controlPanel.addEventListener('click', (e) => {
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
        return;
      }
      const mBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mirror-tilt]');
      if (mBtn && this.draftMirror) {
        this.updateDraftMirror(undefined, undefined, this.draftMirror.angleDeg + Number(mBtn.dataset.mirrorTilt));
        soundEngine.playTick();
      }
    });

    this.btnThrow.addEventListener('click', () => {
      if (this.canHumanControl()) this.fireCurrentPlayerBanana();
    });

    // Remote Controller Events
    this.btnCtrlSettings.addEventListener('click', () => {
      this.ctrlOptionsBar.classList.toggle('hidden');
    });
    this.btnCtrlExit.addEventListener('click', () => this.exitControllerMode());
    this.ctrlModeTabs.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-ctrl-mode]');
      if (!btn) return;
      this.setCtrlActiveTab(btn.dataset.ctrlMode as ActionTab);
    });
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
    this.ctrlBtnMirror.addEventListener('click', () => this.sendControllerCommand({ type: 'mirror_start' }));
    this.ctrlMirrorLock.addEventListener('click', () => {
      this.sendControllerCommand({ type: 'mirror_lock' });
      this.setCtrlActiveTab('throw');
    });
    this.ctrlMirrorCancel.addEventListener('click', () => this.sendControllerCommand({ type: 'mirror_cancel' }));

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
    this.ctrlToggleLab.addEventListener('click', () => this.sendControllerCommand({ type: 'toggle', key: 'lab' }));
    this.ctrlToggleTheme.addEventListener('click', () => this.sendControllerCommand({ type: 'toggle', key: 'theme' }));

    // Game Over modal
    this.btnRematch.addEventListener('click', () => {
      this.gameoverModal.classList.add('hidden');
      this.startMatch();
    });
    this.btnChangeSetup.addEventListener('click', () => {
      this.gameoverModal.classList.add('hidden');
      this.phase = 'setup';
      this.renderSetupAccordions();
      this.setupModal.classList.remove('hidden');
      this.broadcastHostState();
    });

    // Canvas pointer drag: in Mirror mode with draft mirror, drag anywhere moves mirror; otherwise grab near mirror or aim!
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.canHumanControl()) return;
      e.preventDefault();
      const { px, py } = this.pointerToWorld(e);

      const nearDraft =
        this.draftMirror &&
        (this.activeTab === 'mirror' ||
          Math.hypot(px - this.draftMirror.x, py - this.draftMirror.y) <= MIRROR_HALF_LENGTH + 38);

      if (nearDraft) {
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
      if (e.key === 'Escape') {
        this.closeSettingsDrawer();
        this.remoteModal.classList.add('hidden');
        return;
      }
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
        if (this.draftMirror) {
          this.lockDraftMirror();
          this.setActiveTab('throw');
        } else {
          this.setActiveTab('mirror');
          this.startDraftMirror();
        }
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

    const opp = this.players.find((p) => p.id !== active.id);
    const defaultX = opp ? Math.round((active.x + opp.x) / 2) : 600;
    const defaultY = 230;
    const defaultTilt = active.x < defaultX ? -25 : 25;

    this.draftMirror = {
      id: this.nextMirrorId++,
      x: clamp(defaultX, 120, WORLD_WIDTH - 120),
      y: clamp(defaultY, 100, WORLD_HEIGHT - 190),
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
      this.draftMirror.x = Math.round(clamp(x, 85, WORLD_WIDTH - 85));
    }
    if (y !== undefined) {
      this.draftMirror.y = Math.round(clamp(y, 80, WORLD_HEIGHT - 120));
    }
    if (angleDeg !== undefined) {
      this.draftMirror.angleDeg = Math.round(clamp(angleDeg, MIN_MIRROR_TILT, MAX_MIRROR_TILT));
      this.mirrorTiltSlider.setValue(this.draftMirror.angleDeg);
      this.mirrorTiltVal.textContent = `${this.draftMirror.angleDeg >= 0 ? '+' : ''}${this.draftMirror.angleDeg}°`;
    }
    if (this.showSolution) {
      this.refreshVerifiedSolution();
      this.syncSolutionReadout();
    }
    this.broadcastHostState();
  }

  private lockDraftMirror(): void {
    if (!this.draftMirror) return;
    this.draftMirror.locked = true;
    this.mirrors.push(this.draftMirror);
    if (this.mirrors.length > MAX_MIRRORS_PER_ROUND) {
      this.mirrors.shift();
    }
    this.draftMirror = null;
    this.mirrorPlacedThisTurn = true;
    this.syncMirrorUI();
    soundEngine.playMirrorPing(1);
    this.showToast('Mirror locked for this round!', 1.8);
    if (this.showSolution) {
      this.refreshVerifiedSolution();
      this.syncSolutionReadout();
    }
    this.broadcastHostState();
  }

  private cancelDraftMirror(): void {
    this.draftMirror = null;
    this.syncMirrorUI();
    soundEngine.playTick();
    if (this.showSolution) {
      this.refreshVerifiedSolution();
      this.syncSolutionReadout();
    }
    this.broadcastHostState();
  }

  private syncMirrorUI(): void {
    const countText = `${this.mirrors.length}/${MAX_MIRRORS_PER_ROUND}`;
    this.mirrorTabBadge.textContent = countText;
    this.mirrorCountLabel.textContent = `${this.mirrors.length} / ${MAX_MIRRORS_PER_ROUND} mirrors this round`;

    const hasDraft = Boolean(this.draftMirror);
    this.mirrorIdleBox.classList.toggle('hidden', hasDraft);
    this.mirrorDraftBox.classList.toggle('hidden', !hasDraft);

    const mirrorTabBtn = this.modeTabs.querySelector<HTMLButtonElement>('[data-mode="mirror"]');
    mirrorTabBtn?.classList.toggle('has-draft', hasDraft);

    const canPlace = this.canPlaceMirrorNow();
    this.btnPlaceMirror.disabled = !canPlace;
    const span = this.btnPlaceMirror.querySelector('span');
    if (span) {
      span.textContent = !this.config.enableMirrors
        ? 'Mirrors Off'
        : this.mirrorPlacedThisTurn
          ? 'Placed This Turn ✓'
          : 'Place Mirror';
    }
  }

  // ==================== TV Display & Remote Controller Mode ====================

  private startTvHostMode(): void {
    this.appMode = 'tv-host';
    this.tvHostStatus.textContent = 'Opening room...';
    this.btnStartTvHost.disabled = true;

    this.tvHost?.destroy();
    this.tvHost = new TvDisplayHost({
      onReady: (code, qrDataUrl) => {
        this.btnStartTvHost.disabled = false;
        this.btnStartTvHost.classList.add('hidden');
        this.btnStopTvHost.classList.remove('hidden');
        this.tvRoomCodeEl.textContent = code;
        this.tvCodePill.textContent = code;
        if (qrDataUrl) {
          this.tvQrImg.src = qrDataUrl;
          this.tvQrImg.classList.remove('hidden');
        } else {
          this.tvQrImg.classList.add('hidden');
        }
        this.tvStatusStrip.classList.remove('hidden');
        this.tvRoomCard.classList.remove('hidden');
        this.tvHostStatus.textContent = `Room ${code} is live. Scan QR on your phone or tablet.`;
        this.syncOptionsUI();
        this.remoteModal.classList.add('hidden');
        this.resizeCanvas();
        if (this.phase === 'setup') this.startMatch();
        else {
          this.updateStatusHeaders();
          this.broadcastHostState();
        }
      },
      onClientCountChange: (count) => {
        this.tvClientBadge.textContent = count === 1 ? '1 remote connected' : `${count} remotes connected`;
        this.appShell.classList.toggle('is-tv-connected', this.appMode === 'tv-host' && count > 0);
        if (count > 0) {
          this.tvRoomCard.classList.add('hidden'); // Clear sky automatically once remote connects!
          this.showToast('Remote connected — pass the device around!', 2.2);
          this.broadcastHostState();
        } else if (this.appMode === 'tv-host') {
          this.tvRoomCard.classList.remove('hidden');
        }
        this.resizeCanvas();
      },
      onCommand: (cmd) => this.handleControllerCommand(cmd),
      onError: (msg) => {
        this.btnStartTvHost.disabled = false;
        this.tvHostStatus.textContent = msg;
      },
    });
    this.tvHost.start();
  }

  private stopTvHostMode(): void {
    this.tvHost?.destroy();
    this.tvHost = null;
    this.appMode = 'single';
    this.appShell.classList.remove('is-tv-connected');
    this.tvStatusStrip.classList.add('hidden');
    this.tvRoomCard.classList.add('hidden');
    this.syncMirrorUI();
    this.btnStartTvHost.classList.remove('hidden');
    this.btnStopTvHost.classList.add('hidden');
    this.tvHostStatus.textContent = 'TV Display Mode stopped.';
    this.syncOptionsUI();
    this.resizeCanvas();
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
        this.syncOptionsUI();
      } else if (cmd.key === 'solution') {
        this.showSolution = !this.showSolution;
        if (this.showSolution) this.refreshVerifiedSolution();
        this.syncOptionsUI();
      } else if (cmd.key === 'lab') {
        this.showPhysicsVectors = !this.showPhysicsVectors;
        this.syncOptionsUI();
      } else if (cmd.key === 'sound') {
        soundEngine.toggleMute();
        this.syncOptionsUI();
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

  private formatSolutionSummary(): string | undefined {
    if (!this.showSolution) return undefined;
    const sol = this.verifiedSolution;
    if (!sol) return 'Walk or place a Mirror';
    const dir = sol.direction > 0 ? '→' : '←';
    const bank = sol.bounces > 0 ? ' · Bank' : '';
    return `${sol.angleDeg}° · ${sol.speed} m/s ${dir}${bank}`;
  }

  private broadcastHostState(): void {
    if (this.appMode !== 'tv-host' || !this.tvHost) return;
    const active = this.players[this.activePlayerIndex];
    const planet = PLANETS[this.config.planetId];
    const loc = this.terrain.location;

    const snapshot: ControllerStateSnapshot = {
      type: 'state',
      phase: this.phase,
      round: this.currentRound,
      totalRounds: this.config.rounds,
      locationName: loc.name,
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
      showPhysicsLab: this.showPhysicsVectors,
      theme: this.theme,
      muted: soundEngine.isMuted(),
      scores: this.players.map((p, idx) => ({
        name: p.name,
        color: p.color,
        score: p.score,
        active: idx === this.activePlayerIndex,
      })),
      solutionSummary: this.formatSolutionSummary(),
      winnerText: this.phase === 'game_over' ? this.gameoverWinnerLine.textContent ?? '' : undefined,
    };
    this.tvHost.broadcast(snapshot);
  }

  private enterControllerMode(rawCode: string): void {
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (code.length !== 4) {
      this.inputRoomCode.focus();
      return;
    }

    this.tvHost?.destroy();
    this.tvHost = null;
    this.appMode = 'controller';

    this.setupModal.classList.add('hidden');
    this.remoteModal.classList.add('hidden');
    this.gameoverModal.classList.add('hidden');
    this.closeSettingsDrawer();
    this.appShell.classList.add('hidden');
    this.controllerView.classList.remove('hidden');

    this.remoteController?.destroy();
    this.remoteController = new RemoteController({
      onStatus: (_status, msg) => {
        this.ctrlStatusBar.textContent = msg;
      },
      onState: (snap) => this.applyControllerSnapshot(snap),
    });
    this.remoteController.connect(code);
  }

  private exitControllerMode(): void {
    this.remoteController?.destroy();
    this.remoteController = null;
    this.appMode = 'single';
    this.controllerView.classList.add('hidden');
    this.appShell.classList.remove('hidden');
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
    this.resizeCanvas();
  }

  private sendControllerCommand(cmd: ControllerCommand): void {
    this.remoteController?.send(cmd);
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
          ? `${snap.activePlayerName} is aiming…`
          : `${snap.activePlayerName}'s Turn`;
    this.ctrlMetaLine.textContent =
      snap.phase === 'game_over'
        ? snap.winnerText ?? 'See TV for awards'
        : `${ch.name} · Round ${snap.round}/${snap.totalRounds}`;

    this.ctrlLocationChip.textContent = snap.locationName;
    this.ctrlWindChip.textContent =
      Math.abs(snap.windAccel) < 0.25
        ? 'Calm'
        : `Wind ${snap.windAccel > 0 ? '→' : '←'} ${Math.abs(snap.windAccel).toFixed(1)}`;
    const tryNum = snap.triesTotal - snap.triesLeft + 1;
    this.ctrlTriesChip.textContent = `Try ${Math.min(tryNum, snap.triesTotal)}/${snap.triesTotal}`;
    this.ctrlTriesChip.classList.toggle('hidden', snap.triesTotal <= 1);
    this.ctrlMoveLabel.textContent = `${snap.movesLeft} steps left`;

    // Mirror pane state
    const hasDraft = Boolean(snap.draftMirror);
    this.ctrlMirrorBadge.textContent = `${snap.mirrorCount}/${MAX_MIRRORS_PER_ROUND}`;
    this.ctrlMirrorIdle.classList.toggle('hidden', hasDraft);
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
    this.ctrlBtnMirror.textContent = snap.canPlaceMirror
      ? '+ Place Mirror on TV'
      : 'Mirror Placed ✓';

    // Solution pill on Throw pane
    if (snap.showSolution && snap.solutionSummary) {
      this.ctrlSolutionPill.textContent = `✓ ${snap.solutionSummary}`;
      this.ctrlSolutionPill.classList.remove('hidden');
    } else {
      this.ctrlSolutionPill.classList.add('hidden');
    }

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
    this.ctrlToggleLab.textContent = `Vectors: ${snap.showPhysicsLab ? 'On' : 'Off'}`;
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
    this.syncOptionsUI();
  }

  private syncOptionsUI(): void {
    const code = this.tvHost?.getRoomCode();
    this.drawerTvVal.textContent = this.appMode === 'tv-host' && code ? `Room ${code}` : 'Off';
    this.drawerTvVal.classList.toggle('active', this.appMode === 'tv-host');

    this.drawerThemeVal.textContent = this.theme === 'modern' ? 'Modern' : "Retro '90s";

    this.drawerHintVal.textContent = this.showAimHint ? 'On' : 'Off';
    this.drawerHintVal.classList.toggle('active', this.showAimHint);
    this.btnHint.setAttribute('aria-pressed', String(this.showAimHint));

    this.drawerSolutionVal.textContent = this.showSolution ? 'On' : 'Off';
    this.drawerSolutionVal.classList.toggle('active', this.showSolution);
    this.btnSolution.setAttribute('aria-pressed', String(this.showSolution));

    this.drawerLabVal.textContent = this.showPhysicsVectors ? 'On' : 'Off';
    this.drawerLabVal.classList.toggle('active', this.showPhysicsVectors);
    this.btnLab.setAttribute('aria-pressed', String(this.showPhysicsVectors));

    const soundOn = !soundEngine.isMuted();
    this.drawerSoundVal.textContent = soundOn ? 'On' : 'Off';
    this.drawerSoundVal.classList.toggle('active', soundOn);
    this.btnSound.setAttribute('aria-pressed', String(soundOn));

    this.syncSolutionReadout();
  }

  private syncSolutionReadout(): void {
    const summary = this.formatSolutionSummary();
    if (this.showSolution && summary) {
      this.drawerSolutionReadout.textContent = `Solution: ${summary}`;
      this.drawerSolutionReadout.classList.remove('hidden');
      this.panelSolutionPill.textContent = `✓ ${summary}`;
      this.panelSolutionPill.classList.remove('hidden');
    } else {
      this.drawerSolutionReadout.classList.add('hidden');
      this.panelSolutionPill.classList.add('hidden');
    }
  }

  private updateStatusHeaders(): void {
    const active = this.players[this.activePlayerIndex];
    const loc = this.terrain.location;
    const planet = PLANETS[this.config.planetId];
    const tryNum = this.config.triesPerTurn - this.triesRemaining + 1;
    const windStr =
      Math.abs(this.windAccel) < 0.25
        ? 'Calm'
        : `Wind ${this.windAccel > 0 ? '→' : '←'} ${Math.abs(this.windAccel).toFixed(1)}`;
    const planetSuffix = planet.id !== 'earth' ? ` · ${planet.name}` : '';

    if (active) {
      this.turnDot.style.background = active.color;
      this.turnPlayerName.textContent = active.isBot ? `${active.name} (Bot)` : active.name;
      this.tvTurnDot.style.background = active.color;
      this.tvTurnName.textContent = active.name;
    }

    const tryText = `Try ${Math.min(tryNum, this.config.triesPerTurn)}/${this.config.triesPerTurn}`;
    this.triesBadge.textContent = tryText;
    this.triesBadge.classList.toggle('hidden', this.config.triesPerTurn <= 1);
    this.tvTriesChip.textContent = tryText;
    this.tvTriesChip.classList.toggle('hidden', this.config.triesPerTurn <= 1);

    this.panelMetaLine.textContent = `R${this.currentRound}/${this.config.rounds} · ${loc.name}${planetSuffix} · ${windStr}`;
    this.tvRoundChip.textContent = `Round ${this.currentRound}/${this.config.rounds} · ${loc.name}${planetSuffix}`;
    this.tvWindChip.textContent = windStr;
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
      this.spawnFloatingText(active.x, active.y - 90, 'No steps left!', '#fed7aa', 0.9);
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
      this.spawnFloatingText(active.x, active.y - 90, reasonMsg, '#fca5a5', 0.9);
      return;
    }

    active.x = result.x;
    active.y = result.y;
    this.movesRemaining--;

    soundEngine.playStep(result.dropped);
    if (result.dropped) {
      this.spawnDustPuff(active.x, active.y);
      this.spawnFloatingText(active.x, active.y - 90, 'Dropped down!', '#bae6fd', 0.85);
    }

    this.updateMoveUI();
    if (this.showSolution) {
      this.refreshVerifiedSolution();
      this.syncSolutionReadout();
    }
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
    this.moveLabel.textContent = `${this.movesRemaining} steps left`;
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
    if (changed && this.showSolution) {
      this.refreshVerifiedSolution();
      this.syncSolutionReadout();
    }
    this.broadcastHostState();
  }

  private setAimAngle(angle: number): void {
    const clamped = Math.round(clamp(Number.isFinite(angle) ? angle : 45, MIN_ANGLE, MAX_ANGLE));
    this.aimAngle = clamped;
    this.angleSlider.setValue(clamped);
    this.angleValLabel.textContent = `${clamped}°`;
    const active = this.players[this.activePlayerIndex];
    if (active) active.preferredAngle = clamped;
    this.broadcastHostState();
  }

  private setAimSpeed(speed: number): void {
    const clamped = Math.round(clamp(Number.isFinite(speed) ? speed : 40, MIN_SPEED, MAX_SPEED));
    this.aimSpeed = clamped;
    this.speedSlider.setValue(clamped);
    this.speedValLabel.textContent = `${clamped} m/s`;
    const active = this.players[this.activePlayerIndex];
    if (active) active.preferredSpeed = clamped;
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
    this.resizeCanvas();
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
    this.mirrors = [];
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
    this.setActiveTab('throw');
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

    this.updateStatusHeaders();
    this.setControlsEnabled(!active.isBot);
    this.updateMoveUI();
    this.syncMirrorUI();
    this.renderScoreboardStrip();

    if (this.showSolution) this.refreshVerifiedSolution();
    else this.verifiedSolution = null;
    this.syncSolutionReadout();

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
    this.btnPlaceMirror.disabled = !enabled || !this.canPlaceMirrorNow();
    this.angleSlider.setDisabled(!enabled);
    this.speedSlider.setDisabled(!enabled);
    this.controlPanel.querySelectorAll<HTMLButtonElement>('.nudge-btn').forEach((b) => {
      b.disabled = !enabled;
    });
    this.btnThrow.disabled = !enabled;
  }

  private renderScoreboardStrip(): void {
    const html = this.players
      .map(
        (p, idx) =>
          `<div class="score-pill${idx === this.activePlayerIndex ? ' active' : ''}"><span class="score-swatch" style="background:${p.color}"></span><span>${p.name}</span><span>${p.score}</span></div>`,
      )
      .join('');
    this.scoreboardStrip.innerHTML = html;
    this.tvScoresRow.innerHTML = html;
  }

  private showToast(msg: string, duration = 2.0): void {
    this.toastBanner.textContent = msg;
    this.toastBanner.classList.remove('hidden');
    this.toastTimer = duration;
  }

  private fireCurrentPlayerBanana(): void {
    const active = this.players[this.activePlayerIndex];
    if (!active) return;

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
            b.y - 24,
            b.bounces > 1 ? `CHAIN ×${b.bounces}!` : 'REFLECT!',
            '#7dd3fc',
            1.05,
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

      if (!b.hitSun && Math.hypot(b.x - SUN_X, b.y - SUN_Y) <= SUN_RADIUS + BANANA_RADIUS) {
        b.hitSun = true;
        this.sunShocked = true;
        if (owner) {
          owner.sunBonks++;
          owner.score += SCORE_SUN_BONK;
        }
        soundEngine.playSunBonk();
        this.spawnFloatingText(SUN_X, SUN_Y + 42, `SUN BONK! +${SCORE_SUN_BONK}`, '#fde047', 1.05);
        this.renderScoreboardStrip();
      }

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
    }

    this.triesRemaining--;
    const retryNote =
      this.triesRemaining > 0
        ? ` · ${this.triesRemaining} ${this.triesRemaining === 1 ? 'try' : 'tries'} left`
        : '';
    this.showToast(
      (planet.id === 'moon' ? 'Into lunar orbit!' : 'Over the skyline!') + retryNote,
      1.7,
    );
    this.phase = 'exploding';
    this.postShotTimer = 0.8;
    this.broadcastHostState();
  }

  private resolveImpact(ix: number, iy: number, directTarget: Player | null): void {
    const b = this.banana;
    if (!b) return;
    b.active = false;

    const owner = this.players.find((p) => p.id === b.ownerId)!;
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
        this.spawnFloatingText(ix, iy - 34, 'SELF-BONK!', '#fca5a5', 1.15);
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
          bonuses.push(`+${bankBonus} Bank`);
        }
        if (this.config.triesPerTurn > 1 && isFirstTryOfTurn) {
          gained += SCORE_FIRST_TRY_BONUS;
          bonuses.push(`+${SCORE_FIRST_TRY_BONUS} 1st Try`);
        }
        if (distanceMeters >= LONG_SHOT_METERS) {
          gained += SCORE_LONG_SHOT_BONUS;
          bonuses.push(`+${SCORE_LONG_SHOT_BONUS} Long`);
        }
        owner.score += gained;
        owner.animation = 'celebrate';
        directTarget.animation = 'ouch';
        this.pendingRespawnIds.push(directTarget.id);

        soundEngine.playGorillaHit(this.theme);
        this.triggerShake(10, 0.45);
        this.spawnExplosionParticles(ix, iy, '#fde047', 56);
        this.spawnFloatingText(ix, iy - 38, `HIT! +${gained}`, '#fde047', 1.25);
        const bonusStr = bonuses.length > 0 ? ` (${bonuses.join(', ')})` : '';
        this.showToast(`${owner.name} hit ${directTarget.name}! +${gained}${bonusStr}`, 2.3);
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
        this.spawnFloatingText(ix, iy - 28, `CLOSE! +${SCORE_SPLASH_HIT}`, '#fed7aa', 1.1);
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
      bounces: b.bounces,
      outcome,
    };

    this.renderScoreboardStrip();
    this.phase = 'exploding';
    this.postShotTimer = outcome === 'hit' ? 1.45 : 0.75;
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
      this.showToast(`Round ${this.currentRound}: ${loc.name}, ${loc.region}`, 2.4);
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
        ? `Tie between ${winners.map((w) => w.name).join(' & ')} (${topScore} pts)!`
        : `${winners[0].name} wins with ${topScore} points!`;

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
            <div class="standing-meta">${p.hits} hit${p.hits === 1 ? '' : 's'} · ${p.splashHits} close${p.bankShotHits > 0 ? ` · ${p.bankShotHits} bank${p.bankShotHits === 1 ? '' : 's'}` : ''}</div>
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
      life: 1.35,
      maxLife: 1.35,
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
      this.ctx.setTransform(this.canvasScaleX, 0, 0, this.canvasScaleY, 0, 0);
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
        showPhysicsLab: this.showPhysicsVectors,
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

    requestAnimationFrame((now) => this.loop(now));
  }
}

new GorillaPhysicsGame();
