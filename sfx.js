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

  /* One sound engine for the taps and the siren (siren.js asks ImpAudio.ctx()).
     Leaving the app and coming back used to leave it silent for good. Hopscraper
     hit the same thing; what it learned, all of it needed on iOS:
     - the app re-activates its audio session natively (AppDelegate.swift);
     - a context comes back "interrupted", and resume() from there only works
       inside a tap, so keep retrying for 3 s and also retry on the next tap;
     - sometimes it says "running" but its clock is frozen. The clock is the
       only honest signal, so a watchdog checks it, and a frozen one is thrown
       away and rebuilt (at most twice per incident: WebKit allows only a few).
     Never suspend it ourselves when the app hides. */
  let master = null, away = false, awayAt = 0;
  const make = () => {
    const A = window.AudioContext || window.webkitAudioContext;
    try { ctx = A ? new A() : null; } catch (_) { ctx = null; }
    master = null;
    if (ctx) { master = ctx.createGain(); master.gain.value = away ? 0 : 1; master.connect(ctx.destination); }
  };
  // Everything plays through here, so leaving can silence it all at once.
  const out = () => { ac(); return master || (ctx && ctx.destination); };
  function fadeTo(v, sec) {
    if (!ctx || !master) return;
    try { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(v, t + sec); }
    catch (_) { try { master.gain.value = v; } catch (__) {} }
  }
  // Called by the iPhone app the moment it's left or comes back (AppDelegate.swift).
  window.impAudioLeave = () => { away = true; awayAt = performance.now(); fadeTo(0, 0.01); };
  window.impAudioBack = () => { if (document.hidden) return; const was = away; away = false; fadeTo(1, 0.05); if (was && ctx) wake(0); };
  // It always comes back: iOS can say "leaving" (Control Center, a notification
  // pulled down) with no "back" after it. Any tap, or 3 s of being plainly on
  // screen, lifts the mute (Hopscraper's last net).
  ["pointerdown", "touchstart", "keydown"].forEach(e => addEventListener(e, () => { if (away) window.impAudioBack(); }, true));
  setInterval(() => { if (away && !document.hidden && performance.now() - awayAt > 3000) window.impAudioBack(); }, 1000);
  addEventListener("pagehide", () => window.impAudioLeave());
  function ac() {
    if (!ctx) make();
    if (ctx && ctx.state !== "running" && !document.hidden) { try { ctx.resume().catch(() => {}); } catch (_) {} }
    return ctx;
  }
  let rebuilds = 0, frozen = 0, wakeT = null, armed = false, gen = 0, wdLast = -1;
  const healthy = () => { rebuilds = 0; frozen = 0; };
  function rebuild() {
    if (rebuilds >= 2) return false;
    rebuilds++;
    try { if (ctx && ctx.close) ctx.close().catch(() => {}); } catch (_) {}
    ctx = null; make();
    return !!ctx;
  }
  const EV = ["pointerdown", "touchstart", "touchend", "mousedown", "keydown"];
  const onTap = () => wake(0, true);
  function arm() { if (armed) return; armed = true; EV.forEach(e => addEventListener(e, onTap, true)); }
  function disarm() { if (!armed) return; armed = false; EV.forEach(e => removeEventListener(e, onTap, true)); }
  function watch() {
    if (!ctx || document.hidden) return;
    const t0 = ctx.currentTime;
    setTimeout(() => {
      if (!ctx || document.hidden) return;
      if (ctx.currentTime - t0 > 0.005) { healthy(); disarm(); return; }
      if (++frozen > 2) return;
      if (ctx.state !== "running") return wake(0, true);
      if (rebuild()) watch();
    }, 600);
  }
  function wake(tries, tap) {
    if (!ctx) { make(); if (!ctx) return; }
    if (document.hidden) return;
    const t = tries || 0;
    watch();
    if (tap && t === 0 && ctx.state !== "running" && gen > 0 && rebuild()) { disarm(); return; }
    if (tap && ctx.state === "running" && frozen > 0 && rebuild()) { frozen = 0; disarm(); return; }
    try { ctx.resume().catch(() => {}); } catch (_) {}
    if (wakeT) { clearTimeout(wakeT); wakeT = null; }
    if (ctx.state === "running") return;
    arm();
    if (t < 12) { wakeT = setTimeout(() => wake(t + 1), 250); return; }
    gen++;
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) window.impAudioLeave(); else if (ctx) window.impAudioBack(); });
  addEventListener("pageshow", () => { if (ctx && !document.hidden) wake(0); });
  addEventListener("focus", () => { if (ctx && !document.hidden) wake(0); });
  addEventListener("blur", () => { if (ctx && !document.hidden) arm(); });     // iPad Home doesn't always send visibilitychange
  setInterval(() => {
    if (!ctx || document.hidden) { wdLast = -1; return; }
    let now = -1; try { now = ctx.currentTime; } catch (_) { return; }
    const was = wdLast; wdLast = now;
    if (was < 0) return;
    if (now - was > 0.005) { healthy(); return; }
    if (ctx.state !== "running") { wake(0); return; }
    if (rebuild()) wdLast = -1;
  }, 2000);
  window.ImpAudio = { ctx: ac, out };
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
    const now = performance.now() / 1000;
    if (lastAt[name] && now - lastAt[name] < 0.09) return;
    lastAt[name] = now;
    const s = c.createBufferSource(), g = c.createGain();
    s.playbackRate.value = rate || 1;
    g.gain.value = vol == null ? 1 : vol;
    s.buffer = b; s.connect(g); g.connect(out());
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
