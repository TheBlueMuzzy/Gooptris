import React, { useState } from 'react';
import { Game } from './Game';
import { MainMenu } from './components/MainMenu';
import { Upgrades } from './components/Upgrades';
import { Settings } from './components/Settings';

type ViewState = 'MENU' | 'GAME' | 'UPGRADES' | 'SETTINGS';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('MENU');

  return (
    <div className="w-full h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      {view === 'MENU' && (
        <MainMenu 
          onPlay={() => setView('GAME')} 
          onUpgrades={() => setView('UPGRADES')}
          onSettings={() => setView('SETTINGS')}
        />
      )}

      {view === 'GAME' && (
        <Game onExit={() => setView('MENU')} />
      )}

      {view === 'UPGRADES' && (
        <Upgrades onBack={() => setView('MENU')} />
      )}

      {view === 'SETTINGS' && (
        <Settings onBack={() => setView('MENU')} />
      )}
    </div>
  );
};

export default App;