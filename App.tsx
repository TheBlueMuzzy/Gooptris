
import React, { useState, useEffect, useCallback } from 'react';
import Game from './Game';
import { MainMenu } from './components/MainMenu';
import { Upgrades } from './components/Upgrades';
import { Settings } from './components/Settings';
import { SaveData } from './types';
import { loadSaveData, saveGameData, clearSaveData } from './utils/storage';
import { calculateRankDetails } from './utils/progression';

type ViewState = 'MENU' | 'GAME' | 'UPGRADES' | 'SETTINGS';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('MENU');
  const [saveData, setSaveData] = useState<SaveData>(loadSaveData());

  // Save whenever state updates (debouncing optional but safe enough here)
  useEffect(() => {
    saveGameData(saveData);
  }, [saveData]);

  const handleRunComplete = useCallback((runScore: number) => {
    setSaveData(prev => {
      const newTotalScore = prev.totalScore + runScore;
      
      const oldRankDetails = calculateRankDetails(prev.totalScore);
      const newRankDetails = calculateRankDetails(newTotalScore);
      
      const rankDiff = newRankDetails.rank - oldRankDetails.rank;
      
      // Award 1 Point per Rank gained
      const pointsEarned = rankDiff > 0 ? rankDiff : 0;
      
      // First Run Logic
      let points = prev.powerUpPoints + pointsEarned;
      if (!prev.firstRunComplete) {
          // Bonus reward logic TBD, for now just flag it
      }

      return {
        ...prev,
        totalScore: newTotalScore,
        rank: newRankDetails.rank,
        powerUpPoints: points,
        firstRunComplete: true
      };
    });
  }, []);

  const handleWipeSave = () => {
    if (window.confirm("WARNING: This will delete all progress, rank, and upgrades. Are you sure?")) {
      clearSaveData();
    }
  };

  return (
    <div className="w-full h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      {view === 'MENU' && (
        <MainMenu 
          onPlay={() => setView('GAME')} 
          onUpgrades={() => setView('UPGRADES')}
          onSettings={() => setView('SETTINGS')}
          saveData={saveData}
          onWipeSave={handleWipeSave}
        />
      )}

      {view === 'GAME' && (
        <Game 
          onExit={() => setView('MENU')} 
          onRunComplete={handleRunComplete} 
          initialTotalScore={saveData.totalScore}
        />
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
