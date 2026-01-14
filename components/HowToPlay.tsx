
import React from 'react';
import { ArrowLeft, MousePointer, Gauge, Combine, ArrowUpCircle, Keyboard, Zap } from 'lucide-react';

interface HowToPlayProps {
  onBack: () => void;
}

export const HowToPlay: React.FC<HowToPlayProps> = ({ onBack }) => {
  return (
    <div className="w-full h-full flex flex-col items-center p-6 gap-6 animate-in slide-in-from-right duration-300 bg-slate-950 overflow-y-auto">
      <div className="w-full max-w-md flex items-center justify-between flex-shrink-0">
          <button onClick={onBack} className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 text-slate-300 transition-colors active:scale-95 border border-slate-700">
             <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="text-3xl font-black text-slate-200 tracking-tighter uppercase font-mono">Operations Manual</h2>
          <div className="w-12" /> 
      </div>

      <div className="w-full max-w-md space-y-6 pb-8">
          
          {/* Section 1: Objective */}
          <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-3">
                  <Gauge className="w-6 h-6 text-red-500" />
                  <h3 className="text-xl font-bold text-white tracking-wide">THE OBJECTIVE</h3>
              </div>
              <p className="text-slate-400 leading-relaxed text-sm">
                  The filtration system is clogging! Pop as much ooze as you can before the <span className="text-red-400 font-bold">Pressure</span> reaches 100%. 
                  <br/><br/>
                  <span className="text-green-400 font-bold">PRO TIP:</span> Popping larger groups of goop vents pressure, buying you more time to work.
              </p>
          </div>

          {/* Section 2: Mechanics */}
          <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 backdrop-blur-sm space-y-4">
              <div className="flex items-center gap-3 mb-1">
                  <Combine className="w-6 h-6 text-cyan-400" />
                  <h3 className="text-xl font-bold text-white tracking-wide">MECHANICS</h3>
              </div>
              
              <div className="flex gap-4 items-start">
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 shrink-0 mt-1">
                    <MousePointer className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                      <h4 className="font-bold text-slate-200 text-sm">Purging (Clicking)</h4>
                      <p className="text-slate-400 text-xs mt-1">
                          You can only pop goop that is <span className="text-white font-bold">fully filled</span> (solid) and sitting <span className="text-white font-bold">below the pressure line</span> (the water level).
                      </p>
                  </div>
              </div>

              <div className="flex gap-4 items-start">
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 shrink-0 mt-1">
                    <ArrowUpCircle className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                      <h4 className="font-bold text-slate-200 text-sm">Scoring</h4>
                      <p className="text-slate-400 text-xs mt-1">
                          Goop combines with like colors. 
                          <br/>• <span className="text-green-400">Bigger Groups</span> = More Points.
                          <br/>• <span className="text-green-400">Higher Elevation</span> = More Points.
                      </p>
                  </div>
              </div>

              <div className="flex gap-4 items-start">
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 shrink-0 mt-1">
                    <Zap className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                      <h4 className="font-bold text-slate-200 text-sm">Progression</h4>
                      <p className="text-slate-400 text-xs mt-1">
                          Level up your Operator Rank to earn <span className="text-yellow-400">Power Points</span>. Spend these in the Upgrades menu to enhance your efficiency! <span className="opacity-50 italic">(Coming Soon)</span>
                      </p>
                  </div>
              </div>
          </div>

          {/* Section 3: Controls */}
          <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-4">
                  <Keyboard className="w-6 h-6 text-slate-400" />
                  <h3 className="text-xl font-bold text-white tracking-wide">CONTROLS</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                  <ControlKey keyName="A / D" action="Move View" />
                  <ControlKey keyName="Q / E" action="Rotate Goop" />
                  <ControlKey keyName="S" action="Fall Faster" />
                  <ControlKey keyName="W" action="Swap / Store" />
                  <ControlKey keyName="SPACE" action="Hard Drop" />
                  <ControlKey keyName="CLICK" action="Pop Goop" />
              </div>
              <div className="mt-4 text-center text-xs text-slate-500 italic">
                  * Touch controls available for mobile operators.
              </div>
          </div>
      </div>
    </div>
  );
};

const ControlKey = ({ keyName, action }: { keyName: string, action: string }) => (
    <div className="flex flex-col bg-slate-950 border border-slate-800 p-2 rounded-lg text-center">
        <span className="text-cyan-400 font-black font-mono text-sm mb-1">{keyName}</span>
        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">{action}</span>
    </div>
);
