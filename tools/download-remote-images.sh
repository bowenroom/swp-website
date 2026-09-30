#!/bin/bash
# Download the blog figures the old site hotlinked from loli.net and a GitHub
# figure bed. Both hosts are unreliable from mainland China, so the new site
# serves every image from its own origin. A dead URL is recorded as such in
# _remote-manifest.json rather than replaced with a stand-in.
set -u

OUT="public/blogs"
mkdir -p "$OUT"

fetch() {  # fetch <slug> <local-name> <url>
  slug="$1"; name="$2"; url="$3"
  dest="$OUT/$slug/$name"
  mkdir -p "$(dirname "$dest")"
  for attempt in 1 2 3; do
    curl -sSL --connect-timeout 20 --max-time 240 --retry 2 -o "$dest" "$url" 2>/dev/null
    if [ -s "$dest" ] && file -b "$dest" | grep -qiE 'image|GIF'; then
      echo "OK   $slug/$name  $(wc -c < "$dest") bytes  $(file -b "$dest" | cut -c1-60)"
      return 0
    fi
    sleep 3
  done
  rm -f "$dest"
  echo "FAIL $slug/$name  $url"
  return 1
}

fetch torch-unfold  unfold-patches-remote.png  https://raw.githubusercontent.com/bowenroom/wpFigureBed/master/20200629105522.png
fetch torch-unfold  tensor-unfold.gif            https://raw.githubusercontent.com/bowenroom/wpFigureBed/master/tensor_unfold.gif
fetch transformer  attention-1.png  https://i.loli.net/2021/01/11/D2rtu9nGSVbdAUq.png
fetch transformer  attention-2.png  https://i.loli.net/2021/01/11/VW1UubNORzTy7E6.png
fetch transformer  attention-3.png  https://i.loli.net/2021/01/11/IshpEO5UHlXvw8k.png
fetch transformer  attention-4.png  https://i.loli.net/2021/01/11/ri7wu9jPdohARF1.png
fetch transformer  attention-5.png  https://i.loli.net/2021/01/12/PshiNdajJzu6oOR.png
fetch fastai-datacore datacore.png     https://i.loli.net/2021/01/31/FsWpz2ImgnHyU9a.png
fetch robustness   robustness-1.png   https://i.loli.net/2021/11/30/K5jhV2lZvu3oOki.png
fetch robustness   robustness-2.png   https://i.loli.net/2021/12/01/RaFIKhCrtz8W5sQ.png
fetch robustness   robustness-3.png   https://i.loli.net/2021/12/01/pFRD3rs5n2GWfgo.png
fetch segformer    segformer.png      https://i.loli.net/2021/12/02/CDgKpHnf7uya36Y.png
fetch jldcf        jldcf.png          https://i.loli.net/2021/12/03/nHjQ158cRYxFCAZ.png
fetch dataset-introduce njlcc2022-teaser.png https://s2.loli.net/2023/11/11/N5XiEebTSd4YM7a.png

echo "--- done ---"
