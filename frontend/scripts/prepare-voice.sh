#!/usr/bin/env bash
# Turn raw voiceover takes into tour clips.
# Usage:  npm run voice:prepare -- path/to/takes
# Takes are named after the clip they belong to: 01.wav … 08.wav, s1.wav … s4.wav
# (any of wav, mp3, m4a, aiff, flac, ogg). Output: public/audio/tour/<id>.mp3
# Each clip is trimmed of leading/trailing silence, given a 150 ms lead-in,
# loudness-normalised to -16 LUFS (true peak -1.5 dB), mono 44.1 kHz, 128 kbps mp3.
# Needs ffmpeg (brew install ffmpeg · winget install ffmpeg · apt install ffmpeg).
set -euo pipefail
IN="${1:?usage: npm run voice:prepare -- path/to/takes}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/audio/tour"
command -v ffmpeg >/dev/null || { echo "ffmpeg not found. Install it first."; exit 1; }
mkdir -p "$OUT"
shopt -s nullglob nocaseglob
n=0
for f in "$IN"/*.{wav,mp3,m4a,aiff,aif,flac,ogg}; do
  id="$(basename "${f%.*}")"
  if [[ ! "$id" =~ ^(0[1-8]|s[1-4])$ ]]; then echo "skip  $(basename "$f")  (name it 01…08 or s1…s4)"; continue; fi
  ffmpeg -hide_banner -loglevel error -y -i "$f" \
    -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse,adelay=150:all=1,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100" \
    -ac 1 -c:a libmp3lame -b:a 128k "$OUT/$id.mp3"
  d="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$id.mp3")"
  printf 'ok    %s.mp3  %.1f s\n' "$id" "$d"
  n=$((n+1))
done
echo "$n clip(s) written to public/audio/tour/."
echo "Next: open the app with #voiceover, click 'Copy manifest.json', save it as public/audio/tour/manifest.json, reload."
