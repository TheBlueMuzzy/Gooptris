
import { SaveData } from '../types';

const STORAGE_KEY = 'gooptris_save_v1';

export const getDefaultSaveData = (): SaveData => ({
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
});

export const loadSaveData = (): SaveData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const defaults = getDefaultSaveData();
    
    if (!raw) return defaults;
    
    const parsed = JSON.parse(raw);
    // Merge with default to handle schema updates/missing keys
    return { 
        ...defaults, 
        ...parsed, 
        settings: { ...defaults.settings, ...(parsed.settings || {}) },
        powerUps: { ...defaults.powerUps, ...(parsed.powerUps || {}) }
    };
  } catch (e) {
    console.error("Failed to load save data", e);
    return getDefaultSaveData();
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
};

export const wipeSaveData = (): SaveData => {
  const fresh = getDefaultSaveData();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  } catch (e) {
    console.error("Failed to wipe save data", e);
  }
  return fresh;
};
