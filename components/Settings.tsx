import React from 'react';
import { ArrowLeft, Volume2, VolumeX, Monitor } from 'lucide-react';

interface SettingsProps {
  onBack: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ onBack }) => {
  return (
    <div className="w-full h-full flex flex-col items-center p-6 gap-6 animate-in slide-in-from-right duration-300">
      <div className="w-full max-w-md flex items-center justify-between mb-4">
          <button onClick={onBack} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-300">
             <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="text-2xl font-bold text-slate-200 tracking-wider">SETTINGS</h2>
          <div className="w-10" /> 
      </div>

      <div className="w-full max-w-md space-y-4">
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
             <div className="flex items-center gap-3">
                 <Volume2 className="w-5 h-5 text-cyan-400" />
                 <span className="font-bold text-slate-300">Master Volume</span>
             </div>
             <div className="flex gap-1">
                 {[1, 2, 3, 4, 5].map(i => (
                     <div key={i} className={`w-2 h-6 rounded-sm ${i > 3 ? 'bg-slate-700' : 'bg-cyan-500'}`} />
                 ))}
             </div>
          </div>

           <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
             <div className="flex items-center gap-3">
                 <Monitor className="w-5 h-5 text-purple-400" />
                 <span className="font-bold text-slate-300">Graphics</span>
             </div>
             <span className="text-xs font-bold bg-slate-800 px-3 py-1 rounded text-purple-400">HIGH</span>
          </div>

          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between opacity-50">
             <div className="flex items-center gap-3">
                 <VolumeX className="w-5 h-5 text-red-400" />
                 <span className="font-bold text-slate-300">Mute All</span>
             </div>
             <div className="w-10 h-6 bg-slate-800 rounded-full relative">
                 <div className="absolute left-1 top-1 w-4 h-4 bg-slate-600 rounded-full" />
             </div>
          </div>
      </div>
      
       <div className="mt-auto text-center text-slate-600 text-xs mb-4">
          ID: USER-7492-ALPHA
      </div>
    </div>
  );
};