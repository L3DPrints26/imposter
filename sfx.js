/* UI sounds. The sounds are real-sounding recordings made by tools/make_sfx.py
   (a wood tap, a bubble pop, a card flick, a whoosh, a marimba "done", a drum
   and bell for the reveal), played through Web Audio so they start instantly.
   His ask (2026-11-16): good click sounds, not annoying beeps. A speaker
   button on the game menu turns them off; that's remembered. */
(function () {
  "use strict";
  const me = document.currentScript && document.currentScript.src || "";
  const base = me.replace(/sfx\.js(\?.*)?$/, "sfx/");
  const NAMES = ["tap", "pop", "flip", "whoosh", "done", "reveal", "toggle"];
  let ctx = null, loading = null, on = true;
  const bufs = {};
  try { on = localStorage.getItem("imp_sfx") !== "off"; } catch (_) {}

  function ac() {
    if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (A) ctx = new A(); }
    if (ctx && ctx.state !== "running") { try { ctx.resume(); } catch (_) {} }
    return ctx;
  }
  // Fetch every sound once. (The iPhone app serves its own files with fetch
  // status 0, so read the body whatever the status says.)
  function load() {
    if (loading) return loading;
    const c = ac();
    if (!c) return Promise.resolve();
    loading = Promise.all(NAMES.map(n => fetch(base + n + ".wav").then(r => r.arrayBuffer())
      .then(b => new Promise((res, rej) => c.decodeAudioData(b, res, rej)))
      .then(buf => { bufs[n] = buf; }).catch(() => {})));
    return loading;
  }
  function play(name, vol) {
    if (!on) return;
    const c = ac(), b = bufs[name];
    if (!c) return;
    if (!b) { load(); return; }
    const s = c.createBufferSource(), g = c.createGain();
    g.gain.value = vol == null ? 1 : vol;
    s.buffer = b; s.connect(g); g.connect(c.destination);
    s.start();
  }

  // The first touch unlocks audio on a phone; load the sounds then.
  document.addEventListener("pointerdown", e => {
    ac(); load();
    if (e.target.closest && e.target.closest(".hold, .peek")) play("flip");
  }, { capture: true, passive: true });

  // What a tap sounds like: the big moments get their own sound.
  const BIG = { start: "whoosh", "p-go": "whoosh", "mv-submit": "done", "p-mv": "done", "p-fv": "done", "mv-out": "done",
    "p-mv-out": "done", "mv-tagged": "done", "p-mv-tagged": "done", "custom-save": "done", "p-clue": "done",
    reveal: "reveal", "p-reveal-yes": "reveal", "timer-on": "toggle", sfx: "toggle" };
  document.addEventListener("click", e => {
    const el = e.target.closest && e.target.closest("button, a, summary, .opt");
    if (!el || el.disabled) return;
    const a = el.dataset && el.dataset.a;
    if (a && BIG[a]) return play(BIG[a]);
    if (el.matches(".hold, .peek")) return;
    if (el.matches(".opt, .chip, .gm, .seg2 button, .seg button, .sw, .tj")) return play("pop", 0.9);
    play("tap", 0.8);
  }, true);

  window.Sfx = {
    play,
    isOn: () => on,
    setOn(v) { on = !!v; try { localStorage.setItem("imp_sfx", on ? "on" : "off"); } catch (_) {} if (on) play("toggle"); }
  };
})();
