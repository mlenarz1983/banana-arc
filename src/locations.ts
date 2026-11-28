import { WORLD_HEIGHT, WORLD_WIDTH } from './constants';
import type { ConcreteLocationId, LocationSpec, PolyStyle, RectStyle, TerrainShape, Vec2 } from './types';

const H = WORLD_HEIGHT;

// Scale factor so all buildings/landscapes sit cleanly inside the bottom ~25% of the stage (~170px),
// leaving ~75% wide-open sky for finger dragging, high parabolic arcs, and angled mirrors!
const SCALE = 0.44;
const sh = (rawH: number): number => Math.round(rawH * SCALE);
const sy = (rawH: number): number => H - sh(rawH);

function bld(
  x: number,
  w: number,
  rawH: number,
  colorIndex: number,
  style: RectStyle = 'building',
  seed = x * 13 + rawH,
  accent?: string,
): TerrainShape {
  const height = sh(rawH);
  return {
    kind: 'rect',
    x,
    y: H - height,
    width: w,
    height,
    colorIndex,
    style,
    windowSeed: seed,
    accent,
  };
}

function poly(
  points: Array<{ x: number; h: number }>,
  colorIndex: number,
  style: PolyStyle = 'landmark',
  accent?: string,
): TerrainShape {
  return {
    kind: 'poly',
    points: points.map((p): Vec2 => ({ x: p.x, y: sy(p.h) })),
    colorIndex,
    style,
    accent,
  };
}

function makeChicago(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 122, 150, 2, 'deck', 10),
    { kind: 'rect', x: 34, y: sy(196), width: 58, height: sh(46), colorIndex: 2, style: 'bean' },
    // John Hancock Center — tapered trapezoid with X-bracing + twin white spires
    poly(
      [
        { x: 122, h: 0 },
        { x: 140, h: 330 },
        { x: 214, h: 330 },
        { x: 232, h: 0 },
      ],
      0,
      'xbrace-taper',
      '#1e242b',
    ),
    bld(156, 5, 395, 0, 'beacon-spire', 11, '#f8fafc'),
    bld(192, 5, 395, 0, 'beacon-spire', 12, '#f8fafc'),
    bld(232, 90, 185, 1),
    // Marina City twin corncobs
    bld(326, 56, 255, 2, 'corncob', 31, '#cbd5e1'),
    bld(388, 56, 255, 2, 'corncob', 32, '#cbd5e1'),
    bld(448, 86, 170, 3),
    // Willis (Sears) Tower asymmetric bundled setbacks + twin broadcast masts
    bld(534, 134, 240, 0, 'building', 50, '#181c22'),
    bld(534, 102, 300, 0, 'building', 51, '#181c22'),
    bld(558, 78, 350, 0, 'building', 52, '#181c22'),
    bld(572, 50, 385, 0, 'building', 53, '#181c22'),
    bld(582, 5, 445, 0, 'beacon-spire', 54, '#f8fafc'),
    bld(606, 5, 445, 0, 'beacon-spire', 55, '#f8fafc'),
    // Aon Center
    bld(674, 88, 295, 2, 'glass-cylinder', 60, '#cbd5e1'),
    // Crain Communications ("Diamond Building")
    bld(768, 92, 235, 1),
    poly(
      [
        { x: 768, h: 235 },
        { x: 814, h: 310 },
        { x: 860, h: 235 },
      ],
      1,
      'diamond-roof',
      '#e2e8f0',
    ),
    bld(866, 94, 215, 2),
    bld(886, 54, 265, 2),
    bld(910, 5, 310, 2, 'beacon-spire', 70, '#e2e8f0'),
    bld(960, 118, 195, 3),
    bld(1078, 122, 155, 0),
  ];
  return {
    id: 'chicago',
    name: 'Chicago',
    region: 'USA',
    category: 'city',
    skyMood: 'twilight',
    backdrop: 'lake-michigan',
    shapes,
    spawnSpots: [
      { x: 64, y: sy(196) },
      { x: 277, y: sy(185) },
      { x: 490, y: sy(170) },
      { x: 718, y: sy(295) },
      { x: 1018, y: sy(195) },
      { x: 1138, y: sy(155) },
    ],
  };
}

function makeAtlanta(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 116, 165, 3),
    // 191 Peachtree Tower twin crowns
    bld(116, 102, 265, 1, 'twin-crown', 21, '#d6cfc2'),
    bld(218, 96, 185, 0),
    // Westin Peachtree Plaza glass cylinder
    bld(314, 92, 325, 2, 'glass-cylinder', 35, '#3b6e8c'),
    bld(340, 40, 348, 2, 'dome', 36, '#93c5fd'),
    bld(406, 90, 195, 1),
    // Bank of America Plaza rose-terracotta + gilded open-lattice spire
    bld(496, 116, 255, 3, 'building', 41, '#7c4a3e'),
    bld(512, 84, 305, 3, 'building', 42, '#8b5548'),
    poly(
      [
        { x: 522, h: 305 },
        { x: 554, h: 418 },
        { x: 586, h: 305 },
      ],
      3,
      'gold-lattice',
      '#fbbf24',
    ),
    bld(551, 5, 438, 3, 'beacon-spire', 43, '#fde047'),
    bld(612, 106, 190, 0),
    // One Atlantic Center granite + copper-gold peak
    bld(718, 102, 290, 3, 'building', 55, '#6b5b52'),
    poly(
      [
        { x: 722, h: 290 },
        { x: 769, h: 368 },
        { x: 816, h: 290 },
      ],
      3,
      'gold-lattice',
      '#f59e0b',
    ),
    // Truist Plaza golden crown
    bld(820, 102, 260, 1, 'gold-crown', 62),
    bld(922, 134, 195, 2),
    bld(1056, 144, 160, 0),
  ];
  return {
    id: 'atlanta',
    name: 'Atlanta',
    region: 'USA',
    category: 'city',
    skyMood: 'sunset',
    backdrop: 'city-depth',
    shapes,
    spawnSpots: [
      { x: 58, y: sy(165) },
      { x: 266, y: sy(185) },
      { x: 451, y: sy(195) },
      { x: 665, y: sy(190) },
      { x: 988, y: sy(195) },
      { x: 1126, y: sy(160) },
    ],
  };
}

function makeNYC(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 80, 165, 0),
    bld(80, 36, 260, 3, 'bridge-tower', 11, '#8c7a6b'),
    bld(116, 118, 152, 3, 'bridge-deck', 12, '#64748b'),
    bld(234, 36, 260, 3, 'bridge-tower', 13, '#8c7a6b'),
    bld(270, 96, 215, 1),
    bld(366, 94, 265, 2),
    // Empire State Building
    bld(460, 114, 265, 0),
    bld(476, 82, 330, 0),
    bld(494, 46, 376, 0),
    bld(513, 6, 440, 0, 'beacon-spire', 20, '#e2e8f0'),
    bld(574, 90, 200, 1),
    // Chrysler Building
    bld(664, 92, 265, 2),
    poly(
      [
        { x: 672, h: 265 },
        { x: 710, h: 378 },
        { x: 748, h: 265 },
      ],
      2,
      'diamond-roof',
      '#f1f5f9',
    ),
    bld(756, 102, 220, 3),
    // One World Trade Center
    poly(
      [
        { x: 858, h: 0 },
        { x: 874, h: 355 },
        { x: 946, h: 355 },
        { x: 962, h: 0 },
      ],
      2,
      'shard',
      '#60a5fa',
    ),
    bld(907, 5, 425, 2, 'beacon-spire', 44, '#f8fafc'),
    bld(962, 118, 205, 0),
    bld(1080, 120, 168, 1),
  ];
  return {
    id: 'nyc',
    name: 'New York City',
    region: 'USA',
    category: 'city',
    skyMood: 'sunset',
    backdrop: 'city-depth',
    cables: [
      { x1: 18, y1: sy(152), x2: 98, y2: sy(255), sag: 14, color: '#cbd5e1', suspenderCount: 5, deckY: sy(152) },
      { x1: 98, y1: sy(255), x2: 252, y2: sy(255), sag: 32, color: '#cbd5e1', suspenderCount: 9, deckY: sy(152) },
      { x1: 252, y1: sy(255), x2: 310, y2: sy(152), sag: 12, color: '#cbd5e1', suspenderCount: 4, deckY: sy(152) },
    ],
    shapes,
    spawnSpots: [
      { x: 42, y: sy(165) },
      { x: 175, y: sy(152) },
      { x: 318, y: sy(215) },
      { x: 619, y: sy(200) },
      { x: 808, y: sy(220) },
      { x: 1020, y: sy(205) },
      { x: 1140, y: sy(168) },
    ],
  };
}

function makeSanFrancisco(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 365, 134, 3, 'bridge-deck', 10, '#c0392b'),
    bld(78, 30, 290, 3, 'bridge-tower', 11, '#c0392b'),
    bld(266, 30, 290, 3, 'bridge-tower', 12, '#c0392b'),
    bld(365, 102, 195, 1),
    bld(467, 94, 240, 0),
    bld(572, 92, 200, 2, 'building', 30, '#cbd5e1'),
    poly(
      [
        { x: 562, h: 0 },
        { x: 618, h: 392 },
        { x: 674, h: 0 },
      ],
      2,
      'transamerica',
      '#f1f5f9',
    ),
    bld(674, 92, 210, 0),
    bld(766, 98, 330, 2, 'glass-cylinder', 45, '#64748b'),
    bld(776, 78, 356, 2, 'dome', 46, '#bae6fd'),
    bld(864, 114, 240, 3),
    bld(978, 110, 198, 1),
    bld(1088, 112, 165, 0),
  ];
  return {
    id: 'san-francisco',
    name: 'San Francisco',
    region: 'USA',
    category: 'city',
    skyMood: 'sunset',
    backdrop: 'bay-water',
    cables: [
      { x1: 4, y1: sy(134), x2: 93, y2: sy(285), sag: 20, color: '#e74c3c', suspenderCount: 6, deckY: sy(134) },
      { x1: 93, y1: sy(285), x2: 281, y2: sy(285), sag: 48, color: '#e74c3c', suspenderCount: 12, deckY: sy(134) },
      { x1: 281, y1: sy(285), x2: 360, y2: sy(134), sag: 20, color: '#e74c3c', suspenderCount: 5, deckY: sy(134) },
    ],
    shapes,
    spawnSpots: [
      { x: 42, y: sy(134) },
      { x: 186, y: sy(134) },
      { x: 415, y: sy(195) },
      { x: 720, y: sy(210) },
      { x: 920, y: sy(240) },
      { x: 1142, y: sy(165) },
    ],
  };
}

function makeSeattle(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 118, 168, 2),
    bld(118, 108, 212, 0),
    bld(226, 132, 145, 1),
    poly(
      [
        { x: 258, h: 145 },
        { x: 280, h: 295 },
        { x: 304, h: 295 },
        { x: 326, h: 145 },
      ],
      2,
      'landmark',
      '#e2e8f0',
    ),
    { kind: 'rect', x: 238, y: sy(322), width: 108, height: sh(27), colorIndex: 2, style: 'deck', accent: '#f8fafc' },
    { kind: 'rect', x: 256, y: sy(338), width: 72, height: sh(16), colorIndex: 2, style: 'deck', accent: '#38bdf8' },
    bld(289, 5, 395, 2, 'beacon-spire', 20, '#f8fafc'),
    bld(358, 112, 208, 3),
    bld(470, 108, 260, 0),
    bld(578, 118, 340, 0, 'building', 35, '#1e293b'),
    bld(600, 74, 376, 0, 'building', 36, '#1e293b'),
    bld(696, 108, 245, 1),
    bld(804, 112, 210, 2),
    bld(916, 136, 185, 3),
    bld(1052, 148, 155, 1),
  ];
  return {
    id: 'seattle',
    name: 'Seattle',
    region: 'USA',
    category: 'city',
    skyMood: 'twilight',
    backdrop: 'mt-rainier',
    shapes,
    spawnSpots: [
      { x: 60, y: sy(168) },
      { x: 172, y: sy(212) },
      { x: 414, y: sy(208) },
      { x: 750, y: sy(245) },
      { x: 984, y: sy(185) },
      { x: 1126, y: sy(155) },
    ],
  };
}

function makeStLouis(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 125, 175, 3),
    bld(125, 110, 238, 0),
    bld(235, 115, 185, 1),
    bld(350, 500, 120, 2, 'deck'),
    {
      kind: 'arch',
      cx: 600,
      baseY: sy(120),
      outerRx: 175,
      outerRy: sh(275),
      thickness: 16,
      colorIndex: 2,
      style: 'gateway-arch',
    },
    bld(850, 115, 210, 0),
    bld(965, 115, 250, 1),
    bld(1080, 120, 180, 3),
  ];
  return {
    id: 'st-louis',
    name: 'St. Louis',
    region: 'USA',
    category: 'city',
    skyMood: 'sunset',
    backdrop: 'city-depth',
    shapes,
    spawnSpots: [
      { x: 64, y: sy(175) },
      { x: 180, y: sy(238) },
      { x: 292, y: sy(185) },
      { x: 600, y: sy(120) },
      { x: 908, y: sy(210) },
      { x: 1022, y: sy(250) },
      { x: 1140, y: sy(180) },
    ],
  };
}

function makeParis(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 115, 165, 3),
    bld(115, 110, 212, 3, 'gold-crown'),
    bld(225, 125, 175, 1),
    bld(350, 130, 160, 2),
    bld(480, 240, 120, 3, 'deck'),
    {
      kind: 'arch',
      cx: 600,
      baseY: sy(120),
      outerRx: 72,
      outerRy: sh(68),
      thickness: 18,
      colorIndex: 3,
      style: 'eiffel-base',
    },
    poly(
      [
        { x: 536, h: 172 },
        { x: 588, h: 405 },
        { x: 612, h: 405 },
        { x: 664, h: 172 },
      ],
      3,
      'eiffel-lattice',
      '#8c6248',
    ),
    bld(597, 5, 434, 3, 'beacon-spire', 80, '#fde047'),
    bld(720, 125, 170, 1),
    bld(845, 115, 200, 2),
    bld(960, 108, 285, 0),
    bld(1068, 132, 175, 3),
  ];
  return {
    id: 'paris',
    name: 'Paris',
    region: 'France',
    category: 'city',
    skyMood: 'sunset',
    backdrop: 'city-depth',
    shapes,
    spawnSpots: [
      { x: 58, y: sy(165) },
      { x: 170, y: sy(212) },
      { x: 288, y: sy(175) },
      { x: 415, y: sy(160) },
      { x: 782, y: sy(170) },
      { x: 902, y: sy(200) },
      { x: 1134, y: sy(175) },
    ],
  };
}

function makeLondon(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 112, 170, 3),
    bld(112, 70, 305, 3, 'clock'),
    poly(
      [
        { x: 112, h: 305 },
        { x: 147, h: 375 },
        { x: 182, h: 305 },
      ],
      3,
      'gold-lattice',
      '#a16207',
    ),
    bld(182, 118, 185, 1),
    poly(
      [
        { x: 315, h: 0 },
        { x: 304, h: 170 },
        { x: 316, h: 255 },
        { x: 348, h: 295 },
        { x: 380, h: 255 },
        { x: 392, h: 170 },
        { x: 381, h: 0 },
      ],
      2,
      'gherkin',
      '#2c5e63',
    ),
    bld(394, 118, 200, 0),
    poly(
      [
        { x: 512, h: 0 },
        { x: 572, h: 405 },
        { x: 632, h: 0 },
      ],
      2,
      'shard',
      '#93c5fd',
    ),
    bld(632, 112, 198, 1),
    bld(744, 260, 140, 3, 'bridge-deck', 90, '#64748b'),
    bld(786, 36, 270, 3, 'bridge-tower', 91, '#9a8470'),
    bld(926, 36, 270, 3, 'bridge-tower', 92, '#9a8470'),
    { kind: 'rect', x: 822, y: sy(248), width: 104, height: sh(22), colorIndex: 2, style: 'bridge-deck', accent: '#93c5fd' },
    bld(1004, 196, 185, 0),
  ];
  return {
    id: 'london',
    name: 'London',
    region: 'UK',
    category: 'city',
    skyMood: 'twilight',
    backdrop: 'city-depth',
    cables: [
      { x1: 744, y1: sy(140), x2: 804, y2: sy(260), sag: 16, color: '#60a5fa', suspenderCount: 5, deckY: sy(140) },
      { x1: 944, y1: sy(260), x2: 1004, y2: sy(140), sag: 16, color: '#60a5fa', suspenderCount: 5, deckY: sy(140) },
    ],
    shapes,
    spawnSpots: [
      { x: 56, y: sy(170) },
      { x: 242, y: sy(185) },
      { x: 454, y: sy(200) },
      { x: 688, y: sy(198) },
      { x: 874, y: sy(140) },
      { x: 1102, y: sy(185) },
    ],
  };
}

function makeTokyo(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 125, 180, 0),
    bld(125, 110, 235, 1),
    bld(235, 165, 130, 2),
    poly(
      [
        { x: 264, h: 130 },
        { x: 310, h: 375 },
        { x: 326, h: 375 },
        { x: 372, h: 130 },
      ],
      3,
      'eiffel-lattice',
      '#ef4444',
    ),
    bld(315, 5, 405, 3, 'beacon-spire', 44, '#ffffff'),
    bld(400, 115, 240, 0),
    bld(515, 125, 205, 2),
    bld(640, 110, 265, 1),
    bld(750, 150, 145, 0),
    poly(
      [
        { x: 794, h: 145 },
        { x: 820, h: 398 },
        { x: 830, h: 398 },
        { x: 856, h: 145 },
      ],
      2,
      'shard',
      '#e2e8f0',
    ),
    bld(822, 5, 424, 2, 'beacon-spire', 50, '#38bdf8'),
    bld(900, 145, 215, 1),
    bld(1045, 155, 175, 0),
  ];
  return {
    id: 'tokyo',
    name: 'Tokyo',
    region: 'Japan',
    category: 'city',
    skyMood: 'sunset',
    backdrop: 'mt-fuji',
    shapes,
    spawnSpots: [
      { x: 64, y: sy(180) },
      { x: 180, y: sy(235) },
      { x: 458, y: sy(240) },
      { x: 578, y: sy(205) },
      { x: 695, y: sy(265) },
      { x: 972, y: sy(215) },
      { x: 1120, y: sy(175) },
    ],
  };
}

function makeSydney(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 130, 195, 0),
    bld(130, 115, 245, 1),
    bld(245, 340, 135, 2, 'bridge-deck'),
    bld(258, 28, 230, 3, 'bridge-tower', 10, '#94a3b8'),
    bld(544, 28, 230, 3, 'bridge-tower', 11, '#94a3b8'),
    {
      kind: 'arch',
      cx: 415,
      baseY: sy(135),
      outerRx: 145,
      outerRy: sh(160),
      thickness: 14,
      colorIndex: 0,
      style: 'harbour-bridge',
    },
    bld(585, 250, 125, 2, 'deck'),
    poly(
      [
        { x: 598, h: 125 },
        { x: 646, h: 255 },
        { x: 695, h: 125 },
      ],
      2,
      'sail',
      '#f8fafc',
    ),
    poly(
      [
        { x: 664, h: 125 },
        { x: 726, h: 295 },
        { x: 774, h: 125 },
      ],
      2,
      'sail',
      '#ffffff',
    ),
    poly(
      [
        { x: 740, h: 125 },
        { x: 786, h: 230 },
        { x: 828, h: 125 },
      ],
      2,
      'sail',
      '#e2e8f0',
    ),
    bld(835, 115, 225, 1),
    bld(950, 125, 260, 0),
    bld(1075, 125, 190, 3),
  ];
  return {
    id: 'sydney',
    name: 'Sydney',
    region: 'Australia',
    category: 'city',
    skyMood: 'sunset',
    backdrop: 'bay-water',
    shapes,
    spawnSpots: [
      { x: 66, y: sy(195) },
      { x: 188, y: sy(245) },
      { x: 415, y: sy(135) },
      { x: 892, y: sy(225) },
      { x: 1012, y: sy(260) },
      { x: 1138, y: sy(190) },
    ],
  };
}

function makeCairo(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 195, 155, 3, 'deck'),
    poly(
      [
        { x: 175, h: 0 },
        { x: 305, h: 280 },
        { x: 435, h: 0 },
      ],
      3,
      'pyramid',
      '#d9a05b',
    ),
    poly(
      [
        { x: 390, h: 0 },
        { x: 585, h: 375 },
        { x: 780, h: 0 },
      ],
      3,
      'pyramid',
      '#e3b26f',
    ),
    poly(
      [
        { x: 730, h: 0 },
        { x: 890, h: 310 },
        { x: 1050, h: 0 },
      ],
      3,
      'pyramid',
      '#cf9650',
    ),
    bld(0, WORLD_WIDTH, 115, 3, 'deck'),
    bld(1015, 185, 165, 3, 'deck'),
    bld(450, 115, 155, 3, 'deck'),
  ];
  return {
    id: 'cairo',
    name: 'Cairo & Giza',
    region: 'Egypt',
    category: 'city',
    skyMood: 'desert',
    shapes,
    spawnSpots: [
      { x: 92, y: sy(155) },
      { x: 305, y: sy(280) },
      { x: 505, y: sy(155) },
      { x: 890, y: sy(310) },
      { x: 1105, y: sy(165) },
    ],
  };
}

function makeRio(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 115, 175, 1),
    bld(115, 115, 205, 2),
    poly(
      [
        { x: 220, h: 0 },
        { x: 280, h: 270 },
        { x: 335, h: 325 },
        { x: 395, h: 265 },
        { x: 460, h: 0 },
      ],
      2,
      'mountain',
      '#4f6b5a',
    ),
    bld(220, 760, 115, 2, 'deck'),
    poly(
      [
        { x: 530, h: 0 },
        { x: 640, h: 340 },
        { x: 700, h: 340 },
        { x: 810, h: 0 },
      ],
      2,
      'mountain',
      '#3d5c4a',
    ),
    bld(664, 10, 390, 2, 'spire', 10, '#f8fafc'),
    { kind: 'rect', x: 646, y: sy(380), width: 46, height: 6, colorIndex: 2, style: 'spire', accent: '#f8fafc' },
    bld(850, 115, 195, 3),
    bld(965, 115, 225, 1),
    bld(1080, 120, 175, 0),
  ];
  return {
    id: 'rio',
    name: 'Rio de Janeiro',
    region: 'Brazil',
    category: 'city',
    skyMood: 'tropical',
    backdrop: 'bay-water',
    shapes,
    spawnSpots: [
      { x: 58, y: sy(175) },
      { x: 172, y: sy(205) },
      { x: 492, y: sy(115) },
      { x: 908, y: sy(195) },
      { x: 1022, y: sy(225) },
      { x: 1140, y: sy(175) },
    ],
  };
}

function makeJungle(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, WORLD_WIDTH, 110, 2, 'deck'),
    bld(65, 68, 225, 3, 'trunk'),
    bld(30, 145, 245, 2, 'deck'),
    bld(285, 76, 305, 3, 'trunk'),
    bld(245, 160, 325, 2, 'deck'),
    { kind: 'rect', x: 405, y: sy(205), width: 175, height: sh(32), colorIndex: 3, style: 'bridge-deck' },
    bld(555, 92, 345, 3, 'trunk'),
    bld(515, 172, 365, 2, 'deck'),
    { kind: 'rect', x: 687, y: sy(220), width: 145, height: sh(32), colorIndex: 3, style: 'bridge-deck' },
    bld(830, 74, 290, 3, 'trunk'),
    bld(792, 154, 310, 2, 'deck'),
    bld(1035, 70, 220, 3, 'trunk'),
    bld(995, 155, 240, 2, 'deck'),
  ];
  return {
    id: 'jungle',
    name: 'Jungle Canopy',
    region: 'Wild Terrain',
    category: 'wild',
    skyMood: 'tropical',
    backdrop: 'jungle-mist',
    shapes,
    spawnSpots: [
      { x: 102, y: sy(245) },
      { x: 325, y: sy(325) },
      { x: 492, y: sy(205) },
      { x: 600, y: sy(365) },
      { x: 868, y: sy(310) },
      { x: 1072, y: sy(240) },
    ],
  };
}

function makeVolcano(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, WORLD_WIDTH, 115, 0, 'deck'),
    poly(
      [
        { x: 0, h: 0 },
        { x: 0, h: 215 },
        { x: 145, h: 215 },
        { x: 245, h: 145 },
        { x: 270, h: 0 },
      ],
      0,
      'volcano',
    ),
    poly(
      [
        { x: 225, h: 0 },
        { x: 295, h: 275 },
        { x: 410, h: 275 },
        { x: 485, h: 155 },
        { x: 500, h: 0 },
      ],
      0,
      'volcano',
    ),
    poly(
      [
        { x: 460, h: 0 },
        { x: 550, h: 350 },
        { x: 585, h: 305 },
        { x: 615, h: 305 },
        { x: 650, h: 350 },
        { x: 740, h: 0 },
      ],
      0,
      'volcano',
    ),
    poly(
      [
        { x: 720, h: 0 },
        { x: 805, h: 270 },
        { x: 925, h: 270 },
        { x: 1005, h: 160 },
        { x: 1020, h: 0 },
      ],
      0,
      'volcano',
    ),
    poly(
      [
        { x: 985, h: 0 },
        { x: 1045, h: 220 },
        { x: WORLD_WIDTH, h: 220 },
        { x: WORLD_WIDTH, h: 0 },
      ],
      0,
      'volcano',
    ),
  ];
  return {
    id: 'volcano',
    name: 'Volcano Caldera',
    region: 'Wild Terrain',
    category: 'wild',
    skyMood: 'volcanic',
    backdrop: 'lava-glow',
    shapes,
    spawnSpots: [
      { x: 76, y: sy(215) },
      { x: 352, y: sy(275) },
      { x: 600, y: sy(305) },
      { x: 865, y: sy(270) },
      { x: 1118, y: sy(220) },
    ],
  };
}

function makeAlps(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, WORLD_WIDTH, 115, 2, 'deck'),
    poly(
      [
        { x: 0, h: 0 },
        { x: 0, h: 240 },
        { x: 145, h: 240 },
        { x: 255, h: 155 },
        { x: 270, h: 0 },
      ],
      2,
      'snow-peak',
    ),
    poly(
      [
        { x: 220, h: 0 },
        { x: 345, h: 355 },
        { x: 470, h: 0 },
      ],
      2,
      'snow-peak',
    ),
    bld(470, 260, 175, 3, 'deck'),
    poly(
      [
        { x: 710, h: 0 },
        { x: 840, h: 365 },
        { x: 970, h: 0 },
      ],
      2,
      'snow-peak',
    ),
    poly(
      [
        { x: 930, h: 0 },
        { x: 1035, h: 245 },
        { x: WORLD_WIDTH, h: 245 },
        { x: WORLD_WIDTH, h: 0 },
      ],
      2,
      'snow-peak',
    ),
  ];
  return {
    id: 'alps',
    name: 'Alpine Peaks',
    region: 'Wild Terrain',
    category: 'wild',
    skyMood: 'alpine',
    backdrop: 'alpine-peaks',
    shapes,
    spawnSpots: [
      { x: 75, y: sy(240) },
      { x: 245, y: sy(155) },
      { x: 540, y: sy(175) },
      { x: 660, y: sy(175) },
      { x: 1110, y: sy(245) },
    ],
  };
}

export const LOCATION_BUILDERS: Record<ConcreteLocationId, () => LocationSpec> = {
  chicago: makeChicago,
  atlanta: makeAtlanta,
  nyc: makeNYC,
  'san-francisco': makeSanFrancisco,
  seattle: makeSeattle,
  'st-louis': makeStLouis,
  paris: makeParis,
  london: makeLondon,
  tokyo: makeTokyo,
  sydney: makeSydney,
  cairo: makeCairo,
  rio: makeRio,
  jungle: makeJungle,
  volcano: makeVolcano,
  alps: makeAlps,
};

export const ALL_LOCATIONS: ConcreteLocationId[] = [
  'chicago',
  'atlanta',
  'nyc',
  'san-francisco',
  'seattle',
  'st-louis',
  'paris',
  'london',
  'tokyo',
  'sydney',
  'cairo',
  'rio',
  'jungle',
  'volcano',
  'alps',
];

export const LOCATION_META: Array<{ id: ConcreteLocationId; name: string; region: string; category: 'city' | 'wild' }> =
  ALL_LOCATIONS.map((id) => {
    const spec = LOCATION_BUILDERS[id]();
    return { id, name: spec.name, region: spec.region, category: spec.category };
  });

export function buildLocation(id: ConcreteLocationId): LocationSpec {
  return LOCATION_BUILDERS[id]();
}
