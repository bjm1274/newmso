from __future__ import annotations

import math
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np


SAMPLE_RATE = 44_100
DURATION_SECONDS = 180
TOTAL_SAMPLES = SAMPLE_RATE * DURATION_SECONDS
OUTPUT_PATH = Path(r"C:\Users\baek_\Downloads\Serene_Threshold_3min_original.wav")


@dataclass(frozen=True)
class NoteEvent:
    start: float
    duration: float
    midi: int
    velocity: float
    pan: float = 0.0


def midi_to_freq(midi_note: int) -> float:
    return 440.0 * (2.0 ** ((midi_note - 69) / 12.0))


def make_time(duration: float) -> np.ndarray:
    sample_count = max(1, int(duration * SAMPLE_RATE))
    return np.arange(sample_count, dtype=np.float32) / SAMPLE_RATE


def adsr_envelope(
    duration: float,
    attack: float,
    decay: float,
    sustain_level: float,
    release: float,
) -> np.ndarray:
    t = make_time(duration)
    env = np.zeros_like(t)
    total = duration

    attack_end = min(total, attack)
    decay_end = min(total, attack + decay)
    release_start = max(0.0, total - release)

    if attack_end > 0:
        attack_mask = t < attack_end
        env[attack_mask] = t[attack_mask] / max(attack_end, 1e-6)

    decay_mask = (t >= attack_end) & (t < decay_end)
    if decay_end > attack_end:
        progress = (t[decay_mask] - attack_end) / max(decay_end - attack_end, 1e-6)
        env[decay_mask] = 1.0 - (1.0 - sustain_level) * progress

    sustain_mask = (t >= decay_end) & (t < release_start)
    env[sustain_mask] = sustain_level

    release_mask = t >= release_start
    if total > release_start:
        start_level = sustain_level if release_start >= decay_end else env[release_mask][0] if release_mask.any() else sustain_level
        progress = (t[release_mask] - release_start) / max(total - release_start, 1e-6)
        env[release_mask] = start_level * (1.0 - progress)

    return env


def soft_pad(freq: float, duration: float) -> np.ndarray:
    t = make_time(duration)
    detune = 0.35
    osc = (
        0.50 * np.sin(2 * np.pi * freq * t)
        + 0.24 * np.sin(2 * np.pi * (freq * (1 + detune / 100.0)) * t)
        + 0.24 * np.sin(2 * np.pi * (freq * (1 - detune / 100.0)) * t)
        + 0.10 * np.sin(2 * np.pi * freq * 2 * t)
        + 0.05 * np.sin(2 * np.pi * freq * 3 * t)
    )
    lfo = 0.90 + 0.10 * np.sin(2 * np.pi * 0.12 * t + 0.4)
    env = adsr_envelope(duration, attack=1.8, decay=2.4, sustain_level=0.72, release=3.6)
    return osc * env * lfo


def felt_key(freq: float, duration: float) -> np.ndarray:
    t = make_time(duration)
    partials = (
        0.80 * np.sin(2 * np.pi * freq * t)
        + 0.16 * np.sin(2 * np.pi * freq * 2.01 * t)
        + 0.10 * np.sin(2 * np.pi * freq * 3.0 * t)
        + 0.05 * np.sin(2 * np.pi * freq * 4.02 * t)
    )
    shimmer = 0.02 * np.sin(2 * np.pi * (freq * 6.0) * t)
    env = adsr_envelope(duration, attack=0.01, decay=1.1, sustain_level=0.22, release=1.8)
    return (partials + shimmer) * env


def glass_bell(freq: float, duration: float) -> np.ndarray:
    t = make_time(duration)
    partials = (
        0.72 * np.sin(2 * np.pi * freq * t)
        + 0.30 * np.sin(2 * np.pi * freq * 2.7 * t + 0.3)
        + 0.16 * np.sin(2 * np.pi * freq * 4.9 * t + 1.1)
        + 0.09 * np.sin(2 * np.pi * freq * 7.1 * t + 0.5)
    )
    env = adsr_envelope(duration, attack=0.005, decay=1.4, sustain_level=0.12, release=3.6)
    return partials * env


def low_pulse(freq: float, duration: float) -> np.ndarray:
    t = make_time(duration)
    fundamental = np.sin(2 * np.pi * freq * t)
    overtone = 0.15 * np.sin(2 * np.pi * freq * 2 * t)
    env = adsr_envelope(duration, attack=0.02, decay=0.55, sustain_level=0.0, release=0.25)
    return (fundamental + overtone) * env


def air_texture(duration: float) -> np.ndarray:
    rng = np.random.default_rng(42)
    noise = rng.normal(0.0, 1.0, int(duration * SAMPLE_RATE)).astype(np.float32)
    kernel = np.ones(600, dtype=np.float32) / 600.0
    smoothed = np.convolve(noise, kernel, mode="same")
    t = make_time(duration)
    slow = 0.55 + 0.45 * np.sin(2 * np.pi * 0.035 * t + 1.7)
    env = adsr_envelope(duration, attack=5.0, decay=2.0, sustain_level=0.35, release=8.0)
    return smoothed * slow * env


def stereo_pan(signal: np.ndarray, pan: float) -> tuple[np.ndarray, np.ndarray]:
    angle = (pan + 1.0) * math.pi / 4.0
    left_gain = math.cos(angle)
    right_gain = math.sin(angle)
    return signal * left_gain, signal * right_gain


def add_to_mix(
    mix_l: np.ndarray,
    mix_r: np.ndarray,
    signal: np.ndarray,
    start: float,
    gain: float,
    pan: float,
) -> None:
    start_index = int(start * SAMPLE_RATE)
    if start_index >= TOTAL_SAMPLES:
        return
    end_index = min(TOTAL_SAMPLES, start_index + len(signal))
    clipped = signal[: end_index - start_index] * gain
    left, right = stereo_pan(clipped, pan)
    mix_l[start_index:end_index] += left
    mix_r[start_index:end_index] += right


def apply_delay(signal: np.ndarray, delay_seconds: float, feedback: float, mix: float) -> np.ndarray:
    delay_samples = int(delay_seconds * SAMPLE_RATE)
    delayed = np.zeros_like(signal)
    if delay_samples <= 0:
        return signal
    delayed[delay_samples:] = signal[:-delay_samples]
    return signal * (1.0 - mix) + delayed * mix * feedback


def simple_reverb(signal: np.ndarray) -> np.ndarray:
    out = signal.copy()
    for delay, gain in ((0.18, 0.24), (0.31, 0.18), (0.47, 0.14), (0.62, 0.10)):
        delay_samples = int(delay * SAMPLE_RATE)
        if delay_samples < len(signal):
            out[delay_samples:] += signal[:-delay_samples] * gain
    return out


def build_chords() -> list[tuple[list[int], int]]:
    progression = [
        ([62, 66, 69, 73], 6),  # Dmaj9
        ([59, 62, 66, 71], 6),  # Bm7
        ([55, 59, 62, 66], 6),  # Gmaj7
        ([57, 62, 64, 69], 6),  # Aadd9
        ([64, 67, 71, 74], 6),  # Em7
        ([59, 62, 66, 71], 6),  # Bm7
        ([55, 59, 62, 66], 6),  # Gmaj7
        ([57, 62, 64, 69], 6),  # Asus2
        ([62, 66, 69, 73], 9),  # extended outro Dmaj9
    ]
    return progression


def motif_events(bar_seconds: float) -> list[NoteEvent]:
    notes: list[NoteEvent] = []
    motif = [
        (0.0, 0.55, 74),
        (0.75, 0.45, 76),
        (1.45, 0.60, 78),
        (2.25, 0.60, 76),
    ]
    bell = [
        (0.0, 1.4, 86),
        (1.55, 1.6, 83),
        (2.75, 1.5, 81),
    ]
    for section_start in (24.0, 48.0, 72.0, 96.0, 120.0, 144.0):
        for offset, dur, midi in motif:
            notes.append(NoteEvent(section_start + offset, dur, midi, 0.26, pan=-0.15))
        for offset, dur, midi in motif:
            notes.append(NoteEvent(section_start + bar_seconds + offset, dur, midi - 2, 0.22, pan=0.18))
    for section_start in (72.0, 96.0, 120.0):
        for offset, dur, midi in bell:
            notes.append(NoteEvent(section_start + offset, dur, midi, 0.15, pan=0.35))
            notes.append(NoteEvent(section_start + bar_seconds + offset, dur, midi - 5, 0.13, pan=-0.30))
    return notes


def bass_events(tempo_bpm: float) -> list[NoteEvent]:
    beat = 60.0 / tempo_bpm
    roots = [38, 35, 31, 33, 40, 35, 31, 33]
    events: list[NoteEvent] = []
    start = 24.0
    i = 0
    while start < 156.0:
        root = roots[i % len(roots)]
        events.append(NoteEvent(start, 0.6, root, 0.18))
        events.append(NoteEvent(start + beat * 2, 0.45, root, 0.12))
        start += beat * 4
        i += 1
    return events


def render_track() -> tuple[np.ndarray, np.ndarray]:
    mix_l = np.zeros(TOTAL_SAMPLES, dtype=np.float32)
    mix_r = np.zeros(TOTAL_SAMPLES, dtype=np.float32)

    tempo_bpm = 72.0
    bar_seconds = (60.0 / tempo_bpm) * 4.0

    # Air texture for the whole piece.
    air = air_texture(DURATION_SECONDS)
    air = simple_reverb(air)
    add_to_mix(mix_l, mix_r, air, 0.0, gain=0.08, pan=0.0)

    # Long pads following the chord progression.
    start = 0.0
    for chord, bars in build_chords():
        duration = bars * bar_seconds + 2.5
        for idx, midi in enumerate(chord):
            signal = soft_pad(midi_to_freq(midi), duration)
            gain = 0.12 if midi != chord[0] else 0.10
            pan = (-0.35 + idx * 0.22)
            add_to_mix(mix_l, mix_r, signal, start, gain=gain, pan=pan)
        if chord[0] >= 57:
            bass_pad = soft_pad(midi_to_freq(chord[0] - 12), duration)
            add_to_mix(mix_l, mix_r, bass_pad, start, gain=0.06, pan=0.0)
        start += bars * bar_seconds

    # Felt piano motif.
    for event in motif_events(bar_seconds):
        signal = felt_key(midi_to_freq(event.midi), event.duration + 1.6)
        signal = apply_delay(signal, 0.36, feedback=0.82, mix=0.28)
        signal = simple_reverb(signal)
        add_to_mix(mix_l, mix_r, signal, event.start, gain=event.velocity, pan=event.pan)

    # Bell accents.
    for start_time in (84.0, 108.0, 132.0, 150.0):
        for step, midi in enumerate((86, 83, 81, 79)):
            signal = glass_bell(midi_to_freq(midi), 3.5)
            signal = simple_reverb(signal)
            add_to_mix(
                mix_l,
                mix_r,
                signal,
                start_time + step * 1.2,
                gain=0.11 - step * 0.01,
                pan=0.25 if step % 2 == 0 else -0.25,
            )

    # Low pulse.
    for event in bass_events(tempo_bpm):
        signal = low_pulse(midi_to_freq(event.midi), event.duration)
        add_to_mix(mix_l, mix_r, signal, event.start, gain=event.velocity, pan=0.0)

    # Gentle master shaping.
    master = np.stack([mix_l, mix_r], axis=1)
    fade_in = np.linspace(0.0, 1.0, SAMPLE_RATE * 6, dtype=np.float32)
    fade_out = np.linspace(1.0, 0.0, SAMPLE_RATE * 10, dtype=np.float32)
    master[: len(fade_in)] *= fade_in[:, None]
    master[-len(fade_out) :] *= fade_out[:, None]
    master = np.tanh(master * 0.92)
    peak = np.max(np.abs(master))
    if peak > 0:
        master *= 0.92 / peak
    return master[:, 0], master[:, 1]


def write_wav(left: np.ndarray, right: np.ndarray, output_path: Path) -> None:
    stereo = np.stack([left, right], axis=1)
    pcm = np.int16(np.clip(stereo, -1.0, 1.0) * 32767)
    with wave.open(str(output_path), "wb") as wav_file:
        wav_file.setnchannels(2)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        wav_file.writeframes(pcm.tobytes())


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    left, right = render_track()
    write_wav(left, right, OUTPUT_PATH)
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
