#!/usr/bin/env python3
"""
Run WhisperX transcription with word-level forced alignment.

Usage:
    python3 scripts/whisperx_transcribe.py <audio_path> <output_json> [--model base.en]

Outputs JSON with precise word-level timestamps from forced alignment.
"""

import argparse
import json
import sys
import os


def main():
    parser = argparse.ArgumentParser(description="WhisperX word-level transcription")
    parser.add_argument("audio_path", help="Path to WAV audio file")
    parser.add_argument("output_json", help="Path to write output JSON")
    parser.add_argument("--model", default="base.en", help="Whisper model size (default: base.en)")
    parser.add_argument("--language", default="en", help="Language code (default: en)")
    args = parser.parse_args()

    if not os.path.exists(args.audio_path):
        print(f"Error: Audio file not found: {args.audio_path}", file=sys.stderr)
        sys.exit(1)

    try:
        import whisperx
        import torch
    except ImportError as e:
        print(f"Error: Missing dependency: {e}", file=sys.stderr)
        print("Install with: pip3 install --user --break-system-packages whisperx torch torchaudio", file=sys.stderr)
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"

    print(f"  Device: {device}, Model: {args.model}, Compute: {compute_type}")

    # Step 1: Transcribe
    print("  Loading Whisper model...")
    model = whisperx.load_model(args.model, device, compute_type=compute_type)

    print("  Transcribing audio...")
    audio = whisperx.load_audio(args.audio_path)
    result = model.transcribe(audio, batch_size=16 if device == "cuda" else 4)

    # Step 2: Forced alignment for word-level timestamps
    print("  Loading alignment model...")
    model_a, metadata = whisperx.load_align_model(language_code=args.language, device=device)

    print("  Running forced alignment...")
    result = whisperx.align(result["segments"], model_a, metadata, audio, device, return_char_alignments=False)

    # Step 3: Build output
    segments = []
    for seg in result.get("segments", []):
        words = []
        for w in seg.get("words", []):
            # WhisperX sometimes returns words without timing (low confidence)
            if "start" in w and "end" in w:
                words.append({
                    "word": w["word"].strip(),
                    "start": round(w["start"], 3),
                    "end": round(w["end"], 3),
                    "score": round(w.get("score", 0), 3),
                })
        segments.append({
            "text": seg.get("text", "").strip(),
            "start": round(seg.get("start", 0), 3),
            "end": round(seg.get("end", 0), 3),
            "words": words,
        })

    output = {"segments": segments}

    os.makedirs(os.path.dirname(args.output_json) or ".", exist_ok=True)
    with open(args.output_json, "w") as f:
        json.dump(output, f, indent=2)

    total_words = sum(len(s["words"]) for s in segments)
    print(f"  Done: {len(segments)} segments, {total_words} words with timestamps")


if __name__ == "__main__":
    main()
