import { WORLD_HEIGHT, WORLD_WIDTH } from './constants';
import type { ConcreteLocationId, LocationSpec, PolyStyle, RectStyle, TerrainShape, Vec2 } from './types';

const H = WORLD_HEIGHT;

function bld(
  x: number,
  w: number,
  h: number,
  colorIndex: number,
  style: RectStyle = 'building',
  seed = x * 13 + h,
  accent?: string,
): TerrainShape {
  return {
    kind: 'rect',
    x,
    y: H - h,
    width: w,
    height: h,
    colorIndex,
    style,
    windowSeed: seed,
    accent,
  };
}

function poly(
  points: Vec2[],
  colorIndex: number,
  style: PolyStyle = 'landmark',
  accent?: string,
): TerrainShape {
  return { kind: 'poly', points, colorIndex, style, accent };
}

function makeChicago(): LocationSpec {
  const shapes: TerrainShape[] = [
    // Millennium Park plaza & The Bean (Cloud Gate)
    bld(0, 122, 148, 2, 'deck', 10),
    { kind: 'rect', x: 34, y: H - 174, width: 58, height: 26, colorIndex: 2, style: 'bean' },
    // John Hancock Center (875 N Michigan) — true tapered trapezoid with 5-tier X-bracing + twin white masts!
    poly(
      [
        { x: 122, y: H },
        { x: 140, y: H - 325 },
        { x: 214, y: H - 325 },
        { x: 232, y: H },
      ],
      0,
      'xbrace-taper',
      '#1e242b',
    ),
    bld(156, 6, 385, 0, 'beacon-spire', 11, '#f8fafc'),
    bld(192, 6, 385, 0, 'beacon-spire', 12, '#f8fafc'),
    // Riverfront mid-rise
    bld(232, 90, 188, 1),
    // Marina City — iconic twin scalloped "corncob" cylinders!
    bld(326, 56, 250, 2, 'corncob', 31, '#cbd5e1'),
    bld(388, 56, 250, 2, 'corncob', 32, '#cbd5e1'),
    // Lower Loop block
    bld(448, 86, 172, 3),
    // Willis (Sears) Tower — unmistakable asymmetric 9-7-5-2 bundled-tube setbacks + twin white broadcast masts!
    bld(534, 134, 240, 0, 'building', 50, '#181c22'),
    bld(534, 102, 305, 0, 'building', 51, '#181c22'),
    bld(558, 78, 355, 0, 'building', 52, '#181c22'),
    bld(572, 50, 392, 0, 'building', 53, '#181c22'),
    bld(582, 6, 448, 0, 'beacon-spire', 54, '#f8fafc'),
    bld(606, 6, 448, 0, 'beacon-spire', 55, '#f8fafc'),
    // Aon Center (tall clean pale vertical monolith)
    bld(674, 88, 295, 2, 'glass-cylinder', 60, '#cbd5e1'),
    // Crain Communications ("Diamond Building") — iconic slanted diagonal diamond roof!
    bld(768, 92, 235, 1),
    poly(
      [
        { x: 768, y: H - 235 },
        { x: 814, y: H - 305 },
        { x: 860, y: H - 235 },
      ],
      1,
      'diamond-roof',
      '#e2e8f0',
    ),
    // Trump Tower stepped riverfront setback
    bld(866, 94, 215, 2),
    bld(886, 54, 265, 2),
    bld(910, 6, 305, 2, 'beacon-spire', 70, '#e2e8f0'),
    // Grant Park / Lakefront right
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
      { x: 64, y: H - 174 },
      { x: 277, y: H - 188 },
      { x: 490, y: H - 172 },
      { x: 718, y: H - 295 },
      { x: 1018, y: H - 195 },
      { x: 1138, y: H - 155 },
    ],
  };
}

function makeAtlanta(): LocationSpec {
  const shapes: TerrainShape[] = [
    // Downtown Midtown left
    bld(0, 116, 165, 3),
    // 191 Peachtree Tower — twin illuminated Gothic crowns!
    bld(116, 102, 265, 1, 'twin-crown', 21, '#d6cfc2'),
    // Low Peachtree plaza
    bld(218, 96, 185, 0),
    // Westin Peachtree Plaza — iconic tall reflective glass cylinder!
    bld(314, 92, 325, 2, 'glass-cylinder', 35, '#3b6e8c'),
    bld(340, 40, 342, 2, 'dome', 36, '#93c5fd'),
    // Midtown filler
    bld(406, 90, 198, 1),
    // Bank of America Plaza — rose-terracotta stepped tower + iconic glowing gilded gold open-lattice spire!
    bld(496, 116, 255, 3, 'building', 41, '#7c4a3e'),
    bld(512, 84, 305, 3, 'building', 42, '#8b5548'),
    poly(
      [
        { x: 522, y: H - 305 },
        { x: 554, y: H - 418 },
        { x: 586, y: H - 305 },
      ],
      3,
      'gold-lattice',
      '#fbbf24',
    ),
    bld(551, 6, 434, 3, 'beacon-spire', 43, '#fde047'),
    // Centennial Park mid-rise
    bld(612, 106, 190, 0),
    // One Atlantic Center — stately granite tower with glowing copper-gold pyramid peak!
    bld(718, 102, 290, 3, 'building', 55, '#6b5b52'),
    poly(
      [
        { x: 722, y: H - 290 },
        { x: 769, y: H - 365 },
        { x: 816, y: H - 290 },
      ],
      3,
      'gold-lattice',
      '#f59e0b',
    ),
    // Truist (SunTrust) Plaza — stepped golden crown!
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
      { x: 58, y: H - 165 },
      { x: 266, y: H - 185 },
      { x: 451, y: H - 198 },
      { x: 665, y: H - 190 },
      { x: 988, y: H - 195 },
      { x: 1126, y: H - 160 },
    ],
  };
}

function makeNYC(): LocationSpec {
  const shapes: TerrainShape[] = [
    // Brooklyn Bridge stone Gothic towers + roadway
    bld(0, 80, 165, 0),
    bld(80, 36, 255, 3, 'bridge-tower', 11, '#8c7a6b'),
    bld(116, 118, 152, 3, 'bridge-deck', 12, '#64748b'),
    bld(234, 36, 255, 3, 'bridge-tower', 13, '#8c7a6b'),
    // Midtown
    bld(270, 96, 215, 1),
    bld(366, 94, 265, 2),
    // Empire State Building (stepped setbacks + silver mast + blinking beacon)
    bld(460, 114, 265, 0),
    bld(476, 82, 332, 0),
    bld(494, 46, 378, 0),
    bld(513, 8, 440, 0, 'beacon-spire', 20, '#e2e8f0'),
    bld(574, 90, 200, 1),
    // Chrysler Building (Art Deco gleaming sunburst spire)
    bld(664, 92, 265, 2),
    poly(
      [
        { x: 672, y: H - 265 },
        { x: 710, y: H - 375 },
        { x: 748, y: H - 265 },
      ],
      2,
      'diamond-roof',
      '#f1f5f9',
    ),
    bld(756, 102, 220, 3),
    // One World Trade Center (sleek tapered glass tower + spire)
    poly(
      [
        { x: 858, y: H },
        { x: 874, y: H - 355 },
        { x: 946, y: H - 355 },
        { x: 962, y: H },
      ],
      2,
      'shard',
      '#60a5fa',
    ),
    bld(907, 6, 425, 2, 'beacon-spire', 44, '#f8fafc'),
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
      { x1: 18, y1: H - 152, x2: 98, y2: H - 250, sag: 28, color: '#cbd5e1', suspenderCount: 5, deckY: H - 152 },
      { x1: 98, y1: H - 250, x2: 252, y2: H - 250, sag: 66, color: '#cbd5e1', suspenderCount: 9, deckY: H - 152 },
      { x1: 252, y1: H - 250, x2: 310, y2: H - 152, sag: 22, color: '#cbd5e1', suspenderCount: 4, deckY: H - 152 },
    ],
    shapes,
    spawnSpots: [
      { x: 42, y: H - 165 },
      { x: 175, y: H - 152 },
      { x: 318, y: H - 215 },
      { x: 619, y: H - 200 },
      { x: 808, y: H - 220 },
      { x: 1020, y: H - 205 },
      { x: 1140, y: H - 168 },
    ],
  };
}

function makeSanFrancisco(): LocationSpec {
  const shapes: TerrainShape[] = [
    // Golden Gate Bridge (International Orange Art Deco towers + road deck)
    bld(0, 365, 132, 3, 'bridge-deck', 10, '#c0392b'),
    bld(78, 30, 285, 3, 'bridge-tower', 11, '#c0392b'),
    bld(266, 30, 285, 3, 'bridge-tower', 12, '#c0392b'),
    // Financial District
    bld(365, 102, 195, 1),
    bld(467, 94, 240, 0),
    // Transamerica Pyramid (bright white spire with iconic side elevator wings!)
    bld(572, 92, 200, 2, 'building', 30, '#cbd5e1'),
    poly(
      [
        { x: 562, y: H },
        { x: 618, y: H - 392 },
        { x: 674, y: H },
      ],
      2,
      'transamerica',
      '#f1f5f9',
    ),
    bld(674, 92, 210, 0),
    // Salesforce Tower (tall tapering glass obelisk dome)
    bld(766, 98, 330, 2, 'glass-cylinder', 45, '#64748b'),
    bld(776, 78, 355, 2, 'dome', 46, '#bae6fd'),
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
      { x1: 4, y1: H - 132, x2: 93, y2: H - 280, sag: 42, color: '#e74c3c', suspenderCount: 6, deckY: H - 132 },
      { x1: 93, y1: H - 280, x2: 281, y2: H - 280, sag: 105, color: '#e74c3c', suspenderCount: 12, deckY: H - 132 },
      { x1: 281, y1: H - 280, x2: 360, y2: H - 132, sag: 40, color: '#e74c3c', suspenderCount: 5, deckY: H - 132 },
    ],
    shapes,
    spawnSpots: [
      { x: 42, y: H - 132 },
      { x: 186, y: H - 132 },
      { x: 415, y: H - 195 },
      { x: 720, y: H - 210 },
      { x: 920, y: H - 240 },
      { x: 1142, y: H - 165 },
    ],
  };
}

function makeSeattle(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 118, 168, 2),
    bld(118, 108, 212, 0),
    // Space Needle (flared base + slim waist + glowing observation saucer + beacon needle!)
    bld(226, 132, 145, 1),
    poly(
      [
        { x: 258, y: H - 145 },
        { x: 280, y: H - 295 },
        { x: 304, y: H - 295 },
        { x: 326, y: H - 145 },
      ],
      2,
      'landmark',
      '#e2e8f0',
    ),
    { kind: 'rect', x: 238, y: H - 314, width: 108, height: 19, colorIndex: 2, style: 'deck', accent: '#f8fafc' },
    { kind: 'rect', x: 256, y: H - 324, width: 72, height: 10, colorIndex: 2, style: 'deck', accent: '#38bdf8' },
    bld(289, 6, 385, 2, 'beacon-spire', 20, '#f8fafc'),
    // Downtown Seattle + Columbia Center
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
      { x: 60, y: H - 168 },
      { x: 172, y: H - 212 },
      { x: 414, y: H - 208 },
      { x: 750, y: H - 245 },
      { x: 984, y: H - 185 },
      { x: 1126, y: H - 155 },
    ],
  };
}

function makeStLouis(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 125, 175, 3),
    bld(125, 110, 238, 0),
    bld(235, 115, 185, 1),
    // Mississippi riverfront plaza under the Gateway Arch
    bld(350, 500, 120, 2, 'deck'),
    // Iconic hollow stainless-steel Gateway Arch!
    {
      kind: 'arch',
      cx: 600,
      baseY: H - 120,
      outerRx: 178,
      outerRy: 272,
      thickness: 24,
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
      { x: 64, y: H - 175 },
      { x: 180, y: H - 238 },
      { x: 292, y: H - 185 },
      { x: 600, y: H - 120 },
      { x: 908, y: H - 210 },
      { x: 1022, y: H - 250 },
      { x: 1140, y: H - 180 },
    ],
  };
}

function makeParis(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 115, 165, 3),
    // Arc de Triomphe silhouette
    bld(115, 110, 212, 3, 'gold-crown'),
    bld(225, 125, 175, 1),
    bld(350, 130, 160, 2),
    // Eiffel Tower — arched open base + crisp iron lattice pyramid + beacon!
    bld(480, 240, 120, 3, 'deck'),
    {
      kind: 'arch',
      cx: 600,
      baseY: H - 120,
      outerRx: 74,
      outerRy: 62,
      thickness: 24,
      colorIndex: 3,
      style: 'eiffel-base',
    },
    poly(
      [
        { x: 536, y: H - 172 },
        { x: 588, y: H - 405 },
        { x: 612, y: H - 405 },
        { x: 664, y: H - 172 },
      ],
      3,
      'eiffel-lattice',
      '#8c6248',
    ),
    bld(597, 6, 434, 3, 'beacon-spire', 80, '#fde047'),
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
      { x: 58, y: H - 165 },
      { x: 170, y: H - 212 },
      { x: 288, y: H - 175 },
      { x: 415, y: H - 160 },
      { x: 782, y: H - 170 },
      { x: 902, y: H - 200 },
      { x: 1134, y: H - 175 },
    ],
  };
}

function makeLondon(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 112, 170, 3),
    // Big Ben (Elizabeth Tower) with glowing clock dial + Gothic spire
    bld(112, 70, 305, 3, 'clock'),
    poly(
      [
        { x: 112, y: H - 305 },
        { x: 147, y: H - 372 },
        { x: 182, y: H - 305 },
      ],
      3,
      'gold-lattice',
      '#a16207',
    ),
    bld(182, 118, 185, 1),
    // The Gherkin (diamond-grid rounded bullet tower!)
    poly(
      [
        { x: 315, y: H },
        { x: 304, y: H - 170 },
        { x: 316, y: H - 255 },
        { x: 348, y: H - 292 },
        { x: 380, y: H - 255 },
        { x: 392, y: H - 170 },
        { x: 381, y: H },
      ],
      2,
      'gherkin',
      '#2c5e63',
    ),
    bld(394, 118, 200, 0),
    // The Shard (faceted glass pyramid spire!)
    poly(
      [
        { x: 512, y: H },
        { x: 572, y: H - 405 },
        { x: 632, y: H },
      ],
      2,
      'shard',
      '#93c5fd',
    ),
    bld(632, 112, 198, 1),
    // Tower Bridge twin Gothic towers + high walkway + suspension cables
    bld(744, 260, 140, 3, 'bridge-deck', 90, '#64748b'),
    bld(786, 36, 268, 3, 'bridge-tower', 91, '#9a8470'),
    bld(926, 36, 268, 3, 'bridge-tower', 92, '#9a8470'),
    { kind: 'rect', x: 822, y: H - 245, width: 104, height: 14, colorIndex: 2, style: 'bridge-deck', accent: '#93c5fd' },
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
      { x1: 744, y1: H - 140, x2: 804, y2: H - 258, sag: 32, color: '#60a5fa', suspenderCount: 5, deckY: H - 140 },
      { x1: 944, y1: H - 258, x2: 1004, y2: H - 140, sag: 32, color: '#60a5fa', suspenderCount: 5, deckY: H - 140 },
    ],
    shapes,
    spawnSpots: [
      { x: 56, y: H - 170 },
      { x: 242, y: H - 185 },
      { x: 454, y: H - 200 },
      { x: 688, y: H - 198 },
      { x: 874, y: H - 140 },
      { x: 1102, y: H - 185 },
    ],
  };
}

function makeTokyo(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 125, 180, 0),
    bld(125, 110, 235, 1),
    // Tokyo Tower (red & white iron lattice!)
    bld(235, 165, 130, 2),
    poly(
      [
        { x: 264, y: H - 130 },
        { x: 310, y: H - 370 },
        { x: 326, y: H - 370 },
        { x: 372, y: H - 130 },
      ],
      3,
      'eiffel-lattice',
      '#ef4444',
    ),
    bld(315, 6, 398, 3, 'beacon-spire', 44, '#ffffff'),
    // Shinjuku high-rises
    bld(400, 115, 240, 0),
    bld(515, 125, 205, 2),
    bld(640, 110, 265, 1),
    // Tokyo Skytree
    bld(750, 150, 145, 0),
    poly(
      [
        { x: 794, y: H - 145 },
        { x: 820, y: H - 398 },
        { x: 830, y: H - 398 },
        { x: 856, y: H - 145 },
      ],
      2,
      'shard',
      '#e2e8f0',
    ),
    bld(822, 6, 424, 2, 'beacon-spire', 50, '#38bdf8'),
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
      { x: 64, y: H - 180 },
      { x: 180, y: H - 235 },
      { x: 458, y: H - 240 },
      { x: 578, y: H - 205 },
      { x: 695, y: H - 265 },
      { x: 972, y: H - 215 },
      { x: 1120, y: H - 175 },
    ],
  };
}

function makeSydney(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 130, 195, 0),
    bld(130, 115, 245, 1),
    // Sydney Harbour Bridge steel arch + stone pylons
    bld(245, 340, 135, 2, 'bridge-deck'),
    bld(258, 28, 225, 3, 'bridge-tower', 10, '#94a3b8'),
    bld(544, 28, 225, 3, 'bridge-tower', 11, '#94a3b8'),
    {
      kind: 'arch',
      cx: 415,
      baseY: H - 135,
      outerRx: 145,
      outerRy: 148,
      thickness: 20,
      colorIndex: 0,
      style: 'harbour-bridge',
    },
    // Sydney Opera House overlapping gleaming white shells!
    bld(585, 250, 125, 2, 'deck'),
    poly(
      [
        { x: 598, y: H - 125 },
        { x: 646, y: H - 245 },
        { x: 695, y: H - 125 },
      ],
      2,
      'sail',
      '#f8fafc',
    ),
    poly(
      [
        { x: 664, y: H - 125 },
        { x: 726, y: H - 282 },
        { x: 774, y: H - 125 },
      ],
      2,
      'sail',
      '#ffffff',
    ),
    poly(
      [
        { x: 740, y: H - 125 },
        { x: 786, y: H - 222 },
        { x: 828, y: H - 125 },
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
      { x: 66, y: H - 195 },
      { x: 188, y: H - 245 },
      { x: 415, y: H - 135 },
      { x: 892, y: H - 225 },
      { x: 1012, y: H - 260 },
      { x: 1138, y: H - 190 },
    ],
  };
}

function makeCairo(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 195, 155, 3, 'deck'),
    poly(
      [
        { x: 175, y: H },
        { x: 305, y: H - 265 },
        { x: 435, y: H },
      ],
      3,
      'pyramid',
      '#d9a05b',
    ),
    poly(
      [
        { x: 390, y: H },
        { x: 585, y: H - 355 },
        { x: 780, y: H },
      ],
      3,
      'pyramid',
      '#e3b26f',
    ),
    poly(
      [
        { x: 730, y: H },
        { x: 890, y: H - 295 },
        { x: 1050, y: H },
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
      { x: 92, y: H - 155 },
      { x: 305, y: H - 265 },
      { x: 505, y: H - 155 },
      { x: 890, y: H - 295 },
      { x: 1105, y: H - 165 },
    ],
  };
}

function makeRio(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 115, 175, 1),
    bld(115, 115, 205, 2),
    poly(
      [
        { x: 220, y: H },
        { x: 280, y: H - 260 },
        { x: 335, y: H - 310 },
        { x: 395, y: H - 255 },
        { x: 460, y: H },
      ],
      2,
      'mountain',
      '#4f6b5a',
    ),
    bld(220, 760, 115, 2, 'deck'),
    poly(
      [
        { x: 530, y: H },
        { x: 640, y: H - 325 },
        { x: 700, y: H - 325 },
        { x: 810, y: H },
      ],
      2,
      'mountain',
      '#3d5c4a',
    ),
    bld(664, 12, 368, 2, 'spire', 10, '#f8fafc'),
    { kind: 'rect', x: 644, y: H - 360, width: 52, height: 8, colorIndex: 2, style: 'spire', accent: '#f8fafc' },
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
      { x: 58, y: H - 175 },
      { x: 172, y: H - 205 },
      { x: 492, y: H - 115 },
      { x: 908, y: H - 195 },
      { x: 1022, y: H - 225 },
      { x: 1140, y: H - 175 },
    ],
  };
}

function makeJungle(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, WORLD_WIDTH, 110, 2, 'deck'),
    bld(65, 68, 225, 3, 'trunk'),
    bld(30, 145, 240, 2, 'deck'),
    bld(285, 76, 305, 3, 'trunk'),
    bld(245, 160, 320, 2, 'deck'),
    { kind: 'rect', x: 405, y: H - 195, width: 175, height: 22, colorIndex: 3, style: 'bridge-deck' },
    bld(555, 92, 345, 3, 'trunk'),
    bld(515, 172, 360, 2, 'deck'),
    { kind: 'rect', x: 687, y: H - 210, width: 145, height: 22, colorIndex: 3, style: 'bridge-deck' },
    bld(830, 74, 290, 3, 'trunk'),
    bld(792, 154, 305, 2, 'deck'),
    bld(1035, 70, 220, 3, 'trunk'),
    bld(995, 155, 235, 2, 'deck'),
  ];
  return {
    id: 'jungle',
    name: 'DK Jungle Canopy',
    region: 'Wild Terrain',
    category: 'wild',
    skyMood: 'tropical',
    backdrop: 'jungle-mist',
    shapes,
    spawnSpots: [
      { x: 102, y: H - 240 },
      { x: 325, y: H - 320 },
      { x: 492, y: H - 195 },
      { x: 600, y: H - 360 },
      { x: 868, y: H - 305 },
      { x: 1072, y: H - 235 },
    ],
  };
}

function makeVolcano(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, WORLD_WIDTH, 115, 0, 'deck'),
    poly(
      [
        { x: 0, y: H },
        { x: 0, y: H - 210 },
        { x: 145, y: H - 210 },
        { x: 245, y: H - 140 },
        { x: 270, y: H },
      ],
      0,
      'volcano',
    ),
    poly(
      [
        { x: 225, y: H },
        { x: 295, y: H - 270 },
        { x: 410, y: H - 270 },
        { x: 485, y: H - 155 },
        { x: 500, y: H },
      ],
      0,
      'volcano',
    ),
    poly(
      [
        { x: 460, y: H },
        { x: 550, y: H - 340 },
        { x: 585, y: H - 300 },
        { x: 615, y: H - 300 },
        { x: 650, y: H - 340 },
        { x: 740, y: H },
      ],
      0,
      'volcano',
    ),
    poly(
      [
        { x: 720, y: H },
        { x: 805, y: H - 265 },
        { x: 925, y: H - 265 },
        { x: 1005, y: H - 160 },
        { x: 1020, y: H },
      ],
      0,
      'volcano',
    ),
    poly(
      [
        { x: 985, y: H },
        { x: 1045, y: H - 215 },
        { x: WORLD_WIDTH, y: H - 215 },
        { x: WORLD_WIDTH, y: H },
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
      { x: 76, y: H - 210 },
      { x: 352, y: H - 270 },
      { x: 600, y: H - 300 },
      { x: 865, y: H - 265 },
      { x: 1118, y: H - 215 },
    ],
  };
}

function makeAlps(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, WORLD_WIDTH, 115, 2, 'deck'),
    poly(
      [
        { x: 0, y: H },
        { x: 0, y: H - 235 },
        { x: 145, y: H - 235 },
        { x: 255, y: H - 150 },
        { x: 270, y: H },
      ],
      2,
      'snow-peak',
    ),
    poly(
      [
        { x: 220, y: H },
        { x: 345, y: H - 345 },
        { x: 470, y: H },
      ],
      2,
      'snow-peak',
    ),
    bld(470, 260, 175, 3, 'deck'),
    poly(
      [
        { x: 710, y: H },
        { x: 840, y: H - 355 },
        { x: 970, y: H },
      ],
      2,
      'snow-peak',
    ),
    poly(
      [
        { x: 930, y: H },
        { x: 1035, y: H - 240 },
        { x: WORLD_WIDTH, y: H - 240 },
        { x: WORLD_WIDTH, y: H },
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
      { x: 75, y: H - 235 },
      { x: 245, y: H - 150 },
      { x: 540, y: H - 175 },
      { x: 660, y: H - 175 },
      { x: 1110, y: H - 240 },
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
