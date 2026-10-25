"use client";

// Short beeps for the counter, made with the Web Audio API (no sound files).

let context: AudioContext | null = null;

function tone(frequency: number, durationMs: number, volume = 0.08) {
  try {
    context ??= new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "square";
    gain.gain.value = volume;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + durationMs / 1000);
  } catch {
    // Sound is a nice-to-have; ignore browsers that block it.
  }
}

export const beepOk = () => tone(1400, 60);
export const beepError = () => {
  tone(220, 180, 0.12);
  setTimeout(() => tone(180, 220, 0.12), 200);
};
