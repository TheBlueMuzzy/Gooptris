
import { SaveData } from '../types';

class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  
  // Oscillators for BGM
  private droneOsc: OscillatorNode | null = null;
  private droneLfo: OscillatorNode | null = null;
  
  private settings: SaveData['settings'] = {
    masterVolume: 100,
    musicVolume: 80,
    sfxVolume: 100
  };

  private isInitialized = false;

  constructor() {
    // Lazy init
  }

  public init(settings: SaveData['settings']) {
    if (this.isInitialized) return;
    this.settings = settings;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      
      // Master Chain
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);

      // Sub-channels
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);

      this.updateVolumes();
      this.isInitialized = true;
    } catch (e) {
      console.error("Audio init failed", e);
    }
  }

  public updateSettings(newSettings: SaveData['settings']) {
    this.settings = newSettings;
    this.updateVolumes();
  }

  private updateVolumes() {
    if (!this.masterGain || !this.musicGain || !this.sfxGain || !this.ctx) return;
    
    const now = this.ctx.currentTime;
    const mVol = this.settings.masterVolume / 100;
    const musicVol = this.settings.musicVolume / 100;
    const sfxVol = this.settings.sfxVolume / 100;

    this.masterGain.gain.setTargetAtTime(mVol, now, 0.1);
    this.musicGain.gain.setTargetAtTime(musicVol, now, 0.1);
    this.sfxGain.gain.setTargetAtTime(sfxVol, now, 0.1);
  }

  public resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // --- BGM ---

  public startMusic() {
    // Background audio disabled by design preference
    this.stopMusic();
  }

  public stopMusic() {
    if (this.droneOsc) {
      try { this.droneOsc.stop(); } catch(e){}
      this.droneOsc = null;
    }
    if (this.droneLfo) {
        try { this.droneLfo.stop(); } catch(e){}
        this.droneLfo = null;
    }
  }

  public setPressure(intensity: number) {
      // Background audio is disabled, so pressure modulation is no-op
  }

  // --- SFX ---

  public playPop(combo: number) {
    if (!this.ctx || !this.sfxGain) return;
    
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.connect(gain);
    gain.connect(this.sfxGain);

    // Pitch rises with combo
    const baseFreq = 400 + (combo * 50);
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 2, t + 0.1);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  public playReject() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(100, t + 0.15);
    
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.15);
    
    osc.start(t);
    osc.stop(t + 0.15);
  }

  public playMove() {
      if (!this.ctx || !this.sfxGain) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.frequency.setValueAtTime(800, t);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      
      osc.start(t);
      osc.stop(t + 0.05);
  }

  public playRotate() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.frequency.setValueAtTime(600, t);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    
    osc.start(t);
    osc.stop(t + 0.08);
  }

  public playDrop() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    
    // 1. "Gloopy" Body (Low Sine Drop)
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    // Start mid, drop low quickly for the "thud/squish" body
    osc.frequency.setValueAtTime(350, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);
    
    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.4, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    
    osc.connect(oscGain);
    oscGain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);

    // 2. Liquid Texture (Resonant Filtered Noise)
    const bufferSize = this.ctx.sampleRate * 0.2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 8; // High resonance for watery sound
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.15);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    
    noise.start(t);
  }

  public playGameOver() {
      if (!this.ctx || !this.sfxGain) return;
      const t = this.ctx.currentTime;
      
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.sfxGain);
      
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.linearRampToValueAtTime(50, t + 1.5);
      
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.linearRampToValueAtTime(0, t + 1.5);
      
      osc.start(t);
      osc.stop(t + 1.5);
  }
}

export const audio = new AudioSystem();
