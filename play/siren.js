/* The meeting siren: a tornado-warning style wail, made on the spot with Web
   Audio (no recording, so nothing to license). Two detuned saws a minor third
   apart, like the two-tone outdoor sirens, swept up, held while the "horn"
   rotates past (a slow swell in volume), then wound down. About 8 seconds.

   Phones only play sound after a tap, so unlock() runs on every tap; by the
   time a meeting is called from someone else's phone the audio is already
   allowed on this one. */
(function () {
  "use strict";
  let ctx = null, live = null, flashTimer = null;

  /* While the siren sounds, the whole screen pulses into its opposite colors
     under a red glow, and back (his ask, 2026-11-16). Under one flash a second,
     well below the 3-a-second limit for flashing content; a steady red tint
     instead when the phone asks for reduced motion. "Stop the siren" only
     shows while it's going. */
  const FLASH_CSS = `
.sirenflash{position:fixed;inset:0;z-index:9000;pointer-events:none;opacity:0;mix-blend-mode:difference;
  background:radial-gradient(120% 90% at 50% 35%,#FF3B2B 0%,#E01408 55%,#9A0000 100%)}
.siren-on .sirenflash{animation:sirenpulse .6s ease-in-out infinite alternate}
@keyframes sirenpulse{from{opacity:0}to{opacity:.88}}
html:not(.siren-on) [data-a="hush"],html:not(.siren-on) [data-a="p-hush"]{visibility:hidden;pointer-events:none}
@media (prefers-reduced-motion:reduce){.siren-on .sirenflash{animation:none;opacity:.3;mix-blend-mode:normal}}`;
  function flash(on) {
    if (on && !document.querySelector(".sirenflash")) {
      const st = document.createElement("style"); st.textContent = FLASH_CSS; document.head.appendChild(st);
      const d = document.createElement("div"); d.className = "sirenflash"; d.setAttribute("aria-hidden", "true");
      document.body.appendChild(d);
    }
    document.documentElement.classList.toggle("siren-on", on);
    if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
  }

  function unlock() {
    try {
      // (The siren switches the phone to "play even on silent" only while it
      // sounds; see play(). Everyday taps follow the silent switch.)
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Safari says "interrupted" after a lock or a call, not "suspended".
      if (ctx.state !== "running") ctx.resume();
    } catch (_) {}
  }
  document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  document.addEventListener("keydown", unlock, { capture: true });

  function stop() {
    flash(false);
    setLoud(false);
    try { if (navigator.vibrate) navigator.vibrate(0); } catch (_) {}
    if (!live) return;
    const { nodes, out } = live;
    live = null;
    try {
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 0.15);
      setTimeout(() => nodes.forEach(n => { try { n.stop(); } catch (_) {} }), 250);
    } catch (_) {}
  }

  function setLoud(on) {
    try { if (navigator.audioSession) navigator.audioSession.type = on ? "playback" : "auto"; } catch (_) {}
  }
  function play(seconds) {
    unlock();
    if (!ctx) return;
    stop();
    setLoud(true);                      // iPhone: the siren plays even on silent (after stop(), which turns it off)
    const T = Math.max(3, seconds || 8);
    const t0 = ctx.currentTime + 0.05;
    const up = Math.min(2.4, T * 0.3), down = Math.min(1.8, T * 0.22), hold = T - up - down;
    const lo = 140, hi = 560;                       // the wind-up and the wail

    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(0.55, t0 + up * 0.6);
    out.gain.setValueAtTime(0.55, t0 + up + hold);
    out.gain.linearRampToValueAtTime(0, t0 + T);
    // a little grit, then take the fizz off the top
    const shape = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(2.2 * x); }
    shape.curve = curve;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 2600; lp.Q.value = 0.7;
    // the horn turning past you: volume swells about once every 2.5 seconds
    const rot = ctx.createGain();
    rot.gain.value = 0.75;
    const lfo = ctx.createOscillator(), lfoAmt = ctx.createGain();
    lfo.frequency.value = 0.4; lfoAmt.gain.value = 0.25;
    lfo.connect(lfoAmt); lfoAmt.connect(rot.gain);
    rot.connect(shape); shape.connect(lp); lp.connect(out); out.connect(ctx.destination);

    const nodes = [lfo];
    [1, 1.2].forEach((ratio, k) => {                // root and minor third
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sawtooth";
      o.detune.value = k ? 6 : -4;
      const f = o.frequency;
      f.setValueAtTime(lo * ratio, t0);
      f.exponentialRampToValueAtTime(hi * ratio, t0 + up);
      f.setValueAtTime(hi * ratio, t0 + up + hold);
      f.exponentialRampToValueAtTime(lo * ratio * 0.9, t0 + T);
      g.gain.value = 0.32;
      o.connect(g); g.connect(rot);
      o.start(t0); o.stop(t0 + T + 0.1);
      nodes.push(o);
    });
    lfo.start(t0); lfo.stop(t0 + T + 0.1);
    live = { nodes, out };
    setTimeout(() => { if (live && live.out === out) live = null; }, (T + 0.3) * 1000);
    flash(true);
    flashTimer = setTimeout(() => { flash(false); setLoud(false); }, (T + 0.05) * 1000);
    if (typeof buzz === "function") { buzz("heavy"); setTimeout(() => buzz("heavy"), 500); }
    else if (navigator.vibrate) navigator.vibrate([600, 200, 600, 200, 600]);
  }

  window.Siren = { play, stop, unlock };
})();
