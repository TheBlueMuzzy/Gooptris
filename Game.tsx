import React, { useEffect, useState, useCallback, useRef } from 'react';
import { GameState, GridCell, ActivePiece, PieceDefinition, PieceType, FallingBlock, ScoreBreakdown, GameStats } from './types';
import { TOTAL_WIDTH, TOTAL_HEIGHT, VISIBLE_WIDTH, VISIBLE_HEIGHT, BASE_FILL_DURATION, PER_BLOCK_DURATION, GAME_COLORS, PIECES, INITIAL_TIME_MS, SCORE_THRESHOLD, TIME_BONUS_MS } from './constants';
import { 
    spawnPiece, checkCollision, mergePiece, getRotatedCells, normalizeX, findContiguousGroup, 
    updateGroups, getGhostY, updateFallingBlocks, getFloatingBlocks,
    calculateHeightBonus, calculateOffScreenBonus, calculateMultiplier, calculateAdjacencyBonus 
} from './utils/gameLogic';
import { GameBoard } from './components/GameBoard';
import { Controls } from './components/Controls';
import { Play, RotateCcw, Home } from 'lucide-react';

const INITIAL_SPEED = 800; // ms per block
const MIN_SPEED = 100;
const SOFT_DROP_FACTOR = 20; // 20x speed when soft dropping
const LOCK_DELAY_MS = 500; // Time to slide before locking

const createGrid = (): GridCell[][] => 
  Array(TOTAL_HEIGHT).fill(null).map(() => Array(TOTAL_WIDTH).fill(null));

interface GameProps {
  onExit: () => void;
}

const Game: React.FC<GameProps> = ({ onExit }) => {
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

  const spawnNewPiece = useCallback((pieceDef?: PieceDefinition, gridOverride?: GridCell[][], offsetOverride?: number) => {
    const currentGrid = gridOverride || stateRef.current.grid;
    const currentOffset = offsetOverride !== undefined ? offsetOverride : stateRef.current.boardOffset;

    const piece = spawnPiece(pieceDef);
    piece.x = getCenteredSpawnX(currentOffset);
    piece.y = 1; 
    piece.startSpawnY = 1;

    // Reset lock timer for new piece
    lockStartTimeRef.current = null;

    if (checkCollision(currentGrid, piece, currentOffset)) {
       setGameOver(true);
       gameOverRef.current = true;
    } else {
       setActivePiece(piece);
       setCanSwap(true);
    }
  }, []);

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
     const elapsed = now - (cell.timestamp || 0); 
     
     if (!(elapsed >= totalDuration)) {
         return;
     }

     const group = findContiguousGroup(grid, x, y);
     
     if (group.length > 0) {
        setCellsCleared(prev => prev + 1);
        
        // Update Max Group Size
        setGameStats(s => ({ ...s, maxGroupSize: Math.max(s.maxGroupSize, group.length) }));

        let totalScoreForTap = 0;
        let currentComboCount = combo;
        
        currentComboCount++; 

        // Stats accumulator for this tap
        let tapBreakdown = { base: 0, height: 0, offscreen: 0, adjacency: 0, speed: 0 };

        // 1. Adjacency Bonus
        const adjacencyScore = calculateAdjacencyBonus(grid, group);
        totalScoreForTap += adjacencyScore;
        tapBreakdown.adjacency += adjacencyScore;

        // Iterate through each block
        group.forEach((pt) => {
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
    const nextRot = (currentRot + (clockwise ? 1 : -1) + 4) % 4;
    const nextCells = getRotatedCells(activePiece.cells, clockwise);
    
    const tempPiece = { ...activePiece, cells: nextCells, rotation: nextRot };
    const kicks = [{x:0, y:0}, {x:1, y:0}, {x:-1, y:0}, {x:0, y:-1}, {x:1, y:-1}, {x:-1, y:-1}, {x:2, y:0}, {x:-2, y:0}];

    for (const kick of kicks) {
        const kickedPiece = { ...tempPiece, x: normalizeX(tempPiece.x + kick.x), y: tempPiece.y + kick.y };
        if (!checkCollision(grid, kickedPiece, boardOffset)) {
            setActivePiece(kickedPiece);
            // Lock timer is NOT reset on rotate
            return;
        }
    }
  }, [activePiece, grid, boardOffset, gameOver, isPaused, countdown]);

  const hardDrop = useCallback(() => {
    if (gameOver || isPaused || !activePiece || countdown !== null) return;

    const y = getGhostY(grid, activePiece, boardOffset);
    
    const droppedPiece = { ...activePiece, y };

    const newGrid = mergePiece(grid, droppedPiece);
    // REMOVED getFloatingBlocks call here to prevent piece from breaking apart or jittering on lock
    
    const distance = Math.floor(y - activePiece.y);
    updateScoreAndStats(distance * 2, { speed: distance * 2 });

    setGrid(newGrid);
    // Use fresh state for spawn
    spawnNewPiece(undefined, newGrid, boardOffset);
    setCombo(0);
    setIsSoftDropping(false);
  }, [activePiece, grid, gameOver, isPaused, countdown, boardOffset, updateScoreAndStats, spawnNewPiece]);

  const swapPiece = useCallback(() => {
      if (gameOver || isPaused || !activePiece || !canSwap || countdown !== null) return;
      const currentDef = activePiece.definition;
      const nextDef = storedPiece;
      
      setStoredPiece(currentDef);
      lockStartTimeRef.current = null; // Reset timer on swap
      
      if (nextDef) {
          const newPiece = { 
            ...activePiece, 
            definition: nextDef, 
            cells: [...nextDef.cells], 
            rotation: 0,
            spawnTimestamp: Date.now(), // Reset timing on swap
            startSpawnY: 1
          };
          newPiece.x = normalizeX(boardOffset + Math.floor((VISIBLE_WIDTH - 1) / 2));
          newPiece.y = 1;

          if (!checkCollision(grid, newPiece, boardOffset)) {
              setActivePiece(newPiece);
              setCanSwap(false);
          }
      } else {
          setStoredPiece(currentDef);
          spawnNewPiece();
          setCanSwap(false);
      }
  }, [activePiece, storedPiece, grid, boardOffset, gameOver, isPaused, canSwap, countdown, spawnNewPiece]);

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
            const newGrid = state.grid.map(row => [...row]);
            let landUpdates = false;
            
            landed.forEach(b => {
                if (b.y >= 0 && b.y < TOTAL_HEIGHT) {
                    newGrid[Math.floor(b.y)][b.x] = { ...b.data, timestamp: Date.now() }; // Update timestamp to restart animation
                    landUpdates = true;
                }
            });

            if (landUpdates) {
                 const groupedGrid = updateGroups(newGrid);
                 setGrid(groupedGrid);
                 // We do NOT run getFloatingBlocks here to ensure stability. 
                 // Gravity only triggers on destruction (tap).
                 setFallingBlocks(active);
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
            
        const moveAmount = dt / gravitySpeed;
        const nextY = state.activePiece.y + moveAmount;
        const nextPiece = { ...state.activePiece, y: nextY };
        
        if (checkCollision(state.grid, nextPiece, state.boardOffset)) {
            if (lockStartTimeRef.current === null) {
                lockStartTimeRef.current = Date.now();
            }

            const lockedTime = Date.now() - lockStartTimeRef.current;
            
            // Fix: Faster locking when soft dropping
            const effectiveLockDelay = state.isSoftDropping ? 50 : LOCK_DELAY_MS;

            if (lockedTime > effectiveLockDelay) {
                // Lock it
                // Logic used to snap to floor before merging
                const y = getGhostY(state.grid, state.activePiece, state.boardOffset);
                const finalPiece = { ...state.activePiece, y };
                
                // Safety check if floor is invalid (should be handled by collision check but being safe)
                if (checkCollision(state.grid, finalPiece, state.boardOffset)) {
                   // If floor is invalid, it means we are colliding *into* it.
                   // Usually shouldn't happen if checkCollision prevented movement.
                   // But if it does, y-1 is safer.
                   // However, for debugging the jump, let's leave as is or basic correction.
                }
                
                const newGrid = mergePiece(state.grid, finalPiece);
                // REMOVED getFloatingBlocks call here. 
                // The piece should stay solid upon locking. Gravity only runs on tap.
                
                setGrid(newGrid);
                // Don't add new falling blocks here
                
                setCombo(0);
                
                // CRITICAL FIX: Use current state for spawn to avoid stale closure issues
                spawnNewPiece(undefined, newGrid, state.boardOffset);
                
                setIsSoftDropping(false); // Reset soft drop state after lock
            }
        } else {
            setActivePiece(nextPiece);
            lockStartTimeRef.current = null; 
        }
    }

    requestAnimationFrame(gameLoop);
  }, [spawnNewPiece]);

  useEffect(() => {
    const handle = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(handle);
  }, [gameLoop]);

  // Keyboard
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          heldKeys.current.add(e.code);

          if (e.key === 'Escape') {
              setIsPaused(prev => {
                  const newVal = !prev;
                  isPausedRef.current = newVal;
                  return newVal;
              });
              return;
          }
          if (gameOver) {
              if (e.key === 'Enter') startNewGame();
              return;
          }
          if (e.repeat) return;

          switch(e.code) {
              case 'ArrowLeft': case 'KeyA': moveBoard(1); break;
              case 'ArrowRight': case 'KeyD': moveBoard(-1); break;
              case 'KeyQ': rotatePiece(false); break;
              case 'KeyE': case 'ArrowUp': rotatePiece(true); break;
              case 'ArrowDown': case 'KeyS': 
                  setIsSoftDropping(true);
                  break;
              case 'Space': hardDrop(); break;
              case 'KeyW': swapPiece(); break;
          }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
          heldKeys.current.delete(e.code);

          switch(e.code) {
              case 'ArrowDown': case 'KeyS': 
                  if (!heldKeys.current.has('ArrowDown') && !heldKeys.current.has('KeyS')) {
                      setIsSoftDropping(false);
                  }
                  break;
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      };
  }, [moveBoard, rotatePiece, hardDrop, swapPiece, gameOver]);

  const gameState: GameState = {
      grid, boardOffset, activePiece, storedPiece, score, gameOver, isPaused, canSwap,
      level: 1, cellsCleared, combo, fallingBlocks, timeLeft, scoreBreakdown, gameStats
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative touch-none">
      <Controls 
        state={gameState} 
        onTapLeft={() => rotatePiece(false)}
        onTapRight={() => rotatePiece(true)}
        onSwipeLeft={() => moveBoard(1)}
        onSwipeRight={() => moveBoard(-1)}
        onSwipeUp={() => swapPiece()}
        onSwipeDown={() => hardDrop()}
        onRestart={startNewGame}
        onExit={onExit}
      />

      {countdown !== null && !gameOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in">
              <div className="text-9xl font-black text-white animate-pulse drop-shadow-[0_0_30px_rgba(34,211,238,0.8)]">
                  {countdown}
              </div>
          </div>
      )}

      {isPaused && !gameOver && (
        <div className="absolute inset-0 bg-slate-950/80 z-40 flex flex-col items-center justify-center backdrop-blur-sm gap-6">
            <h2 className="text-4xl text-cyan-400 font-bold tracking-widest animate-pulse mb-4">PAUSED</h2>
            <button 
              onClick={() => { setIsPaused(false); isPausedRef.current = false; }}
              className="flex items-center gap-3 px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-lg shadow-cyan-900/50 transition-all active:scale-95 text-xl"
            >
               <Play className="w-6 h-6 fill-current" /> RESUME
            </button>
            <button 
              onClick={startNewGame}
              className="flex items-center gap-3 px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg border border-slate-600 transition-all active:scale-95 text-lg"
            >
               <RotateCcw className="w-5 h-5" /> RESTART
            </button>
            <button 
              onClick={onExit}
              className="flex items-center gap-3 px-8 py-4 bg-red-900/50 hover:bg-red-900/80 text-red-200 font-bold rounded-lg border border-red-800 transition-all active:scale-95 text-lg"
            >
               <Home className="w-5 h-5" /> EXIT
            </button>
        </div>
      )}
      
      <GameBoard state={gameState} onBlockTap={handleBlockTap} />
      
    </div>
  );
};

export default Game;