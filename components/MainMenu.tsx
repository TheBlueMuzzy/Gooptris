
import React, { useState } from 'react';
import { Play, Settings, Zap, Trash2, AlertTriangle } from 'lucide-react';
import { SaveData } from '../types';
import { calculateRankDetails } from '../utils/progression';

interface MainMenuProps {
  onPlay: () => void;
  onUpgrades: () => void;
  onSettings: () => void;
  saveData: SaveData;
  onWipeSave: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onPlay, onUpgrades, onSettings, saveData, onWipeSave }) => {
  const [confirmWipe, setConfirmWipe] = useState(false);
  
  // Local state for button labels to handle "Coming Soon" flash
  const [systemsLabel, setSystemsLabel] = useState("SYSTEMS");
  const [configLabel, setConfigLabel] = useState("CONFIG");
  
  // Calculate directly from props every render to avoid stale memoization issues
  const rankInfo = calculateRankDetails(saveData.totalScore);
  const progressPercent = rankInfo.isMaxRank ? 100 : (rankInfo.progress / rankInfo.toNextRank) * 100;

  const handleWipeClick = () => {
    if (confirmWipe) {
      onWipeSave();
      setConfirmWipe(false);
    } else {
      setConfirmWipe(true);
      // Reset confirmation state after 3 seconds if not clicked again
      setTimeout(() => setConfirmWipe(false), 3000);
    }
  };

  const handleSystemsClick = () => {
      setSystemsLabel("COMING SOON");
      setTimeout(() => setSystemsLabel("SYSTEMS"), 2000);
  };

  const handleConfigClick = () => {
      setConfigLabel("COMING SOON");
      setTimeout(() => setConfigLabel("CONFIG"), 2000);
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 gap-8 animate-in fade-in duration-500 overflow-hidden bg-slate-950 relative">
      <div className="absolute inset-0 z-0 opacity-20 bg-[radial-gradient(circle_at_50%_50%,#059669_0%,transparent_50%)]" />
      
      {/* Title Section */}
      <div className="flex flex-col items-center gap-2 w-full z-10">
        <div className="px-4 py-2">
            <h1 
                className="text-7xl md:text-9xl text-transparent bg-clip-text bg-gradient-to-b from-green-400 via-green-500 to-green-800 filter drop-shadow-[0_0_25px_rgba(34,197,94,0.6)] text-center pb-4"
                style={{ fontFamily: '"Chewy", cursive' }}
            >
            GOOPTRIS
            </h1>
            <div className="text-center text-green-500/60 font-mono tracking-[0.5em] text-sm mt-2 uppercase">Filtration Defense</div>
        </div>
      </div>

      {/* Meta Progression HUD */}
      <div className="w-full max-w-sm z-10 bg-slate-900/80 p-4 rounded-2xl border border-slate-800 backdrop-blur-md shadow-xl">
          <div className="flex justify-between items-end mb-2">
              <div>
                  <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Operator Rank</div>
                  <div className="text-3xl font-mono text-white font-bold leading-none">{rankInfo.rank}</div>
              </div>
              <div className="text-right">
                   <div className="text-xs text-yellow-500 uppercase font-bold tracking-wider">Power Pts</div>
                   <div className="text-xl font-mono text-yellow-400 font-bold leading-none">{saveData.powerUpPoints}</div>
              </div>
          </div>
          
          {/* XP Bar */}
          <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-700 relative">
              <div 
                  className="h-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-1000 ease-out"
                  style={{ width: `${progressPercent}%` }}
              />
              {/* Gloss */}
              <div className="absolute inset-0 bg-white/5" />
          </div>
          <div className="flex justify-between mt-1 text-[10px] font-mono text-slate-500">
              <span>{Math.floor(rankInfo.progress).toLocaleString()} XP</span>
              <span>{rankInfo.isMaxRank ? 'MAX' : `${Math.floor(rankInfo.toNextRank).toLocaleString()} NEXT`}</span>
          </div>
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-4 w-full max-w-xs z-10 relative">
        <button 
          onClick={onPlay}
          className="group relative flex items-center justify-center gap-4 px-8 py-6 bg-green-700 hover:bg-green-600 text-white font-bold rounded-xl shadow-[0_0_30px_rgba(21,128,61,0.4)] hover:shadow-[0_0_50px_rgba(34,197,94,0.6)] transition-all active:scale-95 text-2xl border border-green-500/30 overflow-hidden"
        >
           <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-700 ease-in-out" />
           <Play className="w-8 h-8 fill-current" /> 
           <span>ENGAGE</span>
        </button>

        <button 
          onClick={handleSystemsClick}
          className="flex items-center justify-center gap-3 px-8 py-4 bg-slate-900/50 text-slate-500 font-bold rounded-xl border border-slate-800 transition-all active:scale-95 text-lg cursor-pointer hover:bg-slate-900"
        >
           <Zap className={`w-5 h-5 ${systemsLabel === 'SYSTEMS' ? 'text-slate-600' : 'text-yellow-500'}`} /> 
           <span>{systemsLabel}</span>
        </button>

        <button 
          onClick={handleConfigClick}
          className="flex items-center justify-center gap-3 px-8 py-4 bg-slate-900/50 text-slate-500 font-bold rounded-xl border border-slate-800 transition-all active:scale-95 text-lg cursor-pointer hover:bg-slate-900"
        >
           <Settings className={`w-5 h-5 ${configLabel === 'CONFIG' ? 'text-slate-600' : 'text-cyan-500'}`} /> 
           <span>{configLabel}</span>
        </button>
      </div>

      {/* Footer / Dev Tools */}
      <div className="absolute bottom-6 w-full flex flex-col items-center gap-4 z-50 pointer-events-auto">
          <button 
            onClick={handleWipeClick}
            className={`relative z-50 text-xs font-mono uppercase tracking-widest flex items-center gap-2 px-3 py-1 rounded border transition-all cursor-pointer active:scale-95 duration-200 ${
              confirmWipe 
                ? 'bg-red-900/80 border-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]' 
                : 'text-red-900/50 hover:text-red-500 border-transparent hover:border-red-900/50'
            }`}
          >
             {confirmWipe ? <AlertTriangle className="w-3 h-3 animate-pulse" /> : <Trash2 className="w-3 h-3" />}
             {confirmWipe ? "CONFIRM WIPE?" : "WIPE SAVE DATA (TESTING)"}
          </button>
          
          <div className="flex flex-col items-center gap-1 opacity-60">
            <div className="text-slate-600 text-xs font-mono">v1.1 &bull; REACTOR STABLE</div>
            <div className="text-slate-500 text-[10px] font-mono tracking-widest">
                MuzzyMade &copy; 2026
            </div>
          </div>
      </div>
    </div>
  );
};
