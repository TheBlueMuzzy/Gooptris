import { ActivePiece, Coordinate, GridCell, PieceDefinition, PieceType, BlockData, FallingBlock } from '../types';
import { TOTAL_WIDTH, TOTAL_HEIGHT, PIECES, GAME_COLORS, VISIBLE_WIDTH, BUFFER_HEIGHT } from '../constants';

export const normalizeX = (x: number): number => {
  return ((x % TOTAL_WIDTH) + TOTAL_WIDTH) % TOTAL_WIDTH;
};

export const getRotatedCells = (cells: Coordinate[], clockwise: boolean): Coordinate[] => {
  return cells.map(cell => {
    if (clockwise) return { x: -cell.y, y: cell.x };
    return { x: cell.y, y: -cell.x };
  });
};

export const spawnPiece = (pieceDef?: PieceDefinition): ActivePiece => {
  const definition = pieceDef || PIECES[Math.floor(Math.random() * PIECES.length)];
  const color = GAME_COLORS[Math.floor(Math.random() * GAME_COLORS.length)];
  
  const activeDef = {
    ...definition,
    color
  };

  return {
    definition: activeDef,
    x: 0, 
    y: 0,
    rotation: 0,
    cells: [...activeDef.cells],
    spawnTimestamp: Date.now(),
    startSpawnY: 0
  };
};

export const checkCollision = (grid: GridCell[][], piece: ActivePiece, boardOffset: number): boolean => {
  for (const cell of piece.cells) {
    const x = normalizeX(piece.x + cell.x);
    const y = piece.y + cell.y;
    
    // 1. Check the primary grid cell (Math.floor)
    const floorY = Math.floor(y);
    
    // Bounds check for floorY
    if (floorY >= TOTAL_HEIGHT) return true;
    // Collision check for floorY
    if (floorY >= 0 && grid[floorY][x] !== null) return true;

    // 2. Check the secondary grid cell (Math.ceil) if we are partially in the next row
    // We use a small epsilon (0.05) to allow "resting" exactly on a line without triggering collision,
    // but catching any significant penetration.
    if (y - floorY > 0.05) {
        const ceilY = floorY + 1;
        if (ceilY >= TOTAL_HEIGHT) return true;
        if (ceilY >= 0 && grid[ceilY][x] !== null) return true;
    }
  }
  return false;
};

export const updateGroups = (grid: GridCell[][]): GridCell[][] => {
  const newGrid = grid.map(row => [...row]);
  const visited = new Set<string>();
  const getPosKey = (x: number, y: number) => `${x},${y}`;
  const now = Date.now();
  
  // Track which group IDs have been processed in this cycle to detect splits
  const processedGroupIds = new Set<string>();

  for (let y = 0; y < TOTAL_HEIGHT; y++) {
    for (let x = 0; x < TOTAL_WIDTH; x++) {
      const cell = newGrid[y][x];
      const key = getPosKey(x, y);

      if (cell && !visited.has(key)) {
        const queue = [{x, y}];
        const groupCells: {x: number, y: number, cell: BlockData}[] = [];
        
        let hasNewBlocks = false;
        const existingGroupIds = new Set<string>();
        let originalTimestamp = cell.timestamp;
        const color = cell.color;
        
        visited.add(key);
        
        let ptr = 0;
        while(ptr < queue.length) {
            const cur = queue[ptr++];
            const curCell = newGrid[cur.y][cur.x]!;
            groupCells.push({x: cur.x, y: cur.y, cell: curCell});
            
            // Check if block is new (empty groupId from mergePiece) or existing
            if (curCell.groupId === '') {
                hasNewBlocks = true;
            } else {
                existingGroupIds.add(curCell.groupId);
                originalTimestamp = curCell.timestamp;
            }

            const neighbors = [
                {x: normalizeX(cur.x + 1), y: cur.y},
                {x: normalizeX(cur.x - 1), y: cur.y},
                {x: cur.x, y: cur.y + 1},
                {x: cur.x, y: cur.y - 1}
            ];

            for (const n of neighbors) {
                if (n.y >= 0 && n.y < TOTAL_HEIGHT) {
                    const nKey = getPosKey(n.x, n.y);
                    const nCell = newGrid[n.y][n.x];
                    if (nCell && nCell.color === color && !visited.has(nKey)) {
                        visited.add(nKey);
                        queue.push(n);
                    }
                }
            }
        }

        let minY = TOTAL_HEIGHT;
        let maxY = -1;
        
        groupCells.forEach(gc => {
            if (gc.y < minY) minY = gc.y;
            if (gc.y > maxY) maxY = gc.y;
        });

        const size = groupCells.length;

        // Determine Final Group ID and Timestamp
        let finalGroupId = Math.random().toString(36).substr(2, 9);
        let finalTimestamp = now;

        if (hasNewBlocks) {
            if (existingGroupIds.size > 0) {
                // Case: Merged with existing blocks -> Reset refill (0 progress)
                finalTimestamp = now;
            } else {
                // Case: Isolated new piece -> Start full (100% progress)
                finalTimestamp = 0;
            }
        } else {
            // No new blocks
            if (existingGroupIds.size === 1) {
                const oldId = Array.from(existingGroupIds)[0];
                if (processedGroupIds.has(oldId)) {
                    // Split detected (ID used already) -> Reset refill
                    finalTimestamp = now;
                } else {
                    // Stable group -> Keep original ID and Timestamp
                    finalGroupId = oldId;
                    finalTimestamp = originalTimestamp;
                    processedGroupIds.add(oldId);
                }
            } else {
                // Merging multiple existing groups (e.g. via gravity) -> Reset refill
                finalTimestamp = now;
            }
        }

        groupCells.forEach(gc => {
            newGrid[gc.y][gc.x] = {
                ...gc.cell,
                groupId: finalGroupId,
                groupMinY: minY,
                groupMaxY: maxY,
                groupSize: size,
                timestamp: finalTimestamp
            };
        });
      }
    }
  }
  return newGrid;
};

export const mergePiece = (grid: GridCell[][], piece: ActivePiece): GridCell[][] => {
  const newGrid = grid.map(row => [...row]);
  const color = piece.definition.color;
  const now = Date.now();

  for (const cell of piece.cells) {
    const x = normalizeX(piece.x + cell.x);
    // Map float Y to integer grid row
    const y = Math.floor(piece.y + cell.y);
    
    if (y >= 0 && y < TOTAL_HEIGHT) {
      newGrid[y][x] = {
        id: Math.random().toString(36).substr(2, 9),
        groupId: '', // Mark as temp/new
        timestamp: now,
        color,
        groupMinY: 0,
        groupMaxY: 0,
        groupSize: 0
      };
    }
  }
  
  return updateGroups(newGrid);
};

export const findContiguousGroup = (grid: GridCell[][], startX: number, startY: number): Coordinate[] => {
    const startCell = grid[startY][startX];
    if (!startCell) return [];
    
    const group: Coordinate[] = [];
    const visited = new Set<string>();
    const queue = [{x: startX, y: startY}];
    visited.add(`${startX},${startY}`);
    const color = startCell.color;

    while(queue.length > 0) {
        const {x, y} = queue.shift()!;
        group.push({x, y});

        const neighbors = [
            {x: normalizeX(x + 1), y: y},
            {x: normalizeX(x - 1), y: y},
            {x: x, y: y + 1},
            {x: x, y: y - 1}
        ];

        for (const n of neighbors) {
            if (n.y >= 0 && n.y < TOTAL_HEIGHT) {
                const nCell = grid[n.y][n.x];
                if (nCell && nCell.color === color && !visited.has(`${n.x},${n.y}`)) {
                    visited.add(`${n.x},${n.y}`);
                    queue.push(n);
                }
            }
        }
    }
    return group;
}

export const getGhostY = (grid: GridCell[][], piece: ActivePiece, boardOffset: number): number => {
    // Start searching from the current integer position
    let y = Math.floor(piece.y);
    while(true) {
        if (checkCollision(grid, {...piece, y: y + 1}, boardOffset)) {
            return y;
        }
        y++;
    }
};

export const getFloatingBlocks = (grid: GridCell[][]): { grid: GridCell[][], falling: FallingBlock[] } => {
    const grounded = new Set<string>();
    const queue: {x: number, y: number}[] = [];
    const lastRow = TOTAL_HEIGHT - 1;

    // 1. Mark all bottom-row blocks as grounded
    for (let x = 0; x < TOTAL_WIDTH; x++) {
        if (grid[lastRow][x] !== null) {
            const key = `${x},${lastRow}`;
            grounded.add(key);
            queue.push({x, y: lastRow});
        }
    }

    // 2. BFS to find all connected supported blocks
    let head = 0;
    while(head < queue.length) {
        const {x, y} = queue[head++];
        
        const neighbors = [
            {x: normalizeX(x + 1), y},
            {x: normalizeX(x - 1), y},
            {x, y: y - 1}, // Above
            {x, y: y + 1}  // Below
        ];

        for (const n of neighbors) {
            if (n.y >= 0 && n.y < TOTAL_HEIGHT) {
                const key = `${n.x},${n.y}`;
                if (grid[n.y][n.x] !== null && !grounded.has(key)) {
                    grounded.add(key);
                    queue.push(n);
                }
            }
        }
    }

    // 3. Separate ungrounded blocks into FallingBlock array
    const newGrid = grid.map(row => [...row]);
    const falling: FallingBlock[] = [];

    for (let y = 0; y < TOTAL_HEIGHT; y++) {
        for (let x = 0; x < TOTAL_WIDTH; x++) {
            if (newGrid[y][x] !== null && !grounded.has(`${x},${y}`)) {
                falling.push({
                    data: newGrid[y][x]!,
                    x,
                    y,
                    velocity: 0
                });
                newGrid[y][x] = null;
            }
        }
    }

    return { grid: newGrid, falling };
};

export const updateFallingBlocks = (
    blocks: FallingBlock[], 
    grid: GridCell[][], 
    dt: number,
    baseSpeed: number
  ): { active: FallingBlock[], landed: FallingBlock[] } => {
    const active: FallingBlock[] = [];
    const landed: FallingBlock[] = [];
    
    // Fall 3x faster than the base game speed
    const FALL_SPEED = (1 / baseSpeed) * 3; 
  
    for (const block of blocks) {
      const nextY = block.y + (FALL_SPEED * dt);
      const col = block.x;
      
      // Determine the precise Y coordinate where this block would collide with the floor or another block.
      // We scan downwards from the current position.
      let landingRow = TOTAL_HEIGHT;
      for (let r = Math.floor(block.y) + 1; r < TOTAL_HEIGHT; r++) {
          if (grid[r][col] !== null) {
              landingRow = r;
              break;
          }
      }

      // The block sits on top of landingRow, so its Y can be at most (landingRow - 1.0)
      const maxY = landingRow - 1;

      if (nextY > maxY) {
          // If moving to nextY would penetrate the floor, clamp it and mark as landed
          landed.push({ ...block, y: maxY });
      } else {
          // Otherwise keep falling
          active.push({ ...block, y: nextY });
      }
    }
    
    return { active, landed };
  };

// --- SCORING HELPERS ---

export const calculateHeightBonus = (y: number): number => {
    const bottomRow = TOTAL_HEIGHT - 1;
    const topRow = BUFFER_HEIGHT;
    
    // If somehow below floor (shouldn't happen), 0
    if (y >= bottomRow) return 0;
    // If in buffer or above, max points
    if (y <= topRow) return 200;
    
    // Linear interpolation
    // Range size = 19 (indices 4 to 23)
    const range = bottomRow - topRow;
    const delta = bottomRow - y;
    const fraction = delta / range;
    const rawPoints = 200 * fraction;
    
    // Round up to nearest 5
    return Math.ceil(rawPoints / 5) * 5;
};

export const calculateOffScreenBonus = (x: number, boardOffset: number): number => {
    // Relative position in the 30-width cylinder, shifted so boardOffset is 0
    const relX = normalizeX(x - boardOffset);
    
    // Visible range is 0 to (VISIBLE_WIDTH - 1) i.e. 0-9
    if (relX < VISIBLE_WIDTH) return 0;
    
    // Distance to right edge (index 9)
    const distRight = relX - (VISIBLE_WIDTH - 1);
    
    // Distance to left edge (index 0) wrapping around
    const distLeft = TOTAL_WIDTH - relX;
    
    const dist = Math.min(distRight, distLeft);
    return dist; // 1 point per unit distance
};

// n is the cumulative block number destroyed in this combo sequence (1-indexed)
export const calculateMultiplier = (n: number): number => {
    // n=1 -> 1.0
    // n=2 -> 1.25
    // n=3 -> 1.75
    // Formula: 1 + 0.125 * n * (n - 1)
    // Proof:
    // 1: 1 + 0 = 1
    // 2: 1 + 0.125*2*1 = 1.25
    // 3: 1 + 0.125*3*2 = 1.75
    // 4: 1 + 0.125*4*3 = 2.5
    return 1 + (0.125 * n * (n - 1));
};

export const calculateAdjacencyBonus = (grid: GridCell[][], groupCells: Coordinate[]): number => {
    const uniqueNeighborGroups = new Set<string>();
    const groupSet = new Set(groupCells.map(c => `${c.x},${c.y}`));
    
    groupCells.forEach(cell => {
         const neighbors = [
            {x: normalizeX(cell.x + 1), y: cell.y},
            {x: normalizeX(cell.x - 1), y: cell.y},
            {x: cell.x, y: cell.y + 1},
            {x: cell.x, y: cell.y - 1}
        ];
        
        neighbors.forEach(n => {
            if (n.y >= 0 && n.y < TOTAL_HEIGHT) {
                // If it's not part of the group itself
                if (!groupSet.has(`${n.x},${n.y}`)) {
                    const neighborCell = grid[n.y][n.x];
                    if (neighborCell) {
                        uniqueNeighborGroups.add(neighborCell.groupId);
                    }
                }
            }
        });
    });
    
    return uniqueNeighborGroups.size * 5;
};