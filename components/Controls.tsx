
import React, { useEffect, useMemo, useState } from 'react';
import { GameState } from '../types';
import { SCORE_THRESHOLD } from '../constants';
import { RefreshCw, Skull, Clock, Home } from 'lucide-react';
import { calculateRankDetails } from '../utils/progression';

interface ControlsProps {
  state: GameState;
  onRestart: () => void;
  onExit: () => void;
  initialTotalScore: number;
}

export const Controls: React.FC<ControlsProps> = ({ 
  state, onRestart, onExit, initialTotalScore 
}) => {
  const { score, gameOver, combo, timeLeft, scoreBreakdown, gameStats } = state;
  const [displayedProgress, setDisplayedProgress] = useState(0);

  // Timer Formatting
  const seconds = Math.ceil(timeLeft / 1000);
  const isLowTime = seconds <= 10;
  
  // Meter Progress (In-Game Pressure/Time Bonus Meter)
  const progress = (score % SCORE_THRESHOLD) / SCORE_THRESHOLD;

  // Final Stats Calculation
  const finalTimeSeconds = Math.floor((Date.now() - (gameStats.startTime || Date.now())) / 1000);
  const bonusTimeSeconds = Math.floor(gameStats.totalBonusTime / 1000);

  // --- Meta Progression Calculation for End Screen ---
  // Start state: Where we were before this run
  const startRankInfo = useMemo(() => calculateRankDetails(initialTotalScore), [initialTotalScore]);
  // End state: Where we are now including this run's score
  const endRankInfo = useMemo(() => calculateRankDetails(initialTotalScore + score), [initialTotalScore, score]);

  // Effect to animate the progress bar on the Game Over screen
  useEffect(() => {
    if (gameOver) {
        // Simple animation: 
        // 1. Calculate percentage for the bar.
        // If leveled up: We show full bar then new bar (simplified: just show end state for now to ensure robustness)
        // OR: Calculate raw percentage based on current rank's requirement
        
        const startPct = startRankInfo.isMaxRank ? 100 : (startRankInfo.progress / startRankInfo.toNextRank) * 100;
        const endPct = endRankInfo.isMaxRank ? 100 : (endRankInfo.progress / endRankInfo.toNextRank) * 100;
        
        // Start at previous percentage
        setDisplayedProgress(startPct);

        // After small delay, fill to new percentage
        // Note: If we leveled up, visually handling the wrap-around is complex. 
        // Strategy: If rank increased, animate to 100%.
        // If same rank, animate to endPct.
        
        setTimeout(() => {
            if (endRankInfo.rank > startRankInfo.rank) {
                setDisplayedProgress(100);
            } else {
                setDisplayedProgress(endPct);
            }
        }, 100);
    }
  }, [gameOver, startRankInfo, endRankInfo]);

  return (
    <>
      {/* Vignette Layer */}
      <div className="absolute inset-0 z-30 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,10,0,0.85)_100%)]" />

      {/* HUD Layer - Stretched across top, z-50 to sit above vignettes */}
      <div className="absolute top-0 left-0 right-0 p-3 pointer-events-none z-50">
          <div className={`w-full bg-slate-900/95 p-3 rounded-xl border backdrop-blur-md shadow-2xl transition-colors flex flex-col gap-2 ${isLowTime ? 'border-red-500/50 shadow-red-900/20' : 'border-green-800/80 shadow-black/50'}`}>
              
              <div className="flex justify-between items-end px-2">
                  <div className="flex flex-col">
                      <span className="text-[10px] text-green-500 uppercase font-bold tracking-widest mb-0.5">Purge Score</span>
                      <span className="text-3xl font-mono text-green-400 leading-none tracking-tight shadow-green-500/10 drop-shadow-sm">{score.toLocaleString()}</span>
                  </div>
                  
                  {combo > 1 && <div className="text-lg text-yellow-400 animate-bounce font-black tracking-wider text-center px-4">x{combo} SURGE</div>}

                  <div className="flex flex-col items-end">
                      <span className="text-[10px] text-green-500 uppercase font-bold tracking-widest mb-0.5">Pressure</span>
                      <div className={`flex items-baseline gap-1 ${isLowTime ? 'text-red-500 animate-pulse' : 'text-slate-200'}`}>
                          <Clock className="w-3 h-3 opacity-70" />
                          <span className="text-2xl font-mono font-bold leading-none">{seconds}s</span>
                      </div>
                  </div>
              </div>
              
              {/* 10k Progress Meter (Rank Meter) */}
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-green-900 relative">
                  <div 
                      className={`h-full transition-all duration-300 ${isLowTime ? 'bg-red-500' : 'bg-gradient-to-r from-green-700 to-green-400'}`}
                      style={{ width: `${progress * 100}%` }}
                  />
                  {/* Stripes */}
                  <div className="absolute inset-0 opacity-20 bg-[linear-gradient(45deg,rgba(0,0,0,0.5)_25%,transparent_25%,transparent_50%,rgba(0,0,0,0.5)_50%,rgba(0,0,0,0.5)_75%,transparent_75%,transparent)] bg-[length:10px_10px]" />
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
                   <p className="text-slate-500 font-mono text-sm tracking-widest border-t border-b border-slate-800 py-1">{timeLeft <= 0 ? "PRESSURE BREACH" : "OVERFLOW DETECTED"}</p>
               </div>
               
               <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-red-600" />
                    
                    {/* --- Rank Progress Section (New) --- */}
                    <div className="bg-slate-950/50 rounded-lg p-3 mb-6 border border-slate-800">
                        <div className="flex justify-between items-end mb-2">
                             <div className="text-xs text-slate-400 uppercase font-bold">Operator Rank</div>
                             <div className="text-2xl font-mono text-white font-bold leading-none flex items-center gap-2">
                                <span className="text-slate-500 text-lg">{startRankInfo.rank}</span>
                                {endRankInfo.rank > startRankInfo.rank && <span className="text-yellow-400 animate-pulse">→</span>}
                                <span className={endRankInfo.rank > startRankInfo.rank ? "text-yellow-400" : ""}>{endRankInfo.rank}</span>
                             </div>
                        </div>
                        <div className="w-full h-4 bg-slate-900 rounded-full overflow-hidden border border-slate-700 relative">
                             {/* Base (Previous) Progress - Darker Green */}
                             <div 
                                className="absolute h-full bg-green-900" 
                                style={{ width: `${startRankInfo.isMaxRank ? 100 : (startRankInfo.progress / startRankInfo.toNextRank) * 100}%` }} 
                             />
                             {/* Animated Fill - Bright Green */}
                             <div 
                                className="absolute h-full bg-green-500 transition-all duration-[2000ms] ease-out opacity-80"
                                style={{ width: `${displayedProgress}%` }}
                             />
                        </div>
                        <div className="flex justify-between mt-1 text-[10px] font-mono text-slate-500">
                            <span>+{score.toLocaleString()} XP</span>
                            {endRankInfo.rank > startRankInfo.rank ? (
                                <span className="text-yellow-400 font-bold animate-pulse">RANK UP!</span>
                            ) : (
                                <span>{Math.floor(endRankInfo.toNextRank - endRankInfo.progress).toLocaleString()} TO NEXT</span>
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
