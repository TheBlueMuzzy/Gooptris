export interface Coordinate {
  x: number;
  y: number;
}

export enum PieceType {
  I = 'I',
  J = 'J',
  L = 'L',
  O = 'O',
  S = 'S',
  T = 'T',
  Z = 'Z',
}

export interface PieceDefinition {
  type: PieceType;
  cells: Coordinate[]; // Relative coordinates
  color: string;
}

export interface ActivePiece {
  definition: PieceDefinition;
  x: number; // Logical grid X (0-TOTAL_WIDTH)
  y: number; // Logical grid Y
  rotation: number; // 0-3 (0, 90, 180, 270)
  cells: Coordinate[]; // Current relative cells after rotation
  spawnTimestamp: number; // When this piece was created
  startSpawnY: number;    // Where it started falling from
}

export interface BlockData {
  id: string;        // Unique ID for the individual block (persists on move)
  groupId: string;   // ID for the contiguous group this block belongs to
  timestamp: number; // Time when the group was formed/reset
  color: string;
  groupMinY: number; // Top-most Y (smallest value) of the group
  groupMaxY: number; // Bottom-most Y (largest value) of the group
  groupSize: number; // Number of blocks in this group
}

export type GridCell = BlockData | null;

export interface FallingBlock {
  data: BlockData;
  x: number;
  y: number;
  velocity: number;
}

export interface GameState {
  grid: GridCell[][]; // [y][x]
  boardOffset: number; // 0-TOTAL_WIDTH
  activePiece: ActivePiece | null;
  storedPiece: PieceDefinition | null;
  score: number;
  gameOver: boolean;
  isPaused: boolean;
  canSwap: boolean;
  level: number;
  cellsCleared: number;
  combo: number;
  fallingBlocks: FallingBlock[];
  timeLeft: number;
}