
import { SaveData } from '../types';

const STORAGE_KEY = 'gooptris_save_v1';

const DEFAULT_SAVE: SaveData = {
  rank: 1,
  totalScore: 0,
  powerUpPoints: 0,
  powerUps: {},
  firstRunComplete: false,
  settings: {
    masterVolume: 100,
    musicVolume: 80,
    sfxVolume: 100
  }
};

export const loadSaveData = (): SaveData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SAVE };
    
    const parsed = JSON.parse(raw);
    // Merge with default to handle schema updates/missing keys
    return { ...DEFAULT_SAVE, ...parsed, settings: { ...DEFAULT_SAVE.settings, ...parsed.settings } };
  } catch (e) {
    console.error("Failed to load save data", e);
    return { ...DEFAULT_SAVE };
  }
};

export const saveGameData = (data: SaveData) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save data", e);
  }
};

export const clearSaveData = () => {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload(); // Force reload to reset state
};
