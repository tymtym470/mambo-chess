import { assetUrl } from './mascot.js';

export const MAMBO_TAUNT_LINE = '这盘棋分明就是老叟戏顽童，你一点赢我的概率都没有。';
const MAMBO_TAUNT_AUDIO = assetUrl('audio/mambo-taunt-7-14.mp3');
export const COMMENTARY_AUDIO_LIBRARY = [
  'source-2.mp3', 'source-3.mp3', 'source-4.mp3', 'source-5.mp3', 'source-9.mp3', 'source-10.mp3',
  'source-12.mp3', 'source-13.mp3', 'source-14.mp3', 'source-15.mp3', 'source-17.mp3', 'source-18.mp3',
  'source-20.mp3', 'source-21.mp3', 'source-22.mp3', 'source-23.mp3', 'source-24.mp3', 'source-26.mp3',
  'source-27.mp3', 'source-28.mp3', 'source-29.mp3', 'source-30.mp3', 'source-37.mp3', 'source-42.mp3',
  'source-43.mp3', 'source-44.mp3', 'source-45.mp3', 'source-46.mp3', 'source-47.mp3', 'source-48.mp3',
  'source-51.mp3', 'source-103.mp3', 'source-104.mp3', 'source-10001.mp3', 'source-10252.mp3', 'source-extra-36.mp3',
];
const VOICES = {
  start: COMMENTARY_AUDIO_LIBRARY.slice(0, 6),
  move: COMMENTARY_AUDIO_LIBRARY.slice(6, 16),
  capture: COMMENTARY_AUDIO_LIBRARY.slice(16, 24),
  check: COMMENTARY_AUDIO_LIBRARY.slice(24, 30),
  win: COMMENTARY_AUDIO_LIBRARY.slice(30),
  undo: COMMENTARY_AUDIO_LIBRARY.slice(0, 8),
  promotion: COMMENTARY_AUDIO_LIBRARY.slice(8, 16),
  pass: COMMENTARY_AUDIO_LIBRARY.slice(16, 22),
  mascot: COMMENTARY_AUDIO_LIBRARY.slice(22, 30),
  commentary: COMMENTARY_AUDIO_LIBRARY,
};
class AudioManager {
  enabled = true;
  voice = true;
  music = true;
  volume = .55;
  context = null;
  background = null;
  voiceAudio = null;
  tauntAudio = null;
  voiceIndex = 0;
  lastVoice = 0;
  nextCommentAt = 0;
  configure({ enabled, voice, music = true, volume }) {
    this.enabled = Boolean(enabled);
    this.voice = Boolean(voice);
    this.music = Boolean(music);
    this.volume = Number.isFinite(Number(volume)) ? Math.max(0, Math.min(1, Number(volume))) : .55;
    if (!enabled || !voice) {
      this.stopVoice();
      globalThis.speechSynthesis?.cancel?.();
    }
    if (!enabled || !this.music) this.stopMusic();
    this.applyVolumes();
    if (!enabled && this.context?.state === 'running') this.context.suspend().catch(() => {});
  }
  applyVolumes() {
    if (this.background) this.background.volume = this.volume * .12;
    if (this.voiceAudio) this.voiceAudio.volume = this.volume * .72;
    if (this.tauntAudio) this.tauntAudio.volume = this.volume * .92;
  }
  createAudio(path, volume) {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audio.playsInline = true;
    audio.volume = volume;
    return audio;
  }
  unlock() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (Context) this.context = new Context();
    }
    if (this.enabled && this.context?.state === 'suspended') this.context.resume().catch(() => {});
    if (!this.tauntAudio) {
      this.tauntAudio = this.createAudio(MAMBO_TAUNT_AUDIO, this.volume * .92);
      this.tauntAudio.load();
    }
    this.startMusic();
  }
  stopAudio(audio) {
    if (!audio) return;
    audio.pause();
    try { audio.currentTime = 0; } catch {}
  }
  stopRegularVoice() {
    this.stopAudio(this.voiceAudio);
    this.voiceAudio = null;
  }
  stopTaunt() {
    this.stopAudio(this.tauntAudio);
  }
  stopVoice() {
    this.stopRegularVoice();
    this.stopTaunt();
  }
  startMusic() {
    if (!this.enabled || !this.music) return;
    if (!this.background) {
      this.background = this.createAudio(assetUrl('audio/mambo-friday.mp3'), this.volume * .12);
      this.background.loop = true;
      this.background.addEventListener('timeupdate', () => {
        if (this.background && this.background.currentTime >= 30) this.background.currentTime = 0;
      });
    }
    this.background.volume = this.volume * .12;
    this.background.play().catch(() => {});
  }
  stopMusic() {
    this.stopAudio(this.background);
  }
  nextVoice() {
    const file = COMMENTARY_AUDIO_LIBRARY[this.voiceIndex % COMMENTARY_AUDIO_LIBRARY.length];
    this.voiceIndex++;
    return file;
  }
  play(event = 'move', forceVoice = false) {
    if (!this.enabled) return;
    this.unlock();
    const notes = { move: [640, 440], capture: [260, 480, 720], check: [740, 540, 740], win: [523, 659, 784, 1046], undo: [480, 300], start: [392, 523, 659], select: [700], invalid: [180, 145], promotion: [523, 784, 1046], pass: [350, 420], mascot: [587, 784] }[event] || [500];
    if (this.context?.state === 'running') {
      const ctx = this.context, now = ctx.currentTime;
      notes.forEach((frequency, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = event === 'move' ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(frequency, now + i * .055);
        if (event === 'move') osc.frequency.exponentialRampToValueAtTime(170, now + i * .055 + .08);
        gain.gain.setValueAtTime(0, now + i * .055);
        gain.gain.linearRampToValueAtTime(this.volume * .12, now + i * .055 + .007);
        gain.gain.exponentialRampToValueAtTime(.001, now + i * .055 + .15);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + i * .055); osc.stop(now + i * .055 + .17);
      });
    }
    const files = VOICES[event];
    if (this.voice && files && (forceVoice || event !== 'move' || Date.now() - this.lastVoice > 12000)) {
      const tauntPlaying = this.tauntAudio && !this.tauntAudio.paused && !this.tauntAudio.ended;
      if (!tauntPlaying) {
        this.stopRegularVoice();
        const audio = this.createAudio(assetUrl(`audio/library/${this.nextVoice(event)}`), this.volume * .72);
        this.voiceAudio = audio;
        this.lastVoice = Date.now();
        audio.addEventListener('ended', () => {
          if (this.voiceAudio === audio) this.voiceAudio = null;
        }, { once: true });
        audio.play().catch(() => {});
      }
    }
  }
  comment(text, mood = 'taunt') {
    if (!this.enabled || !this.voice || text !== MAMBO_TAUNT_LINE || Date.now() < this.nextCommentAt) return false;
    this.nextCommentAt = Date.now() + 7000 + Math.random() * 7000;
    this.stopRegularVoice();
    if (!this.tauntAudio) {
      this.tauntAudio = this.createAudio(MAMBO_TAUNT_AUDIO, this.volume * .92);
      this.tauntAudio.load();
    }
    this.tauntAudio.volume = this.volume * .92;
    try { this.tauntAudio.currentTime = 0; } catch {}
    this.tauntAudio.play().catch(() => {});
    return true;
  }
}
export const sound = new AudioManager();
