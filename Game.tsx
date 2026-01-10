import React, { useEffect, useState, useCallback, useRef } from 'react';
import { GameState, GridCell, ActivePiece, PieceDefinition, PieceType, FallingBlock, ScoreBreakdown, GameStats } from './types';
import { TOTAL_WIDTH, TOTAL_HEIGHT, VISIBLE_WIDTH, VISIBLE_HEIGHT, BASE_FILL_DURATION, PER_BLOCK_DURATION, PIECES, INITIAL_TIME_MS, SCORE_THRESHOLD, TIME_BONUS_MS, BUFFER_HEIGHT } from './constants';
import { 
    spawnPiece, checkCollision, mergePiece, getRotatedCells, normalizeX, findContiguousGroup, 
    getGhostY, updateFallingBlocks, getFloatingBlocks, updateGroups,
    calculateHeightBonus, calculateOffScreenBonus, calculateMultiplier, calculateAdjacencyBonus 
} from './utils/gameLogic';
import { GameBoard } from './components/GameBoard';
import { Controls } from './components/Controls';

const INITIAL_SPEED = 800; // ms per block
const MIN_SPEED = 100;
const SOFT_DROP_FACTOR = 20; // 20x speed when soft dropping
const LOCK_DELAY_MS = 500; // Time to slide before locking

const createGrid = (): GridCell[][] => 
  Array(TOTAL_HEIGHT).fill(null).map(() => Array(TOTAL_WIDTH).fill(null));

interface GameProps {
  onExit: () => void;
}

export const Game: React.FC<GameProps> = ({ onExit }) => {
  const [grid, setGrid] = useState<GridCell[][]>(createGrid());
  const [activePiece, setActivePiece] = useState<ActivePiece | null>(null);
  const [storedPiece, setStoredPiece] = useState<PieceDefinition | null>(null);
  const [boardOffset, setBoardOffset] = useState(0); 
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [canSwap, setCanSwap] = useState(true);
  const [combo, setCombo] = useState(0);
  const [cellsCleared, setCellsCleared] = useState(0);
  const [gameSpeed, setGameSpeed] = useState(INITIAL_SPEED);
  const [fallingBlocks, setFallingBlocks] = useState<FallingBlock[]>([]);
  const [isSoftDropping, setIsSoftDropping] = useState(false);
  const [timeLeft, setTimeLeft] = useState(INITIAL_TIME_MS);
  
  // Statistics
  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown>({ base: 0, height: 0, offscreen: 0, adjacency: 0, speed: 0 });
  const [gameStats, setGameStats] = useState<GameStats>({ startTime: 0, totalBonusTime: 0, maxGroupSize: 0 });

  // Countdown State
  const [countdown, setCountdown] = useState<number | null>(3);
  
  // Critical control refs for the game loop
  const gameOverRef = useRef(false);
  const isPausedRef = useRef(false);
  const lockStartTimeRef = useRef<number | null>(null);

  const lastTimeRef = useRef<number>(0);
  const heldKeys = useRef<Set<string>>(new Set());
  
  // Ref to hold latest state for the animation loop
  const stateRef = useRef({ 
      activePiece, grid, boardOffset, gameOver, isPaused, gameSpeed, isSoftDropping, fallingBlocks, timeLeft, countdown 
  });

  // Update ref when state changes
  useEffect(() => {
    stateRef.current = { 
        activePiece, grid, boardOffset, gameOver, isPaused, gameSpeed, isSoftDropping, fallingBlocks, timeLeft, countdown 
    };
    gameOverRef.current = gameOver;
    isPausedRef.current = isPaused;
  }, [activePiece, grid, boardOffset, gameOver, isPaused, gameSpeed, isSoftDropping, fallingBlocks, timeLeft, countdown]);

  useEffect(() => {
    startNewGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown timer logic
  useEffect(() => {
    if (countdown !== null && countdown > 0) {
        const timer = setTimeout(() => {
            setCountdown(prev => (prev !== null && prev > 1) ? prev - 1 : null);
        }, 1000);
        return () => clearTimeout(timer);
    } else if (countdown === null) {
        // When countdown finishes, set start time if it's 0 (first start)
        setGameStats(prev => prev.startTime === 0 ? { ...prev, startTime: Date.now() } : prev);
    }
  }, [countdown]);

  const getCenteredSpawnX = (offset: number) => {
    return normalizeX(offset + Math.floor((VISIBLE_WIDTH - 1) / 2));
  };

  const startNewGame = () => {
    const newGrid = createGrid();
    const newOffset = 0;

    setGrid(newGrid);
    setBoardOffset(newOffset);
    setScore(0);
    
    setGameOver(false);
    gameOverRef.current = false;
    
    setIsPaused(false);
    isPausedRef.current = false;
    
    setCountdown(3); 

    setStoredPiece(null);
    setCombo(0);
    setCellsCleared(0);
    setGameSpeed(INITIAL_SPEED);
    setCanSwap(true);
    setFallingBlocks([]);
    setIsSoftDropping(false);
    setTimeLeft(INITIAL_TIME_MS);
    lockStartTimeRef.current = null;
    
    // Reset Stats
    setScoreBreakdown({ base: 0, height: 0, offscreen: 0, adjacency: 0, speed: 0 });
    setGameStats({ startTime: 0, totalBonusTime: 0, maxGroupSize: 0 });

    heldKeys.current.clear();
    
    const piece = spawnPiece();
    piece.x = getCenteredSpawnX(newOffset);
    piece.y = 1; 
    piece.startSpawnY = 1;
    setActivePiece(piece);
  };

  const spawnNewPiece = (pieceDef?: PieceDefinition) => {
    const piece = spawnPiece(pieceDef);
    piece.x = getCenteredSpawnX(boardOffset);
    piece.y = 1; 
    piece.startSpawnY = 1;

    // Reset lock timer for new piece
    lockStartTimeRef.current = null;

    if (checkCollision(grid, piece, boardOffset)) {
       setGameOver(true);
       gameOverRef.current = true;
    } else {
       setActivePiece(piece);
       setCanSwap(true);
    }
  };

  // Helper to update score, check time bonus, and track stats
  const updateScoreAndStats = useCallback((pointsToAdd: number, breakdown?: Partial<ScoreBreakdown>) => {
      setScore(prev => {
          const newScore = prev + pointsToAdd;
          
          const prevThresholds = Math.floor(prev / SCORE_THRESHOLD);
          const newThresholds = Math.floor(newScore / SCORE_THRESHOLD);
          const diff = newThresholds - prevThresholds;
          
          if (diff > 0) {
              const bonusTime = diff * TIME_BONUS_MS;
              setTimeLeft(t => t + bonusTime);
              setGameStats(s => ({ ...s, totalBonusTime: s.totalBonusTime + bonusTime }));
          }
          
          return newScore;
      });

      if (breakdown) {
          setScoreBreakdown(prev => ({
              base: prev.base + (breakdown.base || 0),
              height: prev.height + (breakdown.height || 0),
              offscreen: prev.offscreen + (breakdown.offscreen || 0),
              adjacency: prev.adjacency + (breakdown.adjacency || 0),
              speed: prev.speed + (breakdown.speed || 0),
          }));
      }
  }, []);

  const handleBlockTap = useCallback((x: number, y: number) => {
     if (gameOver || isPaused || countdown !== null) return;

     const cell = grid[y][x];
     if (!cell) return;

     const now = Date.now();
     const totalDuration = BASE_FILL_DURATION + (cell.groupSize * PER_BLOCK_DURATION);
     
     // Calculate requirement per individual block segment to match visualization
     const groupHeight = (cell.groupMaxY - cell.groupMinY + 1);
     const segmentDuration = totalDuration / groupHeight;
     const indexFromBottom = cell.groupMaxY - y;
     
     // Time required for THIS specific cell to be filled
     // Matching the logic in GameBoard.tsx which enables glow when this segment is full
     const requiredTime = (indexFromBottom + 1) * segmentDuration;
     const elapsed = now - (cell.timestamp || 0); 
     
     if (elapsed < requiredTime) {
         return;
     }

     const group = findContiguousGroup(grid, x, y);
     
     if (group.length > 0) {
        setCellsCleared(prev => prev + 1);
        
        // Update Max Group Size
        setGameStats(s => ({ ...s, maxGroupSize: Math.max(s.maxGroupSize, group.length) }));

        let totalScoreForTap = 0;
        let currentComboCount = combo;
        
        // Stats accumulator for this tap
        let tapBreakdown = { base: 0, height: 0, offscreen: 0, adjacency: 0, speed: 0 };

        // 1. Adjacency Bonus
        const adjacencyScore = calculateAdjacencyBonus(grid, group);
        totalScoreForTap += adjacencyScore;
        tapBreakdown.adjacency += adjacencyScore;

        // Iterate through each block
        group.forEach((pt) => {
             currentComboCount++;
             const block = grid[pt.y][pt.x];
             
             // Base (10)
             let bScore = 10;
             // Height
             let hScore = calculateHeightBonus(pt.y);
             // Offscreen
             let oScore = calculateOffScreenBonus(pt.x, boardOffset);
             
             const multiplier = calculateMultiplier(currentComboCount);
             
             const finalBlockScore = (bScore + hScore + oScore) * multiplier;
             totalScoreForTap += finalBlockScore;

             // Approximate breakdown attribution (scaled by multiplier)
             tapBreakdown.base += (bScore * multiplier);
             tapBreakdown.height += (hScore * multiplier);
             tapBreakdown.offscreen += (oScore * multiplier);
        });
        
        updateScoreAndStats(Math.floor(totalScoreForTap), tapBreakdown);
        setCombo(currentComboCount);

        // Removal
        let tempGrid = grid.map(row => [...row]);
        group.forEach(pt => {
            tempGrid[pt.y][pt.x] = null;
        });

        const { grid: cleanGrid, falling: newFalling } = getFloatingBlocks(tempGrid);

        setGrid(cleanGrid);
        setFallingBlocks(prev => [...prev, ...newFalling]);
        setGameSpeed(prev => Math.max(MIN_SPEED, prev * 0.995));
     }
  }, [grid, gameOver, isPaused, countdown, combo, boardOffset, updateScoreAndStats]);

  // --- Core Actions ---

  const moveBoard = useCallback((dir: number) => {
    if (gameOver || isPaused || !activePiece || countdown !== null) return;
    const moveStep = 1; 
    const direction = dir * moveStep; 
    
    const newOffset = normalizeX(boardOffset + direction);
    const newPieceX = normalizeX(activePiece.x + direction);
    
    const tempPiece = { ...activePiece, x: newPieceX };
    
    if (!checkCollision(grid, tempPiece, newOffset)) {
      setBoardOffset(newOffset);
      setActivePiece(tempPiece);
      // Lock timer is NOT reset on move to prevent infinite stalling
    }
  }, [boardOffset, activePiece, grid, gameOver, isPaused, countdown]);

  const rotatePiece = useCallback((clockwise: boolean) => {
    if (gameOver || isPaused || !activePiece || countdown !== null) return;
    if (activePiece.definition.type === PieceType.O) return;

    const currentRot = activePiece.rotation;
    const newRot = (currentRot + (clockwise ? 1 : 3)) % 4;
    const newCells = getRotatedCells(activePiece.cells, clockwise);

    // Wall Kicks (Simplified: Try center, then right, then left, then up)
    const kicks = [
        {x: 0, y: 0},
        {x: 1, y: 0},
        {x: -1, y: 0},
        {x: 0, y: -1}, // Kick up if at bottom
        {x: 1, y: -1},
        {x: -1, y: -1}
    ];

    for (const kick of kicks) {
        const testPiece = {
            ...activePiece,
            rotation: newRot,
            cells: newCells,
            x: normalizeX(activePiece.x + kick.x),
            y: activePiece.y + kick.y
        };

        if (!checkCollision(grid, testPiece, boardOffset)) {
            setActivePiece(testPiece);
            lockStartTimeRef.current = null; // Reset lock delay on successful rotation
            return;
        }
    }
  }, [activePiece, grid, gameOver, isPaused, countdown, boardOffset]);

  const hardDrop = useCallback(() => {
    if (gameOver || isPaused || !activePiece || countdown !== null) return;

    const y = getGhostY(grid, activePiece, boardOffset);
    const droppedPiece = { ...activePiece, y };

    const newGrid = mergePiece(grid, droppedPiece);
    const { grid: finalGrid, falling: newFalling } = getFloatingBlocks(newGrid);
    
    // Score for hard drop: 2 * distance
    const distance = Math.floor(y - activePiece.y);
    updateScoreAndStats(distance * 2, { speed: distance * 2 });

    setGrid(finalGrid);
    setFallingBlocks(prev => [...prev, ...newFalling]);
    spawnNewPiece();
  }, [activePiece, grid, gameOver, isPaused, countdown, boardOffset, updateScoreAndStats]);

  // --- Game Loop ---

  const gameLoop = useCallback((time: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = time;
    const dt = time - lastTimeRef.current;
    lastTimeRef.current = time;

    const state = stateRef.current;
    if (state.gameOver || state.isPaused || state.countdown !== null) {
         requestAnimationFrame(gameLoop);
         return;
    }

    // 1. Update Timer
    setTimeLeft(prev => Math.max(0, prev - dt));
    if (state.timeLeft <= 0) {
        setGameOver(true);
        return;
    }

    // 2. Falling Blocks Physics
    if (state.fallingBlocks.length > 0) {
        const { active, landed } = updateFallingBlocks(state.fallingBlocks, state.grid, dt, state.gameSpeed);
        
        if (landed.length > 0) {
            // Merge landed blocks into grid
            const newGrid = state.grid.map(row => [...row]);
            let landUpdates = false;
            
            landed.forEach(b => {
                if (b.y >= 0 && b.y < TOTAL_HEIGHT) {
                    newGrid[Math.floor(b.y)][b.x] = b.data;
                    landUpdates = true;
                }
            });

            if (landUpdates) {
                 // Check for merges or group updates after landing
                 const groupedGrid = updateGroups(newGrid);
                 setGrid(groupedGrid);
                 
                 // If landing caused further instability (rare but possible), it will be caught next frame
                 const { grid: nextGrid, falling: nextFalling } = getFloatingBlocks(groupedGrid);
                 setGrid(nextGrid);
                 setFallingBlocks([...active, ...nextFalling]);
            } else {
                 setFallingBlocks(active);
            }
        } else {
            setFallingBlocks(active);
        }
    }

    // 3. Active Piece Gravity
    if (state.activePiece) {
        const gravitySpeed = state.isSoftDropping 
            ? state.gameSpeed / SOFT_DROP_FACTOR 
            : state.gameSpeed;
            
        // Convert speed (ms/block) to velocity (blocks/ms) -> blocks = ms * (1/speed)
        const moveAmount = dt / gravitySpeed;
        
        const nextY = state.activePiece.y + moveAmount;
        const nextPiece = { ...state.activePiece, y: nextY };
        
        if (checkCollision(state.grid, nextPiece, state.boardOffset)) {
            // Collision Detected: Snap to integer or slide?
            // Revert Y to floor(y) of collision? 
            // Better: Check if we can move down at all.
            // If we are stuck, start lock timer.
            
            if (lockStartTimeRef.current === null) {
                lockStartTimeRef.current = Date.now();
            }

            const lockedTime = Date.now() - lockStartTimeRef.current;
            if (lockedTime > LOCK_DELAY_MS) {
                // Lock it
                const finalPiece = { ...state.activePiece, y: Math.floor(state.activePiece.y) };
                // Double check collision on final spot (rare bug prevention)
                if (checkCollision(state.grid, finalPiece, state.boardOffset)) {
                    // Try one up if needed
                    finalPiece.y -= 1;
                }
                
                const newGrid = mergePiece(state.grid, finalPiece);
                const { grid: finalGrid, falling: newFalling } = getFloatingBlocks(newGrid);
                
                setGrid(finalGrid);
                setFallingBlocks(prev => [...prev, ...newFalling]);
                spawnNewPiece();
            }
            // Else: visual slide time (do nothing to Y, let it float at collision point?)
            // Actually usually we clamp Y to floor so it doesn't vibrate
            // But for smooth slide, we just don't increment Y.
        } else {
            // No collision, apply gravity
            setActivePiece(nextPiece);
            lockStartTimeRef.current = null; // Reset lock if we fell successfully
        }
    }

    requestAnimationFrame(gameLoop);
  }, []);

  useEffect(() => {
    const handle = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(handle);
  }, [gameLoop]);

  // --- Input Handling ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (heldKeys.current.has(e.code)) return;
        heldKeys.current.add(e.code);

        if (countdown !== null) return;
        
        switch (e.code) {
            case 'ArrowLeft':
            case 'KeyA':
                moveBoard(-1);
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveBoard(1);
                break;
            case 'ArrowUp':
            case 'KeyW':
                // Maybe quick drop or rotate? Standard is rotate or hard drop.
                // Let's use Up for Rotate CW
                rotatePiece(true);
                break;
            case 'KeyQ':
                rotatePiece(false);
                break;
            case 'KeyE':
                rotatePiece(true);
                break;
            case 'ArrowDown':
            case 'KeyS':
                setIsSoftDropping(true);
                break;
            case 'Space':
                hardDrop();
                break;
            case 'KeyP':
                setIsPaused(p => !p);
                break;
            case 'Escape':
                if (isPaused) {
                    onExit();
                } else {
                    setIsPaused(true);
                }
                break;
        }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        heldKeys.current.delete(e.code);
        if (e.code === 'ArrowDown' || e.code === 'KeyS') {
            setIsSoftDropping(false);
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [moveBoard, rotatePiece, hardDrop, isPaused, countdown, onExit]);

  return (
    <div className="w-full h-full relative bg-slate-900 overflow-hidden">
        <GameBoard 
            state={{ 
                grid, boardOffset, activePiece, storedPiece, score, gameOver, isPaused, canSwap, 
                level: 1, cellsCleared, combo, fallingBlocks, timeLeft, scoreBreakdown, gameStats 
            }} 
            onBlockTap={handleBlockTap}
        />
        
        <Controls 
            state={{ 
                grid, boardOffset, activePiece, storedPiece, score, gameOver, isPaused, canSwap, 
                level: 1, cellsCleared, combo, fallingBlocks, timeLeft, scoreBreakdown, gameStats 
            }}
            onTapLeft={() => moveBoard(-1)}
            onTapRight={() => moveBoard(1)}
            onSwipeUp={() => hardDrop()} // Hold piece or hard drop?
            onSwipeDown={() => setIsSoftDropping(true)} // Note: Touch end stops soft drop? Needs better logic for hold
            onSwipeLeft={() => moveBoard(-1)}
            onSwipeRight={() => moveBoard(1)}
            onRestart={startNewGame}
            onExit={onExit}
        />

        {/* Pause Overlay */}
        {isPaused && !gameOver && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
                <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl text-center">
                    <h2 className="text-3xl font-black text-white mb-6">PAUSED</h2>
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={() => setIsPaused(false)}
                            className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg"
                        >
                            RESUME
                        </button>
                        <button 
                            onClick={onExit}
                            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-lg"
                        >
                            EXIT TO MENU
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Countdown Overlay */}
        {countdown !== null && (
            <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
                <div className="text-9xl font-black text-white animate-ping drop-shadow-[0_0_30px_rgba(255,255,255,0.8)]">
                    {countdown}
                </div>
            </div>
        )}
    </div>
  );
};