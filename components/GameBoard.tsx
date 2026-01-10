import React, { useMemo, useCallback } from 'react';
import { GameState } from '../types';
import { VISIBLE_WIDTH, VISIBLE_HEIGHT, COLORS, TOTAL_WIDTH, TOTAL_HEIGHT, BUFFER_HEIGHT, PER_BLOCK_DURATION } from '../constants';
import { normalizeX, getGhostY } from '../utils/gameLogic';

interface GameBoardProps {
  state: GameState;
  onBlockTap: (x: number, y: number) => void;
}

const BLOCK_SIZE = 30; 

export const GameBoard: React.FC<GameBoardProps> = ({ state, onBlockTap }) => {
  const { grid, boardOffset, activePiece, fallingBlocks } = state;

  // --- CYLINDRICAL PROJECTION LOGIC ---
  
  // Physical Geometry
  const ANGLE_PER_COL = (2 * Math.PI) / TOTAL_WIDTH; 
  const CYL_RADIUS = BLOCK_SIZE / ANGLE_PER_COL; 

  // Viewport / Coordinate System
  const maxAngle = (VISIBLE_WIDTH / 2) * ANGLE_PER_COL;
  const projectedHalfWidth = CYL_RADIUS * Math.sin(maxAngle);
  
  const vbX = -projectedHalfWidth;
  const vbY = 0;
  const vbW = projectedHalfWidth * 2;
  const vbH = VISIBLE_HEIGHT * BLOCK_SIZE;

  // Map grid column index to Screen X pixel position
  const getScreenX = (visX: number) => {
      const centerCol = VISIBLE_WIDTH / 2;
      const offsetFromCenter = visX - centerCol;
      const angle = offsetFromCenter * ANGLE_PER_COL;
      return CYL_RADIUS * Math.sin(angle);
  };

  // Inverse: Screen X to Grid Column
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

  const renderCells = useMemo(() => {
    const elements = [];
    
    // 1. Grid Blocks
    for (let y = BUFFER_HEIGHT; y < BUFFER_HEIGHT + VISIBLE_HEIGHT; y++) {
      for (let visX = 0; visX <= VISIBLE_WIDTH; visX++) {
        const gridX = normalizeX(visX + boardOffset);
        const cell = grid[y][gridX]; 
        
        const startX = getScreenX(visX);
        const endX = getScreenX(visX + 1);
        const cellWidth = endX - startX;
        
        if (cellWidth <= 0) continue;

        const yPos = (y - BUFFER_HEIGHT) * BLOCK_SIZE;
        
        // Background Grid
        if (visX < VISIBLE_WIDTH) {
             elements.push(
                <rect
                  key={`bg-${y}-${visX}`}
                  x={startX}
                  y={yPos}
                  width={cellWidth}
                  height={BLOCK_SIZE}
                  fill={(gridX + y) % 2 === 0 ? COLORS.GRID_BG : COLORS.GRID_EMPTY}
                  opacity={0.3}
                />
            );
        }

        if (cell && visX < VISIBLE_WIDTH) {
            const topSame = y > 0 && grid[y-1][gridX]?.groupId === cell.groupId;
            const bottomSame = y < TOTAL_HEIGHT-1 && grid[y+1][gridX]?.groupId === cell.groupId;
            const leftSame = grid[y][normalizeX(gridX-1)]?.groupId === cell.groupId;
            const rightSame = grid[y][normalizeX(gridX+1)]?.groupId === cell.groupId;

            // Fill Logic
            const totalDuration = cell.groupSize * PER_BLOCK_DURATION;
            const groupHeight = (cell.groupMaxY - cell.groupMinY + 1);
            const timePerRow = totalDuration / Math.max(1, groupHeight);
            
            // Row index from bottom (0 = bottom row of the group)
            const rowIndex = cell.groupMaxY - y; 
            
            const startDelay = rowIndex * timePerRow;
            const timeSinceStart = now - cell.timestamp;
            const timeIntoRow = timeSinceStart - startDelay;

            let fillHeight = 0;
            if (timeIntoRow >= timePerRow) {
                fillHeight = BLOCK_SIZE;
            } else if (timeIntoRow > 0) {
                fillHeight = (timeIntoRow / timePerRow) * BLOCK_SIZE;
            }

            const isFullyFilled = timeSinceStart >= totalDuration;

            elements.push(
                <g key={`cell-${cell.id}-${cell.timestamp}`} className={isFullyFilled ? "glow-anim" : ""}>
                    {/* Shell - Outline only (transparent fill) */}
                    <rect
                        x={startX}
                        y={yPos}
                        width={cellWidth}
                        height={BLOCK_SIZE}
                        fill="none" 
                        stroke="none" 
                    />
                    
                    {/* Animated Fill Rect */}
                    <clipPath id={`clip-${cell.id}-${y}-${visX}`}>
                        <rect x={startX} y={yPos} width={cellWidth} height={BLOCK_SIZE} />
                    </clipPath>

                    <rect 
                        x={startX} 
                        y={yPos} 
                        width={cellWidth} 
                        height={fillHeight} 
                        fill={cell.color} 
                        fillOpacity={0.8}
                        transform={`rotate(180, ${startX + cellWidth/2}, ${yPos + BLOCK_SIZE/2})`}
                        clipPath={`url(#clip-${cell.id}-${y}-${visX})`}
                    />

                    {/* Borders - Drawn on top to define the "Shell" */}
                    {!topSame && <line x1={startX} y1={yPos} x2={startX+cellWidth} y2={yPos} stroke={cell.color} strokeWidth="2" />}
                    {!bottomSame && <line x1={startX} y1={yPos+BLOCK_SIZE} x2={startX+cellWidth} y2={yPos+BLOCK_SIZE} stroke={cell.color} strokeWidth="2" />}
                    {!leftSame && <line x1={startX} y1={yPos} x2={startX} y2={yPos+BLOCK_SIZE} stroke={cell.color} strokeWidth="2" />}
                    {!rightSame && <line x1={startX+cellWidth} y1={yPos} x2={startX+cellWidth} y2={yPos+BLOCK_SIZE} stroke={cell.color} strokeWidth="2" />}
                </g>
            );
        }
      }
    }
    
    // 2. Falling Blocks
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
             
             elements.push(
                 <g key={`falling-${block.data.id}`}>
                    <rect
                        x={startX}
                        y={yPos}
                        width={cellWidth}
                        height={BLOCK_SIZE}
                        fill="none"
                        stroke={block.data.color}
                        strokeWidth="3"
                        rx="2"
                    />
                    <rect
                        x={startX + (cellWidth * 0.2)}
                        y={yPos + 6}
                        width={cellWidth * 0.6}
                        height={BLOCK_SIZE - 12}
                        fill={block.data.color}
                        fillOpacity="0.3"
                        rx="2"
                    />
                 </g>
             );
        }
    });
    
    // 3. Ghost Piece
    if (activePiece) {
        const ghostY = getGhostY(grid, activePiece, boardOffset);
        
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
                 
                 elements.push(
                   <rect
                     key={`ghost-${idx}`}
                     x={startX}
                     y={yPos}
                     width={cellWidth}
                     height={BLOCK_SIZE}
                     fill="none"
                     stroke={activePiece.definition.color}
                     strokeWidth="1"
                     strokeDasharray="4 2"
                     opacity="0.5"
                     rx="2"
                   />
                 );
            }
        });
    }

    // 4. Active Piece
    if (activePiece) {
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
             
             elements.push(
               <rect
                 key={`piece-${idx}`}
                 x={startX}
                 y={yPos}
                 width={cellWidth}
                 height={BLOCK_SIZE}
                 fill={activePiece.definition.color}
                 fillOpacity="0.2" 
                 stroke={activePiece.definition.color}
                 strokeWidth="2"
                 filter="url(#glow)"
                 rx="2"
                 pointerEvents="none"
               />
             );
        }
      });
    }

    return elements;
  }, [grid, boardOffset, activePiece, fallingBlocks, now, vbX, vbY, vbW, vbH]);

  return (
    <div className="w-full h-full bg-slate-950 relative shadow-2xl border-x-4 border-slate-800 overflow-hidden select-none">
        <style>{style}</style>
        <svg 
            width="100%" 
            height="100%"
            viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
            preserveAspectRatio="xMidYMin meet"
            onClick={handleBoardClick}
        >
             <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2" result="blur"/>
                    <feComposite in="SourceGraphic" in2="blur" operator="over"/>
                </filter>
            </defs>
            {renderCells}
        </svg>
    </div>
  );
};