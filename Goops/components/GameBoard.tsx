
import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { GameState, Coordinate, FallingBlock, GridCell } from '../types';
import { VISIBLE_WIDTH, VISIBLE_HEIGHT, COLORS, TOTAL_WIDTH, TOTAL_HEIGHT, BUFFER_HEIGHT, PER_BLOCK_DURATION } from '../constants';
import { normalizeX, getGhostY, getPaletteForRank } from '../utils/gameLogic';
import { audio } from '../utils/audio';

interface GameBoardProps {
  state: GameState;
  rank: number;
  maxTime: number; // For pressure calc
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
    state, rank, maxTime, onBlockTap, onTapLeft, onTapRight, onSwipeUp, onSwipeDown, onSwipeLeft, onSwipeRight 
}) => {
  const { grid, boardOffset, activePiece, fallingBlocks, floatingTexts, timeLeft, goalMarks } = state;
  const [highlightedGroupId, setHighlightedGroupId] = useState<string | null>(null);
  const [shakingGroupId, setShakingGroupId] = useState<string | null>(null);

  const palette = useMemo(() => getPaletteForRank(rank), [rank]);

  // --- PRESSURE CALCULATION ---
  const pressureRatio = useMemo(() => {
    if (timeLeft <= 0) return 1;
    return Math.max(0, 1 - (timeLeft / maxTime));
  }, [timeLeft, maxTime]);

  const pressureHue = Math.max(0, 120 * (1 - pressureRatio)); // 120 (Green) -> 0 (Red)
  const pressureColor = `hsla(${pressureHue}, 100%, 50%, 0.15)`; // Low opacity

  // Calculate Visual Water Height to match Gameplay Logic
  // At Ratio 0: Height is 1 row (row 18)
  // At Ratio 1: Height is 16 rows (rows 3-18)
  const waterHeightBlocks = 1 + (pressureRatio * (VISIBLE_HEIGHT - 1));

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

  // Visual Water positioning
  const waterHeightPx = waterHeightBlocks * BLOCK_SIZE;
  const waterTopY = vbH - waterHeightPx;

  const getScreenX = useCallback((visX: number) => {
      const centerCol = VISIBLE_WIDTH / 2;
      const offsetFromCenter = visX - centerCol;
      const angle = offsetFromCenter * ANGLE_PER_COL;
      return CYL_RADIUS * Math.sin(angle);
  }, [ANGLE_PER_COL, CYL_RADIUS]);

  const getGridXFromScreen = (screenX: number) => {
      const sinVal = Math.max(-1, Math.min(1, screenX / CYL_RADIUS));
      const angle = Math.asin(sinVal);
      const offsetFromCenter = angle / ANGLE_PER_COL;
      return (VISIBLE_WIDTH / 2) + offsetFromCenter;
  };

  // --- Coordinate Helper ---
  // Returns screen % coordinates (0-100) relative to the container for a specific grid slot
  const getScreenPercentCoords = useCallback((gridX: number, gridY: number) => {
      let visX = gridX - boardOffset;
      // Normalize visX to be within standard range if possible
      if (visX > TOTAL_WIDTH / 2) visX -= TOTAL_WIDTH;
      if (visX < -TOTAL_WIDTH / 2) visX += TOTAL_WIDTH;
      
      const svgX = getScreenX(visX);
      const svgY = (gridY - BUFFER_HEIGHT) * BLOCK_SIZE + (BLOCK_SIZE / 2); // Center of block
      
      // Convert SVG viewbox coords to Percentage
      const pctX = ((svgX - vbX) / vbW) * 100;
      const pctY = ((svgY - vbY) / vbH) * 100;
      
      return { x: pctX, y: pctY };
  }, [boardOffset, getScreenX, vbX, vbY, vbW, vbH]);

  // --- Input Handling ---
  const touchStart = useRef<{x: number, y: number, time: number} | null>(null);
  const lastDragXRef = useRef<number>(0);
  const isDraggingHorizontallyRef = useRef(false);

  // Helper to determine what was hit at specific screen coordinates
  const getHitData = (clientX: number, clientY: number, target: Element) => {
      // We must treat the target as an HTMLElement to access client/offset properties
      const container = target as HTMLElement;
      const rect = container.getBoundingClientRect();

      // Accounts for border widths (clientLeft/Top) to get the true content box origin
      const borderLeft = container.clientLeft || 0;
      const borderTop = container.clientTop || 0;

      // Relative to content box
      const relX = clientX - rect.left - borderLeft;
      const relY = clientY - rect.top - borderTop;
      
      const contentW = container.clientWidth;
      const contentH = container.clientHeight;
      
      // Calculate scale based on content dimensions, not bounding rect (which includes borders)
      const scaleX = contentW / vbW;
      const scaleY = contentH / vbH;
      const scale = Math.min(scaleX, scaleY);

      const renderedW = vbW * scale;
      
      // xMidYMin: Center X, Top Y
      const offsetX = (contentW - renderedW) / 2;
      const offsetY = 0; 

      const viewX = relX - offsetX;
      const viewY = relY - offsetY;

      // Convert back to SVG coordinates
      const svgX = vbX + viewX / scale;
      const svgY = vbY + viewY / scale;

      const rawVisX = getGridXFromScreen(svgX);
      const visY = Math.floor(svgY / BLOCK_SIZE);
      
      if (rawVisX >= 0) {
          const visX = Math.floor(rawVisX);
          const gridX = normalizeX(visX + boardOffset);
          const gridY = visY + BUFFER_HEIGHT;

          if (visX >= 0 && visX < VISIBLE_WIDTH && visY >= 0 && visY < VISIBLE_HEIGHT) {
             const cell = grid[gridY][gridX];
             return { type: 'BLOCK', x: gridX, y: gridY, cell };
          }
      }
      
      const screenWidth = window.innerWidth;
      const isLeft = clientX < screenWidth / 2;
      return { type: 'EMPTY', side: isLeft ? 'LEFT' : 'RIGHT' };
  };

  const handleInputStart = (clientX: number, clientY: number, target: Element) => {
      const hit = getHitData(clientX, clientY, target);
      if (hit.type === 'BLOCK' && hit.cell) {
          const totalDuration = hit.cell.groupSize * PER_BLOCK_DURATION;
          const elapsed = Date.now() - hit.cell.timestamp;
          
          // PRESSURE CHECK: Matches Game.tsx logic
          const thresholdY = (TOTAL_HEIGHT - 1) - (pressureRatio * (VISIBLE_HEIGHT - 1));
          
          if (hit.cell.groupMinY < thresholdY) {
              // Not submerged enough -> Reject
              setShakingGroupId(hit.cell.groupId);
              audio.playReject(); 
              setTimeout(() => setShakingGroupId(prev => prev === hit.cell!.groupId ? null : prev), 300);
          } else if (elapsed < totalDuration) {
              // Not ready yet -> Shake & Sound
              setShakingGroupId(hit.cell.groupId);
              audio.playReject(); 
              // Clear shake after animation duration
              setTimeout(() => setShakingGroupId(prev => prev === hit.cell!.groupId ? null : prev), 300);
          } else {
              // Ready -> Highlight
              setHighlightedGroupId(hit.cell.groupId);
          }
      }
  };

  const handleInputEnd = (isTap: boolean, clientX: number, clientY: number, target: Element) => {
      // Capture current highlight before clearing
      const activeGroup = highlightedGroupId;
      setHighlightedGroupId(null);

      if (isTap) {
          const hit = getHitData(clientX, clientY, target);
          if (hit.type === 'BLOCK' && hit.cell) {
              // Only pop if this specific group was highlighted (meaning it was ready at start of touch)
              if (activeGroup === hit.cell.groupId) {
                  onBlockTap(hit.x!, hit.y!);
              }
          } else if (hit.type === 'EMPTY') {
              if (hit.side === 'LEFT') onTapLeft();
              else onTapRight();
          }
      }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
      const cx = e.touches[0].clientX;
      touchStart.current = {
          x: cx,
          y: e.touches[0].clientY,
          time: Date.now()
      };
      
      // Reset drag tracking
      lastDragXRef.current = cx;
      isDraggingHorizontallyRef.current = false;
      
      handleInputStart(cx, e.touches[0].clientY, e.currentTarget);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (!touchStart.current) return;
      const cx = e.touches[0].clientX;
      const cy = e.touches[0].clientY;
      
      const dx = cx - touchStart.current.x;
      const dy = cy - touchStart.current.y;
      
      // If haven't decided if this is a drag yet
      if (!isDraggingHorizontallyRef.current) {
          // If we moved more than 10px and mostly horizontal
          if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
              isDraggingHorizontallyRef.current = true;
              setHighlightedGroupId(null); // Cancel tap highlight
              lastDragXRef.current = cx; // Sync drag start to current position
          }
      }
      
      // Continuous Drag Logic - "Follow Finger"
      if (isDraggingHorizontallyRef.current) {
          const stepSize = 40; // Pixels to trigger one step
          const diff = cx - lastDragXRef.current;
          
          if (Math.abs(diff) >= stepSize) {
              // Drag Right (positive) -> Move Board Right -> Offset -1 -> Swipe Right
              const isRight = diff > 0;
              
              if (isRight) onSwipeRight();
              else onSwipeLeft();
              
              // Advance the reference point by one step to smooth it out
              // We use one step at a time to prevent "teleporting" and ensure each step is processed
              lastDragXRef.current += (stepSize * (isRight ? 1 : -1));
          }
      }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      if (!touchStart.current) return;
      
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const dx = endX - touchStart.current.x;
      const dy = endY - touchStart.current.y;
      const dt = Date.now() - touchStart.current.time;
      
      touchStart.current = null;

      // If we were effectively dragging the board horizontally, stop here
      if (isDraggingHorizontallyRef.current) {
          isDraggingHorizontallyRef.current = false;
          setHighlightedGroupId(null);
          return;
      }

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Tap Detection
      if (Math.max(absDx, absDy) < 15 && dt < 300) {
          handleInputEnd(true, endX, endY, e.currentTarget);
          return;
      }
      
      // Swipe Detection (Vertical Only here, since Horizontal is handled in Move)
      setHighlightedGroupId(null);

      // We only process vertical swipes here or short horizontal flicks that didn't trigger drag
      if (absDy > absDx && absDy > 30) {
          if (dy > 0) onSwipeDown();
          else onSwipeUp();
      } else if (absDx > absDy && absDx > 30) {
          // Fallback for fast flicks that didn't trigger "drag" mode?
          if (dx > 0) onSwipeRight();
          else onSwipeLeft();
      }
  };

  // Mouse Handlers for Desktop
  const handleMouseDown = (e: React.MouseEvent) => {
      touchStart.current = {
          x: e.clientX,
          y: e.clientY,
          time: Date.now()
      };
      handleInputStart(e.clientX, e.clientY, e.currentTarget);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
      if (!touchStart.current) return;
      const dt = Date.now() - touchStart.current.time;
      const dx = Math.abs(e.clientX - touchStart.current.x);
      const dy = Math.abs(e.clientY - touchStart.current.y);
      touchStart.current = null;

      const isTap = Math.max(dx, dy) < 15;
      
      if (isTap) {
        handleInputEnd(true, e.clientX, e.clientY, e.currentTarget);
      } else {
        setHighlightedGroupId(null);
      }
  };
  
  const handleMouseLeave = () => {
      setHighlightedGroupId(null);
      touchStart.current = null;
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
    @keyframes floatUp {
        0% { transform: translateY(0) scale(1); opacity: 1; }
        100% { transform: translateY(-40px) scale(1.5); opacity: 0; }
    }
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-3px); }
        75% { transform: translateX(3px); }
    }
    @keyframes scaleIn {
        from { transform: scale(0); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
    }
    .floating-score {
        animation: floatUp 1s ease-out forwards;
        font-family: monospace;
        font-weight: 900;
        text-shadow: 0px 2px 4px rgba(0,0,0,0.8);
        pointer-events: none;
    }
    .shake-anim {
        animation: shake 0.3s cubic-bezier(.36,.07,.19,.97) both;
    }
    .scale-in {
        animation: scaleIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }
    .super-glowing-stroke {
        filter: drop-shadow(0 0 5px white);
        animation: superGlowStroke 1.5s infinite alternate;
    }
    @keyframes superGlowStroke {
        0%, 100% { filter: drop-shadow(0 0 4px white) drop-shadow(0 0 8px white); opacity: 0.8; stroke-width: 3px; }
        50% { filter: drop-shadow(0 0 8px white) drop-shadow(0 0 15px white); opacity: 1; stroke-width: 4px; }
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

  const activeColors = useMemo(() => new Set(goalMarks.map(m => m.color)), [goalMarks]);
  
  // Calculate flying orbs logic within render to stay synced with rotation
  const flyingOrbs = goalMarks.filter(m => now - m.spawnTime < 500);

  return (
    <div 
        className="w-full h-full bg-slate-950 relative shadow-2xl border-x-4 border-slate-900 overflow-hidden select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
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
                                key={c.cell.id + '-' + i}
                                d={getBlobPath(c.screenX, c.screenY, c.width, BLOCK_SIZE, c.neighbors)}
                                fill="white"
                                stroke="white"
                                strokeWidth="1.5" // Expansion to fix seams
                             />
                        ))}
                    </mask>
                ))}
            </defs>

            {/* 0. Pressure Fluid Background Fill */}
            <rect 
                x={vbX} 
                y={waterTopY} 
                width={vbW} 
                height={waterHeightPx} 
                fill={pressureColor}
            />
            
            {/* Water Line Top */}
            <line 
                x1={vbX} y1={waterTopY} x2={vbX + vbW} y2={waterTopY}
                stroke={pressureColor.replace('0.15', '0.6')}
                strokeWidth="2"
                strokeDasharray="4 4"
            />

            {/* 1. Background Grid & Goal Marks */}
            {Array.from({length: VISIBLE_HEIGHT}).map((_, yIdx) => {
                const y = yIdx + BUFFER_HEIGHT;
                return Array.from({length: VISIBLE_WIDTH}).map((_, visX) => {
                    const startX = getScreenX(visX);
                    const width = getScreenX(visX+1) - startX;
                    const yPos = yIdx * BLOCK_SIZE;
                    const centerX = startX + width / 2;
                    const centerY = yPos + BLOCK_SIZE / 2;

                    const gridX = normalizeX(visX + boardOffset);
                    const mark = goalMarks.find(m => m.x === gridX && m.y === y);

                    return (
                        <g key={`bg-${y}-${visX}`}>
                            <line x1={startX} y1={yPos} x2={startX+width} y2={yPos} stroke={COLORS.GRID_EMPTY} strokeWidth="1" opacity={0.2} />
                            <line x1={startX} y1={yPos} x2={startX} y2={yPos+BLOCK_SIZE} stroke={COLORS.GRID_EMPTY} strokeWidth="1" opacity={0.2} />
                            
                            {/* GOAL MARK RENDER */}
                            {mark && now - mark.spawnTime >= 500 && (
                                <g>
                                    <circle 
                                        cx={centerX} 
                                        cy={centerY} 
                                        r={BLOCK_SIZE / 4} 
                                        fill={mark.color} 
                                        stroke="white"
                                        strokeWidth="1"
                                        strokeOpacity={0.5}
                                    />
                                </g>
                            )}
                        </g>
                    );
                });
            })}

            {/* 1b. Offscreen Goal Indicators */}
            {goalMarks.map(mark => {
                const centerCol = normalizeX(boardOffset + VISIBLE_WIDTH / 2);
                let diff = mark.x - centerCol;
                if (diff > TOTAL_WIDTH / 2) diff -= TOTAL_WIDTH;
                if (diff < -TOTAL_WIDTH / 2) diff += TOTAL_WIDTH;
                
                if (Math.abs(diff) > VISIBLE_WIDTH / 2) {
                    const isRight = diff > 0;
                    const yPos = (mark.y - BUFFER_HEIGHT) * BLOCK_SIZE + (BLOCK_SIZE / 2);
                    const xPos = isRight ? (vbX + vbW - 5) : (vbX + 5);
                    
                    return (
                        <g key={`off-${mark.id}`} opacity={0.7}>
                             <path 
                                d={isRight 
                                    ? `M ${xPos} ${yPos - 10} L ${xPos + 10} ${yPos} L ${xPos} ${yPos + 10} Z`
                                    : `M ${xPos} ${yPos - 10} L ${xPos - 10} ${yPos} L ${xPos} ${yPos + 10} Z`
                                }
                                fill={mark.color}
                                stroke="white"
                                strokeWidth="1"
                             />
                        </g>
                    );
                }
                return null;
            })}

            {/* 2. Groups (Static & Falling) */}
            {Array.from(groups.entries()).map(([gid, cells]) => {
                if (cells.length === 0) return null;
                const sample = cells[0];
                const color = sample.color;
                const isHighlighted = gid === highlightedGroupId;
                const isShaking = gid === shakingGroupId;
                const isGlowing = cells.some(c => c.cell.isGlowing);

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                cells.forEach(c => {
                    minX = Math.min(minX, c.screenX);
                    minY = Math.min(minY, c.screenY);
                    maxX = Math.max(maxX, c.screenX + c.width);
                    maxY = Math.max(maxY, c.screenY + BLOCK_SIZE);
                });

                return (
                    <g key={`group-${gid}`} className={isShaking ? "shake-anim" : ""}>
                        <rect 
                            x={minX} y={minY} width={maxX - minX} height={maxY - minY}
                            fill={color}
                            fillOpacity={0.2}
                            mask={`url(#mask-${gid})`}
                        />
                        <g opacity={0.9} mask={`url(#mask-${gid})`}>
                            {cells.map((c, i) => {
                                if (!c.cell || c.isFalling) {
                                    return (
                                        <rect 
                                            key={`liq-${c.cell.id}`}
                                            x={c.screenX - 0.5} 
                                            y={c.screenY}
                                            width={c.width + 1} 
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
                                        key={`liq-${c.cell.id}`}
                                        x={c.screenX - 0.5} 
                                        y={c.screenY + (BLOCK_SIZE - fillHeight)} 
                                        width={c.width + 1}
                                        height={fillHeight} 
                                        fill={color}
                                    />
                                );
                            })}
                        </g>

                        {isHighlighted && (
                            <rect 
                                x={minX} y={minY} width={maxX - minX} height={maxY - minY}
                                fill="white"
                                fillOpacity={0.3}
                                mask={`url(#mask-${gid})`}
                            />
                        )}

                        {cells.map((c, i) => (
                             <path 
                                key={`cnt-${c.cell.id}`}
                                d={getContourPath(c.screenX, c.screenY, c.width, BLOCK_SIZE, c.neighbors)}
                                fill="none"
                                stroke={isGlowing ? "white" : color}
                                strokeWidth={isGlowing ? "3" : "2"}
                                className={isGlowing ? "super-glowing-stroke" : "glow-stroke"}
                                style={{ color: isGlowing ? 'white' : color }}
                             />
                        ))}

                         {cells.map((c, i) => {
                             const hPath = getHighlightPath(c.screenX, c.screenY, c.width, c.neighbors);
                             if (!hPath) return null;
                             return (
                                 <path 
                                    key={`hlt-${c.cell.id}`}
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

            {/* 5. Floating Score Text */}
            {floatingTexts.map(ft => {
                let visX = ft.x - boardOffset;
                if (visX > TOTAL_WIDTH / 2) visX -= TOTAL_WIDTH;
                if (visX < -TOTAL_WIDTH / 2) visX += TOTAL_WIDTH;

                if (visX >= -2 && visX < VISIBLE_WIDTH + 2) {
                    const startX = getScreenX(visX);
                    const width = getScreenX(visX+1) - startX;
                    const yPos = (ft.y - BUFFER_HEIGHT) * BLOCK_SIZE;
                    const cx = startX + width / 2;
                    const cy = yPos + BLOCK_SIZE / 2;
                    
                    return (
                        <text
                            key={ft.id}
                            x={cx}
                            y={cy}
                            fill={ft.color || '#fff'}
                            textAnchor="middle"
                            className="floating-score"
                            fontSize="24"
                        >
                            {ft.text}
                        </text>
                    );
                }
                return null;
            })}

        </svg>

        {/* Flying Orbs Overlay */}
        {flyingOrbs.map(orb => {
            const elapsed = now - orb.spawnTime;
            const progress = Math.min(1, elapsed / 500);
            
            // Ease Out Quad
            const eased = 1 - (1 - progress) * (1 - progress);

            // Determine Start Position based on Palette Index
            const colorIndex = palette.indexOf(orb.color);
            // Compact spacing logic (gap-2 + w-5 = 28px approx = ~8%)
            const startX = 50 + ((colorIndex - (palette.length - 1) / 2) * 8); 
            const startY = 6; // 6% down (Approx Top area location of new bubble)

            // Determine End Position (Board)
            const endCoords = getScreenPercentCoords(orb.x, orb.y);
            
            // Interpolate
            const currentX = startX + (endCoords.x - startX) * eased;
            const currentY = startY + (endCoords.y - startY) * eased;

            return (
                <div 
                    key={`fly-${orb.id}`}
                    className="absolute w-4 h-4 rounded-full shadow-lg border border-white/50 z-30"
                    style={{
                        backgroundColor: orb.color,
                        left: `${currentX}%`,
                        top: `${currentY}%`,
                        transform: 'translate(-50%, -50%)',
                        boxShadow: `0 0 10px ${orb.color}`
                    }}
                />
            );
        })}

        {/* Top Pool UI - Combined with Goal Counter */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-4 p-2 pl-4 bg-slate-900/80 rounded-full border border-slate-700/50 backdrop-blur-md z-20 pointer-events-none shadow-lg">
            {/* Goal Counter */}
            <span className="text-lg font-mono font-black text-yellow-400 leading-none drop-shadow-md">
                {state.goalsCleared}/{state.goalsTarget}
            </span>
            
            {/* Separator */}
            <div className="w-px h-6 bg-slate-700/50" />

            {/* Palette */}
            <div className="flex items-center gap-2">
                {palette.map(color => {
                    const isActive = activeColors.has(color);
                    return (
                        <div 
                            key={color}
                            className="w-5 h-5 rounded-full border-2 border-slate-700/50 relative flex items-center justify-center transition-all duration-300"
                            style={{ borderColor: isActive ? 'transparent' : color }}
                        >
                            {/* The "Available" Dot */}
                            <div 
                                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${isActive ? 'scale-0 opacity-0' : 'scale-100 opacity-100'}`}
                                style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
                            />
                            
                            {/* Placeholder Slot when active */}
                            {isActive && (
                                <div className="w-1 h-1 rounded-full bg-slate-800" />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    </div>
  );
};
