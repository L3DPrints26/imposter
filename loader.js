/* Pocket Imposter loading screen.
   window.Loader.show(text, ms) / hide() / preview(text)
   One red imposter chases two gold crewmates around a fake-3D loop, drawn on a canvas.
   No libraries. Elements are created on the first show, and the animation stops when hidden. */
(function () {
  'use strict';
  if (window.Loader) return;

  var INK = '#14161C', TAU = Math.PI * 2;
  var GOLD = { body: '#FFC61A', shade: '#E8A400', limb: '#F7B40C', far: '#DE9A00' };
  var RED = { body: '#FF4436', shade: '#C9241A', limb: '#F23A2D', far: '#B81F16' };
  var W = 360, H = 212;                        // stage size in CSS px (shrinks on narrow screens)
  var CX = 180, CY = 126, RX = 130, RY = 50;   // the loop: a flattened ellipse = a circle seen at an angle
  var R = 32;                                  // body radius at the front; a runner is ~2.6R tall
  var OL = 0.1;                                // outline width, in body radii
  var LAP = 3.6;                               // seconds per lap
  var STRIDE = 8.5;                            // run cycles per lap, so the feet roughly match the ground
  // The cast. off = how far ahead of the imposter (radians), wob = gentle speed-up/slow-down.
  // rest = where each one stands when reduced motion is on (front centre + two behind, like the logo).
  var CAST = [
    { pal: RED, imp: true, off: 0, wob: 0.11, wf: 1.3, seed: 0, rest: Math.PI / 2 },
    { pal: GOLD, off: 1.2, wob: 0.05, wf: 1.7, seed: 2.1, rest: -Math.PI / 2 - 0.95 },
    { pal: GOLD, off: 2.45, wob: 0.06, wf: 1.1, seed: 4.4, rest: -Math.PI / 2 + 0.95 }
  ];

  // One runner per player, imposters in red (his ask). Just the host, or no
  // count given: the logo's two gold and one red. Big groups run smaller.
  var DEFAULT_CAST = CAST, SIZE = 1;
  function setCast(o) {
    var n = o && o.players | 0, k = o && o.imps | 0;
    if (!o || n < 3) { CAST = DEFAULT_CAST; SIZE = 1; return; }
    n = Math.min(15, n); k = Math.max(1, Math.min(n - 1, k || 1));
    var every = n / k, cast = [];
    for (var i = 0; i < n; i++) {
      var imp = Math.floor((i + 1) * k / n) > Math.floor(i * k / n);      // exactly k red, spread out
      var spread = Math.min(2.6, 0.32 * (n - 1));             // reduced motion: a row across the front
      cast.push({ pal: imp ? RED : GOLD, imp: imp, off: i * TAU / n, wob: 0.04 + 0.05 * ((i * 37) % 10) / 10,
        wf: 1.1 + (i % 5) * 0.15, seed: i * 1.7, rest: Math.PI / 2 + (i / Math.max(1, n - 1) - 0.5) * spread });
    }
    CAST = cast;
    SIZE = n <= 3 ? 1 : Math.max(0.56, 1 - (n - 3) * 0.04);
  }

  var el, cvs, ctx, label, raf = 0, last = 0, clock = 0, scale = 1;
  var state = 'off', hideT = 0, autoT = 0, waiters = [], text = 'Loading';
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function still() { return !!(mq && mq.matches); }

  var CSS =
    '#pi-loader{position:fixed;top:0;right:0;bottom:0;left:0;z-index:10000;display:none;flex-direction:column;' +
    'align-items:center;justify-content:center;opacity:0;transition:opacity .15s ease-out;touch-action:none;' +
    'overscroll-behavior:contain;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;' +
    '-webkit-tap-highlight-color:transparent;font-family:inherit;cursor:default}' +
    '#pi-loader.on{opacity:1}' +
    // The backdrop overhangs the screen so rubber-band scrolling and safe areas never show the page.
    '#pi-loader .bg{position:absolute;top:-120px;right:-120px;bottom:-120px;left:-120px;background:' +
    'radial-gradient(circle at 50% calc(50% - 18px),rgba(53,232,255,.17) 0,rgba(53,232,255,.07) 130px,rgba(53,232,255,0) 270px),' +
    'linear-gradient(rgba(255,255,255,.024) 1px,transparent 1px) 0 0/30px 30px,' +
    'linear-gradient(90deg,rgba(255,255,255,.024) 1px,transparent 1px) 0 0/30px 30px,#0A0B1D}' +
    '#pi-loader canvas{position:relative;display:block}' +
    '#pi-loader .tx{position:relative;margin-top:10px;padding:0 24px;color:#F2F4F8;font-family:inherit;font-size:20px;' +
    'font-weight:700;line-height:1.3;letter-spacing:.01em;text-align:center;white-space:nowrap}' +
    '#pi-loader .tx i{font-style:normal;opacity:.3;animation:piLdrDot 1.5s ease-in-out infinite}' +
    '#pi-loader .tx i:nth-child(3){animation-delay:.25s}#pi-loader .tx i:nth-child(4){animation-delay:.5s}' +
    '@keyframes piLdrDot{0%,70%,100%{opacity:.3}30%{opacity:1}}' +
    '@media (prefers-reduced-motion:reduce){#pi-loader .tx i{animation:none;opacity:.8}}';

  // ---------- DOM (built lazily on the first show) ----------
  function build() {
    if (el) return true;
    if (!document.body) return false;
    var st = document.createElement('style');
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
    el = document.createElement('div');
    el.id = 'pi-loader';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="bg"></div><canvas aria-hidden="true"></canvas>' +
      '<div class="tx"><span></span><i>.</i><i>.</i><i>.</i></div>';
    cvs = el.querySelector('canvas');
    ctx = cvs.getContext('2d');
    label = el.querySelector('span');
    // Swallow every tap, scroll and long-press so nothing underneath reacts.
    var swallow = function (e) { e.stopPropagation(); };
    var block = function (e) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); };
    'click dblclick mousedown mouseup pointerdown pointerup touchstart keydown'.split(' ').forEach(function (n) {
      el.addEventListener(n, swallow, false);
    });
    'touchmove touchend wheel contextmenu'.split(' ').forEach(function (n) {
      el.addEventListener(n, block, { passive: false });
    });
    window.addEventListener('resize', function () { if (state !== 'off') { fit(); draw(); } });
    document.body.appendChild(el);
    return true;
  }

  // Size the canvas for the screen width and pixel density so lines stay crisp.
  function fit() {
    var vw = Math.min(window.innerWidth || W, document.documentElement.clientWidth || W);
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    scale = Math.min(1, (vw - 20) / W);
    cvs.style.width = W * scale + 'px';
    cvs.style.height = H * scale + 'px';
    cvs.width = Math.round(W * scale * dpr);
    cvs.height = Math.round(H * scale * dpr);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.lineCap = ctx.lineJoin = 'round';
  }

  // ---------- drawing helpers (all in body-radius units after scaling) ----------
  function ell(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, Math.max(rx, 0.001), Math.max(ry, 0.001), rot || 0, 0, TAU); }

  // A leg: thick rounded stroke plus a boot-shaped foot. Outlines are drawn first, fills on top,
  // so the leg and foot merge into one clean outlined shape.
  function leg(c, hx, hy, fx, fy, fwd, col) {
    var tx = fx + fwd * 0.1;
    c.beginPath(); c.moveTo(hx, hy); c.lineTo(fx, fy - 0.08);
    c.lineWidth = 0.36 + OL * 2; c.strokeStyle = INK; c.stroke();
    ell(c, tx, fy, 0.25 + OL, 0.15 + OL); c.fillStyle = INK; c.fill();
    c.beginPath(); c.moveTo(hx, hy); c.lineTo(fx, fy - 0.08);
    c.lineWidth = 0.36; c.strokeStyle = col; c.stroke();
    ell(c, tx, fy, 0.25, 0.15); c.fillStyle = col; c.fill();
  }

  // A stubby arm from shoulder to a round mitten hand, outlined the same way.
  function arm(c, sx, sy, hx, hy, col) {
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(hx, hy);
    c.lineWidth = 0.24 + OL * 2; c.strokeStyle = INK; c.stroke();
    ell(c, hx, hy, 0.15 + OL, 0.15 + OL); c.fillStyle = INK; c.fill();
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(hx, hy);
    c.lineWidth = 0.24; c.strokeStyle = col; c.stroke();
    ell(c, hx, hy, 0.15, 0.15); c.fillStyle = col; c.fill();
  }

  // Round body: shade colour underneath, lit colour offset up-left (leaves a shaded crescent
  // at the bottom), a soft gloss highlight, then the thick outline.
  function body(c, pal) {
    ell(c, 0, 0, 1, 1); c.fillStyle = pal.shade; c.fill();
    c.save(); c.clip();
    ell(c, -0.07, -0.17, 0.99, 0.93); c.fillStyle = pal.body; c.fill();
    ell(c, -0.42, -0.56, 0.25, 0.13, -0.75); c.fillStyle = 'rgba(255,255,255,.28)'; c.fill();
    c.restore();
    ell(c, 0, 0, 1, 1); c.lineWidth = OL; c.strokeStyle = INK; c.stroke();
  }

  // Gold face. Running: wide worried eyes glancing back + open grin. Standing: the logo's happy closed eyes.
  function goldFace(c, fx, k, turn, run) {
    for (var sgn = -1; sgn <= 1; sgn += 2) {
      var far = Math.max(0, sgn * turn), es = 1 - 0.2 * far;   // the eye on the far side is narrower
      var ex = fx + sgn * (0.3 - 0.07 * far) * k, ey = -0.14;
      if (run < 0.5) {                                        // happy closed eyes, like the logo
        c.beginPath(); c.arc(ex, ey + 0.06, 0.13 * es, Math.PI * 1.05, Math.PI * 1.95);
        c.lineWidth = 0.09; c.strokeStyle = INK; c.stroke();
        continue;
      }
      ell(c, ex, ey, 0.16 * es, 0.21); c.fillStyle = '#fff'; c.fill();
      c.lineWidth = 0.065; c.strokeStyle = INK; c.stroke();
      var px = ex - turn * 0.055 * es, py = ey + 0.015;        // pupils look back at the chaser
      ell(c, px, py, 0.085 * es, 0.095); c.fillStyle = INK; c.fill();
      ell(c, px - 0.025, py - 0.035, 0.028, 0.028); c.fillStyle = '#fff'; c.fill();
      c.beginPath();                                          // worried brow: inner end raised
      c.moveTo(ex + sgn * 0.14 * es, ey - 0.28);
      c.quadraticCurveTo(ex, ey - 0.37, ex - sgn * 0.1 * es, ey - 0.4);
      c.lineWidth = 0.07; c.stroke();
    }
    var mx = fx * 1.12, my = 0.24, mw = 0.33 * k, open = run < 0.5 ? 0.36 : 0.4;
    function grin() {                                         // D-shaped open grin
      c.beginPath(); c.moveTo(mx - mw, my - 0.04);
      c.quadraticCurveTo(mx, my + 0.04, mx + mw, my - 0.04);
      c.bezierCurveTo(mx + mw * 0.95, my + open, mx - mw * 0.95, my + open, mx - mw, my - 0.04);
      c.closePath();
    }
    grin(); c.fillStyle = INK; c.fill();
    c.save(); c.clip();
    ell(c, mx + 0.03 * k, my + open * 0.8, mw * 0.6, 0.13); c.fillStyle = '#F28A12'; c.fill();
    c.restore();
    grin(); c.lineWidth = 0.05; c.strokeStyle = INK; c.stroke();
  }

  // Red face: eyes cut flat by angled brows (sneaky), pupils locked on the prey, lopsided grin.
  function redFace(c, fx, k, turn, look) {
    for (var sgn = -1; sgn <= 1; sgn += 2) {
      var far = Math.max(0, sgn * turn), es = 1 - 0.2 * far;
      var ex = fx + sgn * (0.31 - 0.07 * far) * k, ey = -0.12;
      var ox = ex + sgn * 0.27 * es, oy = ey - 0.2;           // brow: outer end high...
      var ix = ex - sgn * 0.17 * es, iy = ey - 0.03;          // ...inner end low
      c.save();
      c.beginPath(); c.moveTo(ox + sgn * 0.2, oy - 0.07 * 1); c.lineTo(ix - sgn * 0.2, iy + 0.1);
      c.lineTo(ix - sgn * 0.2, ey + 1); c.lineTo(ox + sgn * 0.2, ey + 1); c.closePath(); c.clip();
      ell(c, ex, ey, 0.2 * es, 0.2); c.fillStyle = '#fff'; c.fill();
      c.save(); c.clip();
      ell(c, ex + look * 0.08 * es, ey + 0.06, 0.09 * es, 0.095); c.fillStyle = INK; c.fill();
      c.restore();
      ell(c, ex, ey, 0.2 * es, 0.2); c.lineWidth = 0.065; c.strokeStyle = INK; c.stroke();
      c.restore();
      c.beginPath(); c.moveTo(ox, oy); c.lineTo(ix, iy);
      c.lineWidth = 0.11; c.strokeStyle = INK; c.stroke();
    }
    var d = look, mx = fx * 1.12 + d * 0.05, my = 0.3, mw = 0.31 * k;
    var lx = mx - mw, ly = my + 0.07 * d, rx = mx + mw, ry = my - 0.09 * d;   // the forward corner rides up
    function grin() {                                         // crescent grin
      c.beginPath(); c.moveTo(lx, ly);
      c.quadraticCurveTo(mx - 0.04 * d, my + 0.15, rx, ry);
      c.quadraticCurveTo(mx + 0.06 * d, my + 0.5, lx, ly);
      c.closePath();
    }
    grin(); c.fillStyle = INK; c.fill();
    c.save(); c.clip();                                       // teeth fill the top of the grin
    c.beginPath(); c.moveTo(lx - 0.2, ly - 0.3); c.lineTo(rx + 0.2, ry - 0.3);
    c.lineTo(rx + 0.2, ry + 0.03); c.quadraticCurveTo(mx + 0.02 * d, my + 0.33, lx - 0.2, ly + 0.03);
    c.closePath(); c.fillStyle = '#F4F4F6'; c.fill();
    c.restore();
    grin(); c.lineWidth = 0.06; c.strokeStyle = INK; c.stroke();
  }

  // ---------- one runner ----------
  // turn: -1 facing left .. 0 facing us .. 1 facing right. p: run-cycle phase. run: 1 running, 0 standing.
  function runner(c, r) {
    var pal = r.c.pal, turn = r.turn, run = r.run, p = r.p;
    var ang = turn * 0.75, ca = Math.cos(ang), sa = Math.sin(ang);
    var u = run * Math.pow(Math.sin(p), 2);                   // 0 mid-stance .. 1 full stride
    var lift = run * 0.13 * u + r.idle;                       // body bob
    var sx = 1 + run * (0.04 - 0.07 * u), sy = 1 - run * (0.05 - 0.09 * u);  // squash on landing, stretch in the air
    c.save();
    c.translate(r.x, r.y); c.scale(r.s * R, r.s * R);
    // Legs (behind the body). Same-side arm swings against its leg.
    var limbs = [];
    for (var sgn = -1; sgn <= 1; sgn += 2) {
      var ph = p + (sgn > 0 ? Math.PI : 0), sw = Math.sin(ph);
      limbs.push({ sgn: sgn, sw: sw, far: sgn * turn > 0.12, up: run * 0.3 * Math.max(0, Math.cos(ph)) });
    }
    limbs.sort(function (a, b) { return (b.far ? 1 : 0) - (a.far ? 1 : 0); });
    limbs.forEach(function (L) {
      var hx = L.sgn * 0.34 * ca, fx = hx * 1.12 + sa * L.sw * 0.62 * run;
      leg(c, hx, -0.9 - lift, fx, -0.16 - L.up, sa * 0.9 + L.sgn * 0.25 * ca, L.far ? pal.far : pal.limb);
    });
    // Body frame: pivot at the bottom of the body, lean into the run, squash, centre at the origin.
    c.translate(0, -0.6 - lift); c.rotate(0.13 * turn * run); c.scale(sx, sy); c.translate(0, -1);
    // Arms swing like pendulums from the shoulder, against the leg on the same side.
    // Shoulders stay near the sides (a cartoon cheat) so the arms always read against the body edge.
    function armOf(L) {
      var cs = Math.cos(turn * 0.5), ax = L.sgn * 0.84 * cs, a = L.sgn * 0.55 * cs - turn * L.sw * 0.8 * run;
      arm(c, ax, 0.24, ax + Math.sin(a) * 0.46, 0.24 + Math.cos(a) * 0.46, L.far ? pal.far : pal.limb);
    }
    limbs.forEach(function (L) { if (L.far) armOf(L); });
    body(c, pal);
    var fx = 0.4 * turn, k = 1 - 0.22 * Math.abs(turn);   // face slides toward where they run
    if (r.c.imp) redFace(c, fx, k, turn, r.look); else goldFace(c, fx, k, turn, run);
    limbs.forEach(function (L) { if (!L.far) armOf(L); });
    c.restore();
  }

  // Soft oval shadow on the ground; it shrinks a little while the runner is in the air.
  function shadow(c, r) {
    var u = r.run * Math.pow(Math.sin(r.p), 2), rx = R * r.s * (1.02 - 0.2 * u);
    c.save(); c.translate(r.x, r.y); c.scale(1, 0.3);
    var g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, 'rgba(2,3,14,.6)'); g.addColorStop(0.6, 'rgba(2,3,14,.35)'); g.addColorStop(1, 'rgba(2,3,14,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill();
    c.restore();
  }

  // The floor: a faint cyan disc with a thin track ring where they run.
  function floor(c) {
    c.save(); c.translate(CX, CY); c.scale(1, RY / RX);
    var g = c.createRadialGradient(0, 0, 0, 0, 0, RX + 40);
    g.addColorStop(0, 'rgba(53,232,255,.10)'); g.addColorStop(0.75, 'rgba(53,232,255,.05)'); g.addColorStop(1, 'rgba(53,232,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, RX + 40, 0, TAU); c.fill();
    c.restore();
    ell(c, CX, CY, RX, RY); c.lineWidth = 2; c.strokeStyle = 'rgba(53,232,255,.16)'; c.stroke();
  }

  // ---------- one frame ----------
  function draw() {
    if (!ctx) return;
    var t = clock, calm = still(), w = TAU / LAP, list = [];
    ctx.clearRect(0, 0, W, H);
    floor(ctx);
    CAST.forEach(function (c) {
      var th, r = { c: c, run: calm ? 0 : 1, idle: 0, p: 0, turn: 0, look: c.imp && calm ? 0.8 : 0 };
      if (calm) {
        th = c.rest;
        r.idle = 0.03 * (1 - Math.cos(t * 2.2 + c.seed));     // slow, tiny breathing bob
      } else {
        // Angle decreases over time, so the front of the loop runs left-to-right.
        // Starts at 2.9 rad (imposter at the left end) so the first frame shows all three spread out.
        th = 2.9 - t * w - c.off + c.wob * Math.sin(t * c.wf + c.seed);
        r.turn = Math.tanh(2.4 * Math.sin(th)) / Math.tanh(2.4);   // screen-x direction, eased at the ends
        r.p = -th * STRIDE + c.seed;                          // stride follows distance travelled
        if (c.imp) r.look = Math.max(-1, Math.min(1, r.turn * 2.5));
      }
      r.z = Math.sin(th);                                     // +1 nearest the viewer, -1 farthest
      r.s = (0.84 + 0.08 * (r.z + 1)) * SIZE;                 // far = smaller
      r.x = CX + RX * Math.cos(th);
      r.y = CY + RY * r.z;
      list.push(r);
    });
    list.sort(function (a, b) { return a.z - b.z; });        // painter's order: back first
    list.forEach(function (r) { shadow(ctx, r); });
    list.forEach(function (r) { runner(ctx, r); });
  }

  function tick(now) {
    raf = 0;
    if (state === 'off') return;
    clock += last ? Math.min(now - last, 50) / 1000 : 0;     // clamp so a paused tab doesn't jump
    last = now;
    draw();
    raf = requestAnimationFrame(tick);
  }

  // ---------- show / hide ----------
  function setText(t) {
    if (t != null) text = String(t).replace(/\s*(\.{1,3}|\u2026)\s*$/, '');   // we draw our own dots
    if (label) label.textContent = text;
  }

  function appear() {
    if (!build()) return;                                     // no body yet: DOMContentLoaded retries
    setText();
    if (el.style.display !== 'flex') {
      el.style.display = 'flex';
      fit(); draw();
      void el.offsetWidth;                                    // commit opacity 0 before fading in
    }
    el.style.transitionDuration = '.15s';
    el.classList.add('on');
    if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
  }

  function done() {
    hideT = 0; state = 'off';
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (el) { el.style.display = 'none'; el.classList.remove('on'); }
    var w = waiters; waiters = [];
    w.forEach(function (fn) { fn(); });
  }

  function show(t, ms, cast) {
    if (state === 'off' || cast) setCast(cast);
    setText(t);
    if (hideT) { clearTimeout(hideT); hideT = 0; }            // cancel a fade-out in progress
    if (state === 'off') clock = 0;
    state = 'on';
    appear();
    if (ms == null) return Promise.resolve();
    clearTimeout(autoT);
    autoT = setTimeout(hide, Math.max(0, +ms || 0));
    return new Promise(function (res) { waiters.push(res); });
  }

  function hide() {
    clearTimeout(autoT); autoT = 0;
    if (state === 'off') return Promise.resolve();
    var p = new Promise(function (res) { waiters.push(res); });
    if (state !== 'hiding') {
      state = 'hiding';
      if (!el || el.style.display !== 'flex') done();
      else {
        el.style.transitionDuration = '.25s';
        el.classList.remove('on');
        hideT = setTimeout(done, 260);                        // timer, not transitionend: always fires
      }
    }
    return p;
  }

  // Called before the page body exists? Finish mounting once it does.
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', function () { if (state === 'on') appear(); });
  }

  window.Loader = {
    show: show,
    hide: hide,
    preview: function (t, cast) { clearTimeout(autoT); autoT = 0; return show(t, null, cast); }
  };
})();
