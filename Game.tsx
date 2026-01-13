
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { GameState, GridCell, ActivePiece, PieceDefinition, PieceType, FallingBlock, ScoreBreakdown, GameStats, FloatingText } from './types';
import { 
    TOTAL_WIDTH, TOTAL_HEIGHT, VISIBLE_WIDTH, VISIBLE_HEIGHT, PER_BLOCK_DURATION, INITIAL_TIME_MS, 
    PRESSURE_RECOVERY_BASE_MS, PRESSURE_RECOVERY_PER_UNIT_MS, PRESSURE_TIER_THRESHOLD, PRESSURE_TIER_STEP, PRESSURE_TIER_BONUS_MS, UPGRADE_CONFIG
} from './constants';
import { 
    spawnPiece, checkCollision, mergePiece, getRotatedCells, normalizeX, findContiguousGroup, 
    updateGroups, getGhostY, updateFallingBlocks, getFloatingBlocks,
    calculateHeightBonus, calculateOffScreenBonus, calculateMultiplier, calculateAdjacencyBonus, createInitialGrid
} from './utils/gameLogic';
import { calculateRankDetails } from './utils/progression';
import { GameBoard } from './components/GameBoard';
import { Controls } from './components/Controls';
import { Play, RotateCcw, Home } from 'lucide-react';
import { audio } from './utils/audio';

const INITIAL_SPEED = 800; // ms per block
const MIN_SPEED = 100;
const SOFT_DROP_FACTOR = 20; // 20x speed when soft dropping
const LOCK_DELAY_MS = 500; // Time to slide before locking

interface GameProps {
  onExit: () => void;
  onRunComplete: (score: number) => void;
  initialTotalScore: number;
  powerUps?: Record<string, number>;
}

const Game: React.FC<GameProps> = ({ onExit, onRunComplete, initialTotalScore, powerUps = {} }) => {
  const [gameId, setGameId] = useState(0);

  // Grid initialization
  const [grid, setGrid] = useState<GridCell[][]>(() => {
      const rank = calculateRankDetails(initialTotalScore).rank;
      return createInitialGrid(rank);
  });
  
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
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  
  const maxTimeRef = useRef(INITIAL_TIME_MS);

  // Statistics
  const [scoreBreakdown, setScoreBreakdown] = useState<ScoreBreakdown>({ base: 0, height: 0, offscreen: 0, adjacency: 0, speed: 0 });
  const [gameStats, setGameStats] = useState<GameStats>({ startTime: 0, totalBonusTime: 0, maxGroupSize: 0 });

  const [countdown, setCountdown] = useState<number | null>(2);
  
  const gameOverRef = useRef(false);
  const isPausedRef = useRef(false);
  const lockStartTimeRef = useRef<number | null>(null);
  const requestRef = useRef<number>(0);
  
  const initialTotalScoreRef = useRef(initialTotalScore);
  const latestTotalScorePropRef = useRef(initialTotalScore);

  useEffect(() => {
    latestTotalScorePropRef.current = initialTotalScore;
  }, [initialTotalScore]);

  const lastTimeRef = useRef<number>(0);
  const heldKeys = useRef<Set<string>>(new Set());
  const lastMoveTimeRef = useRef(0);
  
  // Ref to hold latest state for the animation loop
  const stateRef = useRef({ 
      activePiece, grid, boardOffset, gameOver, isPaused, gameSpeed, isSoftDropping, fallingBlocks, timeLeft, countdown, floatingTexts, score,
      canSwap, storedPiece, combo
  });

  useEffect(() => {
    stateRef.current = { 
        activePiece, grid, boardOffset, gameOver, isPaused, gameSpeed, isSoftDropping, fallingBlocks, timeLeft, countdown, floatingTexts, score,
        canSwap, storedPiece, combo
    };
    gameOverRef.current = gameOver;
    isPausedRef.current = isPaused;
    
    // Audio: Update pressure
    const pressure = Math.max(0, 1 - (timeLeft / maxTimeRef.current));
    audio.setPressure(pressure);
  }, [activePiece, grid, boardOffset, gameOver, isPaused, gameSpeed, isSoftDropping, fallingBlocks, timeLeft, countdown, floatingTexts, score, canSwap, storedPiece, combo]);

  useEffect(() => {
    startNewGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (gameOver) {
        audio.playGameOver();
        audio.stopMusic();
        onRunComplete(score);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver]);

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
        const timer = setTimeout(() => {
            setCountdown(prev => (prev !== null && prev > 1) ? prev - 1 : null);
        }, 1000);
        return () => clearTimeout(timer);
    } else if (countdown === null) {
        setGameStats(prev => prev.startTime === 0 ? { ...prev, startTime: Date.now() } : prev);
        audio.startMusic();
    }
  }, [countdown]);

  const getCenteredSpawnX = (offset: number) => {
    return normalizeX(offset + Math.floor((VISIBLE_WIDTH - 1) / 2));
  };

  const startNewGame = useCallback(() => {
    initialTotalScoreRef.current = latestTotalScorePropRef.current;
    
    const timeBonusLevel = powerUps[UPGRADE_CONFIG.TIME_BONUS.id] || 0;
    const stabilityLevel = powerUps[UPGRADE_CONFIG.STABILITY.id] || 0;
    
    const newMaxTime = INITIAL_TIME_MS + (timeBonusLevel * UPGRADE_CONFIG.TIME_BONUS.effectPerLevel);
    maxTimeRef.current = newMaxTime;
    
    const stabilityMod = stabilityLevel * UPGRADE_CONFIG.STABILITY.effectPerLevel;
    const newInitialSpeed = INITIAL_SPEED * (1 + stabilityMod); 

    const startRank = calculateRankDetails(initialTotalScoreRef.current).rank;
    const newGrid = createInitialGrid(startRank);
    const newOffset = 0;

    setGameId(prev => prev + 1);

    setGrid(newGrid);
    setBoardOffset(newOffset);
    setScore(0);
    setGameOver(false);
    gameOverRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    setCountdown(2); 

    setStoredPiece(null);
    setCombo(0);
    setCellsCleared(0);
    setGameSpeed(newInitialSpeed);
    setCanSwap(true);
    setFallingBlocks([]);
    setIsSoftDropping(false);
    setTimeLeft(newMaxTime);
    setFloatingTexts([]);
    lockStartTimeRef.current = null;
    
    setScoreBreakdown({ base: 0, height: 0, offscreen: 0, adjacency: 0, speed: 0 });
    setGameStats({ startTime: 0, totalBonusTime: 0, maxGroupSize: 0 });

    heldKeys.current.clear();
    lastMoveTimeRef.current = 0;
    
    const piece = spawnPiece(undefined, startRank);
    piece.x = getCenteredSpawnX(newOffset);
    piece.y = 1; 
    piece.startSpawnY = 1;
    setActivePiece(piece);
    
    audio.resume();
  }, [powerUps]); 

  const spawnNewPiece = useCallback((pieceDef?: PieceDefinition, gridOverride?: GridCell[][], offsetOverride?: number) => {
    const currentGrid = gridOverride || stateRef.current.grid;
    const currentOffset = offsetOverride !== undefined ? offsetOverride : stateRef.current.boardOffset;

    const currentTotalScore = initialTotalScoreRef.current + stateRef.current.score;
    const currentRank = calculateRankDetails(currentTotalScore).rank;

    const piece = spawnPiece(pieceDef, currentRank);
    piece.x = getCenteredSpawnX(currentOffset);
    piece.y = 1; 
    piece.startSpawnY = 1;

    lockStartTimeRef.current = null;

    if (checkCollision(currentGrid, piece, currentOffset)) {
       setGameOver(true);
       gameOverRef.current = true;
    } else {
       setActivePiece(piece);
       // Sync stateRef immediately for any subsequent logic in same frame
       stateRef.current.activePiece = piece;
       setCanSwap(true);
    }
  }, []);

  const updateScoreAndStats = useCallback((pointsToAdd: number, breakdown?: Partial<ScoreBreakdown>) => {
      const scoreBoostLevel = powerUps[UPGRADE_CONFIG.SCORE_BOOST.id] || 0;
      const boostMod = 1 + (scoreBoostLevel * UPGRADE_CONFIG.SCORE_BOOST.effectPerLevel);
      const finalPoints = Math.ceil(pointsToAdd * boostMod);

      setScore(prev => prev + finalPoints);

      if (breakdown) {
          setScoreBreakdown(prev => ({
              base: prev.base + (breakdown.base || 0) * boostMod,
              height: prev.height + (breakdown.height || 0) * boostMod,
              offscreen: prev.offscreen + (breakdown.offscreen || 0) * boostMod,
              adjacency: prev.adjacency + (breakdown.adjacency || 0) * boostMod,
              speed: prev.speed + (breakdown.speed || 0) * boostMod,
          }));
      }
  }, [powerUps]);

  // CRITICAL: We update stateRef.current manually in these handlers to ensure
  // that the game loop (gravity) sees the movement immediately, even before React re-renders.
  // This prevents the race condition where Gravity overwrites X-movement with Stale X.

  const moveBoard = useCallback((dir: number) => {
    const { gameOver, isPaused, activePiece, countdown, boardOffset, grid } = stateRef.current;
    if (gameOver || isPaused || !activePiece || countdown !== null) return;
    
    const newOffset = normalizeX(boardOffset + dir);
    const newPieceX = normalizeX(activePiece.x + dir);
    
    const tempPiece = { ...activePiece, x: newPieceX };
    
    if (!checkCollision(grid, tempPiece, newOffset)) {
      audio.playMove();
      setBoardOffset(newOffset);
      setActivePiece(tempPiece);
      
      // Manual Sync
      stateRef.current = {
          ...stateRef.current,
          boardOffset: newOffset,
          activePiece: tempPiece
      };
    }
  }, []);

  const rotatePiece = useCallback((clockwise: boolean) => {
    const { gameOver, isPaused, activePiece, countdown, boardOffset, grid } = stateRef.current;
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
            audio.playRotate();
            setActivePiece(kickedPiece);
            
            // Manual Sync
            stateRef.current = {
                ...stateRef.current,
                activePiece: kickedPiece
            };
            return;
        }
    }
  }, []);

  const hardDrop = useCallback(() => {
    const { gameOver, isPaused, activePiece, countdown, grid, boardOffset } = stateRef.current;
    if (gameOver || isPaused || !activePiece || countdown !== null) return;

    const y = getGhostY(grid, activePiece, boardOffset);
    const droppedPiece = { ...activePiece, y };
    const newGrid = mergePiece(grid, droppedPiece);
    const distance = Math.floor(y - activePiece.y);
    updateScoreAndStats(distance * 2, { speed: distance * 2 });

    audio.playDrop(); 
    setGrid(newGrid);
    
    // Update ref locally to prevent glitches if called repeatedly or near frame end
    stateRef.current.grid = newGrid;
    
    spawnNewPiece(undefined, newGrid, boardOffset);
    setCombo(0);
    setIsSoftDropping(false);
  }, [updateScoreAndStats, spawnNewPiece]);

  const swapPiece = useCallback(() => {
      const { gameOver, isPaused, activePiece, countdown, boardOffset, grid, canSwap, storedPiece } = stateRef.current;
      if (gameOver || isPaused || !activePiece || !canSwap || countdown !== null) return;
      
      audio.playRotate(); 

      const currentDef = activePiece.definition;
      const nextDef = storedPiece;
      
      setStoredPiece(currentDef);
      lockStartTimeRef.current = null; 
      
      if (nextDef) {
          const newPiece = { 
            ...activePiece, 
            definition: nextDef, 
            cells: [...nextDef.cells], 
            rotation: 0,
            spawnTimestamp: Date.now(),
            startSpawnY: 1
          };
          
          // Attempt 1: Swap in-place
          newPiece.x = activePiece.x;
          newPiece.y = activePiece.y;

          if (checkCollision(grid, newPiece, boardOffset)) {
              // Collision handling: Try simple nudges
              let placed = false;
              
              // Nudge Up
              const upPiece = { ...newPiece, y: newPiece.y - 1 };
              if (!checkCollision(grid, upPiece, boardOffset)) {
                  newPiece.y = upPiece.y;
                  placed = true;
              } 
              
              if (!placed) {
                  // Nudge Left
                  const leftPiece = { ...newPiece, x: normalizeX(newPiece.x - 1) };
                  if (!checkCollision(grid, leftPiece, boardOffset)) {
                      newPiece.x = leftPiece.x;
                      placed = true;
                  }
              }

              if (!placed) {
                  // Nudge Right
                  const rightPiece = { ...newPiece, x: normalizeX(newPiece.x + 1) };
                  if (!checkCollision(grid, rightPiece, boardOffset)) {
                      newPiece.x = rightPiece.x;
                      placed = true;
                  }
              }
              
              // Fallback to top spawn if cannot fit nearby
              if (!placed) {
                  newPiece.x = getCenteredSpawnX(boardOffset);
                  newPiece.y = 1;
              }
          }

          setActivePiece(newPiece);
          stateRef.current.activePiece = newPiece; // Manual Sync
          setCanSwap(false);
      } else {
          setStoredPiece(currentDef);
          spawnNewPiece(); 
          setCanSwap(false);
      }
  }, [spawnNewPiece]);

  const handleBlockTap = useCallback((x: number, y: number) => {
     const { gameOver, isPaused, countdown, grid, boardOffset, combo, timeLeft } = stateRef.current;
     if (gameOver || isPaused || countdown !== null) return;

     const cell = grid[y][x];
     if (!cell) return;
     
     // PRESSURE LOGIC:
     // Allow popping if the group reaches down into the "high pressure" zone.
     // Base zone is the bottom row (18). 
     // As pressure increases (timeLeft decreases), the threshold moves UP.
     const pressureRatio = Math.max(0, 1 - (timeLeft / maxTimeRef.current));
     const thresholdY = (TOTAL_HEIGHT - 1) - (pressureRatio * (VISIBLE_HEIGHT - 1));
     
     // Check if the group's HIGHEST point (smallest Y) is below (greater than) the threshold line
     // This ensures the entire group (or at least its top block) is submerged.
     if (cell.groupMinY < thresholdY) {
         audio.playReject();
         return;
     }

     const now = Date.now();
     const totalDuration = cell.groupSize * PER_BLOCK_DURATION;
     const elapsed = now - (cell.timestamp || 0); 
     
     if (elapsed < totalDuration) {
         audio.playReject(); 
         return;
     }

     const group = findContiguousGroup(grid, x, y);
     
     if (group.length > 0) {
        audio.playPop(combo); 
        setCellsCleared(prev => prev + 1);
        
        const groupSize = group.length;
        setGameStats(s => ({ ...s, maxGroupSize: Math.max(s.maxGroupSize, groupSize) }));

        // Pressure Reduction
        const basePressureReduc = PRESSURE_RECOVERY_BASE_MS;
        const unitPressureReduc = groupSize * PRESSURE_RECOVERY_PER_UNIT_MS;
        let tierPressureReduc = 0;
        if (groupSize >= PRESSURE_TIER_THRESHOLD) {
            const tier = Math.floor((groupSize - PRESSURE_TIER_THRESHOLD) / PRESSURE_TIER_STEP) + 1;
            tierPressureReduc = tier * PRESSURE_TIER_BONUS_MS;
        }

        const totalTimeAdded = basePressureReduc + unitPressureReduc + tierPressureReduc;

        setTimeLeft(current => Math.min(maxTimeRef.current, current + totalTimeAdded));
        setGameStats(s => ({ ...s, totalBonusTime: s.totalBonusTime + totalTimeAdded }));

        // Score Calculation
        let totalScoreForTap = 0;
        let currentComboCount = combo;
        currentComboCount++; 

        let tapBreakdown = { base: 0, height: 0, offscreen: 0, adjacency: 0, speed: 0 };
        const adjacencyScore = calculateAdjacencyBonus(grid, group);
        totalScoreForTap += adjacencyScore;
        tapBreakdown.adjacency += adjacencyScore;

        group.forEach((pt) => {
             let bScore = 10;
             let hScore = calculateHeightBonus(pt.y);
             let oScore = calculateOffScreenBonus(pt.x, boardOffset);
             const multiplier = calculateMultiplier(currentComboCount);
             const finalBlockScore = (bScore + hScore + oScore) * multiplier;
             totalScoreForTap += finalBlockScore;
             tapBreakdown.base += (bScore * multiplier);
             tapBreakdown.height += (hScore * multiplier);
             tapBreakdown.offscreen += (oScore * multiplier);
        });
        
        const roundedScore = Math.floor(totalScoreForTap);
        updateScoreAndStats(roundedScore, tapBreakdown);
        setCombo(currentComboCount);

        const textId = Math.random().toString(36).substr(2, 9);
        setFloatingTexts(prev => [
            ...prev, 
            { id: textId, text: `+${roundedScore}`, x, y, life: 1, color: '#fbbf24' },
            { id: textId + '_time', text: `-${(totalTimeAdded/1000).toFixed(1)}s`, x: x, y: y - 1, life: 1, color: '#4ade80' }
        ]);
        
        setTimeout(() => {
            setFloatingTexts(prev => prev.filter(ft => !ft.id.startsWith(textId)));
        }, 1000);

        let tempGrid = grid.map(row => [...row]);
        const uniqueCols = new Set<number>();
        group.forEach(pt => {
            tempGrid[pt.y][pt.x] = null;
            uniqueCols.add(pt.x);
        });
        
        const colsToCheck = Array.from(uniqueCols);
        const { grid: cleanGrid, falling: newFalling } = getFloatingBlocks(tempGrid, colsToCheck);

        setGrid(cleanGrid);
        stateRef.current.grid = cleanGrid; // Manual Sync
        setFallingBlocks(prev => [...prev, ...newFalling]);
        setGameSpeed(prev => Math.max(MIN_SPEED, prev * 0.995));
     }
  }, [updateScoreAndStats]);

  const gameLoop = useCallback((time: number) => {
    if (!lastTimeRef.current) {
        lastTimeRef.current = time;
    }
    const dt = time - lastTimeRef.current;
    lastTimeRef.current = time;

    // We only access stateRef ONCE per tick logic block, but critically, 
    // we must allow step 0 (input) to mutate it for Step 3 (Gravity).
    const state = stateRef.current;

    if (state.gameOver || state.isPaused || state.countdown !== null) {
         requestRef.current = requestAnimationFrame(gameLoop);
         return;
    }

    // 0. Continuous Input Handling
    // This calls moveBoard, which may update stateRef.current immediately.
    const now = Date.now();
    const DAS_DELAY = 100; 
    
    if (now > lastMoveTimeRef.current) {
        if (heldKeys.current.has('ArrowLeft') || heldKeys.current.has('KeyA')) {
             moveBoard(1);
             lastMoveTimeRef.current = now + DAS_DELAY;
        } else if (heldKeys.current.has('ArrowRight') || heldKeys.current.has('KeyD')) {
             moveBoard(-1);
             lastMoveTimeRef.current = now + DAS_DELAY;
        }
    }

    // RE-READ STATE for Gravity Logic
    // This is the fix for the "Piece drifts left" bug. 
    // moveBoard may have updated activePiece.x in stateRef.current.
    // We must use that updated X for the gravity Y update.
    const freshState = stateRef.current;

    // 1. Update Timer
    setTimeLeft(prev => Math.max(0, prev - dt));
    if (freshState.timeLeft <= 0) {
        setGameOver(true);
        return;
    }

    // 2. Falling Blocks Physics
    if (freshState.fallingBlocks.length > 0) {
        const { active, landed } = updateFallingBlocks(freshState.fallingBlocks, freshState.grid, dt, freshState.gameSpeed);
        
        if (landed.length > 0) {
            audio.playDrop(); 
            const newGrid = freshState.grid.map(row => [...row]);
            let landUpdates = false;
            
            landed.forEach(b => {
                if (b.y >= 0 && b.y < TOTAL_HEIGHT) {
                    newGrid[Math.floor(b.y)][b.x] = { ...b.data, timestamp: Date.now() }; 
                    landUpdates = true;
                }
            });

            if (landUpdates) {
                 const groupedGrid = updateGroups(newGrid);
                 setGrid(groupedGrid);
                 stateRef.current.grid = groupedGrid; // Sync
                 setFallingBlocks(active);
            } else {
                 setFallingBlocks(active);
            }
        } else {
            setFallingBlocks(active);
        }
    }

    // 3. Active Piece Gravity
    if (freshState.activePiece) {
        const gravitySpeed = freshState.isSoftDropping 
            ? freshState.gameSpeed / SOFT_DROP_FACTOR 
            : freshState.gameSpeed;
            
        const moveAmount = dt / gravitySpeed;
        const nextY = freshState.activePiece.y + moveAmount;
        const nextPiece = { ...freshState.activePiece, y: nextY };
        
        if (checkCollision(freshState.grid, nextPiece, freshState.boardOffset)) {
            if (lockStartTimeRef.current === null) {
                lockStartTimeRef.current = Date.now();
            }

            const lockedTime = Date.now() - lockStartTimeRef.current;
            const effectiveLockDelay = freshState.isSoftDropping ? 50 : LOCK_DELAY_MS;

            if (lockedTime > effectiveLockDelay) {
                const y = getGhostY(freshState.grid, freshState.activePiece, freshState.boardOffset);
                const finalPiece = { ...freshState.activePiece, y };
                
                const newGrid = mergePiece(freshState.grid, finalPiece);
                audio.playDrop(); 

                setGrid(newGrid);
                stateRef.current.grid = newGrid; // Sync
                setCombo(0);
                spawnNewPiece(undefined, newGrid, freshState.boardOffset);
                setIsSoftDropping(false);
            }
        } else {
            setActivePiece(nextPiece);
            // Sync logic for loop consistency
            stateRef.current.activePiece = nextPiece;
            lockStartTimeRef.current = null; 
        }
    }

    requestRef.current = requestAnimationFrame(gameLoop);
  }, [spawnNewPiece, moveBoard]);

  useEffect(() => {
    lastTimeRef.current = 0;
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [gameLoop, gameId]);

  const handlersRef = useRef({ moveBoard, rotatePiece, hardDrop, swapPiece, startNewGame });
  useEffect(() => {
    handlersRef.current = { moveBoard, rotatePiece, hardDrop, swapPiece, startNewGame };
  }, [moveBoard, rotatePiece, hardDrop, swapPiece, startNewGame]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.repeat) return; 

          heldKeys.current.add(e.code);

          if (e.key === 'Escape') {
              setIsPaused(prev => {
                  const newVal = !prev;
                  isPausedRef.current = newVal;
                  if (newVal) audio.stopMusic();
                  else audio.startMusic();
                  return newVal;
              });
              return;
          }
          
          if (gameOverRef.current) {
              if (e.key === 'Enter') handlersRef.current.startNewGame();
              return;
          }

          const { moveBoard, rotatePiece, hardDrop, swapPiece } = handlersRef.current;

          switch(e.code) {
              case 'ArrowLeft': case 'KeyA': 
                  moveBoard(1); 
                  lastMoveTimeRef.current = Date.now() + 250; 
                  break;
              case 'ArrowRight': case 'KeyD': 
                  moveBoard(-1); 
                  lastMoveTimeRef.current = Date.now() + 250; 
                  break;
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
  }, []); 

  const gameState: GameState = {
      grid, boardOffset, activePiece, storedPiece, score, gameOver, isPaused, canSwap,
      level: 1, cellsCleared, combo, fallingBlocks, timeLeft, scoreBreakdown, gameStats, floatingTexts
  };

  const animStyle = useMemo(() => `
    @keyframes popSequence {
      0% { transform: scale(0); opacity: 0; }
      15% { transform: scale(1.1); opacity: 1; }
      20% { transform: scale(1.0); opacity: 1; }
      90% { transform: scale(1.0); opacity: 1; filter: blur(0px); }
      100% { transform: scale(1.5); opacity: 0; filter: blur(4px); }
    }
    .animate-pop-sequence {
      animation: popSequence 2s linear forwards;
    }
  `, []);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative touch-none">
      <Controls 
        state={gameState} 
        onRestart={startNewGame}
        onExit={() => { audio.stopMusic(); onExit(); }}
        initialTotalScore={initialTotalScoreRef.current}
        maxTime={maxTimeRef.current}
      />

      {countdown !== null && !gameOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in pointer-events-none">
              <style>{animStyle}</style>
              <div 
                className="text-6xl md:text-8xl font-black text-white drop-shadow-[0_0_30px_rgba(34,211,238,0.8)] text-center px-4 leading-tight animate-pop-sequence"
                style={{ fontFamily: '"Chewy", cursive' }}
              >
                  CLEAR OUT<br/><span className="text-cyan-400 text-7xl md:text-9xl">THE GOOP!</span>
              </div>
          </div>
      )}

      {isPaused && !gameOver && (
        <div className="absolute inset-0 bg-slate-950/80 z-40 flex flex-col items-center justify-center backdrop-blur-sm gap-6">
            <h2 className="text-4xl text-cyan-400 font-bold tracking-widest animate-pulse mb-4">PAUSED</h2>
            <button 
              onClick={() => { setIsPaused(false); isPausedRef.current = false; audio.resume(); audio.startMusic(); }}
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
              onClick={() => { audio.stopMusic(); onExit(); }}
              className="flex items-center gap-3 px-8 py-4 bg-red-900/50 hover:bg-red-900/80 text-red-200 font-bold rounded-lg border border-red-800 transition-all active:scale-95 text-lg"
            >
               <Home className="w-5 h-5" /> EXIT
            </button>
        </div>
      )}
      
      <GameBoard 
        state={gameState} 
        maxTime={maxTimeRef.current}
        onBlockTap={handleBlockTap} 
        onTapLeft={() => rotatePiece(false)}
        onTapRight={() => rotatePiece(true)}
        onSwipeLeft={() => moveBoard(1)}
        onSwipeRight={() => moveBoard(-1)}
        onSwipeUp={() => swapPiece()}
        onSwipeDown={() => hardDrop()}
      />
      
    </div>
  );
};

export default Game;
