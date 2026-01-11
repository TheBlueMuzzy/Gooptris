import React, { useMemo, useCallback } from 'react';
import { GameState, Coordinate } from '../types';
import { VISIBLE_WIDTH, VISIBLE_HEIGHT, COLORS, TOTAL_WIDTH, TOTAL_HEIGHT, BUFFER_HEIGHT, PER_BLOCK_DURATION } from '../constants';
import { normalizeX, getGhostY } from '../utils/gameLogic';

interface GameBoardProps {
  state: GameState;
  onBlockTap: (x: number, y: number) => void;
}

const BLOCK_SIZE = 30; 
const RADIUS = 8; // Corner radius for goop blobs

export const GameBoard: React.FC<GameBoardProps> = ({ state, onBlockTap }) => {
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

  const handleBoardClick = useCallback((e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
       clientX = e.changedTouches[0].clientX;
       clientY = e.changedTouches[0].clientY;
    } else {
       clientX = e.clientX;
       clientY = e.clientY;
    }

    const relX = clientX - svgRect.left;
    const relY = clientY - svgRect.top;
    
    const svgX = vbX + (relX / svgRect.width) * vbW;
    const svgY = vbY + (relY / svgRect.height) * vbH;

    const rawVisX = getGridXFromScreen(svgX);
    if (rawVisX < 0) return; 

    const visX = Math.floor(rawVisX);
    const visY = Math.floor(svgY / BLOCK_SIZE);
    
    const gridX = normalizeX(visX + boardOffset);
    const gridY = visY + BUFFER_HEIGHT;

    if (visX >= 0 && visX < VISIBLE_WIDTH && visY >= 0 && visY < VISIBLE_HEIGHT) {
        onBlockTap(gridX, gridY);
    }
  }, [boardOffset, onBlockTap, vbX, vbY, vbW, vbH]);

  const style = useMemo(() => `
    .glow-anim {
        filter: drop-shadow(0 0 4px white);
        animation: pulseGlow 1.5s infinite alternate;
    }
    @keyframes pulseGlow {
        from { filter: drop-shadow(0 0 2px white); stroke-width: 2px; }
        to { filter: drop-shadow(0 0 8px white); stroke-width: 3px; }
    }
  `, []);

  const now = Date.now();

  // 1. Fill Path: The closed shape for the color fill (includes rounded corners where appropriate)
  const getBlobPath = (x: number, y: number, w: number, h: number, neighbors: {t:boolean, r:boolean, b:boolean, l:boolean}) => {
      let d = "";
      // Top Left
      if (!neighbors.t && !neighbors.l) d += `M ${x} ${y + RADIUS} Q ${x} ${y} ${x + RADIUS} ${y} `;
      else d += `M ${x} ${y} `;
      
      // Top Right
      if (!neighbors.t && !neighbors.r) d += `L ${x + w - RADIUS} ${y} Q ${x + w} ${y} ${x + w} ${y + RADIUS} `;
      else d += `L ${x + w} ${y} `;

      // Bottom Right
      if (!neighbors.b && !neighbors.r) d += `L ${x + w} ${y + h - RADIUS} Q ${x + w} ${y + h} ${x + w - RADIUS} ${y + h} `;
      else d += `L ${x + w} ${y + h} `;

      // Bottom Left
      if (!neighbors.b && !neighbors.l) d += `L ${x + RADIUS} ${y + h} Q ${x} ${y + h} ${x} ${y + h - RADIUS} `;
      else d += `L ${x} ${y + h} `;
      
      d += "Z";
      return d;
  };

  // 2. Stroke Path: Disjoint segments for the outer border only (removes internal seams)
  const getContourPath = (x: number, y: number, w: number, h: number, n: {t:boolean, r:boolean, b:boolean, l:boolean}) => {
      const r = RADIUS;
      let d = "";

      // Top Edge
      if (!n.t) {
          const start = n.l ? x : x + r;
          const end = n.r ? x + w : x + w - r;
          d += `M ${start} ${y} L ${end} ${y} `;
      }
      // Right Edge
      if (!n.r) {
          const start = n.t ? y : y + r;
          const end = n.b ? y + h : y + h - r;
          d += `M ${x + w} ${start} L ${x + w} ${end} `;
      }
      // Bottom Edge
      if (!n.b) {
          const start = n.l ? x : x + r;
          const end = n.r ? x + w : x + w - r;
          d += `M ${end} ${y + h} L ${start} ${y + h} `;
      }
      // Left Edge
      if (!n.l) {
          const start = n.t ? y : y + r;
          const end = n.b ? y + h : y + h - r;
          d += `M ${x} ${end} L ${x} ${start} `;
      }

      // Corners
      if (!n.t && !n.l) d += `M ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} `; // TL
      if (!n.t && !n.r) d += `M ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} `; // TR
      if (!n.b && !n.r) d += `M ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} `; // BR
      if (!n.b && !n.l) d += `M ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} `; // BL

      return d;
  };

  // 3. Highlight: Only on top edge if exposed
  const getHighlightPath = (x: number, y: number, w: number, n: {t:boolean, l:boolean, r:boolean}) => {
      if (n.t) return "";
      const start = n.l ? x + 2 : x + RADIUS;
      const end = n.r ? x + w - 2 : x + w - RADIUS;
      const width = end - start;
      if (width <= 0) return "";
      return `M ${start} ${y + 5} Q ${start + width/2} ${y + 5} ${end} ${y + 5}`;
  };

  const renderCells = useMemo(() => {
    const elements = [];
    
    // 1. Grid Blocks (Background mesh)
    for (let y = BUFFER_HEIGHT; y < BUFFER_HEIGHT + VISIBLE_HEIGHT; y++) {
      for (let visX = 0; visX <= VISIBLE_WIDTH; visX++) {
        const gridX = normalizeX(visX + boardOffset);
        
        const startX = getScreenX(visX);
        const endX = getScreenX(visX + 1);
        const cellWidth = endX - startX;
        
        if (cellWidth <= 0) continue;
        const yPos = (y - BUFFER_HEIGHT) * BLOCK_SIZE;

        if (visX < VISIBLE_WIDTH) {
             // Industrial Mesh Look
             elements.push(
                <g key={`bg-${y}-${visX}`} opacity={0.2}>
                    <line x1={startX} y1={yPos} x2={startX+cellWidth} y2={yPos} stroke={COLORS.GRID_EMPTY} strokeWidth="1" />
                    <line x1={startX} y1={yPos} x2={startX} y2={yPos+BLOCK_SIZE} stroke={COLORS.GRID_EMPTY} strokeWidth="1" />
                    <circle cx={startX} cy={yPos} r={1} fill={COLORS.GRID_EMPTY} />
                </g>
            );
        }
      }
    }

    // 2. Active Cells (Goop Masses)
    for (let y = BUFFER_HEIGHT; y < BUFFER_HEIGHT + VISIBLE_HEIGHT; y++) {
      for (let visX = 0; visX <= VISIBLE_WIDTH; visX++) {
        const gridX = normalizeX(visX + boardOffset);
        const cell = grid[y][gridX]; 

        const startX = getScreenX(visX);
        const endX = getScreenX(visX + 1);
        const cellWidth = endX - startX;
        if (cellWidth <= 0) continue;
        const yPos = (y - BUFFER_HEIGHT) * BLOCK_SIZE;

        if (cell && visX < VISIBLE_WIDTH) {
            const topSame = y > 0 && grid[y-1][gridX]?.groupId === cell.groupId;
            const bottomSame = y < TOTAL_HEIGHT-1 && grid[y+1][gridX]?.groupId === cell.groupId;
            const leftSame = grid[y][normalizeX(gridX-1)]?.groupId === cell.groupId;
            const rightSame = grid[y][normalizeX(gridX+1)]?.groupId === cell.groupId;
            
            const neighbors = { t: topSame, r: rightSame, b: bottomSame, l: leftSame };
            const fillPath = getBlobPath(startX, yPos, cellWidth, BLOCK_SIZE, neighbors);
            const contourPath = getContourPath(startX, yPos, cellWidth, BLOCK_SIZE, neighbors);
            const highlightPath = getHighlightPath(startX, yPos, cellWidth, neighbors);

            // Fill Logic
            const totalDuration = cell.groupSize * PER_BLOCK_DURATION;
            const groupHeight = (cell.groupMaxY - cell.groupMinY + 1);
            const timePerRow = totalDuration / Math.max(1, groupHeight);
            const rowIndex = cell.groupMaxY - y; 
            const startDelay = rowIndex * timePerRow;
            const timeSinceStart = now - cell.timestamp;
            const timeIntoRow = timeSinceStart - startDelay;
            let fillHeight = 0;
            if (timeIntoRow >= timePerRow) fillHeight = BLOCK_SIZE;
            else if (timeIntoRow > 0) fillHeight = (timeIntoRow / timePerRow) * BLOCK_SIZE;
            const isFullyFilled = timeSinceStart >= totalDuration;

            elements.push(
                <g key={`cell-${cell.id}-${cell.timestamp}`} className={isFullyFilled ? "glow-anim" : ""}>
                    {/* Shell Fill (Background) - increased opacity to hide seams */}
                    <path 
                        d={fillPath} 
                        fill={cell.color} 
                        fillOpacity={0.2}
                        stroke="none"
                    />

                    {/* Animated Fill Level */}
                    <clipPath id={`clip-${cell.id}-${y}-${visX}`}>
                         <path d={fillPath} />
                    </clipPath>

                    {/* Masking Rect for fill level */}
                    <rect 
                        x={startX} 
                        y={yPos + (BLOCK_SIZE - fillHeight)} 
                        width={cellWidth} 
                        height={fillHeight} 
                        fill={cell.color} 
                        fillOpacity={0.9} 
                        clipPath={`url(#clip-${cell.id}-${y}-${visX})`}
                    />

                    {/* External Contour (Stroke) - ONLY draws outer edges */}
                    <path 
                        d={contourPath} 
                        fill="none" 
                        stroke={cell.color} 
                        strokeWidth="2"
                    />
                    
                    {/* Highlight/Reflection for Goopiness */}
                    {highlightPath && (
                      <path 
                          d={highlightPath}
                          fill="none"
                          stroke="white"
                          strokeWidth="2"
                          strokeOpacity={0.4}
                          strokeLinecap="round"
                          clipPath={`url(#clip-${cell.id}-${y}-${visX})`}
                      />
                    )}
                </g>
            );
        }
      }
    }
    
    // 3. Falling Blocks
    fallingBlocks.forEach((block) => {
        if (block.y < BUFFER_HEIGHT - 1) return; 

        let visX = block.x - boardOffset;
        if (visX > TOTAL_WIDTH / 2) visX -= TOTAL_WIDTH;
        if (visX < -TOTAL_WIDTH / 2) visX += TOTAL_WIDTH;
        
        if (visX >= 0 && visX < VISIBLE_WIDTH) {
             const startX = getScreenX(visX);
             const endX = getScreenX(visX + 1);
             const cellWidth = endX - startX;
             const yPos = (block.y - BUFFER_HEIGHT) * BLOCK_SIZE;
             
             // Falling blocks are single, so no neighbors
             const neighbors = { t: false, r: false, b: false, l: false };
             const fillPath = getBlobPath(startX, yPos, cellWidth, BLOCK_SIZE, neighbors);
             const contourPath = getContourPath(startX, yPos, cellWidth, BLOCK_SIZE, neighbors);
             const highlightPath = getHighlightPath(startX, yPos, cellWidth, neighbors);

             elements.push(
                 <g key={`falling-${block.data.id}`}>
                    <path 
                        d={fillPath}
                        fill={block.data.color}
                        fillOpacity={0.9}
                        stroke="none"
                    />
                    <path 
                        d={contourPath}
                        fill="none"
                        stroke="white"
                        strokeWidth="1"
                        strokeOpacity={0.8}
                    />
                    {highlightPath && (
                        <path 
                            d={highlightPath}
                            fill="none"
                            stroke="white"
                            strokeWidth="2"
                            strokeOpacity={0.6}
                            strokeLinecap="round"
                        />
                    )}
                 </g>
             );
        }
    });
    
    // 4. Ghost Piece & Active Piece
    // Helper to check connectivity within the active piece
    const isConnected = (cells: Coordinate[], currentIdx: number, dx: number, dy: number) => {
        const curr = cells[currentIdx];
        return cells.some(other => other.x === curr.x + dx && other.y === curr.y + dy);
    };

    if (activePiece) {
        const ghostY = getGhostY(grid, activePiece, boardOffset);
        
        // Render Ghost
        activePiece.cells.forEach((cell, idx) => {
            const pieceGridX = normalizeX(activePiece.x + cell.x);
            const pieceGridY = ghostY + cell.y;
            if (pieceGridY < BUFFER_HEIGHT) return;
            
            let visX = pieceGridX - boardOffset;
            if (visX > TOTAL_WIDTH / 2) visX -= TOTAL_WIDTH;
            if (visX < -TOTAL_WIDTH / 2) visX += TOTAL_WIDTH;

            if (visX >= -2 && visX < VISIBLE_WIDTH + 2) {
                 const startX = getScreenX(visX);
                 const endX = getScreenX(visX + 1);
                 const cellWidth = endX - startX;
                 const yPos = (pieceGridY - BUFFER_HEIGHT) * BLOCK_SIZE;

                 const neighbors = {
                     t: isConnected(activePiece.cells, idx, 0, -1),
                     r: isConnected(activePiece.cells, idx, 1, 0),
                     b: isConnected(activePiece.cells, idx, 0, 1),
                     l: isConnected(activePiece.cells, idx, -1, 0),
                 };
                 const contourPath = getContourPath(startX, yPos, cellWidth, BLOCK_SIZE, neighbors);

                 elements.push(
                   <path
                     key={`ghost-${idx}`}
                     d={contourPath}
                     fill="none"
                     stroke={activePiece.definition.color}
                     strokeWidth="1"
                     strokeDasharray="4 2"
                     opacity="0.3"
                   />
                 );
            }
        });

        // Render Active Piece
        activePiece.cells.forEach((cell, idx) => {
            const pieceGridX = normalizeX(activePiece.x + cell.x);
            const pieceGridY = activePiece.y + cell.y;
            if (pieceGridY < BUFFER_HEIGHT) return;

            let visX = pieceGridX - boardOffset;
            if (visX > TOTAL_WIDTH / 2) visX -= TOTAL_WIDTH;
            if (visX < -TOTAL_WIDTH / 2) visX += TOTAL_WIDTH;

            if (visX >= -2 && visX < VISIBLE_WIDTH + 2) {
                 const startX = getScreenX(visX);
                 const endX = getScreenX(visX + 1);
                 const cellWidth = endX - startX;
                 const yPos = (pieceGridY - BUFFER_HEIGHT) * BLOCK_SIZE;

                 const neighbors = {
                     t: isConnected(activePiece.cells, idx, 0, -1),
                     r: isConnected(activePiece.cells, idx, 1, 0),
                     b: isConnected(activePiece.cells, idx, 0, 1),
                     l: isConnected(activePiece.cells, idx, -1, 0),
                 };

                 const fillPath = getBlobPath(startX, yPos, cellWidth, BLOCK_SIZE, neighbors);
                 const contourPath = getContourPath(startX, yPos, cellWidth, BLOCK_SIZE, neighbors);
                 const highlightPath = getHighlightPath(startX, yPos, cellWidth, neighbors);
             
                 elements.push(
                   <g key={`piece-${idx}`}>
                       <path
                         d={fillPath}
                         fill={activePiece.definition.color}
                         fillOpacity={0.8} // Higher opacity for active piece to look solid
                         stroke="none"
                       />
                       <path
                         d={contourPath}
                         fill="none"
                         stroke={activePiece.definition.color}
                         strokeWidth="2"
                       />
                       {highlightPath && (
                           <path 
                              d={highlightPath}
                              fill="none"
                              stroke="white"
                              strokeWidth="2"
                              strokeOpacity={0.6}
                              strokeLinecap="round"
                           />
                       )}
                   </g>
                 );
            }
        });
    }

    return elements;
  }, [grid, boardOffset, activePiece, fallingBlocks, now, vbX, vbY, vbW, vbH]);

  return (
    <div className="w-full h-full bg-slate-950 relative shadow-2xl border-x-4 border-slate-900 overflow-hidden select-none">
        {/* CRT Scanline Effect Overlay */}
        <div className="absolute inset-0 pointer-events-none z-10 opacity-10 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))]" style={{backgroundSize: "100% 2px, 3px 100%"}} />
        
        <style>{style}</style>
        <svg 
            width="100%" 
            height="100%"
            viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
            preserveAspectRatio="xMidYMin meet"
            onClick={handleBoardClick}
        >
            {renderCells}
        </svg>
    </div>
  );
};