from __future__ import annotations

import math
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np


SAMPLE_RATE = 44_100
TEMPO_BPM = 80.0
BEAT = 60.0 / TEMPO_BPM
BAR = BEAT * 4.0
TOTAL_BARS = 60
DURATION_SECONDS = int(BAR * TOTAL_BARS)
TOTAL_SAMPLES = SAMPLE_RATE * DURATION_SECONDS
OUTPUT_PATH = Path(r"C:\Users\baek_\Downloads\Serene_Threshold_3min_piano.wav")


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


def piano_envelope(duration: float, attack: float, release: float, decay_pow: float) -> np.ndarray:
    t = make_time(duration)
    attack_samples = max(1, int(attack * SAMPLE_RATE))
    env = np.ones_like(t)
    env[:attack_samples] = np.linspace(0.0, 1.0, attack_samples, dtype=np.float32)
    tail = np.linspace(0.0, 1.0, len(t), dtype=np.float32)
    env *= np.power(1.0 - tail, decay_pow)
    if release > 0:
        release_samples = min(len(t), int(release * SAMPLE_RATE))
        env[-release_samples:] *= np.linspace(1.0, 0.0, release_samples, dtype=np.float32)
    return env


def felt_piano(freq: float, duration: float, brightness: float = 1.0) -> np.ndarray:
    t = make_time(duration)
    hammer = np.exp(-t * 38.0) * np.sin(2 * np.pi * freq * 7.5 * t)
    body = (
        0.95 * np.sin(2 * np.pi * freq * t)
        + 0.28 * np.sin(2 * np.pi * freq * 2.0 * t + 0.04)
        + 0.12 * np.sin(2 * np.pi * freq * 3.02 * t + 0.08)
        + 0.06 * np.sin(2 * np.pi * freq * 4.95 * t + 0.12)
    )
    noise = 0.01 * np.sin(2 * np.pi * (freq * 0.5) * t + 1.2)
    env = piano_envelope(duration, attack=0.008, release=0.55, decay_pow=1.6 + 0.8 / max(brightness, 0.4))
    tone = (body + hammer * 0.12 * brightness + noise) * env
    return tone


def stereo_pan(signal: np.ndarray, pan: float) -> tuple[np.ndarray, np.ndarray]:
    angle = (pan + 1.0) * math.pi / 4.0
    return signal * math.cos(angle), signal * math.sin(angle)


def add_to_mix(
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
    chunk = signal[: end - start] * gain
    left, right = stereo_pan(chunk, pan)
    mix_l[start:end] += left
    mix_r[start:end] += right


def add_room_reverb(stereo: np.ndarray) -> np.ndarray:
    out = stereo.copy()
    taps = ((0.13, 0.18), (0.23, 0.13), (0.37, 0.09), (0.53, 0.06))
    for delay_s, gain in taps:
        delay = int(delay_s * SAMPLE_RATE)
        if delay >= len(out):
            continue
        out[delay:] += stereo[:-delay] * gain
    return out


def build_events() -> list[NoteEvent]:
    events: list[NoteEvent] = []
    progression = [
        [50, 57, 62, 66, 69],  # Dmaj7/add9
        [49, 57, 61, 64, 69],  # A/C#
        [47, 54, 59, 62, 66],  # Bm7
        [43, 50, 55, 59, 62],  # Gmaj7
    ]
    right_patterns = [
        [74, 78, 81, 78],
        [73, 76, 81, 76],
        [71, 74, 78, 74],
        [67, 71, 74, 71],
    ]
    upper_motif = [81, 83, 81, 78]

    for bar in range(TOTAL_BARS):
        chord = progression[bar % len(progression)]
        pattern = right_patterns[bar % len(right_patterns)]
        start = bar * BAR

        intro = bar < 4
        outro = bar >= 52
        full = 4 <= bar < 40
        lift = 40 <= bar < 52

        # Left hand foundation.
        if not intro:
            root = chord[0]
            fifth = root + 7
            events.append(NoteEvent(start, 1.65, root, 0.20, pan=-0.22))
            if full or lift:
                events.append(NoteEvent(start + 1.5, 1.3, fifth, 0.12, pan=-0.18))

        # Broken chord right hand.
        step_starts = [0.0, 0.75, 1.5, 2.25]
        for idx, note in enumerate(pattern):
            vel = 0.24 if not outro else 0.16
            if intro:
                vel = 0.18
            if lift:
                vel = 0.28
            events.append(NoteEvent(start + step_starts[idx], 1.45, note, vel, pan=0.16))

        # Midrange support tones for fuller middle section.
        if full:
            events.append(NoteEvent(start + 0.38, 1.2, chord[2], 0.11, pan=0.05))
            events.append(NoteEvent(start + 1.85, 1.2, chord[3], 0.10, pan=0.08))

        # High motif in the later section.
        if lift:
            for step, midi in enumerate(upper_motif):
                events.append(NoteEvent(start + 0.5 + step * 0.62, 1.0, midi, 0.12, pan=0.28))

        # Outro sparse top note.
        if outro:
            events.append(NoteEvent(start + 1.0, 2.2, chord[-1] + 5, 0.08, pan=0.24))

    return events


def render() -> tuple[np.ndarray, np.ndarray]:
    left = np.zeros(TOTAL_SAMPLES, dtype=np.float32)
    right = np.zeros(TOTAL_SAMPLES, dtype=np.float32)

    # Very soft room/air to keep the piano from feeling dry.
    rng = np.random.default_rng(7)
    room = rng.normal(0.0, 1.0, TOTAL_SAMPLES).astype(np.float32)
    kernel = np.ones(2000, dtype=np.float32) / 2000.0
    room = np.convolve(room, kernel, mode="same")
    room *= 0.002
    slow = 0.8 + 0.2 * np.sin(2 * np.pi * np.arange(TOTAL_SAMPLES, dtype=np.float32) / SAMPLE_RATE * 0.03)
    room *= slow
    left += room
    right += room * 0.92

    for event in build_events():
        freq = midi_to_freq(event.midi)
        brightness = 1.15 if event.midi >= 76 else 0.85
        signal = felt_piano(freq, event.duration + 1.4, brightness=brightness)
        add_to_mix(left, right, signal, event.start, gain=event.velocity, pan=event.pan)

    stereo = np.stack([left, right], axis=1)
    stereo = add_room_reverb(stereo)

    fade_in = np.linspace(0.0, 1.0, SAMPLE_RATE * 4, dtype=np.float32)
    fade_out = np.linspace(1.0, 0.0, SAMPLE_RATE * 8, dtype=np.float32)
    stereo[: len(fade_in)] *= fade_in[:, None]
    stereo[-len(fade_out) :] *= fade_out[:, None]

    stereo = np.tanh(stereo * 1.15)
    peak = np.max(np.abs(stereo))
    if peak > 0:
        stereo *= 0.92 / peak
    return stereo[:, 0], stereo[:, 1]


def write_wav(left: np.ndarray, right: np.ndarray, path: Path) -> None:
    stereo = np.stack([left, right], axis=1)
    pcm = np.int16(np.clip(stereo, -1.0, 1.0) * 32767)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    left, right = render()
    write_wav(left, right, OUTPUT_PATH)
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
