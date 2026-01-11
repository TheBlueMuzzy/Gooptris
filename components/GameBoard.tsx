import React, { useMemo, useCallback, useRef } from 'react';
import { GameState, Coordinate, FallingBlock, GridCell } from '../types';
import { VISIBLE_WIDTH, VISIBLE_HEIGHT, COLORS, TOTAL_WIDTH, TOTAL_HEIGHT, BUFFER_HEIGHT, PER_BLOCK_DURATION } from '../constants';
import { normalizeX, getGhostY } from '../utils/gameLogic';

interface GameBoardProps {
  state: GameState;
  onBlockTap: (x: number, y: number) => void;
  onTapLeft: () => void;
  onTapRight: () => void;
  onSwipeUp: () => void;
  onSwipeDown: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}

const BLOCK_SIZE = 30; 
const RADIUS = 8; // Corner radius for goop blobs

// Helper interface for renderable items
interface RenderableCell {
    visX: number;
    y: number; // Grid Y
    screenX: number;
    screenY: number;
    width: number;
    cell: GridCell; // For static/falling blocks
    color: string;
    neighbors: { t: boolean, r: boolean, b: boolean, l: boolean };
    isFalling?: boolean;
}

export const GameBoard: React.FC<GameBoardProps> = ({ 
    state, onBlockTap, onTapLeft, onTapRight, onSwipeUp, onSwipeDown, onSwipeLeft, onSwipeRight 
}) => {
  const { grid, boardOffset, activePiece, fallingBlocks } = state;

  // --- CYLINDRICAL PROJECTION LOGIC ---
  const ANGLE_PER_COL = (2 * Math.PI) / TOTAL_WIDTH; 
  const CYL_RADIUS = BLOCK_SIZE / ANGLE_PER_COL; 

  // Viewport
  const maxAngle = (VISIBLE_WIDTH / 2) * ANGLE_PER_COL;
  const projectedHalfWidth = CYL_RADIUS * Math.sin(maxAngle);
  
  const vbX = -projectedHalfWidth;
  const vbY = 0;
  const vbW = projectedHalfWidth * 2;
  const vbH = VISIBLE_HEIGHT * BLOCK_SIZE;

  const getScreenX = (visX: number) => {
      const centerCol = VISIBLE_WIDTH / 2;
      const offsetFromCenter = visX - centerCol;
      const angle = offsetFromCenter * ANGLE_PER_COL;
      return CYL_RADIUS * Math.sin(angle);
  };

  const getGridXFromScreen = (screenX: number) => {
      const sinVal = Math.max(-1, Math.min(1, screenX / CYL_RADIUS));
      const angle = Math.asin(sinVal);
      const offsetFromCenter = angle / ANGLE_PER_COL;
      return (VISIBLE_WIDTH / 2) + offsetFromCenter;
  };

  // Touch / Mouse Handling
  const touchStart = useRef<{x: number, y: number, time: number} | null>(null);

  const resolveClickOrTap = (clientX: number, clientY: number, target: Element) => {
      const svgRect = target.getBoundingClientRect();
      const relX = clientX - svgRect.left;
      const relY = clientY - svgRect.top;
      
      const svgX = vbX + (relX / svgRect.width) * vbW;
      const svgY = vbY + (relY / svgRect.height) * vbH;

      const rawVisX = getGridXFromScreen(svgX);
      const visY = Math.floor(svgY / BLOCK_SIZE);
      
      // 1. Check if we hit a valid block
      if (rawVisX >= 0) {
          const visX = Math.floor(rawVisX);
          const gridX = normalizeX(visX + boardOffset);
          const gridY = visY + BUFFER_HEIGHT;

          if (visX >= 0 && visX < VISIBLE_WIDTH && visY >= 0 && visY < VISIBLE_HEIGHT) {
             const cell = grid[gridY][gridX];
             if (cell) {
                 onBlockTap(gridX, gridY);
                 return;
             }
          }
      }

      // 2. If no block hit (or empty space), handle as Rotation Tap
      const screenWidth = window.innerWidth;
      if (clientX < screenWidth / 2) {
          onTapLeft();
      } else {
          onTapRight();
      }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
      touchStart.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          time: Date.now()
      };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      if (!touchStart.current) return;
      
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const dx = endX - touchStart.current.x;
      const dy = endY - touchStart.current.y;
      const dt = Date.now() - touchStart.current.time;
      
      touchStart.current = null;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Tap Detection (minimal movement and short duration)
      if (Math.max(absDx, absDy) < 15 && dt < 300) {
          resolveClickOrTap(endX, endY, e.currentTarget);
          return;
      }

      // Swipe Detection
      if (absDx > absDy) {
          if (dx > 30) onSwipeRight();
          else if (dx < -30) onSwipeLeft();
      } else {
          if (dy > 30) onSwipeDown();
          else if (dy < -30) onSwipeUp();
      }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
     // Optional: simple mouse click handling for desktop (taps only)
     // Swipes via mouse drag not strictly necessary for MVP but helpful
     // For now, assume Click = Tap
     resolveClickOrTap(e.clientX, e.clientY, e.currentTarget);
  };

  const style = useMemo(() => `
    .glow-stroke {
        filter: drop-shadow(0 0 3px currentColor);
        animation: pulseGlow 2s infinite alternate;
    }
    @keyframes pulseGlow {
        from { filter: drop-shadow(0 0 2px currentColor); }
        to { filter: drop-shadow(0 0 6px currentColor); }
    }
  `, []);

  const now = Date.now();

  const getBlobPath = (x: number, y: number, w: number, h: number, neighbors: {t:boolean, r:boolean, b:boolean, l:boolean}) => {
      let d = "";
      if (!neighbors.t && !neighbors.l) d += `M ${x} ${y + RADIUS} Q ${x} ${y} ${x + RADIUS} ${y} `;
      else d += `M ${x} ${y} `;
      
      if (!neighbors.t && !neighbors.r) d += `L ${x + w - RADIUS} ${y} Q ${x + w} ${y} ${x + w} ${y + RADIUS} `;
      else d += `L ${x + w} ${y} `;

      if (!neighbors.b && !neighbors.r) d += `L ${x + w} ${y + h - RADIUS} Q ${x + w} ${y + h} ${x + w - RADIUS} ${y + h} `;
      else d += `L ${x + w} ${y + h} `;

      if (!neighbors.b && !neighbors.l) d += `L ${x + RADIUS} ${y + h} Q ${x} ${y + h} ${x} ${y + h - RADIUS} `;
      else d += `L ${x} ${y + h} `;
      
      d += "Z";
      return d;
  };

  const getContourPath = (x: number, y: number, w: number, h: number, n: {t:boolean, r:boolean, b:boolean, l:boolean}) => {
      const r = RADIUS;
      let d = "";
      if (!n.t) {
          const start = n.l ? x : x + r;
          const end = n.r ? x + w : x + w - r;
          d += `M ${start} ${y} L ${end} ${y} `;
      }
      if (!n.r) {
          const start = n.t ? y : y + r;
          const end = n.b ? y + h : y + h - r;
          d += `M ${x + w} ${start} L ${x + w} ${end} `;
      }
      if (!n.b) {
          const start = n.l ? x : x + r;
          const end = n.r ? x + w : x + w - r;
          d += `M ${end} ${y + h} L ${start} ${y + h} `;
      }
      if (!n.l) {
          const start = n.t ? y : y + r;
          const end = n.b ? y + h : y + h - r;
          d += `M ${x} ${end} L ${x} ${start} `;
      }
      if (!n.t && !n.l) d += `M ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} `; 
      if (!n.t && !n.r) d += `M ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} `; 
      if (!n.b && !n.r) d += `M ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} `; 
      if (!n.b && !n.l) d += `M ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} `; 
      return d;
  };

  const getHighlightPath = (x: number, y: number, w: number, n: {t:boolean, l:boolean, r:boolean}) => {
      if (n.t) return "";
      const start = n.l ? x + 2 : x + RADIUS;
      const end = n.r ? x + w - 2 : x + w - RADIUS;
      const width = end - start;
      if (width <= 0) return "";
      return `M ${start} ${y + 5} Q ${start + width/2} ${y + 5} ${end} ${y + 5}`;
  };

  // --- Render Groups Preparation ---
  // Bucket all visible items by GroupID to enable Masking
  const groups = useMemo(() => {
      const map = new Map<string, RenderableCell[]>();

      // 1. Static Grid
      for (let y = BUFFER_HEIGHT; y < BUFFER_HEIGHT + VISIBLE_HEIGHT; y++) {
          for (let visX = 0; visX < VISIBLE_WIDTH; visX++) {
              const gridX = normalizeX(visX + boardOffset);
              const cell = grid[y][gridX];
              if (!cell) continue;

              const startX = getScreenX(visX);
              const endX = getScreenX(visX + 1);
              const width = endX - startX;
              if (width <= 0) continue;
              const yPos = (y - BUFFER_HEIGHT) * BLOCK_SIZE;

              const neighbors = {
                  t: y > 0 && grid[y - 1][gridX]?.groupId === cell.groupId,
                  b: y < TOTAL_HEIGHT - 1 && grid[y + 1][gridX]?.groupId === cell.groupId,
                  l: grid[y][normalizeX(gridX - 1)]?.groupId === cell.groupId,
                  r: grid[y][normalizeX(gridX + 1)]?.groupId === cell.groupId,
              };

              if (!map.has(cell.groupId)) map.set(cell.groupId, []);
              map.get(cell.groupId)!.push({
                  visX, y, screenX: startX, screenY: yPos, width, cell, color: cell.color, neighbors
              });
          }
      }

      // 2. Falling Blocks
      const fallingMap = new Map<string, FallingBlock[]>();
      fallingBlocks.forEach(b => {
          if (!fallingMap.has(b.data.groupId)) fallingMap.set(b.data.groupId, []);
          fallingMap.get(b.data.groupId)!.push(b);
      });

      fallingMap.forEach((blocks, gid) => {
           const coords = new Set<string>();
           blocks.forEach(b => coords.add(`${Math.round(b.x)},${Math.round(b.y)}`));

           blocks.forEach(block => {
                if (block.y < BUFFER_HEIGHT - 1) return;
                let visX = block.x - boardOffset;
                if (visX > TOTAL_WIDTH / 2) visX -= TOTAL_WIDTH;
                if (visX < -TOTAL_WIDTH / 2) visX += TOTAL_WIDTH;

                if (visX >= 0 && visX < VISIBLE_WIDTH) {
                    const startX = getScreenX(visX);
                    const endX = getScreenX(visX + 1);
                    const width = endX - startX;
                    const yPos = (block.y - BUFFER_HEIGHT) * BLOCK_SIZE;

                    const bx = Math.round(block.x);
                    const by = Math.round(block.y);
                    const neighbors = {
                        t: coords.has(`${bx},${by - 1}`),
                        r: coords.has(`${normalizeX(bx + 1)},${by}`),
                        b: coords.has(`${bx},${by + 1}`),
                        l: coords.has(`${normalizeX(bx - 1)},${by}`),
                    };

                    if (!map.has(gid)) map.set(gid, []);
                    map.get(gid)!.push({
                        visX, y: block.y, screenX: startX, screenY: yPos, width, 
                        cell: block.data, color: block.data.color, neighbors, isFalling: true
                    });
                }
           });
      });

      return map;
  }, [grid, boardOffset, fallingBlocks, vbX, vbY, vbW, vbH]);

  return (
    <div 
        className="w-full h-full bg-slate-950 relative shadow-2xl border-x-4 border-slate-900 overflow-hidden select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleMouseDown}
    >
        {/* CRT Scanline */}
        <div className="absolute inset-0 pointer-events-none z-10 opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))]" style={{backgroundSize: "100% 2px, 3px 100%"}} />
        
        <style>{style}</style>
        <svg 
            width="100%" 
            height="100%"
            viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
            preserveAspectRatio="xMidYMin meet"
            className="touch-none"
        >
            <defs>
                {Array.from(groups.entries()).map(([gid, cells]) => (
                    <mask key={`mask-${gid}`} id={`mask-${gid}`}>
                        {cells.map((c, i) => (
                             <path 
                                key={i}
                                d={getBlobPath(c.screenX, c.screenY, c.width, BLOCK_SIZE, c.neighbors)}
                                fill="white"
                                stroke="white"
                                strokeWidth="1.5" // Expansion to fix seams
                             />
                        ))}
                    </mask>
                ))}
            </defs>

            {/* 1. Background Grid */}
            {Array.from({length: VISIBLE_HEIGHT}).map((_, yIdx) => {
                const y = yIdx + BUFFER_HEIGHT;
                return Array.from({length: VISIBLE_WIDTH}).map((_, visX) => {
                    const startX = getScreenX(visX);
                    const width = getScreenX(visX+1) - startX;
                    const yPos = yIdx * BLOCK_SIZE;
                    return (
                        <g key={`bg-${y}-${visX}`} opacity={0.2}>
                            <line x1={startX} y1={yPos} x2={startX+width} y2={yPos} stroke={COLORS.GRID_EMPTY} strokeWidth="1" />
                            <line x1={startX} y1={yPos} x2={startX} y2={yPos+BLOCK_SIZE} stroke={COLORS.GRID_EMPTY} strokeWidth="1" />
                            <circle cx={startX} cy={yPos} r={1} fill={COLORS.GRID_EMPTY} />
                        </g>
                    );
                });
            })}

            {/* 2. Groups (Static & Falling) */}
            {Array.from(groups.entries()).map(([gid, cells]) => {
                if (cells.length === 0) return null;
                const sample = cells[0];
                const color = sample.color;

                // Calculate bounding box for the mask-rect
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                cells.forEach(c => {
                    minX = Math.min(minX, c.screenX);
                    minY = Math.min(minY, c.screenY);
                    maxX = Math.max(maxX, c.screenX + c.width);
                    maxY = Math.max(maxY, c.screenY + BLOCK_SIZE);
                });

                return (
                    <g key={`group-${gid}`}>
                        {/* A. Unified Shell */}
                        <rect 
                            x={minX} y={minY} width={maxX - minX} height={maxY - minY}
                            fill={color}
                            fillOpacity={0.2}
                            mask={`url(#mask-${gid})`}
                        />

                        {/* B. Liquid Fills - Rendered as solid shapes inside a Group with opacity */}
                        <g opacity={0.9} mask={`url(#mask-${gid})`}>
                            {cells.map((c, i) => {
                                if (!c.cell || c.isFalling) {
                                    return (
                                        <rect 
                                            key={`liq-${i}`}
                                            x={c.screenX - 0.5} 
                                            y={c.screenY}
                                            width={c.width + 1} // Overlap
                                            height={BLOCK_SIZE}
                                            fill={color}
                                        />
                                    );
                                }

                                const totalDuration = c.cell.groupSize * PER_BLOCK_DURATION;
                                const groupHeight = (c.cell.groupMaxY - c.cell.groupMinY + 1);
                                const timePerRow = totalDuration / Math.max(1, groupHeight);
                                const rowIndex = c.cell.groupMaxY - c.y; 
                                const startDelay = rowIndex * timePerRow;
                                const timeSinceStart = now - c.cell.timestamp;
                                const timeIntoRow = timeSinceStart - startDelay;
                                let fillHeight = 0;
                                if (timeIntoRow >= timePerRow) fillHeight = BLOCK_SIZE;
                                else if (timeIntoRow > 0) fillHeight = (timeIntoRow / timePerRow) * BLOCK_SIZE;

                                return (
                                    <rect 
                                        key={`liq-${i}`}
                                        x={c.screenX - 0.5} 
                                        y={c.screenY + (BLOCK_SIZE - fillHeight)} 
                                        width={c.width + 1}
                                        height={fillHeight} 
                                        fill={color}
                                    />
                                );
                            })}
                        </g>

                        {/* C. Contours (Glow) */}
                        {cells.map((c, i) => (
                             <path 
                                key={`cnt-${i}`}
                                d={getContourPath(c.screenX, c.screenY, c.width, BLOCK_SIZE, c.neighbors)}
                                fill="none"
                                stroke={color}
                                strokeWidth="2"
                                className="glow-stroke"
                                style={{ color: color }}
                             />
                        ))}

                         {/* D. Highlights */}
                         {cells.map((c, i) => {
                             const hPath = getHighlightPath(c.screenX, c.screenY, c.width, c.neighbors);
                             if (!hPath) return null;
                             return (
                                 <path 
                                    key={`hlt-${i}`}
                                    d={hPath}
                                    fill="none"
                                    stroke="white"
                                    strokeWidth="2"
                                    strokeOpacity={0.4}
                                    strokeLinecap="round"
                                 />
                             );
                         })}
                    </g>
                );
            })}

            {/* 3. Ghost Piece */}
            {activePiece && (() => {
                const ghostY = getGhostY(grid, activePiece, boardOffset);
                return activePiece.cells.map((cell, idx) => {
                    const pieceGridX = normalizeX(activePiece.x + cell.x);
                    const pieceGridY = ghostY + cell.y;
                    if (pieceGridY < BUFFER_HEIGHT) return null;

                    let visX = pieceGridX - boardOffset;
                    if (visX > TOTAL_WIDTH / 2) visX -= TOTAL_WIDTH;
                    if (visX < -TOTAL_WIDTH / 2) visX += TOTAL_WIDTH;

                    if (visX >= -2 && visX < VISIBLE_WIDTH + 2) {
                        const startX = getScreenX(visX);
                        const width = getScreenX(visX+1) - startX;
                        const yPos = (pieceGridY - BUFFER_HEIGHT) * BLOCK_SIZE;

                        const neighbors = {
                            t: activePiece.cells.some(o => o.x === cell.x && o.y === cell.y - 1),
                            r: activePiece.cells.some(o => o.x === cell.x + 1 && o.y === cell.y),
                            b: activePiece.cells.some(o => o.x === cell.x && o.y === cell.y + 1),
                            l: activePiece.cells.some(o => o.x === cell.x - 1 && o.y === cell.y),
                        };

                        return (
                            <path
                                key={`ghost-${idx}`}
                                d={getContourPath(startX, yPos, width, BLOCK_SIZE, neighbors)}
                                fill="none"
                                stroke={activePiece.definition.color}
                                strokeWidth="1"
                                strokeDasharray="4 2"
                                opacity="0.3"
                            />
                        );
                    }
                    return null;
                });
            })()}

            {/* 4. Active Piece */}
            {activePiece && (() => {
                const apCells = [];
                activePiece.cells.forEach((cell, idx) => {
                    const pieceGridX = normalizeX(activePiece.x + cell.x);
                    const pieceGridY = activePiece.y + cell.y;
                    if (pieceGridY < BUFFER_HEIGHT) return;

                    let visX = pieceGridX - boardOffset;
                    if (visX > TOTAL_WIDTH / 2) visX -= TOTAL_WIDTH;
                    if (visX < -TOTAL_WIDTH / 2) visX += TOTAL_WIDTH;

                    if (visX >= -2 && visX < VISIBLE_WIDTH + 2) {
                         const startX = getScreenX(visX);
                         const width = getScreenX(visX+1) - startX;
                         const yPos = (pieceGridY - BUFFER_HEIGHT) * BLOCK_SIZE;
                         
                         const neighbors = {
                            t: activePiece.cells.some(o => o.x === cell.x && o.y === cell.y - 1),
                            r: activePiece.cells.some(o => o.x === cell.x + 1 && o.y === cell.y),
                            b: activePiece.cells.some(o => o.x === cell.x && o.y === cell.y + 1),
                            l: activePiece.cells.some(o => o.x === cell.x - 1 && o.y === cell.y),
                        };
                        apCells.push({ screenX: startX, screenY: yPos, width, neighbors });
                    }
                });
                
                if (apCells.length === 0) return null;
                const color = activePiece.definition.color;
                
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                apCells.forEach(c => {
                    minX = Math.min(minX, c.screenX);
                    minY = Math.min(minY, c.screenY);
                    maxX = Math.max(maxX, c.screenX + c.width);
                    maxY = Math.max(maxY, c.screenY + BLOCK_SIZE);
                });

                return (
                    <g>
                        <defs>
                            <mask id="mask-active">
                                {apCells.map((c, i) => (
                                    <path 
                                        key={i}
                                        d={getBlobPath(c.screenX, c.screenY, c.width, BLOCK_SIZE, c.neighbors)}
                                        fill="white"
                                        stroke="white"
                                        strokeWidth="1.5"
                                    />
                                ))}
                            </mask>
                        </defs>
                        
                        <rect 
                            x={minX} y={minY} width={maxX - minX} height={maxY - minY}
                            fill={color}
                            fillOpacity={0.2}
                            mask="url(#mask-active)"
                        />
                        <g opacity={0.8} mask="url(#mask-active)">
                             {apCells.map((c, i) => (
                                <rect 
                                    key={i} 
                                    x={c.screenX - 0.5} 
                                    y={c.screenY} 
                                    width={c.width + 1} 
                                    height={BLOCK_SIZE} 
                                    fill={color} 
                                />
                             ))}
                        </g>

                        {apCells.map((c, i) => (
                             <React.Fragment key={i}>
                                <path 
                                    d={getContourPath(c.screenX, c.screenY, c.width, BLOCK_SIZE, c.neighbors)}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth="2"
                                    className="glow-stroke"
                                    style={{ color }}
                                />
                                {(() => {
                                    const h = getHighlightPath(c.screenX, c.screenY, c.width, c.neighbors);
                                    return h ? <path d={h} fill="none" stroke="white" strokeWidth="2" strokeOpacity={0.4} strokeLinecap="round" /> : null;
                                })()}
                             </React.Fragment>
                        ))}
                    </g>
                );
            })()}

        </svg>
    </div>
  );
};