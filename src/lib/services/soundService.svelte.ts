// Concord Dynamic Sound Engine & MyInstants Soundboard Integration
// Provides zero-latency procedural Web Audio synthesis for UI events
// and high-fidelity MyInstants streaming/caching for meme soundboards.

export type SystemSound =
  | 'message-sent'
  | 'message-received'
  | 'join-channel'
  | 'leave-channel'
  | 'mute'
  | 'unmute'
  | 'deafen'
  | 'undeafen'
  | 'button-click'
  | 'modal-open'
  | 'modal-close'
  | 'screen-share-start'
  | 'screen-share-stop'
  | 'error'
  | 'success';

export interface SoundboardSound {
  id: string;
  name: string;
  category: 'memes' | 'effects' | 'games' | 'reactions';
  icon: string;
  slug: string;
  url: string;
  duration?: number;
}

// Top curated MyInstants soundboard catalog (100% Verified Direct URLs)
export const SOUNDBOARD_SOUNDS: SoundboardSound[] = [
  {
    id: 'vine-boom',
    name: 'Vine Boom',
    category: 'memes',
    icon: '💥',
    slug: 'vine-boom',
    url: 'https://www.myinstants.com/media/sounds/vine-boom.mp3',
  },
  {
    id: 'bruh',
    name: 'Bruh',
    category: 'memes',
    icon: '🗿',
    slug: 'bruh-sound-effect',
    url: 'https://www.myinstants.com/media/sounds/bruh-sound-effect_WstdzdM.mp3',
  },
  {
    id: 'metal-pipe',
    name: 'Metal Pipe',
    category: 'memes',
    icon: '🏗️',
    slug: 'metal-pipe-clang',
    url: 'https://www.myinstants.com/media/sounds/metal-pipe-clang.mp3',
  },
  {
    id: 'airhorn',
    name: 'MLG Airhorn',
    category: 'effects',
    icon: '📢',
    slug: 'airhorn',
    url: 'https://www.myinstants.com/media/sounds/airhorn.mp3',
  },
  {
    id: 'taco-bell',
    name: 'Taco Bell Bong',
    category: 'memes',
    icon: '🔔',
    slug: 'taco-bell-bong-sfx',
    url: 'https://www.myinstants.com/media/sounds/taco-bell-bong-sfx.mp3',
  },
  {
    id: 'emotional-damage',
    name: 'Emotional Damage',
    category: 'memes',
    icon: '💔',
    slug: 'emotional-damage-meme',
    url: 'https://www.myinstants.com/media/sounds/emotional-damage-meme.mp3',
  },
  {
    id: 'bonk',
    name: 'Bonk',
    category: 'effects',
    icon: '🏏',
    slug: 'improved-bonk-sound',
    url: 'https://www.myinstants.com/media/sounds/improved-bonk-sound.mp3',
  },
  {
    id: 'anime-wow',
    name: 'Anime Wow',
    category: 'reactions',
    icon: '✨',
    slug: 'anime-wow-sound-effect',
    url: 'https://www.myinstants.com/media/sounds/anime-wow-sound-effect.mp3',
  },
  {
    id: 'sheesh',
    name: 'Sheesh',
    category: 'memes',
    icon: '🥶',
    slug: 'klaysheesh',
    url: 'https://www.myinstants.com/media/sounds/klaysheesh.mp3',
  },
  {
    id: 'badum-tss',
    name: 'Ba-Dum Tss',
    category: 'effects',
    icon: '🥁',
    slug: 'joke_drum_effect',
    url: 'https://www.myinstants.com/media/sounds/joke_drum_effect.mp3',
  },
  {
    id: 'roblox-oof',
    name: 'Roblox Oof',
    category: 'games',
    icon: '🧱',
    slug: 'roblox-death-sound_1',
    url: 'https://www.myinstants.com/media/sounds/roblox-death-sound_1.mp3',
  },
  {
    id: 'level-up',
    name: 'Level Up',
    category: 'games',
    icon: '⭐',
    slug: '12_3',
    url: 'https://www.myinstants.com/media/sounds/12_3.mp3',
  },
  {
    id: 'fart-reverb',
    name: 'Fart Reverb',
    category: 'memes',
    icon: '💨',
    slug: 'fart-with-reverb',
    url: 'https://www.myinstants.com/media/sounds/fart-with-reverb.mp3',
  },
  {
    id: 'quack',
    name: 'Quack',
    category: 'reactions',
    icon: '🦆',
    slug: 'quack-sound-effect',
    url: 'https://www.myinstants.com/media/sounds/quack-sound-effect.mp3',
  },
  {
    id: 'sad-violin',
    name: 'Sad Violin',
    category: 'reactions',
    icon: '🎻',
    slug: 'sad-violin',
    url: 'https://www.myinstants.com/media/sounds/sad-violin.mp3',
  },
  {
    id: 'victory',
    name: 'Victory Fanfare',
    category: 'games',
    icon: '🏆',
    slug: 'final-fantasy-vii-victory-fanfare-1',
    url: 'https://www.myinstants.com/media/sounds/final-fantasy-vii-victory-fanfare-1.mp3',
  },
];

function getInitialMuted(): boolean {
  if (typeof localStorage !== 'undefined') {
    const savedMuted = localStorage.getItem('concord_sfx_muted');
    if (savedMuted !== null) return savedMuted === 'true';
  }
  return false;
}

function getInitialSystemVolume(): number {
  if (typeof localStorage !== 'undefined') {
    const savedVol = localStorage.getItem('concord_sfx_volume');
    if (savedVol !== null) {
      const parsed = parseFloat(savedVol);
      if (!isNaN(parsed)) return Math.max(0, Math.min(1, parsed));
    }
  }
  return 0.8;
}

function getInitialSoundboardVolume(): number {
  if (typeof localStorage !== 'undefined') {
    const savedVol = localStorage.getItem('concord_soundboard_volume');
    if (savedVol !== null) {
      const parsed = parseFloat(savedVol);
      if (!isNaN(parsed)) return Math.max(0, Math.min(1, parsed));
    }
  }
  return 0.8;
}

class SoundService {
  private ctx: AudioContext | null = null;
  isMuted = $state<boolean>(getInitialMuted());
  systemVolume = $state<number>(getInitialSystemVolume());
  soundboardVolume = $state<number>(getInitialSoundboardVolume());
  private soundCache: Map<string, HTMLAudioElement> = new Map();

  constructor() {}

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  get enabled(): boolean {
    return !this.isMuted;
  }

  set enabled(val: boolean) {
    this.isMuted = !val;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('concord_sfx_muted', String(this.isMuted));
    }
  }

  // System FX Volume (0-100)
  get volume(): number {
    return Math.round(this.systemVolume * 100);
  }

  set volume(percent: number) {
    this.systemVolume = Math.max(0, Math.min(100, percent)) / 100;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('concord_sfx_volume', String(this.systemVolume));
    }
  }

  // Soundboard specific Volume (0-100)
  get soundboardVolumePercent(): number {
    return Math.round(this.soundboardVolume * 100);
  }

  set soundboardVolumePercent(percent: number) {
    this.soundboardVolume = Math.max(0, Math.min(100, percent)) / 100;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('concord_soundboard_volume', String(this.soundboardVolume));
    }
  }

  // Play a standard system sound
  play(sound: SystemSound) {
    if (this.isMuted || this.systemVolume <= 0) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      switch (sound) {
        case 'message-sent': {
          // Pleasant gentle pop (whoosh upward)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
          gain.gain.setValueAtTime(this.systemVolume * 0.25, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.09);
          break;
        }

        case 'message-received': {
          // Discord-style double bell ping (E5 -> B5)
          const t1 = now;
          const t2 = now + 0.08;

          // Note 1
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(659.25, t1); // E5
          gain1.gain.setValueAtTime(this.systemVolume * 0.35, t1);
          gain1.gain.exponentialRampToValueAtTime(0.001, t1 + 0.18);
          osc1.connect(gain1);
          gain1.connect(ctx.destination);
          osc1.start(t1);
          osc1.stop(t1 + 0.18);

          // Note 2
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(987.77, t2); // B5
          gain2.gain.setValueAtTime(this.systemVolume * 0.35, t2);
          gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.25);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(t2);
          osc2.stop(t2 + 0.25);
          break;
        }

        case 'join-channel': {
          // Ascending 4-tone Discord chime (D4 -> F#4 -> A4 -> D5)
          const notes = [293.66, 369.99, 440.0, 587.33];
          notes.forEach((freq, i) => {
            const t = now + i * 0.06;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(this.systemVolume * 0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.15);
          });
          break;
        }

        case 'leave-channel': {
          // Descending Discord leave chime (D5 -> A4 -> D4)
          const notes = [587.33, 440.0, 293.66];
          notes.forEach((freq, i) => {
            const t = now + i * 0.07;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(this.systemVolume * 0.28, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.16);
          });
          break;
        }

        case 'mute': {
          // Low-pitch double beep (G4 -> Eb4)
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(392.0, now);
          gain1.gain.setValueAtTime(this.systemVolume * 0.25, now);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc1.connect(gain1);
          gain1.connect(ctx.destination);
          osc1.start(now);
          osc1.stop(now + 0.08);

          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(311.13, now + 0.07);
          gain2.gain.setValueAtTime(this.systemVolume * 0.25, now + 0.07);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(now + 0.07);
          osc2.stop(now + 0.17);
          break;
        }

        case 'unmute': {
          // High-pitch double beep (Eb4 -> G4)
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(311.13, now);
          gain1.gain.setValueAtTime(this.systemVolume * 0.25, now);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc1.connect(gain1);
          gain1.connect(ctx.destination);
          osc1.start(now);
          osc1.stop(now + 0.08);

          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(392.0, now + 0.07);
          gain2.gain.setValueAtTime(this.systemVolume * 0.25, now + 0.07);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(now + 0.07);
          osc2.stop(now + 0.17);
          break;
        }

        case 'deafen': {
          const notes = [440, 330, 220];
          notes.forEach((f, i) => {
            const t = now + i * 0.06;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t);
            gain.gain.setValueAtTime(this.systemVolume * 0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.12);
          });
          break;
        }

        case 'undeafen': {
          const notes = [220, 330, 440];
          notes.forEach((f, i) => {
            const t = now + i * 0.06;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t);
            gain.gain.setValueAtTime(this.systemVolume * 0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.12);
          });
          break;
        }

        case 'button-click': {
          // Snappy UI micro-click (500Hz -> 100Hz in 15ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(800, now);
          osc.frequency.exponentialRampToValueAtTime(150, now + 0.02);
          gain.gain.setValueAtTime(this.systemVolume * 0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.02);
          break;
        }

        case 'modal-open': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(250, now);
          osc.frequency.exponentialRampToValueAtTime(600, now + 0.09);
          gain.gain.setValueAtTime(this.systemVolume * 0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.1);
          break;
        }

        case 'modal-close': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, now);
          osc.frequency.exponentialRampToValueAtTime(250, now + 0.08);
          gain.gain.setValueAtTime(this.systemVolume * 0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.09);
          break;
        }

        case 'screen-share-start': {
          const notes = [300, 450, 600, 800];
          notes.forEach((f, i) => {
            const t = now + i * 0.05;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t);
            gain.gain.setValueAtTime(this.systemVolume * 0.22, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.1);
          });
          break;
        }

        case 'screen-share-stop': {
          const notes = [800, 600, 450, 300];
          notes.forEach((f, i) => {
            const t = now + i * 0.05;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t);
            gain.gain.setValueAtTime(this.systemVolume * 0.22, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.1);
          });
          break;
        }

        case 'error': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(180, now);
          osc.frequency.setValueAtTime(140, now + 0.1);
          gain.gain.setValueAtTime(this.systemVolume * 0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.25);
          break;
        }

        case 'success': {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523.25, now);
          osc.frequency.setValueAtTime(659.25, now + 0.08);
          osc.frequency.setValueAtTime(783.99, now + 0.16);
          gain.gain.setValueAtTime(this.systemVolume * 0.25, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.3);
          break;
        }
      }
    } catch (err) {
      console.warn('Sound effect playback issue:', err);
    }
  }

  // Play a soundboard sound by ID or object
  async playSoundboard(soundIdOrSound: string | SoundboardSound, volumeMultiplier = 1.0): Promise<void> {
    if (this.isMuted || this.soundboardVolume <= 0) return;

    const sound = typeof soundIdOrSound === 'string'
      ? SOUNDBOARD_SOUNDS.find((s) => s.id === soundIdOrSound)
      : soundIdOrSound;

    if (!sound) return;

    try {
      let audio = this.soundCache.get(sound.id);
      if (!audio) {
        audio = new Audio(sound.url);
        this.soundCache.set(sound.id, audio);
      }

      let player = audio;
      if (!audio.paused && audio.currentTime > 0) {
        player = audio.cloneNode() as HTMLAudioElement;
      } else {
        player.currentTime = 0;
      }

      player.volume = Math.max(0, Math.min(1, this.soundboardVolume * volumeMultiplier));
      await player.play();
    } catch (err) {
      console.warn(`[MyInstants] Playback fallback for ${sound.id}:`, err);
      // Fallback to synthetic punchy tone
      this.play('message-received');
    }
  }

  // Preload top sounds for instant zero-lag response
  preloadSounds() {
    if (typeof window === 'undefined') return;
    SOUNDBOARD_SOUNDS.slice(0, 8).forEach((sound) => {
      if (!this.soundCache.has(sound.id)) {
        const audio = new Audio();
        audio.src = sound.url;
        audio.preload = 'auto';
        this.soundCache.set(sound.id, audio);
      }
    });
  }
}

export const soundService = new SoundService();
