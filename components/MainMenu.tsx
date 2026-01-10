import React from 'react';
import { Play, Settings, Zap } from 'lucide-react';

interface MainMenuProps {
  onPlay: () => void;
  onUpgrades: () => void;
  onSettings: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onPlay, onUpgrades, onSettings }) => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 gap-12 animate-in fade-in duration-500 overflow-hidden">
      <div className="flex flex-col items-center gap-2 w-full">
        {/* Added padding to container to prevent font clipping on edges */}
        <div className="px-4 py-2">
            <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 tracking-tighter filter drop-shadow-[0_0_15px_rgba(34,211,238,0.5)] text-center">
            CELLTRIS
            </h1>
        </div>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button 
          onClick={onPlay}
          className="group relative flex items-center justify-center gap-4 px-8 py-6 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-[0_0_30px_rgba(8,145,178,0.3)] hover:shadow-[0_0_50px_rgba(8,145,178,0.5)] transition-all active:scale-95 text-2xl border border-cyan-400/30 overflow-hidden"
        >
           <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-700 ease-in-out" />
           <Play className="w-8 h-8 fill-current" /> 
           <span>PLAY</span>
        </button>

        <button 
          onClick={onUpgrades}
          className="flex items-center justify-center gap-3 px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl border border-slate-700 hover:border-slate-600 transition-all active:scale-95 text-lg"
        >
           <Zap className="w-5 h-5 text-yellow-400" /> 
           <span>POWER UP</span>
        </button>

        <button 
          onClick={onSettings}
          className="flex items-center justify-center gap-3 px-8 py-4 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-bold rounded-xl border border-slate-800 hover:border-slate-700 transition-all active:scale-95 text-lg"
        >
           <Settings className="w-5 h-5" /> 
           <span>SETTINGS</span>
        </button>
      </div>

      <div className="absolute bottom-6 text-slate-600 text-xs">
        v0.1.0 &bull; SYSTEM READY
      </div>
    </div>
  );
};