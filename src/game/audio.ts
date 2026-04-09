type AudioKind = 'click' | 'fire' | 'pickup' | 'damage';

const AudioContextCtor =
  typeof window !== 'undefined'
    ? (window.AudioContext ??
        ((window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext as
          | typeof AudioContext
          | undefined))
    : undefined;

export class GameAudio {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientOscillator: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;

  private ensureContext() {
    if (!AudioContextCtor) return null;
    if (!this.context) {
      this.context = new AudioContextCtor();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.16;
      this.masterGain.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') {
      void this.context.resume();
    }
    return this.context;
  }

  private tone({
    frequency,
    type,
    duration,
    gain,
    endFrequency,
  }: {
    frequency: number;
    type: OscillatorType;
    duration: number;
    gain: number;
    endFrequency?: number;
  }) {
    const context = this.ensureContext();
    if (!context || !this.masterGain) return;

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), now + duration);
    }

    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(envelope);
    envelope.connect(this.masterGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  public play(kind: AudioKind) {
    if (kind === 'click') {
      this.tone({ frequency: 640, type: 'triangle', duration: 0.08, gain: 0.08, endFrequency: 440 });
      return;
    }

    if (kind === 'pickup') {
      this.tone({ frequency: 520, type: 'triangle', duration: 0.14, gain: 0.09, endFrequency: 760 });
      return;
    }

    if (kind === 'damage') {
      this.tone({ frequency: 180, type: 'sawtooth', duration: 0.18, gain: 0.11, endFrequency: 90 });
      return;
    }

    this.tone({ frequency: 230, type: 'square', duration: 0.11, gain: 0.11, endFrequency: 120 });
    this.tone({ frequency: 120, type: 'triangle', duration: 0.16, gain: 0.05, endFrequency: 72 });
  }

  public startAmbient() {
    const context = this.ensureContext();
    if (!context || !this.masterGain || this.ambientOscillator) return;

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;

    this.ambientGain = context.createGain();
    this.ambientGain.gain.setValueAtTime(0.0001, context.currentTime);
    this.ambientGain.gain.linearRampToValueAtTime(0.014, context.currentTime + 1.2);

    this.ambientOscillator = context.createOscillator();
    this.ambientOscillator.type = 'triangle';
    this.ambientOscillator.frequency.setValueAtTime(92, context.currentTime);

    this.ambientOscillator.connect(filter);
    filter.connect(this.ambientGain);
    this.ambientGain.connect(this.masterGain);
    this.ambientOscillator.start();
  }

  public stopAmbient() {
    if (!this.context || !this.ambientOscillator || !this.ambientGain) return;

    const now = this.context.currentTime;
    this.ambientGain.gain.cancelScheduledValues(now);
    this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, now);
    this.ambientGain.gain.linearRampToValueAtTime(0.0001, now + 0.25);
    this.ambientOscillator.stop(now + 0.3);
    this.ambientOscillator = null;
    this.ambientGain = null;
  }
}
