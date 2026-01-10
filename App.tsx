import React, { useEffect, useState, useCallback, useRef } from 'react';
import { GameState, GridCell, ActivePiece, PieceDefinition, PieceType, FallingBlock } from './types';
import { TOTAL_WIDTH, TOTAL_HEIGHT, BUFFER_HEIGHT, VISIBLE_WIDTH, COMBO_BONUS, VISIBLE_HEIGHT, BASE_FILL_DURATION, PER_BLOCK_DURATION, GAME_COLORS, PIECES, INITIAL_TIME_MS, SCORE_THRESHOLD, TIME_BONUS_MS } from './constants';
import { 
    spawnPiece, checkCollision, mergePiece, getRotatedCells, normalizeX, findContiguousGroup, 
    updateGroups, getGhostY, updateFallingBlocks, getFloatingBlocks,
    calculateHeightBonus, calculateOffScreenBonus, calculateMultiplier, calculateAdjacencyBonus 
} from './utils/gameLogic';
import { GameBoard } from './components/GameBoard';
import { Controls } from './components/Controls';
import { Play, RotateCcw } from 'lucide-react';

const INITIAL_SPEED = 800; // ms per block
const MIN_SPEED = 100;
const SOFT_DROP_FACTOR = 20; // 20x speed when soft dropping

const createGrid = (): GridCell[][] => 
  Array(TOTAL_HEIGHT).fill(null).map(() => Array(TOTAL_WIDTH).fill(null));

const App: React.FC = () => {
  const [grid, setGrid] = useState<GridCell[][]>(createGrid());
  const [activePiece, setActivePiece] = useState<ActivePiece | null>(null);
  const [storedPiece, setStoredPiece] = useState<PieceDefinition | null>(null);
  const [boardOffset, setBoardOffset] = useState(0); 
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [canSwap, setCanSwap] = useState(true);
  const [combo, setCombo] = useState(0); // This now tracks total blocks destroyed between locks
  const [cellsCleared, setCellsCleared] = useState(0);
  const [gameSpeed, setGameSpeed] = useState(INITIAL_SPEED);
  const [fallingBlocks, setFallingBlocks] = useState<FallingBlock[]>([]);
  const [isSoftDropping, setIsSoftDropping] = useState(false);
  const [timeLeft, setTimeLeft] = useState(INITIAL_TIME_MS);
  
  // Critical control refs for the game loop to avoid state sync lag
  const gameOverRef = useRef(false);
  const isPausedRef = useRef(false);

  const lastTimeRef = useRef<number>(0);
  const heldKeys = useRef<Set<string>>(new Set());
  
  // Ref to hold latest state for the animation loop
  const stateRef = useRef({ activePiece, grid, boardOffset, gameOver, isPaused, gameSpeed, isSoftDropping, fallingBlocks, timeLeft });

  useEffect(() => {
    startNewGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    setStoredPiece(null);
    setCombo(0);
    setCellsCleared(0);
    setGameSpeed(INITIAL_SPEED);
    setCanSwap(true);
    setFallingBlocks([]);
    setIsSoftDropping(false);
    setTimeLeft(INITIAL_TIME_MS);
    heldKeys.current.clear();
    
    // Manually spawn first piece to avoid checking collision against stale grid state
    const piece = spawnPiece();
    piece.x = getCenteredSpawnX(newOffset);
    piece.y = 1; 
    piece.startSpawnY = 1;
    setActivePiece(piece);

    // Force sync stateRef immediately so the loop doesn't see stale state
    stateRef.current = {
        activePiece: piece,
        grid: newGrid,
        boardOffset: newOffset,
        gameOver: false,
        isPaused: false,
        gameSpeed: INITIAL_SPEED,
        isSoftDropping: false,
        fallingBlocks: [],
        timeLeft: INITIAL_TIME_MS
    };
    
    // NOTE: We do NOT reset lastTimeRef here to avoid delta spikes. 
    // The loop will continue using the existing timeline.
  };

  const spawnNewPiece = (pieceDef?: PieceDefinition) => {
    const piece = spawnPiece(pieceDef);
    piece.x = getCenteredSpawnX(boardOffset);
    piece.y = 1; 
    // Track start Y for speed bonus
    piece.startSpawnY = 1;

    if (checkCollision(grid, piece, boardOffset)) {
       setGameOver(true);
       gameOverRef.current = true;
    } else {
       setActivePiece(piece);
       setCanSwap(true);
    }
  };

  // Helper to update score and check for time bonus
  const updateScore = useCallback((pointsToAdd: number) => {
      setScore(prev => {
          const newScore = prev + pointsToAdd;
          
          const prevThresholds = Math.floor(prev / SCORE_THRESHOLD);
          const newThresholds = Math.floor(newScore / SCORE_THRESHOLD);
          const diff = newThresholds - prevThresholds;
          
          if (diff > 0) {
              setTimeLeft(t => t + (diff * TIME_BONUS_MS));
          }
          
          return newScore;
      });
  }, []);

  // --- Tap Interaction ---

  const handleBlockTap = useCallback((x: number, y: number) => {
     if (gameOver || isPaused) return;

     const cell = grid[y][x];
     if (!cell) return;

     // RULE: Can only tap if fully charged
     const now = Date.now();
     const totalDuration = BASE_FILL_DURATION + (cell.groupSize * PER_BLOCK_DURATION);
     const elapsed = now - (cell.timestamp || 0); 
     
     if (!(elapsed >= totalDuration)) {
         return;
     }

     const group = findContiguousGroup(grid, x, y);
     
     if (group.length > 0) {
        setCellsCleared(prev => prev + 1); // Counts as 1 Cell, no matter how big

        // --- NEW SCORING LOGIC ---
        let totalScoreForTap = 0;
        let currentComboCount = combo; // Start from current accumulated count
        
        // 1. Adjacency Bonus (Unique neighbors touching the group)
        // 5 pts per unique touching group
        const adjacencyScore = calculateAdjacencyBonus(grid, group);
        totalScoreForTap += adjacencyScore;

        // Iterate through each block to calculate individual scores + multiplier
        group.forEach((pt) => {
             currentComboCount++;
             const block = grid[pt.y][pt.x];
             
             // Base Score
             let blockScore = 10;
             
             // Height Bonus
             blockScore += calculateHeightBonus(pt.y);
             
             // Off-screen Bonus
             blockScore += calculateOffScreenBonus(pt.x, boardOffset);
             
             // Multiplier
             const multiplier = calculateMultiplier(currentComboCount);
             
             totalScoreForTap += (blockScore * multiplier);
        });
        
        // Update global score and check time bonus
        updateScore(Math.floor(totalScoreForTap));
        
        // Update combo counter (blocks destroyed since last lock)
        setCombo(currentComboCount);


        // --- DESTRUCTION LOGIC ---
        // Remove Blocks immediately
        let tempGrid = grid.map(row => [...row]);
        group.forEach(pt => {
            tempGrid[pt.y][pt.x] = null;
        });

        // Identify any unsupported floating blocks
        const { grid: cleanGrid, falling: newFalling } = getFloatingBlocks(tempGrid);

        setGrid(cleanGrid);
        setFallingBlocks(prev => [...prev, ...newFalling]);
        setGameSpeed(prev => Math.max(MIN_SPEED, prev * 0.995));
     }
  }, [grid, gameOver, isPaused, combo, boardOffset, updateScore]);

  // --- Core Actions ---

  const moveBoard = useCallback((dir: number) => {
    if (gameOver || isPaused || !activePiece) return;
    const moveStep = 1; 
    const direction = dir * moveStep; 
    
    const newOffset = normalizeX(boardOffset + direction);
    const newPieceX = normalizeX(activePiece.x + direction);
    
    const tempPiece = { ...activePiece, x: newPieceX };
    
    if (!checkCollision(grid, tempPiece, newOffset)) {
      setBoardOffset(newOffset);
      setActivePiece(tempPiece);
    }
  }, [boardOffset, activePiece, grid, gameOver, isPaused]);

  const rotatePiece = useCallback((clockwise: boolean) => {
    if (gameOver || isPaused || !activePiece) return;
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
            return;
        }
    }
  }, [activePiece, grid, boardOffset, gameOver, isPaused]);

  const lockPiece = useCallback((pieceToLock: ActivePiece | null = null) => {
      // Logic handled mostly in loop
  }, []);

  const slamPiece = useCallback(() => {
    if (gameOver || isPaused || !activePiece) return;
    
    const finalY = getGhostY(grid, activePiece, boardOffset);
    const slammedPiece = { ...activePiece, y: finalY };
    
    const newGrid = mergePiece(grid, slammedPiece);
    
    // Calculate Speed Bonus Manually here since we are bypassing the loop's drift
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
        updateScore(speedBonus);
    }
    
    // Reset combo on lock
    setCombo(0);

    setGrid(newGrid);
    setActivePiece(null);
    spawnNewPiece();
    
    // Check if soft drop keys are still held
    const isDownHeld = heldKeys.current.has('ArrowDown') || heldKeys.current.has('KeyS');
    setIsSoftDropping(isDownHeld);
  }, [activePiece, grid, boardOffset, gameOver, isPaused, gameSpeed, updateScore]);

  const swapPiece = useCallback(() => {
      if (gameOver || isPaused || !activePiece || !canSwap) return;
      const currentDef = activePiece.definition;
      const nextDef = storedPiece;
      
      setStoredPiece(currentDef);
      
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
  }, [activePiece, storedPiece, grid, boardOffset, gameOver, isPaused, canSwap]);

  // --- Game Loop ---
  
  // Ref to hold latest state for the animation loop
  useEffect(() => { 
      stateRef.current = { activePiece, grid, boardOffset, gameOver, isPaused, gameSpeed, isSoftDropping, fallingBlocks, timeLeft }; 
  }, [activePiece, grid, boardOffset, gameOver, isPaused, gameSpeed, isSoftDropping, fallingBlocks, timeLeft]);
  
  useEffect(() => {
      let requestID: number;
      
      // Initialize time
      lastTimeRef.current = performance.now();

      const animate = (time: number) => {
          const dt = time - lastTimeRef.current;
          lastTimeRef.current = time;

          // Read latest state from ref
          const { gameSpeed, grid, activePiece, boardOffset, isSoftDropping, fallingBlocks, timeLeft } = stateRef.current;
          
          // Use Control Refs for loop condition to avoid stale state
          if (!gameOverRef.current && !isPausedRef.current) {
              
              // 0. Timer Logic
              const newTimeLeft = timeLeft - dt;
              if (newTimeLeft <= 0) {
                  setTimeLeft(0);
                  setGameOver(true);
                  gameOverRef.current = true;
                  // Don't process anything else
                  return; 
              } else {
                  setTimeLeft(newTimeLeft);
              }

              // 1. Update Falling Blocks (Gravity for destroyed columns)
              if (fallingBlocks.length > 0) {
                  const { active, landed } = updateFallingBlocks(fallingBlocks, grid, dt, gameSpeed);
                  
                  if (landed.length > 0) {
                      const nextGrid = grid.map(row => [...row]);
                      landed.forEach(b => {
                          // Check collision again in case two blocks land on same spot in same frame (rare but possible)
                          if (nextGrid[b.y][b.x] === null) {
                              nextGrid[b.y][b.x] = b.data;
                          }
                      });
                      
                      // Merge colors/groups only when things land
                      const finalizedGrid = updateGroups(nextGrid);
                      setGrid(finalizedGrid);
                      setFallingBlocks(active);
                  } else {
                      setFallingBlocks(active);
                  }
              }

              // 2. Update Active Piece
              if (activePiece) {
                  // Calculate speed
                  let effectiveSpeed = gameSpeed;
                  if (isSoftDropping) {
                      effectiveSpeed = Math.max(16, gameSpeed / SOFT_DROP_FACTOR);
                  }
                  
                  const speed = 1 / effectiveSpeed;
                  // Cap dy to prevent tunneling through blocks at very low frame rates
                  let dy = Math.min(speed * dt, 0.9); 
                  
                  const nextY = activePiece.y + dy;
                  
                  // Try moving to nextY
                  const nextPiece = { ...activePiece, y: nextY };
                  
                  if (checkCollision(grid, nextPiece, boardOffset)) {
                      // Collision imminent or happened
                      const curIntY = Math.floor(activePiece.y);
                      const nextIntY = curIntY + 1;
                      
                      const candidate = { ...activePiece, y: nextIntY };
                      let finalY = curIntY;
                      if (!checkCollision(grid, candidate, boardOffset)) {
                          finalY = nextIntY;
                      }
                      
                      // LOCKING
                      const lockingPiece = { ...activePiece, y: finalY };
                      
                      // Speed Bonus Calculation (Natural Lock)
                      const dropDistance = finalY - activePiece.startSpawnY;
                      if (dropDistance > 0) {
                          const now = Date.now();
                          const expectedTime = dropDistance * gameSpeed;
                          const actualTime = now - activePiece.spawnTimestamp;
                          const ratio = actualTime / expectedTime;
                          
                          let speedBonus = 0;
                          if (ratio < 1) {
                              speedBonus = Math.ceil(5 * (1 - ratio));
                          }
                          // Note: Can't use updateScore callback here easily without state mismatch in loop
                          // But we can trigger setScore using function form
                          setScore(prev => {
                             const newScore = prev + speedBonus;
                             const prevThresholds = Math.floor(prev / SCORE_THRESHOLD);
                             const newThresholds = Math.floor(newScore / SCORE_THRESHOLD);
                             const diff = newThresholds - prevThresholds;
                             if (diff > 0) setTimeLeft(t => t + (diff * TIME_BONUS_MS));
                             return newScore;
                          });
                      }
                      
                      // Reset Combo
                      setCombo(0);
                      
                      const newGrid = mergePiece(grid, lockingPiece);
                      
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

                       setGrid(newGrid);
                       
                       // Check if soft drop keys are still held
                       const isDownHeld = heldKeys.current.has('ArrowDown') || heldKeys.current.has('KeyS');
                       setIsSoftDropping(isDownHeld);

                       if (checkCollision(newGrid, newPiece, boardOffset)) {
                           setGameOver(true);
                           gameOverRef.current = true;
                           setActivePiece(null);
                       } else {
                           setActivePiece(newPiece);
                           setCanSwap(true);
                       }
                      
                  } else {
                      setActivePiece(nextPiece);
                  }
              }
          }
          requestID = requestAnimationFrame(animate);
      };
      
      requestID = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(requestID);
  }, []); // Run once

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
                  // Only stop soft dropping if NEITHER key is held
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
      level: 1, cellsCleared, combo, fallingBlocks, timeLeft
  };

  return (
    <div className="w-full h-screen bg-slate-950 flex flex-col items-center justify-center relative touch-none">
      <Controls 
        state={gameState} 
        onTapLeft={() => rotatePiece(false)}
        onTapRight={() => rotatePiece(true)}
        onSwipeLeft={() => moveBoard(1)}
        onSwipeRight={() => moveBoard(-1)}
        onSwipeUp={() => swapPiece()}
        onSwipeDown={() => slamPiece()}
        onRestart={startNewGame}
      />

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
        </div>
      )}
      
      <GameBoard state={gameState} onBlockTap={handleBlockTap} />
      
    </div>
  );
};

export default App;