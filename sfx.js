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
  // Each kind of button has its own sound, and the same kind always sounds the
  // same (his call: "group them, don't change the sound each time you click").
  // A sound fired again within a moment is skipped.
  const lastAt = {};
  function play(name, vol, rate) {
    if (!on) return;
    const c = ac(), b = bufs[name];
    if (!c) return;
    if (!b) { load(); return; }
    const now = c.currentTime;
    if (lastAt[name] && now - lastAt[name] < 0.09) return;
    lastAt[name] = now;
    const s = c.createBufferSource(), g = c.createGain();
    s.playbackRate.value = rate || 1;
    g.gain.value = vol == null ? 1 : vol;
    s.buffer = b; s.connect(g); g.connect(c.destination);
    s.start();
  }

  // The first touch unlocks audio on a phone; load the sounds then.
  document.addEventListener("pointerdown", e => {
    ac(); load();
    if (e.target.closest && e.target.closest(".hold, .peek")) play("flip");
  }, { capture: true, passive: true });

  // The big moments get their own sound.
  const BIG = { start: "whoosh", "p-go": "whoosh", "mv-submit": "done", "p-mv": "done", "p-fv": "done", "mv-out": "done",
    "p-mv-out": "done", "mv-tagged": "done", "p-mv-tagged": "done", "custom-save": "done", "p-clue": "done",
    reveal: "reveal", "p-reveal-yes": "reveal", "timer-on": "toggle", sfx: "toggle" };
  // Button families -> [sound, pitch, volume]. First match wins. Back arrows,
  // links and small icons stay quiet.
  const GROUPS = [
    [".hold, .peek", null],
    [".opt, .chip, .seg2 button, .seg button, .tj", ["pop", 1, 0.85]],           // picking something
    [".sw", ["toggle", 1, 1]],                                                    // switches
    [".call", ["tap", 0.67, 1]],                                                  // meeting buttons: deep
    [".big, .gm, .mode", ["tap", 0.75, 0.9]],                                     // big game tiles: low
    [".step button", ["tap", 1.33, 0.7]],                                         // + and -: a light tick
    [".bar.ghost, .dk, .together, .livebar, .app, .av.add, .cta.ghost", ["tap", 0.89, 0.8]],  // second buttons
    [".bar, .tipbig, .cta, .aiform button", ["tap", 1, 0.8]],                    // main buttons
  ];
  document.addEventListener("click", e => {
    const el = e.target.closest && e.target.closest("button, a, .opt");
    if (!el || el.disabled) return;
    const a = el.dataset && el.dataset.a;
    if (a && BIG[a]) return play(BIG[a]);
    const g = GROUPS.find(([sel]) => el.matches(sel));
    if (g && g[1]) play(g[1][0], g[1][2], g[1][1]);
  }, true);

  window.Sfx = {
    play,
    isOn: () => on,
    setOn(v) { on = !!v; try { localStorage.setItem("imp_sfx", on ? "on" : "off"); } catch (_) {} if (on) play("toggle"); }
  };
})();
