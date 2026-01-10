import { ActivePiece, Coordinate, GridCell, PieceDefinition, PieceType, BlockData, FallingBlock } from '../types';
import { TOTAL_WIDTH, TOTAL_HEIGHT, PIECES, GAME_COLORS, VISIBLE_WIDTH, BUFFER_HEIGHT } from '../constants';

export const normalizeX = (x: number): number => {
  return ((x % TOTAL_WIDTH) + TOTAL_WIDTH) % TOTAL_WIDTH;
};

export const getRotatedCells = (cells: Coordinate[], clockwise: boolean): Coordinate[] => {
  return cells.map(({ x, y }) => {
    if (clockwise) {
      return { x: -y, y: x };
    } else {
      return { x: y, y: -x };
    }
  });
};

export const spawnPiece = (definition?: PieceDefinition): ActivePiece => {
  const def = definition || PIECES[Math.floor(Math.random() * PIECES.length)];
  const color = GAME_COLORS[Math.floor(Math.random() * GAME_COLORS.length)];
  
  return {
    definition: { ...def, color },
    x: 0, // Set by caller
    y: 0, // Set by caller
    rotation: 0,
    cells: [...def.cells],
    spawnTimestamp: Date.now(),
    startSpawnY: 0 // Set by caller
  };
};

export const checkCollision = (grid: GridCell[][], piece: ActivePiece, boardOffset: number): boolean => {
  for (const cell of piece.cells) {
    const x = normalizeX(piece.x + cell.x);
    const y = piece.y + cell.y;

    // Floor Check:
    // A block at y spans [y, y+1).
    // It hits the floor if the bottom edge (y + 1) is > TOTAL_HEIGHT.
    if (y + 1 > TOTAL_HEIGHT) return true; 
    
    // Grid Cell Check:
    // We must check all integer grid rows that this block overlaps.
    // A block at y spans [y, y+1).
    // Using a slightly more permissive epsilon (0.01) allows for microscopic overlaps 
    // without triggering collision, preventing "sticky" movement.
    
    const rStart = Math.floor(y);
    const rEnd = Math.floor(y + 1 - 0.01);

    for (let r = rStart; r <= rEnd; r++) {
        if (r >= 0 && r < TOTAL_HEIGHT) {
           if (grid[r][x] !== null) return true;
        }
    }
  }
  return false;
};

export const getGhostY = (grid: GridCell[][], piece: ActivePiece, boardOffset: number): number => {
  // Start search strictly from the floor of the current position
  const startY = Math.floor(piece.y);
  let y = startY;

  // Search downwards for the first invalid position
  while (!checkCollision(grid, { ...piece, y: y + 1 }, boardOffset)) {
    y += 1;
  }
  
  // Safety: Ensure we never return a ghost position 'above' the current floor 
  // (though the loop logic starting at startY guarantees this naturally).
  return Math.max(startY, y);
};

export const findContiguousGroup = (grid: GridCell[][], startX: number, startY: number): Coordinate[] => {
  const startCell = grid[startY][startX];
  if (!startCell) return [];

  const group: Coordinate[] = [];
  const visited = new Set<string>();
  const queue: Coordinate[] = [{ x: startX, y: startY }];
  
  const targetGroupId = startCell.groupId;

  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    const key = `${x},${y}`;
    
    if (visited.has(key)) continue;
    visited.add(key);
    group.push({ x, y });

    const neighbors = [
      { x: normalizeX(x + 1), y: y },
      { x: normalizeX(x - 1), y: y },
      { x: x, y: y + 1 },
      { x: x, y: y - 1 }
    ];

    for (const n of neighbors) {
      if (n.y >= 0 && n.y < TOTAL_HEIGHT) {
        const neighborCell = grid[n.y][n.x];
        if (neighborCell && neighborCell.groupId === targetGroupId) {
           if (!visited.has(`${n.x},${n.y}`)) {
             queue.push(n);
           }
        }
      }
    }
  }

  return group;
};

export const updateGroups = (grid: GridCell[][]): GridCell[][] => {
    const newGrid = grid.map(row => [...row]);
    const visited = new Set<string>();
    
    // Helper to find color-contiguous group
    const findColorGroup = (gx: number, gy: number, color: string): Coordinate[] => {
        const g: Coordinate[] = [];
        const q: Coordinate[] = [{x: gx, y: gy}];
        const v = new Set<string>();
        
        while(q.length > 0) {
            const curr = q.shift()!;
            const key = `${curr.x},${curr.y}`;
            if(v.has(key)) continue;
            v.add(key);
            g.push(curr);
            
            const nbs = [
                { x: normalizeX(curr.x + 1), y: curr.y },
                { x: normalizeX(curr.x - 1), y: curr.y },
                { x: curr.x, y: curr.y + 1 },
                { x: curr.x, y: curr.y - 1 }
            ];
            
            for(const n of nbs) {
                if(n.y >= 0 && n.y < TOTAL_HEIGHT) {
                    const c = newGrid[n.y][n.x];
                    if(c && c.color === color && !v.has(`${n.x},${n.y}`)) {
                        q.push(n);
                    }
                }
            }
        }
        return g;
    };

    for (let y = 0; y < TOTAL_HEIGHT; y++) {
        for (let x = 0; x < TOTAL_WIDTH; x++) {
            const cell = newGrid[y][x];
            if (cell && !visited.has(`${x},${y}`)) {
                const group = findColorGroup(x, y, cell.color);
                const newGroupId = Math.random().toString(36).substr(2, 9);
                
                let minY = TOTAL_HEIGHT;
                let maxY = -1;
                
                group.forEach(pt => {
                    if (pt.y < minY) minY = pt.y;
                    if (pt.y > maxY) maxY = pt.y;
                });
                
                group.forEach(pt => {
                    visited.add(`${pt.x},${pt.y}`);
                    const c = newGrid[pt.y][pt.x]!;
                    newGrid[pt.y][pt.x] = {
                        ...c,
                        groupId: newGroupId,
                        groupMinY: minY,
                        groupMaxY: maxY,
                        groupSize: group.length
                    };
                });
            }
        }
    }
    return newGrid;
};

export const mergePiece = (grid: GridCell[][], piece: ActivePiece): GridCell[][] => {
  const newGrid = grid.map(row => [...row]);
  const groupId = Math.random().toString(36).substr(2, 9);
  const now = Date.now();
  
  let minY = TOTAL_HEIGHT;
  let maxY = -1;
  
  piece.cells.forEach(cell => {
      const y = Math.floor(piece.y + cell.y);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
  });

  const groupSize = piece.cells.length;

  piece.cells.forEach(cell => {
    const x = normalizeX(piece.x + cell.x);
    const y = Math.floor(piece.y + cell.y);
    
    if (y >= 0 && y < TOTAL_HEIGHT) {
      newGrid[y][x] = {
        id: Math.random().toString(36).substr(2, 9),
        groupId,
        timestamp: now,
        color: piece.definition.color,
        groupMinY: minY,
        groupMaxY: maxY,
        groupSize
      };
    }
  });
  
  return updateGroups(newGrid);
};

export const getFloatingBlocks = (grid: GridCell[][]): { grid: GridCell[][], falling: FallingBlock[] } => {
    const newGrid = grid.map(row => [...row]);
    const falling: FallingBlock[] = [];
    const isSupported = new Set<string>();
    
    let changed = true;
    while (changed) {
        changed = false;
        // Scan bottom-up
        for (let y = TOTAL_HEIGHT - 1; y >= 0; y--) {
            for (let x = 0; x < TOTAL_WIDTH; x++) {
                if (newGrid[y][x]) {
                    const key = `${x},${y}`;
                    if (isSupported.has(key)) continue;
                    
                    let supported = false;
                    // 1. Floor support
                    if (y === TOTAL_HEIGHT - 1) {
                        supported = true;
                    } 
                    // 2. Block below support
                    else {
                        const below = newGrid[y+1][x];
                        // Must be occupied AND supported
                        if (below && isSupported.has(`${x},${y+1}`)) {
                           supported = true;
                        }
                    }
                    
                    if (supported) {
                        isSupported.add(key);
                        changed = true;
                    }
                }
            }
        }
    }
    
    // Remove unsupported
    for (let y = 0; y < TOTAL_HEIGHT; y++) {
        for (let x = 0; x < TOTAL_WIDTH; x++) {
            if (newGrid[y][x] && !isSupported.has(`${x},${y}`)) {
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
    gameSpeed: number
): { active: FallingBlock[], landed: FallingBlock[] } => {
    
    const active: FallingBlock[] = [];
    const landed: FallingBlock[] = [];
    const FALL_SPEED = 0.02 * dt; 
    
    const sortedBlocks = [...blocks].sort((a, b) => b.y - a.y);
    
    for (const block of sortedBlocks) {
        const nextY = block.y + FALL_SPEED;
        
        if (nextY >= TOTAL_HEIGHT - 1) {
            landed.push({ ...block, y: TOTAL_HEIGHT - 1 });
            continue;
        }
        
        const checkRow = Math.floor(nextY + 1);
        const col = block.x;
        
        if (grid[checkRow] && grid[checkRow][col]) {
             landed.push({ ...block, y: Math.floor(nextY) });
        } else {
             active.push({ ...block, y: nextY });
        }
    }
    
    return { active, landed };
};

export const calculateHeightBonus = (y: number): number => {
    return Math.max(0, (TOTAL_HEIGHT - y) * 10);
};

export const calculateOffScreenBonus = (x: number, boardOffset: number): number => {
    const center = normalizeX(boardOffset + VISIBLE_WIDTH / 2);
    let dist = Math.abs(x - center);
    if (dist > TOTAL_WIDTH / 2) dist = TOTAL_WIDTH - dist;
    
    if (dist > VISIBLE_WIDTH / 2) {
        return 50;
    }
    return 0;
};

export const calculateMultiplier = (combo: number): number => {
    return 1 + (combo * 0.1);
};

export const calculateAdjacencyBonus = (grid: GridCell[][], group: Coordinate[]): number => {
    let neighborsCount = 0;
    const groupKeys = new Set(group.map(g => `${g.x},${g.y}`));
    
    group.forEach(({x, y}) => {
         const nbs = [
            { x: normalizeX(x + 1), y },
            { x: normalizeX(x - 1), y },
            { x, y: y + 1 },
            { x, y: y - 1 }
        ];
        
        nbs.forEach(n => {
            if (n.y >= 0 && n.y < TOTAL_HEIGHT) {
                if (grid[n.y][n.x] && !groupKeys.has(`${n.x},${n.y}`)) {
                    neighborsCount++;
                }
            }
        });
    });
    
    return neighborsCount * 5;
};