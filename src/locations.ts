import { WORLD_HEIGHT, WORLD_WIDTH } from './constants';
import type { ConcreteLocationId, LocationSpec, TerrainShape, Vec2 } from './types';

const H = WORLD_HEIGHT;

function bld(
  x: number,
  w: number,
  h: number,
  colorIndex: number,
  style: Extract<TerrainShape, { kind: 'rect' }>['style'] = 'building',
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
  style: Extract<TerrainShape, { kind: 'poly' }>['style'] = 'landmark',
  accent?: string,
): TerrainShape {
  return { kind: 'poly', points, colorIndex, style, accent };
}

function makeNYC(): LocationSpec {
  const shapes: TerrainShape[] = [
    // Left waterfront + Brooklyn Bridge towers
    bld(0, 88, 170, 0),
    bld(88, 34, 245, 3, 'bridge-tower'),
    bld(122, 110, 155, 3, 'bridge-deck'),
    bld(232, 34, 245, 3, 'bridge-tower'),
    // Midtown
    bld(266, 98, 225, 1),
    bld(364, 96, 280, 2),
    // Empire State Building (stepped + spire)
    bld(460, 110, 275, 0),
    bld(478, 74, 345, 0),
    bld(496, 38, 385, 0),
    bld(511, 8, 435, 0, 'spire'),
    // Midtown filler
    bld(570, 96, 210, 1),
    // Chrysler Building (stepped Art Deco crown)
    bld(666, 92, 270, 2),
    poly(
      [
        { x: 676, y: H - 270 },
        { x: 712, y: H - 365 },
        { x: 748, y: H - 270 },
      ],
      2,
      'spire',
      '#e2e8f0',
    ),
    bld(758, 102, 230, 3),
    // One World Trade Center (tapered + needle)
    poly(
      [
        { x: 860, y: H },
        { x: 874, y: H - 355 },
        { x: 946, y: H - 355 },
        { x: 960, y: H },
      ],
      1,
      'landmark',
    ),
    bld(906, 8, 415, 1, 'spire'),
    // Lower Manhattan right
    bld(960, 115, 215, 0),
    bld(1075, 125, 175, 2),
  ];
  return {
    id: 'nyc',
    name: 'New York City',
    region: 'USA',
    category: 'city',
    skyMood: 'sunset',
    shapes,
    spawnSpots: [
      { x: 50, y: H - 170 },
      { x: 175, y: H - 155 },
      { x: 315, y: H - 225 },
      { x: 618, y: H - 210 },
      { x: 808, y: H - 230 },
      { x: 1020, y: H - 215 },
      { x: 1135, y: H - 175 },
    ],
  };
}

function makeChicago(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 110, 175, 1),
    // John Hancock Center (X-braced)
    bld(110, 102, 305, 0, 'xbrace'),
    bld(136, 6, 365, 0, 'spire'),
    bld(182, 6, 365, 0, 'spire'),
    // Riverfront
    bld(212, 106, 200, 2),
    // Marina City twin corncob cylinders
    bld(318, 60, 245, 3, 'cylinder'),
    bld(382, 60, 245, 3, 'cylinder'),
    bld(442, 92, 185, 1),
    // Willis (Sears) Tower stepped bundle + twin antennas
    bld(534, 128, 250, 0),
    bld(552, 96, 320, 0),
    bld(570, 62, 375, 0),
    bld(582, 6, 430, 0, 'spire'),
    bld(614, 6, 430, 0, 'spire'),
    // Loop & Lakefront
    bld(662, 108, 235, 2),
    bld(770, 102, 275, 1),
    bld(872, 112, 210, 3),
    bld(984, 106, 240, 0),
    bld(1090, 110, 165, 2),
  ];
  return {
    id: 'chicago',
    name: 'Chicago',
    region: 'USA',
    category: 'city',
    skyMood: 'twilight',
    shapes,
    spawnSpots: [
      { x: 55, y: H - 175 },
      { x: 265, y: H - 200 },
      { x: 488, y: H - 185 },
      { x: 716, y: H - 235 },
      { x: 928, y: H - 210 },
      { x: 1140, y: H - 165 },
    ],
  };
}

function makeSanFrancisco(): LocationSpec {
  const shapes: TerrainShape[] = [
    // Golden Gate Bridge (left side over bay)
    bld(0, 360, 130, 3, 'bridge-deck', 10, '#c0392b'),
    bld(82, 30, 275, 3, 'bridge-tower', 11, '#c0392b'),
    bld(268, 30, 275, 3, 'bridge-tower', 12, '#c0392b'),
    // Downtown slopes
    bld(360, 105, 195, 1),
    bld(465, 100, 240, 2),
    // Transamerica Pyramid
    poly(
      [
        { x: 565, y: H },
        { x: 618, y: H - 380 },
        { x: 671, y: H },
      ],
      2,
      'spire',
      '#f1f5f9',
    ),
    bld(671, 95, 215, 0),
    // Salesforce Tower (rounded top cylinder)
    bld(766, 98, 330, 1, 'dome'),
    bld(864, 112, 245, 3),
    bld(976, 110, 200, 0),
    bld(1086, 114, 165, 2),
  ];
  return {
    id: 'san-francisco',
    name: 'San Francisco',
    region: 'USA',
    category: 'city',
    skyMood: 'sunset',
    backdrop: 'bay-water',
    shapes,
    spawnSpots: [
      { x: 42, y: H - 130 },
      { x: 190, y: H - 130 },
      { x: 412, y: H - 195 },
      { x: 718, y: H - 215 },
      { x: 920, y: H - 245 },
      { x: 1140, y: H - 165 },
    ],
  };
}

function makeSeattle(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 120, 170, 2),
    bld(120, 110, 215, 0),
    // Space Needle!
    bld(275, 34, 285, 2, 'cylinder'),
    bld(240, 104, 298, 2, 'deck'),
    { kind: 'rect', x: 240, y: H - 314, width: 104, height: 18, colorIndex: 2, style: 'deck', accent: '#f8fafc' },
    bld(289, 6, 370, 2, 'spire'),
    // Fill base under Space Needle so gorillas can stand around it
    bld(230, 124, 145, 1),
    // Downtown Seattle
    bld(354, 116, 210, 3),
    bld(470, 110, 265, 0),
    // Columbia Center (tall dark stepped tower)
    bld(580, 114, 345, 0),
    bld(602, 70, 372, 0),
    bld(694, 108, 250, 1),
    bld(802, 112, 215, 2),
    bld(914, 134, 185, 3),
    bld(1048, 152, 155, 1),
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
      { x: 60, y: H - 170 },
      { x: 175, y: H - 215 },
      { x: 412, y: H - 210 },
      { x: 748, y: H - 250 },
      { x: 980, y: H - 185 },
      { x: 1125, y: H - 155 },
    ],
  };
}

function makeAtlanta(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 125, 165, 3),
    bld(125, 115, 215, 1),
    // Westin Peachtree Plaza (tall cylinder)
    bld(240, 96, 315, 2, 'cylinder'),
    bld(336, 114, 200, 0),
    // Bank of America Plaza (gilded pencil spire)
    bld(450, 106, 290, 3),
    poly(
      [
        { x: 462, y: H - 290 },
        { x: 503, y: H - 395 },
        { x: 544, y: H - 290 },
      ],
      3,
      'spire',
      '#fbbf24',
    ),
    bld(556, 116, 220, 1),
    // One Atlantic Center / SunTrust pyramid top
    bld(672, 104, 280, 0),
    poly(
      [
        { x: 676, y: H - 280 },
        { x: 724, y: H - 340 },
        { x: 772, y: H - 280 },
      ],
      0,
      'spire',
      '#f59e0b',
    ),
    bld(776, 120, 235, 2),
    bld(896, 144, 195, 1),
    bld(1040, 160, 165, 0),
  ];
  return {
    id: 'atlanta',
    name: 'Atlanta',
    region: 'USA',
    category: 'city',
    skyMood: 'sunset',
    shapes,
    spawnSpots: [
      { x: 64, y: H - 165 },
      { x: 182, y: H - 215 },
      { x: 392, y: H - 200 },
      { x: 614, y: H - 220 },
      { x: 836, y: H - 235 },
      { x: 968, y: H - 195 },
      { x: 1120, y: H - 165 },
    ],
  };
}

function makeStLouis(): LocationSpec {
  const shapes: TerrainShape[] = [
    // Left riverfront + Old Courthouse dome
    bld(0, 125, 175, 3),
    bld(125, 110, 235, 0),
    bld(235, 115, 185, 1),
    // Riverfront base ground under the Gateway Arch
    bld(350, 500, 120, 2),
    // Iconic hollow Gateway Arch! Players can lob over OR thread right through!
    {
      kind: 'arch',
      cx: 600,
      baseY: H - 120,
      outerRx: 175,
      outerRy: 265,
      thickness: 24,
      colorIndex: 2,
      style: 'gateway-arch',
    },
    // Right downtown skyline
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
    shapes,
    spawnSpots: [
      { x: 64, y: H - 175 },
      { x: 180, y: H - 235 },
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
    // Haussmann blocks + Arc de Triomphe
    bld(0, 115, 165, 3),
    bld(115, 108, 210, 3),
    bld(223, 125, 175, 1),
    bld(348, 132, 160, 2),
    // Eiffel Tower (stepped graceful A-frame)
    bld(480, 240, 125, 3),
    poly(
      [
        { x: 522, y: H - 125 },
        { x: 586, y: H - 395 },
        { x: 614, y: H - 395 },
        { x: 678, y: H - 125 },
      ],
      3,
      'landmark',
      '#b07d62',
    ),
    bld(596, 8, 425, 3, 'spire'),
    // Right bank + Tour Montparnasse
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
    shapes,
    spawnSpots: [
      { x: 58, y: H - 165 },
      { x: 170, y: H - 210 },
      { x: 286, y: H - 175 },
      { x: 414, y: H - 160 },
      { x: 782, y: H - 170 },
      { x: 902, y: H - 200 },
      { x: 1134, y: H - 175 },
    ],
  };
}

function makeLondon(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 115, 170, 3),
    // Big Ben (Elizabeth Tower)
    bld(115, 68, 305, 3, 'clock'),
    poly(
      [
        { x: 115, y: H - 305 },
        { x: 149, y: H - 365 },
        { x: 183, y: H - 305 },
      ],
      3,
      'spire',
    ),
    bld(183, 120, 185, 1),
    // The Gherkin
    bld(303, 94, 270, 2, 'dome'),
    bld(397, 118, 205, 0),
    // The Shard (sharp glass pyramid)
    poly(
      [
        { x: 515, y: H },
        { x: 572, y: H - 395 },
        { x: 630, y: H },
      ],
      2,
      'spire',
      '#bae6fd',
    ),
    bld(630, 115, 200, 1),
    // Tower Bridge twin towers + deck
    bld(745, 255, 140, 3, 'bridge-deck'),
    bld(785, 36, 260, 3, 'bridge-tower'),
    bld(925, 36, 260, 3, 'bridge-tower'),
    bld(1000, 200, 185, 0),
  ];
  return {
    id: 'london',
    name: 'London',
    region: 'UK',
    category: 'city',
    skyMood: 'twilight',
    shapes,
    spawnSpots: [
      { x: 58, y: H - 170 },
      { x: 242, y: H - 185 },
      { x: 456, y: H - 205 },
      { x: 688, y: H - 200 },
      { x: 874, y: H - 140 },
      { x: 1100, y: H - 185 },
    ],
  };
}

function makeTokyo(): LocationSpec {
  const shapes: TerrainShape[] = [
    bld(0, 125, 180, 0),
    bld(125, 110, 235, 1),
    // Tokyo Tower (red & white tapered lattice)
    bld(235, 165, 130, 2),
    poly(
      [
        { x: 266, y: H - 130 },
        { x: 310, y: H - 365 },
        { x: 326, y: H - 365 },
        { x: 370, y: H - 130 },
      ],
      3,
      'landmark',
      '#ef4444',
    ),
    // Shinjuku high-rises
    bld(400, 115, 240, 0),
    bld(515, 125, 205, 2),
    bld(640, 110, 265, 1),
    // Tokyo Skytree
    bld(750, 150, 145, 0),
    poly(
      [
        { x: 794, y: H - 145 },
        { x: 820, y: H - 390 },
        { x: 830, y: H - 390 },
        { x: 856, y: H - 145 },
      ],
      2,
      'spire',
      '#e2e8f0',
    ),
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
    // Harbour Bridge arch over water
    bld(245, 340, 135, 2, 'bridge-deck'),
    {
      kind: 'arch',
      cx: 415,
      baseY: H - 135,
      outerRx: 145,
      outerRy: 145,
      thickness: 20,
      colorIndex: 0,
      style: 'harbour-bridge',
    },
    // Sydney Opera House sails!
    bld(585, 250, 125, 2),
    poly(
      [
        { x: 600, y: H - 125 },
        { x: 648, y: H - 245 },
        { x: 695, y: H - 125 },
      ],
      2,
      'sail',
      '#f8fafc',
    ),
    poly(
      [
        { x: 668, y: H - 125 },
        { x: 726, y: H - 275 },
        { x: 772, y: H - 125 },
      ],
      2,
      'sail',
      '#f8fafc',
    ),
    poly(
      [
        { x: 742, y: H - 125 },
        { x: 786, y: H - 215 },
        { x: 825, y: H - 125 },
      ],
      2,
      'sail',
      '#f8fafc',
    ),
    // CBD + Sydney Tower
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
    // Desert sandstone mesas + Great Pyramids of Giza
    bld(0, 195, 155, 3, 'deck'),
    // Pyramid 1 (Menkaure)
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
    // Great Pyramid of Khufu (center giant!)
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
    // Pyramid of Khafre
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
    // Desert floor & flat right sandstone plateau
    bld(0, WORLD_WIDTH, 115, 3, 'deck'),
    bld(1015, 185, 165, 3, 'deck'),
    // Sphinx-style low platform in front
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
    // Beachfront Copacabana towers
    bld(0, 115, 175, 1),
    bld(115, 115, 205, 2),
    // Sugarloaf Mountain granite monolith
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
    // Bay shoreline floor
    bld(220, 760, 115, 2, 'deck'),
    // Corcovado mountain + Christ the Redeemer peak
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
    // Statue silhouette on peak
    bld(664, 12, 365, 2, 'spire'),
    { kind: 'rect', x: 646, y: H - 358, width: 48, height: 8, colorIndex: 2, style: 'spire', accent: '#f8fafc' },
    // Right hillside condos
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
    // Jungle forest floor
    bld(0, WORLD_WIDTH, 110, 2, 'deck'),
    // Giant Redwood Tree 1 + Treehouse deck
    bld(65, 68, 225, 3, 'trunk'),
    bld(30, 145, 240, 2, 'deck'),
    // Giant Redwood Tree 2 (tall canopy tower)
    bld(285, 76, 305, 3, 'trunk'),
    bld(245, 160, 320, 2, 'deck'),
    // Suspension bridge between trees
    { kind: 'rect', x: 405, y: H - 195, width: 175, height: 22, colorIndex: 3, style: 'bridge-deck' },
    // Central Giant Kong Tree
    bld(555, 92, 345, 3, 'trunk'),
    bld(515, 172, 360, 2, 'deck'),
    // Right canopy trees & wooden bridge
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
    // Basalt base floor
    bld(0, WORLD_WIDTH, 115, 0, 'deck'),
    // Left volcanic crag
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
    // Left-mid lava mesa
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
    // Central Volcano Cone with flat caldera rim
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
    // Right basalt ridges
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
    // Alpine valley snow base
    bld(0, WORLD_WIDTH, 115, 2, 'deck'),
    // Left peak + flat ski deck
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
    // Sharp Matterhorn-style middle-left peak
    poly(
      [
        { x: 220, y: H },
        { x: 345, y: H - 345 },
        { x: 470, y: H },
      ],
      2,
      'snow-peak',
    ),
    // Cozy alpine chalet ledge in center valley
    bld(470, 260, 175, 3, 'deck'),
    // High glacier peak right-center
    poly(
      [
        { x: 710, y: H },
        { x: 840, y: H - 355 },
        { x: 970, y: H },
      ],
      2,
      'snow-peak',
    ),
    // Right ski ridge
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
  nyc: makeNYC,
  chicago: makeChicago,
  'san-francisco': makeSanFrancisco,
  seattle: makeSeattle,
  atlanta: makeAtlanta,
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
  'nyc',
  'chicago',
  'san-francisco',
  'seattle',
  'atlanta',
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
