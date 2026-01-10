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
    const scaleX = (VISIBLE_WIDTH * BLOCK_SIZE) / svgRect.width;
    const scaleY = (VISIBLE_HEIGHT * BLOCK_SIZE) / svgRect.height;
    const svgX = relX * scaleX;
    const svgY = relY * scaleY;

    const visX = Math.floor(svgX / BLOCK_SIZE);
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
      for (let visX = 0; visX < VISIBLE_WIDTH; visX++) {
        const gridX = normalizeX(visX + boardOffset);
        const cell = grid[y][gridX];
        
        const xPos = visX * BLOCK_SIZE;
        const yPos = (y - BUFFER_HEIGHT) * BLOCK_SIZE;
        
        // Background Grid
        elements.push(
            <rect
              key={`bg-${y}-${visX}`}
              x={xPos}
              y={yPos}
              width={BLOCK_SIZE}
              height={BLOCK_SIZE}
              fill={(gridX + y) % 2 === 0 ? COLORS.GRID_BG : COLORS.GRID_EMPTY}
              opacity={0.3}
            />
        );

        if (cell) {
            // Check Neighbors
            const topSame = y > 0 && grid[y-1][gridX]?.groupId === cell.groupId;
            const bottomSame = y < TOTAL_HEIGHT-1 && grid[y+1][gridX]?.groupId === cell.groupId;
            const leftSame = grid[y][normalizeX(gridX-1)]?.groupId === cell.groupId;
            const rightSame = grid[y][normalizeX(gridX+1)]?.groupId === cell.groupId;

            // Fill Logic
            // DURATION depends on group size
            const totalDuration = BASE_FILL_DURATION + (cell.groupSize * PER_BLOCK_DURATION);
            
            const groupHeight = (cell.groupMaxY - cell.groupMinY + 1);
            const indexFromBottom = cell.groupMaxY - y;
            
            const segmentDuration = totalDuration / groupHeight;
            const startDelay = indexFromBottom * segmentDuration;
            
            // Sync logic
            const animDelay = (cell.timestamp + startDelay) - now;

            // Base Fill (Transparent/Faint)
            // Note: Key includes timestamp to force re-render/animation restart on merge
            elements.push(
                <g key={`cell-${cell.id}-${cell.timestamp}`} className={cell.timestamp + totalDuration < now ? "glow-anim" : ""}>
                    <rect
                        x={xPos}
                        y={yPos}
                        width={BLOCK_SIZE}
                        height={BLOCK_SIZE}
                        fill={cell.color}
                        fillOpacity={0.1}
                    />
                    
                    {/* Animated Fill Meter */}
                    <svg x={xPos} y={yPos} width={BLOCK_SIZE} height={BLOCK_SIZE}>
                        <rect 
                            className="fill-anim"
                            x={0} 
                            y={0} 
                            width="100%" 
                            height="100%" 
                            fill={cell.color} 
                            fillOpacity={0.8}
                            transform="rotate(180, 15, 15)" 
                            style={{ 
                                animationDuration: `${segmentDuration}ms`,
                                animationDelay: `${animDelay}ms`
                            }} 
                        />
                    </svg>

                    {/* Borders */}
                    {!topSame && <line x1={xPos} y1={yPos} x2={xPos+BLOCK_SIZE} y2={yPos} stroke={cell.color} strokeWidth="2" />}
                    {!bottomSame && <line x1={xPos} y1={yPos+BLOCK_SIZE} x2={xPos+BLOCK_SIZE} y2={yPos+BLOCK_SIZE} stroke={cell.color} strokeWidth="2" />}
                    {!leftSame && <line x1={xPos} y1={yPos} x2={xPos} y2={yPos+BLOCK_SIZE} stroke={cell.color} strokeWidth="2" />}
                    {!rightSame && <line x1={xPos+BLOCK_SIZE} y1={yPos} x2={xPos+BLOCK_SIZE} y2={yPos+BLOCK_SIZE} stroke={cell.color} strokeWidth="2" />}
                </g>
            );
        }
      }
    }
    
    // 2. Falling Blocks
    fallingBlocks.forEach((block) => {
        // Only render if within visible buffer range
        if (block.y < BUFFER_HEIGHT - 1) return; // -1 for smoothness entering top

        let visX = block.x - boardOffset;
        if (visX > TOTAL_WIDTH / 2) visX -= TOTAL_WIDTH;
        if (visX < -TOTAL_WIDTH / 2) visX += TOTAL_WIDTH;
        
        if (visX >= 0 && visX < VISIBLE_WIDTH) {
             const xPos = visX * BLOCK_SIZE;
             const yPos = (block.y - BUFFER_HEIGHT) * BLOCK_SIZE;
             
             elements.push(
                 <g key={`falling-${block.data.id}`}>
                    <rect
                        x={xPos}
                        y={yPos}
                        width={BLOCK_SIZE}
                        height={BLOCK_SIZE}
                        fill="none"
                        stroke={block.data.color}
                        strokeWidth="3"
                        rx="2"
                    />
                    {/* Inner detail for style */}
                    <rect
                        x={xPos + 6}
                        y={yPos + 6}
                        width={BLOCK_SIZE - 12}
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
                 const xPos = visX * BLOCK_SIZE;
                 const yPos = (pieceGridY - BUFFER_HEIGHT) * BLOCK_SIZE;
                 
                 elements.push(
                   <rect
                     key={`ghost-${idx}`}
                     x={xPos}
                     y={yPos}
                     width={BLOCK_SIZE}
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
             const xPos = visX * BLOCK_SIZE;
             const yPos = (pieceGridY - BUFFER_HEIGHT) * BLOCK_SIZE;
             
             elements.push(
               <rect
                 key={`piece-${idx}`}
                 x={xPos}
                 y={yPos}
                 width={BLOCK_SIZE}
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

        {/* Cylinder Gradient Overlay */}
        <div 
          className="absolute inset-0 pointer-events-none z-10"
          style={{
             background: 'linear-gradient(90deg, rgba(15,23,42,0.85) 0%, rgba(15,23,42,0) 25%, rgba(15,23,42,0) 75%, rgba(15,23,42,0.85) 100%)'
          }}
        />
    </div>
  );
};