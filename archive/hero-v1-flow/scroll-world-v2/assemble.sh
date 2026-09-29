#!/bin/bash
# Assemble the 4-shot scroll-world hero into the final homepage asset.
#
# The chain is frame-locked by construction: shot N ends on keyframe K[N]
# and shot N+1 starts on the same K[N]. Verified SSIM ~0.98 on s1's tail
# frame vs k1, so a plain hard cut is already seamless -- we still insert a
# 5-frame cross dissolve to absorb the residual 2% and any generator noise.
set -euo pipefail
cd "$(dirname "$0")"

SHOTS=(s1-approach s2-sensing s3-fusion s4-decision)
OUT=video
mkdir -p "$OUT"

for s in "${SHOTS[@]}"; do
  [ -f "shots/$s.mp4" ] || { echo "missing shots/$s.mp4"; exit 1; }
done

# 30fps output, 5-frame (0.167s) dissolves between shots.
# Each shot is 7.979167s, so the i-th xfade offset is i*(7.979167 - 0.167):
#   7.812 / 15.624 / 23.437  (the old 15.457 / 23.270 drifted ~0.2s per cut).
X=0.167
ffmpeg -v error -y \
  -i shots/s1-approach.mp4 \
  -i shots/s2-sensing.mp4 \
  -i shots/s3-fusion.mp4 \
  -i shots/s4-decision.mp4 \
  -filter_complex "[0:v]fps=30,format=yuv420p,settb=AVTB[v0];
                   [1:v]fps=30,format=yuv420p,settb=AVTB[v1];
                   [2:v]fps=30,format=yuv420p,settb=AVTB[v2];
                   [3:v]fps=30,format=yuv420p,settb=AVTB[v3];
                   [v0][v1]xfade=transition=fade:duration=$X:offset=7.812[x1];
                   [x1][v2]xfade=transition=fade:duration=$X:offset=15.624[x2];
                   [x2][v3]xfade=transition=fade:duration=$X:offset=23.437[v]" \
  -map "[v]" -an -c:v libx264 -crf 20 -preset slow -g 8 -pix_fmt yuv420p \
  -movflags +faststart "$OUT/hero.mp4"

# webm fallback (smaller, for browsers that prefer it)
ffmpeg -v error -y -i "$OUT/hero.mp4" -an -c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 -pix_fmt yuv420p "$OUT/hero.webm"

# poster: the establishing keyframe (what shows before the video paints)
ffmpeg -v error -y -i keyframes/k0-establish.png -vf 'scale=1344:768' -q:v 4 "$OUT/poster.jpg"

# mobile still-fallback (Q7: static frame degradation on phones)
ffmpeg -v error -y -i "$OUT/poster.jpg" -vf 'scale=1024:586' -q:v 5 "$OUT/poster-mobile.jpg"

echo "done:"
ls -la "$OUT"
for s in "${SHOTS[@]}"; do
  printf '%-14s %s\n' "$s" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 shots/$s.mp4)"
done
printf '%-14s %s\n' hero "$(ffprobe -v error -show_entries format=duration -of csv=p=0 $OUT/hero.mp4)"
