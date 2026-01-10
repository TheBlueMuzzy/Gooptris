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

    stateRef.current = {
        activePiece: piece,
        grid: newGrid,
        boardOffset: newOffset,
        gameOver: false,
        isPaused: false,
        gameSpeed: INITIAL_SPEED,
        isSoftDropping: false,
        fallingBlocks: [],
        timeLeft: INITIAL_TIME_MS,
        countdown: 3
    };
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

  const slamPiece = useCallback(() => {
    if (gameOver || isPaused || !activePiece || countdown !== null) return;
    
    const finalY = getGhostY(grid, activePiece, boardOffset);
    const slammedPiece = { ...activePiece, y: finalY };
    
    const mergedGrid = mergePiece(grid, slammedPiece);
    const { grid: finalGrid, falling: newFalling } = getFloatingBlocks(mergedGrid);
    
    const now = Date.now();
    const dropDistance = finalY - activePiece.startSpawnY;
    if (dropDistance > 0) {
        const expectedTime = dropDistance * gameSpeed;
        const actualTime = now - activePiece.spawnTimestamp;
        const ratio = actualTime / expectedTime;
        
        let speedBonus = 0;
        if (ratio < 1) {
            speedBonus = Math.ceil(5 * (1 - ratio));
        }
        updateScoreAndStats(speedBonus, { speed: speedBonus });
    }
    
    setCombo(0);
    setGrid(finalGrid);
    setFallingBlocks(prev => [...prev, ...newFalling]);

    setActivePiece(null);
    spawnNewPiece();
    
    // Explicitly clear lock timer on slam
    lockStartTimeRef.current = null;
    
    const isDownHeld = heldKeys.current.has('ArrowDown') || heldKeys.current.has('KeyS');
    setIsSoftDropping(isDownHeld);
  }, [activePiece, grid, boardOffset, gameOver, isPaused, countdown, gameSpeed, updateScoreAndStats]);

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
  }, [activePiece, storedPiece, grid, boardOffset, gameOver, isPaused, canSwap, countdown]);

  // --- Game Loop ---
  
  useEffect(() => { 
      stateRef.current = { activePiece, grid, boardOffset, gameOver, isPaused, gameSpeed, isSoftDropping, fallingBlocks, timeLeft, countdown }; 
  }, [activePiece, grid, boardOffset, gameOver, isPaused, gameSpeed, isSoftDropping, fallingBlocks, timeLeft, countdown]);
  
  useEffect(() => {
      let requestID: number;
      
      // Initialize time
      lastTimeRef.current = performance.now();

      const animate = (time: number) => {
          const dt = time - lastTimeRef.current;
          lastTimeRef.current = time;

          const { gameSpeed, grid, activePiece, boardOffset, isSoftDropping, fallingBlocks, timeLeft, countdown } = stateRef.current;
          
          if (countdown !== null) {
              lastTimeRef.current = time;
              requestID = requestAnimationFrame(animate);
              return;
          }

          if (!gameOverRef.current && !isPausedRef.current) {
              
              const newTimeLeft = timeLeft - dt;
              if (newTimeLeft <= 0) {
                  setTimeLeft(0);
                  setGameOver(true);
                  gameOverRef.current = true;
                  return; 
              } else {
                  setTimeLeft(newTimeLeft);
              }

              if (fallingBlocks.length > 0) {
                  const { active, landed } = updateFallingBlocks(fallingBlocks, grid, dt, gameSpeed);
                  
                  if (landed.length > 0) {
                      const nextGrid = grid.map(row => [...row]);
                      landed.forEach(b => {
                          if (nextGrid[b.y][b.x] === null) {
                              nextGrid[b.y][b.x] = b.data;
                          }
                      });
                      const finalizedGrid = updateGroups(nextGrid);
                      setGrid(finalizedGrid);
                      setFallingBlocks(active);
                  } else {
                      setFallingBlocks(active);
                  }
              }

              if (activePiece) {
                  let effectiveSpeed = gameSpeed;
                  if (isSoftDropping) {
                      effectiveSpeed = Math.max(16, gameSpeed / SOFT_DROP_FACTOR);
                  }
                  
                  const speed = 1 / effectiveSpeed;
                  let dy = Math.min(speed * dt, 0.9); 
                  
                  const nextY = activePiece.y + dy;
                  
                  // Check collision for the next frame
                  const nextPiece = { ...activePiece, y: nextY };
                  
                  if (checkCollision(grid, nextPiece, boardOffset)) {
                      // Collision detected: We are hitting the floor or a block
                      
                      // 1. Visual Snap: Try to land on the integer grid line if possible
                      // This ensures the piece looks grounded while sliding
                      const floorY = Math.floor(nextY);
                      if (floorY > activePiece.y) {
                          const snapPiece = { ...activePiece, y: floorY };
                          if (!checkCollision(grid, snapPiece, boardOffset)) {
                              setActivePiece(snapPiece);
                          }
                      }

                      // 2. Lock Delay Logic
                      if (lockStartTimeRef.current === null) {
                          lockStartTimeRef.current = Date.now();
                      }
                      
                      const elapsed = Date.now() - lockStartTimeRef.current;
                      const effectiveLockDelay = isSoftDropping ? 0 : LOCK_DELAY_MS;
                      
                      if (elapsed > effectiveLockDelay) {
                          // === TIME EXPIRED: LOCK PIECE ===
                          
                          // Speed Score logic
                          const now = Date.now();
                          const dropDistance = activePiece.y - activePiece.startSpawnY;
                          if (dropDistance > 0) {
                              const expectedTime = dropDistance * gameSpeed;
                              const actualTime = now - activePiece.spawnTimestamp;
                              const ratio = actualTime / expectedTime;
                              let speedBonus = 0;
                              if (ratio < 1) {
                                  speedBonus = Math.ceil(5 * (1 - ratio));
                              }
                          }

                          setCombo(0);
                          const mergedGrid = mergePiece(grid, activePiece);
                          const { grid: finalGrid, falling: newFalling } = getFloatingBlocks(mergedGrid);
                          
                          const nextDef = PIECES[Math.floor(Math.random() * PIECES.length)];
                          const nextColor = GAME_COLORS[Math.floor(Math.random() * GAME_COLORS.length)];
                          const newPiece = { 
                               definition: { ...nextDef, color: nextColor },
                               x: normalizeX(boardOffset + Math.floor((VISIBLE_WIDTH - 1) / 2)),
                               y: 1,
                               rotation: 0,
                               cells: nextDef.cells,
                               spawnTimestamp: Date.now(),
                               startSpawnY: 1
                           };
    
                           setGrid(finalGrid);
                           setFallingBlocks(prev => [...prev, ...newFalling]);
                           
                           const isDownHeld = heldKeys.current.has('ArrowDown') || heldKeys.current.has('KeyS');
                           setIsSoftDropping(isDownHeld);
    
                           if (checkCollision(finalGrid, newPiece, boardOffset)) {
                               setGameOver(true);
                               gameOverRef.current = true;
                               setActivePiece(null);
                           } else {
                               setActivePiece(newPiece);
                               setCanSwap(true);
                           }
                          
                          lockStartTimeRef.current = null;
                      }
                      // Else: we wait. Piece stays at activePiece.y. Player can move but timer keeps ticking.
                      
                  } else {
                      // No collision, falling freely
                      setActivePiece(nextPiece);
                      lockStartTimeRef.current = null; // Reset lock timer if we become airborne
                  }
              }
          }
          requestID = requestAnimationFrame(animate);
      };
      
      requestID = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(requestID);
  }, []); 

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
              case 'Space': slamPiece(); break;
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
  }, [moveBoard, rotatePiece, slamPiece, swapPiece, gameOver]);

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
        onSwipeDown={() => slamPiece()}
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