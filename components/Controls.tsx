
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { GameState } from '../types';
import { RefreshCw, Skull, Home, Zap, Activity } from 'lucide-react';
import { calculateRankDetails } from '../utils/progression';

interface ControlsProps {
  state: GameState;
  onRestart: () => void;
  onExit: () => void;
  initialTotalScore: number;
  maxTime: number; // Added to calculate pressure percentage
}

export const Controls: React.FC<ControlsProps> = ({ 
  state, onRestart, onExit, initialTotalScore, maxTime 
}) => {
  const { score, gameOver, combo, timeLeft, scoreBreakdown, gameStats } = state;
  
  // Timer Formatting (Pressure)
  // Low time means High Pressure
  const pressureRatio = Math.max(0, Math.min(1, 1 - (timeLeft / maxTime)));
  const isHighPressure = pressureRatio > 0.8;
  const isCriticalPressure = pressureRatio > 0.9;
  
  // Final Stats Calculation
  const finalTimeSeconds = Math.floor((Date.now() - (gameStats.startTime || Date.now())) / 1000);
  const bonusTimeSeconds = Math.floor(gameStats.totalBonusTime / 1000);

  // --- End Game Animation State ---
  const [visualScore, setVisualScore] = useState(initialTotalScore);
  const [levelUpTrigger, setLevelUpTrigger] = useState(false);
  const [accumulatedPowerPts, setAccumulatedPowerPts] = useState(0);

  const startRankInfo = useMemo(() => calculateRankDetails(initialTotalScore), [initialTotalScore]);
  const currentVisualRankInfo = useMemo(() => calculateRankDetails(visualScore), [visualScore]);
  
  const prevRankRef = useRef(startRankInfo.rank);

  // Animation Loop for Score
  useEffect(() => {
    if (gameOver) {
        let animationFrameId: number;
        const start = initialTotalScore;
        const end = initialTotalScore + score;
        const duration = 2500; // 2.5 seconds to count up
        const startTime = performance.now();

        const animate = (now: number) => {
            const elapsed = now - startTime;
            const t = Math.min(1, elapsed / duration);
            // Ease out cubic
            const ease = 1 - Math.pow(1 - t, 3);
            
            const current = Math.floor(start + (end - start) * ease);
            setVisualScore(current);

            if (t < 1) {
                animationFrameId = requestAnimationFrame(animate);
            }
        };
        animationFrameId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrameId);
    } else {
        // Reset if game restarts without unmount
        setVisualScore(initialTotalScore);
        setAccumulatedPowerPts(0);
        prevRankRef.current = calculateRankDetails(initialTotalScore).rank;
    }
  }, [gameOver, initialTotalScore, score]);

  // Detect Level Up during animation
  useEffect(() => {
      const diff = currentVisualRankInfo.rank - prevRankRef.current;
      if (diff > 0) {
          setLevelUpTrigger(true);
          setAccumulatedPowerPts(prev => prev + diff);
          
          const timer = setTimeout(() => setLevelUpTrigger(false), 800);
          
          prevRankRef.current = currentVisualRankInfo.rank;
          return () => clearTimeout(timer);
      }
  }, [currentVisualRankInfo.rank]);

  const visualBarPercent = currentVisualRankInfo.isMaxRank 
      ? 100 
      : (currentVisualRankInfo.progress / currentVisualRankInfo.toNextRank) * 100;

  return (
    <>
      {/* Vignette Layer for Critical States */}
      {isCriticalPressure && (
          <div className="absolute inset-0 z-30 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_40%,rgba(100,0,0,0.4)_100%)] animate-pulse" />
      )}

      {/* HUD Layer - Slimmed down */}
      <div className="absolute top-0 left-0 right-0 p-2 pointer-events-none z-50">
          <div className={`w-full bg-slate-900/90 p-2 rounded-xl border backdrop-blur-md shadow-2xl transition-colors flex flex-col ${isHighPressure ? 'border-red-500/50 shadow-red-900/20' : 'border-slate-700/50 shadow-black/50'}`}>
              
              <div className="flex justify-between items-start px-2 w-full">
                  
                  {/* LEFT: Pressure (Swapped) */}
                  <div className="flex flex-col items-start min-w-[100px]">
                      <span className="text-[9px] uppercase font-bold tracking-widest mb-0.5 text-slate-400">Pressure</span>
                      <div className={`flex items-baseline gap-1 ${isHighPressure ? 'text-red-500 animate-pulse' : 'text-slate-200'}`}>
                          <Activity className="w-4 h-4 opacity-70" />
                          <span className="text-3xl font-mono font-bold leading-none">{(pressureRatio * 100).toFixed(0)}%</span>
                      </div>
                  </div>

                  {/* CENTER: Combo (Optimized Position) */}
                  {combo > 1 && (
                      <div className="absolute left-1/2 -translate-x-1/2 top-4">
                          <div className="text-lg text-yellow-400 animate-bounce font-black tracking-wider whitespace-nowrap drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                              x{combo} SURGE
                          </div>
                      </div>
                  )}

                  {/* RIGHT: Score */}
                  <div className="flex flex-col items-end min-w-[100px]">
                      <span className="text-[9px] text-green-500 uppercase font-bold tracking-widest mb-0.5">Score</span>
                      <span className="text-3xl font-mono text-green-400 leading-none tracking-tight shadow-green-500/10 drop-shadow-sm">{score.toLocaleString()}</span>
                  </div>
              </div>
          </div>
      </div>

      {/* Game Over Screen */}
      {gameOver && (
        <div className="absolute inset-0 bg-black/90 z-[60] flex flex-col items-center justify-center p-6 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto pointer-events-auto">
           <div className="flex flex-col items-center w-full max-w-sm gap-6 my-auto">
               <div className="text-center">
                   <Skull className="w-16 h-16 text-red-600 mx-auto mb-4 animate-bounce" />
                   <h1 className="text-4xl font-black text-white tracking-tighter mb-1 font-mono uppercase text-red-500">SYSTEM FAILURE</h1>
                   <p className="text-slate-500 font-mono text-sm tracking-widest border-t border-b border-slate-800 py-1">{timeLeft <= 0 ? "PRESSURE CRITICAL" : "OVERFLOW DETECTED"}</p>
               </div>
               
               <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-red-600" />
                    
                    {/* --- Rank Progress Section --- */}
                    <div className={`rounded-lg p-3 mb-6 border transition-all duration-300 ${levelUpTrigger ? 'bg-yellow-900/20 border-yellow-500 scale-105' : 'bg-slate-950/50 border-slate-800'}`}>
                        <div className="flex justify-between items-end mb-2">
                             <div>
                                 <div className="text-xs text-slate-400 uppercase font-bold">Operator Rank</div>
                                 <div className="text-2xl font-mono text-white font-bold leading-none flex items-center gap-2">
                                    <span className={levelUpTrigger ? "text-yellow-400 animate-pulse scale-125 inline-block" : ""}>{currentVisualRankInfo.rank}</span>
                                 </div>
                             </div>
                             
                             {accumulatedPowerPts > 0 && (
                                 <div className="text-right animate-in zoom-in slide-in-from-bottom duration-500">
                                     <div className="text-[10px] text-yellow-600 uppercase font-bold tracking-widest">Rewards</div>
                                     <div className="flex items-center justify-end gap-1 text-yellow-400 font-bold font-mono">
                                         <Zap className="w-4 h-4 fill-current" />
                                         <span>+{accumulatedPowerPts} PTS</span>
                                     </div>
                                 </div>
                             )}
                        </div>
                        
                        <div className="w-full h-4 bg-slate-900 rounded-full overflow-hidden border border-slate-700 relative">
                             {/* REMOVED transition-all/width transition to prevent bar from sliding backwards when wrapping to 0 on level up */}
                             <div 
                                className={`absolute h-full transition-colors duration-200 ease-out ${levelUpTrigger ? 'bg-yellow-400' : 'bg-green-500'}`}
                                style={{ width: `${visualBarPercent}%` }}
                             />
                             {/* Gloss */}
                             <div className="absolute inset-0 bg-white/5" />
                        </div>

                        <div className="flex justify-between mt-1 text-[10px] font-mono text-slate-500">
                            <span>{Math.floor(currentVisualRankInfo.progress).toLocaleString()} XP</span>
                            {levelUpTrigger ? (
                                <span className="text-yellow-400 font-bold animate-pulse">PROMOTION!</span>
                            ) : (
                                <span>{Math.floor(currentVisualRankInfo.toNextRank).toLocaleString()} NEXT</span>
                            )}
                        </div>
                    </div>

                    <div className="text-center mb-6">
                        <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">Final Score</div>
                        <div className="text-4xl font-mono text-white font-bold">{score.toLocaleString()}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                         <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                            <div className="text-[10px] text-slate-500 uppercase">Run Time</div>
                            <div className="text-lg text-slate-200 font-mono">
                                {finalTimeSeconds}s 
                                <span className="text-xs text-green-600 ml-1">(+{bonusTimeSeconds}s)</span>
                            </div>
                         </div>
                         <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                            <div className="text-[10px] text-slate-500 uppercase">Max Mass</div>
                            <div className="text-lg text-slate-200 font-mono">{gameStats.maxGroupSize} Units</div>
                         </div>
                    </div>

                    <div className="space-y-2 text-xs font-mono border-t border-slate-800 pt-4">
                        <div className="flex justify-between text-slate-400">
                            <span>Mass Purged</span>
                            <span className="text-slate-200">{Math.floor(scoreBreakdown.base / 10).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                            <span>Elevation Bonus</span>
                            <span className="text-slate-200">{Math.floor(scoreBreakdown.height).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                            <span>Combo Multiplier</span>
                            <span className="text-slate-200">{(1 + combo * 0.1).toFixed(1)}x</span>
                        </div>
                    </div>
               </div>

               <div className="flex gap-3 w-full">
                   <button 
                     onClick={onExit}
                     className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl border border-slate-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                   >
                     <Home className="w-5 h-5" /> EXIT
                   </button>
                   <button 
                     onClick={onRestart}
                     className="flex-[2] py-4 bg-green-700 hover:bg-green-600 text-white font-bold rounded-xl shadow-lg shadow-green-900/50 transition-all active:scale-95 flex items-center justify-center gap-2"
                   >
                     <RefreshCw className="w-5 h-5" /> RE-INITIALIZE
                   </button>
               </div>
           </div>
        </div>
      )}
      
      {/* Desktop Hints */}
      <div className="absolute bottom-4 left-0 right-0 text-center text-slate-500 text-xs pointer-events-none hidden md:block opacity-30 z-50 font-mono">
        ARROWS / WASD to Rotate Cylinder &bull; SPACE to Drop &bull; CLICK Masses to Purge
      </div>
    </>
  );
};
