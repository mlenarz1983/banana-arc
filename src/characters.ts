import type { CharacterDef, CharacterId } from './types';

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  'king-kong': {
    id: 'king-kong',
    name: 'King Kong',
    title: 'Golden Crown',
    color: '#d9534f',
    accentColor: '#fbbf24',
    furColor: '#3b3332',
    chestColor: '#594c4a',
  },
  'astro-ape': {
    id: 'astro-ape',
    name: 'Astro-Ape',
    title: 'Space Helmet',
    color: '#2563eb',
    accentColor: '#93c5fd',
    furColor: '#3a3b47',
    chestColor: '#e2e8f0',
  },
  'prof-peel': {
    id: 'prof-peel',
    name: 'Prof. Peel',
    title: 'Physics Specs',
    color: '#0d9488',
    accentColor: '#fef08a',
    furColor: '#4a3d36',
    chestColor: '#69574d',
  },
  'capt-bongo': {
    id: 'capt-bongo',
    name: 'Capt. Bongo',
    title: 'Pirate Hat',
    color: '#b45309',
    accentColor: '#fde047',
    furColor: '#47342b',
    chestColor: '#6b4f41',
  },
  'dj-kong': {
    id: 'dj-kong',
    name: 'DJ Kong',
    title: 'Headphones',
    color: '#0891b2',
    accentColor: '#38bdf8',
    furColor: '#33363f',
    chestColor: '#4e5361',
  },
  'chef-nana': {
    id: 'chef-nana',
    name: 'Chef Nana',
    title: 'Chef Toque',
    color: '#ea580c',
    accentColor: '#ffffff',
    furColor: '#4a372f',
    chestColor: '#695045',
  },
  'ninja-chimp': {
    id: 'ninja-chimp',
    name: 'Ninja Chimp',
    title: 'Shadow Scarf',
    color: '#374151',
    accentColor: '#f43f5e',
    furColor: '#27272a',
    chestColor: '#3f3f46',
  },
  'robo-kong': {
    id: 'robo-kong',
    name: 'Robo-Kong',
    title: 'Laser Visor',
    color: '#0ea5a4',
    accentColor: '#5eead4',
    furColor: '#475569',
    chestColor: '#94a3b8',
  },
};

export const CHARACTER_ORDER: CharacterId[] = [
  'king-kong',
  'astro-ape',
  'prof-peel',
  'capt-bongo',
  'dj-kong',
  'chef-nana',
  'ninja-chimp',
  'robo-kong',
];

export const DEFAULT_PLAYER_CHARACTERS: CharacterId[] = [
  'king-kong',
  'astro-ape',
  'prof-peel',
  'capt-bongo',
];
