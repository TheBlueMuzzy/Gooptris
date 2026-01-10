import React from 'react';
import { GameState, PieceDefinition } from '../types';
import { SCORE_THRESHOLD } from '../constants';
import { RefreshCw, Skull, Clock, Home } from 'lucide-react';

interface ControlsProps {
  state: GameState;
  onTapLeft: () => void;
  onTapRight: () => void;
  onSwipeUp: () => void;
  onSwipeDown: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onRestart: () => void;
  onExit: () => void;
}

export const Controls: React.FC<ControlsProps> = ({ 
  state, onTapLeft, onTapRight, onSwipeUp, onSwipeDown, onSwipeLeft, onSwipeRight, onRestart, onExit 
}) => {
  const { score, gameOver, combo, cellsCleared, timeLeft, scoreBreakdown, gameStats } = state;

  // Touch handling
  const touchStart = React.useRef<{x: number, y: number} | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - touchStart.current.x;
    const dy = endY - touchStart.current.y;
    
    touchStart.current = null;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) < 10) {
      // Tap
      const screenWidth = window.innerWidth;
      if (endX < screenWidth / 2) onTapLeft();
      else onTapRight();
      return;
    }

    if (absDx > absDy) {
      // Horizontal
      if (dx > 30) onSwipeRight();
      else if (dx < -30) onSwipeLeft();
    } else {
      // Vertical
      if (dy > 30) onSwipeDown();
      else if (dy < -30) onSwipeUp();
    }
  };

  // Timer Formatting
  const seconds = Math.ceil(timeLeft / 1000);
  const isLowTime = seconds <= 10;
  
  // Meter Progress
  const progress = (score % SCORE_THRESHOLD) / SCORE_THRESHOLD;

  // Final Stats Calculation
  const finalTimeSeconds = Math.floor((Date.now() - (gameStats.startTime || Date.now())) / 1000);
  const bonusTimeSeconds = Math.floor(gameStats.totalBonusTime / 1000);

  return (
    <>
      {/* Vignette Layer */}
      <div className="absolute inset-0 z-30 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.75)_100%)]" />

      {/* HUD Layer - Stretched across top, z-50 to sit above vignettes */}
      <div className="absolute top-0 left-0 right-0 p-3 pointer-events-none z-50">
          <div className={`w-full bg-slate-900/95 p-3 rounded-xl border backdrop-blur-md shadow-2xl transition-colors flex flex-col gap-2 ${isLowTime ? 'border-red-500/50 shadow-red-900/20' : 'border-slate-700/80 shadow-black/50'}`}>
              
              <div className="flex justify-between items-end px-2">
                  <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-0.5">Score</span>
                      <span className="text-3xl font-mono text-cyan-400 leading-none tracking-tight shadow-cyan-500/10 drop-shadow-sm">{score.toLocaleString()}</span>
                  </div>
                  
                  {combo > 1 && <div className="text-lg text-yellow-400 animate-bounce font-black tracking-wider text-center px-4">x{combo} COMBO</div>}

                  <div className="flex flex-col items-end">
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-0.5">Time</span>
                      <div className={`flex items-baseline gap-1 ${isLowTime ? 'text-red-400 animate-pulse' : 'text-slate-200'}`}>
                          <Clock className="w-3 h-3 opacity-70" />
                          <span className="text-2xl font-mono font-bold leading-none">{seconds}s</span>
                      </div>
                  </div>
              </div>
              
              {/* 10k Progress Meter */}
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50 relative">
                  <div 
                      className={`h-full transition-all duration-300 ${isLowTime ? 'bg-red-500' : 'bg-gradient-to-r from-cyan-600 to-cyan-400'}`}
                      style={{ width: `${progress * 100}%` }}
                  />
              </div>
          </div>
      </div>

      {/* Game Over Screen */}
      {gameOver && (
        <div className="absolute inset-0 bg-slate-950/95 z-[60] flex flex-col items-center justify-center p-6 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto">
           <div className="flex flex-col items-center w-full max-w-sm gap-6 my-auto">
               <div className="text-center">
                   <Skull className="w-12 h-12 text-red-500 mx-auto mb-2 animate-bounce" />
                   <h1 className="text-4xl font-black text-white tracking-tighter mb-1">GAME OVER</h1>
                   <p className="text-slate-400 font-mono text-sm tracking-widest">{timeLeft <= 0 ? "TEMPORAL FAILURE" : "SYSTEM CRITICAL"}</p>
               </div>
               
               <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
                    <div className="text-center mb-6">
                        <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">Final Score</div>
                        <div className="text-4xl font-mono text-cyan-400 font-bold">{score.toLocaleString()}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                         <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                            <div className="text-[10px] text-slate-500 uppercase">Play Time</div>
                            <div className="text-lg text-slate-200 font-mono">
                                {finalTimeSeconds}s 
                                <span className="text-xs text-green-400 ml-1">(+{bonusTimeSeconds}s)</span>
                            </div>
                         </div>
                         <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-center">
                            <div className="text-[10px] text-slate-500 uppercase">Max Chain</div>
                            <div className="text-lg text-slate-200 font-mono">{gameStats.maxGroupSize} Units</div>
                         </div>
                    </div>

                    <div className="space-y-2 text-xs font-mono border-t border-slate-800 pt-4">
                        <div className="flex justify-between text-slate-400">
                            <span>Block Clears</span>
                            <span className="text-slate-200">{Math.floor(scoreBreakdown.base).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                            <span>Height Bonus</span>
                            <span className="text-slate-200">{Math.floor(scoreBreakdown.height).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                            <span>Off-screen Bonus</span>
                            <span className="text-slate-200">{Math.floor(scoreBreakdown.offscreen).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                            <span>Adjacency Bonus</span>
                            <span className="text-slate-200">{Math.floor(scoreBreakdown.adjacency).toLocaleString()}</span>
                        </div>
                         <div className="flex justify-between text-slate-400">
                            <span>Speed Bonus</span>
                            <span className="text-slate-200">{Math.floor(scoreBreakdown.speed).toLocaleString()}</span>
                        </div>
                    </div>
               </div>

               <div className="flex gap-3 w-full">
                   <button 
                     onClick={onExit}
                     className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl border border-slate-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                   >
                     <Home className="w-5 h-5" /> MENU
                   </button>
                   <button 
                     onClick={onRestart}
                     className="flex-[2] py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-900/50 transition-all active:scale-95 flex items-center justify-center gap-2"
                   >
                     <RefreshCw className="w-5 h-5" /> REBOOT
                   </button>
               </div>
           </div>
        </div>
      )}

      {/* Touch Area Overlay */}
      <div 
        className="absolute inset-0 z-0"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      />
      
      {/* Desktop Hints */}
      <div className="absolute bottom-4 left-0 right-0 text-center text-slate-500 text-xs pointer-events-none hidden md:block opacity-50 z-50">
        ARROWS / WASD to Move &bull; Q/E to Rotate &bull; SPACE to Slam
      </div>
    </>
  );
};