import React from 'react';
import { GameState, PieceDefinition } from '../types';
import { SCORE_THRESHOLD } from '../constants';
import { RefreshCw, Skull, Clock } from 'lucide-react';

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
  const { score, storedPiece, gameOver, combo, cellsCleared, timeLeft } = state;

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

  return (
    <>
      {/* HUD Layer */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-10">
        <div className="flex flex-col gap-2 w-full max-w-[200px]">
            <div className={`bg-slate-900/90 p-3 rounded-lg border backdrop-blur transition-colors ${isLowTime ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-slate-700'}`}>
                <div className="flex justify-between items-baseline mb-2">
                    <div className="flex items-baseline gap-3">
                        <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Score</span>
                        <span className="text-2xl font-mono text-cyan-400 leading-none">{score.toLocaleString()}</span>
                    </div>
                    
                    <div className={`flex items-center gap-1.5 ${isLowTime ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>
                         <Clock className="w-3.5 h-3.5" />
                         <span className="text-lg font-mono font-bold">{seconds}s</span>
                    </div>
                </div>
                
                {/* 10k Progress Meter */}
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                    <div 
                        className={`h-full transition-all duration-300 ${isLowTime ? 'bg-red-500' : 'bg-gradient-to-r from-cyan-600 to-cyan-400'}`}
                        style={{ width: `${progress * 100}%` }}
                    />
                </div>
                
                {combo > 1 && <div className="text-xs text-yellow-400 animate-pulse mt-1 font-bold tracking-wider text-center">COMBO x{combo}</div>}
            </div>
        </div>

        {/* Hold (Currently Hidden/Locked) */}
        {/* 
        <div className="flex flex-col items-end">
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-700 backdrop-blur flex flex-col items-center min-w-[80px]">
                <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-2">Hold</div>
                <div className="w-12 h-12 flex items-center justify-center bg-slate-800 rounded-md">
                   {storedPiece ? (
                       <PiecePreview piece={storedPiece} />
                   ) : <span className="text-slate-600 text-xs">EMPTY</span>}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">SWIPE UP</div>
            </div>
        </div>
        */}
      </div>

      {/* Game Over Screen */}
      {gameOver && (
        <div className="absolute inset-0 bg-slate-950/90 z-50 flex flex-col items-center justify-center p-8 backdrop-blur-sm animate-in fade-in duration-300">
           <Skull className="w-16 h-16 text-red-500 mb-4 animate-bounce" />
           <h1 className="text-4xl font-bold text-white mb-2 tracking-tighter">GAME OVER</h1>
           <p className="text-slate-400 mb-8">{timeLeft <= 0 ? "Time's Up" : "System Failure"}</p>
           
           <div className="bg-slate-800 p-6 rounded-xl w-full max-w-xs mb-8 border border-slate-700">
             <div className="flex justify-between items-center mb-2">
                <span className="text-slate-400">Final Score</span>
                <span className="text-2xl text-cyan-400 font-mono">{score.toLocaleString()}</span>
             </div>
             <div className="flex justify-between items-center">
                <span className="text-slate-400">Cells Cleared</span>
                <span className="text-xl text-white font-mono">{cellsCleared}</span>
             </div>
           </div>

           <button 
             onClick={onExit}
             className="px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-lg shadow-cyan-900/50 transition-all active:scale-95 flex items-center gap-2"
           >
             <RefreshCw className="w-5 h-5" /> REBOOT
           </button>
        </div>
      )}

      {/* Touch Area Overlay */}
      <div 
        className="absolute inset-0 z-0"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      />
      
      {/* Desktop Hints */}
      <div className="absolute bottom-4 left-0 right-0 text-center text-slate-500 text-xs pointer-events-none hidden md:block opacity-50">
        ARROWS / WASD to Move &bull; Q/E to Rotate &bull; SPACE to Slam
      </div>
    </>
  );
};

const PiecePreview: React.FC<{ piece: PieceDefinition }> = ({ piece }) => {
    // Simple SVG preview
    return (
        <svg viewBox="-2.5 -2.5 5 5" width="40" height="40">
             {piece.cells.map((c, i) => (
                 <polygon 
                    key={i}
                    points="0,-0.57 0.5,0.28 -0.5,0.28" // Approx triangle
                    transform={`translate(${c.x * 0.5}, ${c.y * 0.866}) rotate(${ (c.x + c.y)%2===0 ? 0 : 180 })`}
                    fill={piece.color}
                 />
             ))}
        </svg>
    )
}