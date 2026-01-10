import React, { useMemo, useCallback } from 'react';
import { GameState } from '../types';
import { VISIBLE_WIDTH, VISIBLE_HEIGHT, COLORS, TOTAL_WIDTH, TOTAL_HEIGHT, BUFFER_HEIGHT, BASE_FILL_DURATION, PER_BLOCK_DURATION } from '../constants';
import { normalizeX, getGhostY } from '../utils/gameLogic';

interface GameBoardProps {
  state: GameState;
  onBlockTap: (x: number, y: number) => void;
}

const BLOCK_SIZE = 30; 

export const GameBoard: React.FC<GameBoardProps> = ({ state, onBlockTap }) => {
  const { grid, boardOffset, activePiece, fallingBlocks } = state;

  // --- CYLINDRICAL PROJECTION LOGIC ---
  // The visible area represents 1/3 of the cylinder (120 degrees).
  // We map the linear grid x (0..VISIBLE_WIDTH) to a sine-wave distorted x.
  
  // Total visible width in pixels
  const VIEW_WIDTH_PX = VISIBLE_WIDTH * BLOCK_SIZE;
  const CENTER_X_PX = VIEW_WIDTH_PX / 2;
  const RADIUS = VIEW_WIDTH_PX / (2 * Math.sin(Math.PI / 3)); // Chord length formula inverse

  // Map grid column index (float) to Screen X pixel position
  const getScreenX = (visX: number) => {
      // Normalize visX to -1..1 range relative to center
      const normalizedPos = (visX - (VISIBLE_WIDTH / 2)) / (VISIBLE_WIDTH / 2);
      
      // Angle coverage: -60deg to +60deg (total 120deg)
      const angle = normalizedPos * (Math.PI / 3);
      
      // Projected X onto the flat screen plane (sine of angle)
      // We map angle -60..60 to screen width
      const projectedX = Math.sin(angle) * RADIUS;
      
      return CENTER_X_PX + projectedX;
  };

  // Inverse: Screen X to Grid Column (for clicks)
  const getGridXFromScreen = (screenX: number) => {
      const relativeX = screenX - CENTER_X_PX;
      const ratio = relativeX / RADIUS;
      // Clamp for safety
      if (ratio < -1 || ratio > 1) return -1;
      
      const angle = Math.asin(ratio);
      const normalizedPos = angle / (Math.PI / 3);
      
      const visX = (normalizedPos * (VISIBLE_WIDTH / 2)) + (VISIBLE_WIDTH / 2);
      return visX;
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
    
    // Scale SVG coords
    const scaleX = (VISIBLE_WIDTH * BLOCK_SIZE) / svgRect.width;
    const scaleY = (VISIBLE_HEIGHT * BLOCK_SIZE) / svgRect.height;
    
    const svgX = relX * scaleX;
    const svgY = relY * scaleY;

    // Inverse projection for X
    const rawVisX = getGridXFromScreen(svgX);
    if (rawVisX < 0) return; // clicked outside cylinder projection

    const visX = Math.floor(rawVisX);
    const visY = Math.floor(svgY / BLOCK_SIZE);
    
    const gridX = normalizeX(visX + boardOffset);
    const gridY = visY + BUFFER_HEIGHT;

    if (visX >= 0 && visX < VISIBLE_WIDTH && visY >= 0 && visY < VISIBLE_HEIGHT) {
        onBlockTap(gridX, gridY);
    }
  }, [boardOffset, onBlockTap]);

  // CSS for fill animation
  const style = useMemo(() => `
    @keyframes fillUp {
        0% { height: 0%; }
        100% { height: 100%; }
    }
    .fill-anim {
        animation-name: fillUp;
        animation-timing-function: linear;
        animation-fill-mode: both;
    }
    .glow-anim {
        filter: drop-shadow(0 0 4px white);
        animation: pulseGlow 2s infinite;
    }
    @keyframes pulseGlow {
        0%, 100% { filter: drop-shadow(0 0 2px white); stroke-width: 2px; }
        50% { filter: drop-shadow(0 0 6px white); stroke-width: 3px; }
    }
  `, []);

  const now = Date.now();

  const renderCells = useMemo(() => {
    const elements = [];
    
    // 1. Grid Blocks
    for (let y = BUFFER_HEIGHT; y < BUFFER_HEIGHT + VISIBLE_HEIGHT; y++) {
      for (let visX = 0; visX <= VISIBLE_WIDTH; visX++) {
        const gridX = normalizeX(visX + boardOffset);
        const cell = grid[y][gridX]; // Note: This might read index 12 (VISIBLE_WIDTH) which wraps to valid gridX
        
        // Calculate projected Width and X
        const startX = getScreenX(visX);
        const endX = getScreenX(visX + 1);
        const cellWidth = endX - startX;
        
        // Skip invalid projections (edges)
        if (isNaN(startX) || isNaN(cellWidth)) continue;

        const yPos = (y - BUFFER_HEIGHT) * BLOCK_SIZE;
        
        // Background Grid (only render up to VISIBLE_WIDTH - 1)
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
            // Check Neighbors
            const topSame = y > 0 && grid[y-1][gridX]?.groupId === cell.groupId;
            const bottomSame = y < TOTAL_HEIGHT-1 && grid[y+1][gridX]?.groupId === cell.groupId;
            const leftSame = grid[y][normalizeX(gridX-1)]?.groupId === cell.groupId;
            const rightSame = grid[y][normalizeX(gridX+1)]?.groupId === cell.groupId;

            // Fill Logic
            const totalDuration = BASE_FILL_DURATION + (cell.groupSize * PER_BLOCK_DURATION);
            const groupHeight = (cell.groupMaxY - cell.groupMinY + 1);
            const indexFromBottom = cell.groupMaxY - y;
            const segmentDuration = totalDuration / groupHeight;
            const startDelay = indexFromBottom * segmentDuration;
            const animDelay = (cell.timestamp + startDelay) - now;

            elements.push(
                <g key={`cell-${cell.id}-${cell.timestamp}`} className={cell.timestamp + totalDuration < now ? "glow-anim" : ""}>
                    <rect
                        x={startX}
                        y={yPos}
                        width={cellWidth}
                        height={BLOCK_SIZE}
                        fill={cell.color}
                        fillOpacity={0.1}
                    />
                    
                    {/* For animated fill, we use a clip path to handle the variable width */}
                    <clipPath id={`clip-${cell.id}-${y}-${visX}`}>
                        <rect x={startX} y={yPos} width={cellWidth} height={BLOCK_SIZE} />
                    </clipPath>

                    <rect 
                        className="fill-anim"
                        x={startX} 
                        y={yPos} 
                        width={cellWidth} 
                        height={BLOCK_SIZE} 
                        fill={cell.color} 
                        fillOpacity={0.8}
                        transform={`rotate(180, ${startX + cellWidth/2}, ${yPos + BLOCK_SIZE/2})`}
                        clipPath={`url(#clip-${cell.id}-${y}-${visX})`}
                        style={{ 
                            animationDuration: `${segmentDuration}ms`,
                            animationDelay: `${animDelay}ms`
                        }} 
                    />

                    {/* Borders */}
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
  }, [grid, boardOffset, activePiece, fallingBlocks, now]);

  return (
    <div className="w-full max-w-md aspect-[1/2] bg-slate-950 relative shadow-2xl border-4 border-slate-800 rounded-lg overflow-hidden select-none">
        <style>{style}</style>
        <svg 
            width="100%" 
            height="100%"
            viewBox={`0 0 ${VISIBLE_WIDTH * BLOCK_SIZE} ${VISIBLE_HEIGHT * BLOCK_SIZE}`}
            preserveAspectRatio="xMidYMid meet"
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