
import { PieceDefinition, PieceType } from './types';

export const VISIBLE_WIDTH = 12; // 12 units wide
export const TOTAL_WIDTH = 30;   // Cylindrical width (3 screens wide approx)
export const VISIBLE_HEIGHT = 16; 
export const TOTAL_HEIGHT = 19;  // 3 rows of buffer at the top
export const BUFFER_HEIGHT = TOTAL_HEIGHT - VISIBLE_HEIGHT;

export const COMBO_BONUS = 50;

// Linear Interpolation: 1 block = 1000ms, 25 blocks = 10000ms
// T = m * S + c
// 1000 = m + c
// 10000 = 25m + c
// 9000 = 24m -> m = 375
// 1000 = 375 + c -> c = 625
export const BASE_FILL_DURATION = 0; // Base time
export const PER_BLOCK_DURATION = 375;  // Extra time per block in group

// Timer Constants
export const INITIAL_TIME_MS = 60 * 1000;
export const SCORE_THRESHOLD = 10000;
export const TIME_BONUS_MS = 1000;

// The 4 Game Colors
export const GAME_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#22c55e', // Green
  '#eab308', // Yellow
];

export const COLORS = {
  RED: '#ef4444',
  BLUE: '#3b82f6',
  GREEN: '#22c55e',
  YELLOW: '#eab308',
  
  GRID_BG: '#1e293b',
  GRID_EMPTY: '#334155',
};

const makePiece = (type: PieceType, coords: number[][]): PieceDefinition => ({
  type,
  color: COLORS.RED, // Default placeholder, will be randomized on spawn
  cells: coords.map(([x, y]) => ({ x, y })),
});

// SRS-ish definitions
export const PIECES: PieceDefinition[] = [
  // I
  makePiece(PieceType.I, [[-1, 0], [0, 0], [1, 0], [2, 0]]),
  // J
  makePiece(PieceType.J, [[-1, -1], [-1, 0], [0, 0], [1, 0]]),
  // L
  makePiece(PieceType.L, [[1, -1], [-1, 0], [0, 0], [1, 0]]),
  // O
  makePiece(PieceType.O, [[0, 0], [1, 0], [0, 1], [1, 1]]),
  // S
  makePiece(PieceType.S, [[0, 0], [1, 0], [0, 1], [-1, 1]]),
  // T
  makePiece(PieceType.T, [[0, -1], [-1, 0], [0, 0], [1, 0]]),
  // Z
  makePiece(PieceType.Z, [[-1, 0], [0, 0], [0, 1], [1, 1]]),
];