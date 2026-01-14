
import React, { useEffect } from 'react';
import { ArrowLeft, Volume2, Music, Speaker } from 'lucide-react';
import { SaveData } from '../types';
import { audio } from '../utils/audio';

interface SettingsProps {
  settings: SaveData['settings'];
  onUpdate: (newSettings: SaveData['settings']) => void;
  onBack: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onUpdate, onBack }) => {
  
  // Attempt to initialize audio if not already, so adjustments can be heard (if user interaction allows)
  useEffect(() => {
      audio.init(settings);
  }, []);

  const handleChange = (key: keyof SaveData['settings'], value: number) => {
    onUpdate({
      ...settings,
      [key]: value
    });
  };

  const VolumeSlider = ({ 
    label, 
    value, 
    onChange, 
    icon: Icon,
    colorClass
  }: { 
    label: string, 
    value: number, 
    onChange: (val: number) => void,
    icon: React.ElementType,
    colorClass: string
  }) => (
    <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex flex-col gap-3 transition-colors hover:border-slate-700">
       <div className="flex items-center justify-between">
           <div className="flex items-center gap-3">
               <Icon className={`w-5 h-5 ${colorClass}`} />
               <span className="font-bold text-slate-300 tracking-wide uppercase text-sm">{label}</span>
           </div>
           <span className={`font-mono font-bold text-sm ${colorClass}`}>{value}%</span>
       </div>
       <div className="relative w-full h-6 flex items-center">
           <input 
              type="range" 
              min="0" 
              max="100" 
              value={value} 
              onChange={(e) => onChange(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-opacity-50 focus:ring-cyan-500 z-10"
              style={{
                  background: `linear-gradient(to right, currentColor 0%, currentColor ${value}%, rgba(30, 41, 59, 1) ${value}%, rgba(30, 41, 59, 1) 100%)`
              }} 
           />
           {/* Visual Track fix for input range styling trick */}
           <style>{`
              input[type=range]::-webkit-slider-thumb {
                  -webkit-appearance: none;
                  height: 16px;
                  width: 16px;
                  border-radius: 50%;
                  background: #f1f5f9;
                  margin-top: -2px; /* align center */
                  box-shadow: 0 0 10px rgba(255,255,255,0.5);
              }
              input[type=range]::-moz-range-thumb {
                  height: 16px;
                  width: 16px;
                  border: none;
                  border-radius: 50%;
                  background: #f1f5f9;
                  box-shadow: 0 0 10px rgba(255,255,255,0.5);
              }
           `}</style>
       </div>
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col items-center p-6 gap-6 animate-in slide-in-from-right duration-300 bg-slate-950">
      <div className="w-full max-w-md flex items-center justify-between mb-2">
          <button onClick={onBack} className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 text-slate-300 transition-colors active:scale-95 border border-slate-700">
             <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="text-3xl font-black text-slate-200 tracking-tighter uppercase font-mono">Config</h2>
          <div className="w-12" /> 
      </div>

      <div className="w-full max-w-md space-y-4">
          <VolumeSlider 
             label="Master Output" 
             value={settings.masterVolume} 
             onChange={(v) => handleChange('masterVolume', v)}
             icon={Volume2}
             colorClass="text-cyan-400"
          />
          
          <VolumeSlider 
             label="Music Level" 
             value={settings.musicVolume} 
             onChange={(v) => handleChange('musicVolume', v)}
             icon={Music}
             colorClass="text-purple-400"
          />

          <VolumeSlider 
             label="SFX Level" 
             value={settings.sfxVolume} 
             onChange={(v) => {
                 handleChange('sfxVolume', v);
             }}
             icon={Speaker}
             colorClass="text-green-400"
          />
      </div>
      
       <div className="mt-auto text-center text-slate-700 text-[10px] font-mono mb-4 uppercase tracking-widest">
          Audio System v2.1 &bull; Initialized
      </div>
    </div>
  );
};
