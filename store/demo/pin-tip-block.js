// Freeze the clock so the block-page frame always shows the same study.
//
// blocked/main.ts calls pickTip(Date.now()), and pickTip indexes TIPS by
// `seed % TIPS.length` (38 entries). Left alone, every regeneration of the
// store assets would swap in a different citation, so the committed PNGs would
// stop matching what `pnpm store:assets` produces.
//
// 1767225600015 % 38 === 19 -> Albulescu et al., PLOS ONE, 2022.
// Injected via capture_ui.mjs --init-script, which runs before page scripts on
// every navigation and therefore survives the post-seed reload.
//
// Adding or removing a tip shifts every index: if this frame changes citation
// unexpectedly, recompute the epoch rather than editing the captured pixels.
;(() => {
  const FROZEN = 1767225600015
  const RealDate = Date
  const Frozen = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [FROZEN]))
    }
    static now() {
      return FROZEN
    }
  }
  Frozen.parse = RealDate.parse
  Frozen.UTC = RealDate.UTC
  globalThis.Date = Frozen
})()
