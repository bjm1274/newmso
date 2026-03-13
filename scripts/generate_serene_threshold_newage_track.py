from __future__ import annotations

import math
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np


SAMPLE_RATE = 44_100
TEMPO_BPM = 60.0
BEAT = 60.0 / TEMPO_BPM
BAR = BEAT * 4.0
TOTAL_BARS = 45
DURATION_SECONDS = int(BAR * TOTAL_BARS)
TOTAL_SAMPLES = SAMPLE_RATE * DURATION_SECONDS
OUTPUT_PATH = Path(r"C:\Users\baek_\Downloads\Serene_Threshold_3min_newage.wav")


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
    length = max(1, int(duration * SAMPLE_RATE))
    return np.arange(length, dtype=np.float32) / SAMPLE_RATE


def smooth_env(duration: float, attack: float, release: float, curve: float) -> np.ndarray:
    t = make_time(duration)
    env = np.ones_like(t)
    attack_len = max(1, int(attack * SAMPLE_RATE))
    release_len = max(1, int(release * SAMPLE_RATE))
    env[:attack_len] = np.linspace(0.0, 1.0, attack_len, dtype=np.float32)
    tail = np.linspace(0.0, 1.0, len(t), dtype=np.float32)
    env *= np.power(1.0 - tail, curve)
    env[-release_len:] *= np.linspace(1.0, 0.0, release_len, dtype=np.float32)
    return env


def new_age_piano(freq: float, duration: float, mellow: float = 1.0) -> np.ndarray:
    t = make_time(duration)
    body = (
        0.88 * np.sin(2 * np.pi * freq * t)
        + 0.22 * np.sin(2 * np.pi * freq * 2.0 * t + 0.02)
        + 0.08 * np.sin(2 * np.pi * freq * 3.0 * t + 0.04)
        + 0.03 * np.sin(2 * np.pi * freq * 4.02 * t + 0.08)
    )
    sparkle = 0.06 * np.sin(2 * np.pi * freq * 6.0 * t) * np.exp(-t * 7.0) * mellow
    env = smooth_env(duration, attack=0.012, release=1.2, curve=1.55 + 0.45 * mellow)
    return (body + sparkle) * env


def warm_pad(freq: float, duration: float) -> np.ndarray:
    t = make_time(duration)
    osc = (
        0.60 * np.sin(2 * np.pi * freq * t)
        + 0.25 * np.sin(2 * np.pi * freq * 2.0 * t)
        + 0.12 * np.sin(2 * np.pi * freq * 0.5 * t + 0.7)
        + 0.08 * np.sin(2 * np.pi * freq * 1.01 * t + 1.3)
    )
    lfo = 0.92 + 0.08 * np.sin(2 * np.pi * 0.09 * t + 0.5)
    env = smooth_env(duration, attack=2.8, release=4.5, curve=1.2)
    return osc * env * lfo


def stereo_pan(signal: np.ndarray, pan: float) -> tuple[np.ndarray, np.ndarray]:
    angle = (pan + 1.0) * math.pi / 4.0
    return signal * math.cos(angle), signal * math.sin(angle)


def add_note(
    mix_l: np.ndarray,
    mix_r: np.ndarray,
    signal: np.ndarray,
    start_time: float,
    gain: float,
    pan: float,
) -> None:
    start = int(start_time * SAMPLE_RATE)
    if start >= TOTAL_SAMPLES:
        return
    end = min(TOTAL_SAMPLES, start + len(signal))
    clipped = signal[: end - start] * gain
    left, right = stereo_pan(clipped, pan)
    mix_l[start:end] += left
    mix_r[start:end] += right


def simple_reverb(stereo: np.ndarray) -> np.ndarray:
    out = stereo.copy()
    for delay_s, gain in ((0.14, 0.18), (0.27, 0.13), (0.41, 0.09), (0.58, 0.06)):
        delay = int(delay_s * SAMPLE_RATE)
        if delay < len(stereo):
            out[delay:] += stereo[:-delay] * gain
    return out


def build_events() -> tuple[list[NoteEvent], list[NoteEvent], list[NoteEvent]]:
    left_hand: list[NoteEvent] = []
    right_hand: list[NoteEvent] = []
    melody: list[NoteEvent] = []

    progression_a = [
        [50, 57, 62, 66, 69],  # Dmaj9
        [49, 57, 61, 64, 69],  # A/C#
        [47, 54, 59, 62, 66],  # Bm7
        [43, 50, 55, 59, 62],  # Gmaj7
    ]
    progression_b = [
        [45, 52, 57, 60, 64],  # Am7
        [47, 54, 59, 62, 66],  # Bm7
        [50, 57, 62, 66, 69],  # Dmaj9
        [43, 50, 55, 59, 62],  # Gmaj7
    ]
    pattern_a = [0, 2, 3, 2, 4, 2, 3, 2]
    pattern_b = [0, 2, 4, 2, 3, 2, 4, 2]
    offsets = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]

    for bar in range(TOTAL_BARS):
        if bar < 4:
            chord = progression_a[bar % len(progression_a)]
            pattern = pattern_a
        elif bar < 28:
            chord = progression_a[(bar - 4) % len(progression_a)]
            pattern = pattern_a if bar % 2 == 0 else pattern_b
        elif bar < 40:
            chord = progression_b[(bar - 28) % len(progression_b)]
            pattern = pattern_b
        else:
            chord = progression_a[(bar - 40) % len(progression_a)]
            pattern = pattern_a

        start = bar * BAR

        # Left hand, very slow and gentle.
        root = chord[0]
        fifth = chord[1]
        if bar >= 1:
          left_hand.append(NoteEvent(start, 1.7, root, 0.16, pan=-0.22))
        if 8 <= bar < 40:
          left_hand.append(NoteEvent(start + 2.0, 1.5, fifth, 0.08, pan=-0.18))

        # Right hand broken chords.
        for idx, offset in enumerate(offsets):
            note = chord[pattern[idx]]
            velocity = 0.14 if bar < 4 else 0.18
            if 28 <= bar < 40:
                velocity = 0.20
            if bar >= 40:
                velocity = 0.12
            right_hand.append(NoteEvent(start + offset, 1.4, note + 12, velocity, pan=0.14))

        # Sparse top melody every two bars.
        if bar % 2 == 0 and 6 <= bar < 40:
            melody_note = [81, 78, 76, 74][(bar // 2) % 4]
            if 28 <= bar < 40:
                melody_note = [83, 81, 78, 76][(bar // 2) % 4]
            melody.append(NoteEvent(start + 0.75, 2.8, melody_note, 0.10, pan=0.24))
        if bar >= 40:
            melody.append(NoteEvent(start + 1.0, 2.2, chord[3] + 12, 0.06, pan=0.20))

    return left_hand, right_hand, melody


def render_track() -> np.ndarray:
    left = np.zeros(TOTAL_SAMPLES, dtype=np.float32)
    right = np.zeros(TOTAL_SAMPLES, dtype=np.float32)

    # Soft air bed.
    rng = np.random.default_rng(11)
    air = rng.normal(0.0, 1.0, TOTAL_SAMPLES).astype(np.float32)
    kernel = np.ones(1600, dtype=np.float32) / 1600.0
    air = np.convolve(air, kernel, mode="same")
    air *= 0.0018
    left += air
    right += air * 0.95

    left_hand, right_hand, melody = build_events()

    # Subtle pads behind harmony.
    chord_starts = [0.0, 16.0, 32.0, 48.0, 64.0, 80.0, 96.0, 112.0, 128.0, 144.0, 160.0]
    chord_roots = [50, 49, 47, 43, 50, 49, 47, 43, 45, 47, 50]
    for start_time, root in zip(chord_starts, chord_roots):
        pad = warm_pad(midi_to_freq(root - 12), 15.5)
        add_note(left, right, pad, start_time, gain=0.030, pan=0.0)

    for event in left_hand:
        signal = new_age_piano(midi_to_freq(event.midi), event.duration + 1.2, mellow=0.8)
        add_note(left, right, signal, event.start, gain=event.velocity, pan=event.pan)

    for event in right_hand:
        signal = new_age_piano(midi_to_freq(event.midi), event.duration + 1.1, mellow=1.1)
        add_note(left, right, signal, event.start, gain=event.velocity, pan=event.pan)

    for event in melody:
        signal = new_age_piano(midi_to_freq(event.midi), event.duration + 1.8, mellow=1.2)
        add_note(left, right, signal, event.start, gain=event.velocity, pan=event.pan)

    stereo = np.stack([left, right], axis=1)
    stereo = simple_reverb(stereo)

    fade_in = np.linspace(0.0, 1.0, SAMPLE_RATE * 4, dtype=np.float32)
    fade_out = np.linspace(1.0, 0.0, SAMPLE_RATE * 10, dtype=np.float32)
    stereo[: len(fade_in)] *= fade_in[:, None]
    stereo[-len(fade_out) :] *= fade_out[:, None]

    stereo = np.tanh(stereo * 1.05)
    peak = np.max(np.abs(stereo))
    if peak > 0:
        stereo *= 0.90 / peak
    return stereo


def write_wav(stereo: np.ndarray, path: Path) -> None:
    pcm = np.int16(np.clip(stereo, -1.0, 1.0) * 32767)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    stereo = render_track()
    write_wav(stereo, OUTPUT_PATH)
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
