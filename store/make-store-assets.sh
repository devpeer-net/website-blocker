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
#
# Requires: playwright (in node_modules), ImageMagick.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/store/build}"
SKILL="${CWS_SKILL:-$HOME/.claude/skills/chrome-webstore-screenshots}"
CAP="$SKILL/scripts/capture_ui.mjs"
RENDER="$SKILL/scripts/render.mjs"
VERIFY="$SKILL/scripts/verify_assets.mjs"

cd "$ROOT"
# Rebuild first, always. Capturing a stale dist/ is how a listing ends up showing
# last release's UI, which the Program Policy calls out as out-of-date metadata.
# It also silently breaks the pinned tip indices below, because those depend on
# TIPS.length in the *running* bundle, not in src/.
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  pnpm build
fi
mkdir -p "$OUT" store/captures

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
node store/render_icon.mjs "$OUT/store-icon-128.png"

if [ "$OUT" != "$ROOT/store/build" ]; then
  cp store/build/*.png "$OUT/"
fi

echo "── verifying against the store specs ────────────────────────────────"
node "$VERIFY" "$OUT"
