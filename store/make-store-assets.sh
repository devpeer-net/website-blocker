#!/usr/bin/env bash
# Regenerate the whole Chrome Web Store asset set from the current build.
#
# Out-of-date screenshots are an explicit Program Policy violation ("misleading,
# inaccurate, ... out of date ... metadata"), so this has to be cheap to re-run
# at every release. Everything here is derived: the captures come from dist/,
# the frames are HTML, and the only hand-made pixels are the shield in
# frames/icon-128.html.
#
#   ./store/make-store-assets.sh            # -> store/build
#   ./store/make-store-assets.sh /some/dir  # -> /some/dir
#   SKIP_BUILD=1 ./store/make-store-assets.sh   # reuse the existing dist/ (frame work only)
#
# Requires: playwright (in node_modules), ImageMagick, and three capture/render scripts
# that are NOT part of this repository — see the preflight check below.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_ARG="${1:-$ROOT/store/build}"

# The generator is a local authoring tool, not a vendored dependency. Its three scripts
# live outside this repository and are not redistributed here, so this script runs for
# whoever has them and fails clearly for everyone else rather than part-way through with a
# node stack trace. The committed PNGs in store/build/ are the actual deliverable; nobody
# needs to run this to build, test or release the extension.
SKILL="${CWS_SKILL:-$HOME/.claude/skills/chrome-webstore-screenshots}"
CAP="$SKILL/scripts/capture_ui.mjs"
RENDER="$SKILL/scripts/render.mjs"
VERIFY="$SKILL/scripts/verify_assets.mjs"

missing=()
for script in "$CAP" "$RENDER" "$VERIFY"; do
  [ -f "$script" ] || missing+=("$script")
done
if [ ${#missing[@]} -gt 0 ]; then
  cat >&2 <<EOF
make-store-assets: the asset generator is not available here.

Missing:
$(printf '  %s\n' "${missing[@]}")

These are not part of this repository. Set CWS_SKILL to the directory containing
scripts/{capture_ui,render,verify_assets}.mjs, or regenerate the set by hand — the
frames in store/frames/ are plain HTML and render at the sizes in
store/frames/manifest.json.

The eight PNGs in store/build/ are committed, so nothing about building, testing or
releasing the extension depends on this script.
EOF
  exit 1
fi

command -v node > /dev/null || { echo 'make-store-assets: node is not installed' >&2; exit 1; }
command -v magick > /dev/null || command -v convert > /dev/null || {
  echo 'make-store-assets: ImageMagick is not installed (need `magick` or `convert`)' >&2
  exit 1
}

cd "$ROOT"
# Rebuild first, always. Capturing a stale dist/ is how a listing ends up showing
# last release's UI, which the Program Policy calls out as out-of-date metadata.
# It also silently breaks the pinned tip indices below, because those depend on
# TIPS.length in the *running* bundle, not in src/.
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  pnpm build
fi
# Resolve OUT before comparing it to the default: a plain string compare treats
# "store/build", "./store/build" and a trailing slash as different directories, and the
# copy below then runs `cp x/*.png x/` and aborts the run under set -e.
mkdir -p "$OUT_ARG" store/captures
OUT="$(cd "$OUT_ARG" && pwd)"

echo "── capturing the real UI from dist/ ─────────────────────────────────"
# Element captures, not whole pages: the frames compose them at 1.9x with the
# page's own 32px gaps, which is the only way 14px UI text survives the store's
# downscale to 640x400. Capturing <header>/<form>/<section> separately also
# leaves out the "allow in Incognito" advisory, which is a property of this
# throwaway capture profile rather than of the extension.
for sel in header form section; do
  out=$([ "$sel" = section ] && echo list || echo "$sel")
  node "$CAP" --extension ./dist --page options.html \
    --seed store/demo/seed-list.js --selector "$sel" \
    --out "store/captures/ui-$out.png" --width 640 --height 700 --scale 2
done

# The confirm dialog only exists after the switch is moved to off. Its tip is
# pickTip(Date.now()), so the clock is frozen to keep the frame reproducible --
# see store/demo/pin-tip-dialog.js.
node "$CAP" --extension ./dist --page options.html \
  --seed store/demo/seed-list.js --init-script store/demo/pin-tip-dialog.js \
  --click 'button[role="switch"]' --wait 700 \
  --selector '[role="dialog"]' \
  --out store/captures/ui-dialog.png --width 640 --height 700 --scale 2

# The block page names a host only when it really matches the stored blocklist.
for n in reddit subdomain; do
  node "$CAP" --extension ./dist --page blocked.html \
    --seed "store/demo/seed-blocked-$n.js" --init-script store/demo/pin-tip-block.js \
    --selector main \
    --out "store/captures/ui-blocked-$n.png" --width 560 --height 430 --scale 2
done

echo "── rendering the canvases ───────────────────────────────────────────"
node "$RENDER" --batch store/frames/manifest.json
# render.mjs --batch writes the seven canvases into store/build; the icon needs its own pass
# for transparency. Both land in store/build first, and only then is the set mirrored --
# rendering into $OUT before the copy let `cp store/build/*.png` overwrite the fresh icon
# with the stale committed one, silently shipping last release's artwork.
node store/render_icon.mjs "$ROOT/store/build/store-icon-128.png"

if [ "$OUT" != "$ROOT/store/build" ]; then
  cp "$ROOT"/store/build/*.png "$OUT/"
fi

echo "── verifying against the store specs ────────────────────────────────"
node "$VERIFY" "$OUT"
