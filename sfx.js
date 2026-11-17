/* UI sounds: soft marimba, kalimba and water-drop sounds made by
   tools/make_soft_sfx.py (he picked this set 2026-11-16 over made-up beeps and
   over stock UI blips). Played through Web Audio so they start instantly. A
   speaker button on the game menu turns them off; that's remembered. */
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
  // Not the same sound over and over: taps and pops land on a different note
  // of the same scale each time (never the same one twice in a row), and the
  // same sound fired again within a moment is skipped.
  const STEPS = [1, 1.125, 1.25, 1.5, 0.889];      // a major-pentatonic handful
  const lastStep = {}, lastAt = {};
  function play(name, vol, vary) {
    if (!on) return;
    const c = ac(), b = bufs[name];
    if (!c) return;
    if (!b) { load(); return; }
    const now = c.currentTime;
    if (lastAt[name] && now - lastAt[name] < 0.09) return;
    lastAt[name] = now;
    const s = c.createBufferSource(), g = c.createGain();
    if (vary) {
      let k;
      do { k = Math.floor(Math.random() * STEPS.length); } while (k === lastStep[name] && STEPS.length > 1);
      lastStep[name] = k;
      s.playbackRate.value = STEPS[k];
    }
    g.gain.value = vol == null ? 1 : vol;
    s.buffer = b; s.connect(g); g.connect(c.destination);
    s.start();
  }

  // The first touch unlocks audio on a phone; load the sounds then.
  document.addEventListener("pointerdown", e => {
    ac(); load();
    if (e.target.closest && e.target.closest(".hold, .peek")) play("flip");
  }, { capture: true, passive: true });

  // Only real actions make a sound; back arrows, links and small icons stay quiet.
  const BIG = { start: "whoosh", "p-go": "whoosh", "mv-submit": "done", "p-mv": "done", "p-fv": "done", "mv-out": "done",
    "p-mv-out": "done", "mv-tagged": "done", "p-mv-tagged": "done", "custom-save": "done", "p-clue": "done",
    reveal: "reveal", "p-reveal-yes": "reveal", "timer-on": "toggle", sfx: "toggle" };
  const PICK = ".opt, .chip, .gm, .seg2 button, .seg button, .sw, .tj";
  const ACTION = ".bar, .big, .call, .together, .dk, .step button, .app, .av.add, .tipbig, .livebar, .cta, .mode, .aiform button";
  document.addEventListener("click", e => {
    const el = e.target.closest && e.target.closest("button, a, .opt");
    if (!el || el.disabled) return;
    const a = el.dataset && el.dataset.a;
    if (a && BIG[a]) return play(BIG[a]);
    if (el.matches(".hold, .peek")) return;
    if (el.matches(PICK)) return play("pop", 0.85, true);
    if (el.matches(ACTION)) play("tap", 0.8, true);
  }, true);

  window.Sfx = {
    play,
    isOn: () => on,
    setOn(v) { on = !!v; try { localStorage.setItem("imp_sfx", on ? "on" : "off"); } catch (_) {} if (on) play("toggle"); }
  };
})();
