import React from 'react';
import { ArrowLeft, Lock } from 'lucide-react';

interface UpgradesProps {
  onBack: () => void;
}

export const Upgrades: React.FC<UpgradesProps> = ({ onBack }) => {
  return (
    <div className="w-full h-full flex flex-col items-center p-6 gap-6 animate-in slide-in-from-right duration-300">
      <div className="w-full max-w-md flex items-center justify-between mb-4">
          <button onClick={onBack} className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-300">
             <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="text-2xl font-bold text-yellow-400 tracking-wider">POWER UPS</h2>
          <div className="w-10" /> {/* Spacer */}
      </div>

      <div className="w-full max-w-md space-y-4 opacity-50 pointer-events-none">
          {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center">
                          <Lock className="w-6 h-6 text-slate-600" />
                      </div>
                      <div>
                          <div className="font-bold text-slate-300">Locked Power Up {i}</div>
                          <div className="text-xs text-slate-500">Requires Level {i * 5}</div>
                      </div>
                  </div>
                  <div className="px-3 py-1 bg-slate-800 rounded text-slate-500 text-xs font-bold">LOCKED</div>
              </div>
          ))}
      </div>
      
      <div className="mt-8 text-center text-slate-500 text-sm">
          Play more to unlock system upgrades.
      </div>
    </div>
  );
};