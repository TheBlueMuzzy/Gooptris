
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
    if (!this.ctx || !this.musicGain) return;
    this.stopMusic();

    // Dark Drone Logic
    // 1. Low sine wave
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 55; // Low A
    
    // 2. LFO to modulate amplitude (throbbing)
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.5; // Slow throb

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 50.0;

    lfo.connect(lfoGain);
    // lfoGain.connect(osc.frequency); // FM Synthesis style
    
    osc.connect(this.musicGain);
    
    osc.start();
    lfo.start();

    this.droneOsc = osc;
    this.droneLfo = lfo;
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
      // intensity 0 to 1 (1 is high pressure/low time)
      if (this.droneOsc && this.ctx) {
          const now = this.ctx.currentTime;
          // Pitch up slightly
          this.droneOsc.frequency.setTargetAtTime(55 + (intensity * 55), now, 2);
      }
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
    
    // Noise burst
    const bufferSize = this.ctx.sampleRate * 0.1; // 0.1 sec
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    
    noise.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noise.start(t);

    // Kick
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    
    const kickGain = this.ctx.createGain();
    kickGain.gain.setValueAtTime(0.5, t);
    kickGain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    
    osc.connect(kickGain);
    kickGain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
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
