#!/bin/bash
# Mobile encodes at 720p. Q7: desktop plays video, phones get a lighter clip
# (not a pure still -- the engine swaps sources live; stills remain the poster
# and the reduced-motion path).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p shots-m
for s in s1-approach s2-sensing s3-fusion s4-decision; do
  [ -f "shots/$s.mp4" ] || { echo "missing shots/$s.mp4"; exit 1; }
  ffmpeg -v error -y -i "shots/$s.mp4" -an -vf scale=-2:720 \
    -c:v libx264 -crf 26 -preset slow -g 4 -pix_fmt yuv420p -movflags +faststart \
    "shots-m/$s.mp4"
done
ls -la shots-m
