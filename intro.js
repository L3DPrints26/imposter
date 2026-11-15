/* The GamerCrafter studio intro, ported from Hopscraper (Hopscraper.html, "STUDIO INTRO").
   Plays once each time the iPhone app opens: a 3D controller whooshes past, swings
   back and slams into place, GAMERCRAFTER waves out letter by letter, "A GAME BY"
   pops in, a shine sweeps it, then it fades into the app. Tap to skip.

   Same timeline, shape and sounds as Hopscraper; only the layout changed, from a
   960x540 landscape screen to an upright phone (everything is placed relative to
   the middle of the screen instead of fixed rows). The app is allowed to play
   sound without a tap (Capacitor turns autoplay on), so it has its sounds there.

   Only the app build includes this file (ios-app/scripts/build-web.js). */
(function () {
  "use strict";
  try { if (sessionStorage.getItem("gcIntro")) return; sessionStorage.setItem("gcIntro", "1"); } catch (_) {}

  const VW = 600;                                   // logical width; height follows the screen
  let VH = 1200, CY = 600;
  const Y = v => v - 270 + CY;                      // Hopscraper's rows, re-centred
  const F = 600, NAME = "GAMERCRAFTER";
  const FONT = '800 58px "Helvetica Neue","Segoe UI",Arial,sans-serif';
  const SUBFONT = 'bold 16px -apple-system,"Segoe UI",Arial,sans-serif';
  const TA0 = 0.25, TA1 = 1.02, TB0 = 1.1, TI = 1.52, TL = 1.66, LS = 0.052, LD = 0.26, TW = 2.5, TU = 2.52, TG = 2.72, TSC = 2.95, TS = 3.05, TH = 4.15, TE = 4.5;
  const PENT = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
  const RM = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } })();

  // ---- the page
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:fixed;inset:0;z-index:9999;background:#07121a;transition:opacity .35s;touch-action:none";
  const cv = document.createElement("canvas");
  cv.style.cssText = "width:100%;height:100%;display:block";
  wrap.appendChild(cv);
  document.documentElement.appendChild(wrap);
  const ctx = cv.getContext("2d");
  function fit() {
    const w = innerWidth, h = innerHeight, d = Math.min(3, devicePixelRatio || 1);
    if (!w || !h) return;                           // not laid out yet; the next frame tries again
    cv.width = Math.round(w * d); cv.height = Math.round(h * d);
    VH = VW * h / w; CY = VH / 2;
  }
  fit(); addEventListener("resize", fit);

  // controller silhouette (body + both bumpers), traced from the GamerCrafter controller logo
  const SHAPE = (() => { const p = new Path2D();
    p.moveTo(0,-68.3);p.quadraticCurveTo(21.7,-67.9,38.3,-65.2);p.lineTo(43.8,-63.5);p.lineTo(73.7,-58.3);p.quadraticCurveTo(80.4,-56.3,83.3,-51.9);
    p.bezierCurveTo(94.8,-31.7,104.4,6.7,107.3,37.5);p.bezierCurveTo(108.3,56.7,96.7,69.2,83.3,69.8);p.quadraticCurveTo(79.4,69.6,77.5,66.7);
    p.bezierCurveTo(69.8,54.8,58.3,26,48.7,18.7);p.quadraticCurveTo(45.2,16.7,41.9,16.7);p.quadraticCurveTo(31.3,20.2,21.7,15.6);p.lineTo(0,15.2);
    p.lineTo(-21.7,15.6);p.quadraticCurveTo(-31.3,20.2,-41.9,16.7);p.quadraticCurveTo(-45.2,16.7,-48.7,18.7);p.bezierCurveTo(-58.3,26,-69.8,54.8,-77.5,66.7);
    p.quadraticCurveTo(-79.4,69.6,-83.3,69.8);p.bezierCurveTo(-96.7,69.2,-108.3,56.7,-107.3,37.5);p.bezierCurveTo(-104.4,6.7,-94.8,-31.7,-83.3,-51.9);
    p.quadraticCurveTo(-80.4,-56.3,-73.7,-58.3);p.lineTo(-43.8,-63.5);p.lineTo(-38.3,-65.2);p.quadraticCurveTo(-21.7,-67.9,0,-68.3);p.closePath();
    for (const s of [1, -1]) { p.moveTo(49*s,-65.6);p.quadraticCurveTo(50*s,-70.2,55*s,-70.3);p.quadraticCurveTo(70*s,-69,76.5*s,-64.5);p.quadraticCurveTo(78.6*s,-62.6,77*s,-60.6);
      p.lineTo(50.6*s,-64.6);p.quadraticCurveTo(48.8*s,-64.8,49*s,-65.6);p.closePath(); }
    return p; })();
  let FACEG = null, NB = null, ST = [], SP = [];
  function details() { const D = "#14212a"; ctx.fillStyle = D; ctx.strokeStyle = D; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-40.6,-63);ctx.lineTo(-33.4,-31);ctx.quadraticCurveTo(-31,-22.5,-22,-22.5);ctx.lineTo(22,-22.5);ctx.quadraticCurveTo(31,-22.5,33.4,-31);ctx.lineTo(40.6,-63);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-46,-56.5);ctx.lineTo(-44.6,-50.8);ctx.moveTo(46,-56.5);ctx.lineTo(44.6,-50.8);ctx.stroke();
    for(let r=0;r<4;r++){ctx.save();ctx.translate(-64.2,-29.8);ctx.rotate(r*Math.PI/2);ctx.beginPath();ctx.moveTo(-5.2,-16.2);ctx.quadraticCurveTo(-5.2,-18,0,-18);ctx.quadraticCurveTo(5.2,-18,5.2,-16.2);
      ctx.lineTo(5.2,-7.7);ctx.lineTo(0,-2.7);ctx.lineTo(-5.2,-7.7);ctx.closePath();ctx.fill();ctx.restore()}
    for(const[x,y]of[[64.6,-44.6],[50.2,-30.2],[78.8,-30.2],[64.6,-16.3]]){ctx.beginPath();ctx.arc(x,y,6.9,0,Math.PI*2);ctx.fill()}
    for(const x of[-36.5,36.5]){ctx.fillStyle=D;ctx.beginPath();ctx.arc(x,-1.5,15.8,0,Math.PI*2);ctx.fill();ctx.fillStyle=FACEG;ctx.beginPath();ctx.arc(x,-1.5,12.4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=D;ctx.beginPath();ctx.arc(x,-1.5,9.8,0,Math.PI*2);ctx.fill()}
    for(const[x,y]of[[-6.5,-16.9],[-2.2,-16.9],[2.2,-16.9],[6.5,-16.9],[-4.3,-13],[0,-13],[4.3,-13]]){ctx.beginPath();ctx.arc(x,y,1.35,0,Math.PI*2);ctx.fill()}
    ctx.lineWidth=4.2;ctx.beginPath();ctx.moveTo(-5.2,1);ctx.lineTo(5.2,1);ctx.stroke(); }
  const ease = k => 1 - Math.pow(1 - k, 3);
  function rot(yaw, pitch, roll) { const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
    const ap=(x,y,z)=>{const y1=y*cp-z*sp,z1=y*sp+z*cp;return[x*cy+z1*sy,y1,-x*sy+z1*cy]};
    return{ex:ap(cr,sr,0),ey:ap(-sr,cr,0),n:ap(0,0,1)}; }
  function pose(t) {
    if(t<TA0)return null;
    if(t<TA1){const u=(t-TA0)/(TA1-TA0),e=Math.pow(u,2.3),iz=1/3200+(1/50-1/3200)*e;
      return{X:-240+380*e,Y:-130+190*e,Z:1/iz,yaw:-0.35+0.9*e,pitch:0.15*Math.sin(u*Math.PI),roll:0.35-0.7*e,sz:1}}
    if(t<TB0)return null;
    if(t<TI){const u=(t-TB0)/(TI-TB0),e=u*u,k=1-e,k2=k*k,iz=1/2600+(1/F-1/2600)*e;
      return{X:-700*Math.pow(k,1.3),Y:-70-420*k2,Z:1/iz,yaw:-1.1*k2,pitch:0.2*k2,roll:0.45*k2,sz:1}}
    const a=t-TI,s=1-Math.exp(-2*a);
    return{X:0,Y:-70+3*Math.sin(a*2.2)*s,Z:F,yaw:0.2*Math.sin(a*1.4)*s,pitch:0.06*Math.sin(a*1.1)*s,roll:0.05*Math.exp(-4*a)*Math.sin(10*a),sz:1-0.06*Math.exp(-5*a)*Math.cos(12*a)}; }
  function drawGC(o, alpha, shine) {
    const R=rot(o.yaw,o.pitch,o.roll),sz=o.sz||1,D=20*sz,N=Math.min(40,Math.max(10,Math.round(8+2400/o.Z))),list=[];
    for(let k=0;k<=N;k++){const d=(k/N-0.5)*D,wz=o.Z+R.n[2]*d;if(wz<25)return;list.push([k,o.X+R.n[0]*d,o.Y+R.n[1]*d,wz])}
    list.sort((a,b)=>b[3]-a[3]);
    const frontNear=list[list.length-1][0]===0,side=Math.abs(R.n[0])+Math.abs(R.n[1]);
    if(!FACEG){FACEG=ctx.createLinearGradient(0,-75,0,75);FACEG.addColorStop(0,"#ffffff");FACEG.addColorStop(1,"#d9e2e6")}
    ctx.save();ctx.globalAlpha=alpha;
    for(let j=0;j<list.length;j++){const q=list[j],k=q[0],wz=q[3],sc=F/wz*sz;
      ctx.save();ctx.transform(R.ex[0]*sc,R.ex[1]*sc,R.ey[0]*sc,R.ey[1]*sc,VW/2+F*q[1]/wz,CY+F*q[2]/wz);
      if(j===list.length-1){
        if(frontNear){ctx.fillStyle=FACEG;ctx.fill(SHAPE,"evenodd");details();
          if(shine>0&&shine<1){ctx.clip(SHAPE,"evenodd");const bx=-190+380*shine,g=ctx.createLinearGradient(bx-45,-80,bx+45,80);
            g.addColorStop(0,"rgba(255,214,150,0)");g.addColorStop(0.5,"rgba(255,238,200,.95)");g.addColorStop(1,"rgba(255,214,150,0)");ctx.fillStyle=g;ctx.fillRect(-110,-85,220,170)}}
        else{ctx.fillStyle="#aab6bc";ctx.fill(SHAPE,"evenodd")}}
      else{const f=k/N,l=Math.round(46+62*(frontNear?1-f:f)+30*Math.min(1,side));ctx.fillStyle=`rgb(${l+16},${l+5},${l-6})`;ctx.fill(SHAPE,"evenodd")}
      ctx.restore()}
    ctx.restore(); }

  // ---- sound: all scheduled up front on the audio clock, through one bus that fades on skip
  let AC = null, bus = null, at0 = 0;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state !== "running") AC.resume().catch(() => {}); } catch (_) {}
  function noise(){if(!NB){const n=AC.sampleRate*2|0;NB=AC.createBuffer(1,n,AC.sampleRate);const d=NB.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1}return NB}
  function out(b,at,p0,p1,dur){if(p0==null||!AC.createStereoPanner)return b;const pn=AC.createStereoPanner();pn.pan.setValueAtTime(p0,at);if(p1!=null)pn.pan.linearRampToValueAtTime(p1,at+dur);pn.connect(b);return pn}
  function osc(b,at,type,f0,f1,slide,peak,atk,dur,pan){const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.setValueAtTime(f0,at);if(f1)o.frequency.exponentialRampToValueAtTime(f1,at+slide);
    g.gain.setValueAtTime(0.0001,at);g.gain.exponentialRampToValueAtTime(peak,at+atk);g.gain.exponentialRampToValueAtTime(0.0001,at+dur);o.connect(g);g.connect(out(b,at,pan));o.start(at);o.stop(at+dur+0.05)}
  function hiss(b,at,type,f0,f1,q,peak,atk,dur,p0,p1){const s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();s.buffer=noise();s.loop=true;f.type=type;f.Q.value=q;
    f.frequency.setValueAtTime(f0,at);if(f1)f.frequency.exponentialRampToValueAtTime(f1,at+dur*0.85);g.gain.setValueAtTime(0.0001,at);g.gain.exponentialRampToValueAtTime(peak,at+atk);g.gain.exponentialRampToValueAtTime(0.0001,at+dur);
    s.connect(f);f.connect(g);g.connect(out(b,at,p0,p1,dur));s.start(at,Math.random()*1.5);s.stop(at+dur+0.05)}
  function whoosh(b,at,dur,p0,p1,vol){const o=out(b,at,p0,p1,dur+0.3),pk=at+dur*0.78,end=at+dur+0.3;
    for(const[type,f0,f1,f2,q,v]of[["lowpass",350,1900,450,0.6,1],["bandpass",1800,4200,1500,0.5,0.22]]){
      const s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();s.buffer=noise();s.loop=true;f.type=type;f.Q.value=q;
      f.frequency.setValueAtTime(f0,at);f.frequency.exponentialRampToValueAtTime(f1,pk);f.frequency.exponentialRampToValueAtTime(f2,end);
      g.gain.setValueAtTime(0.0001,at);g.gain.exponentialRampToValueAtTime(vol*v*0.35,at+dur*0.45);g.gain.exponentialRampToValueAtTime(vol*v,pk);g.gain.exponentialRampToValueAtTime(0.0001,end);
      s.connect(f);f.connect(g);g.connect(o);s.start(at,Math.random()*1.5);s.stop(end+0.05)}}
  function sounds(b,A){
    osc(b,A+0.1,"sine",55,110,1.4,0.14,1.2,1.5);hiss(b,A+0.2,"highpass",400,5000,0.7,0.05,1.1,1.35);
    whoosh(b,A+TA0,TA1-TA0+0.05,-0.7,0.9,0.5);whoosh(b,A+TB0-0.05,TI-TB0+0.05,-0.8,0,0.38);
    const I=A+TI;osc(b,I,"sine",110,55,0.35,0.5,0.02,0.6);hiss(b,I-0.02,"lowpass",1800,300,0.5,0.18,0.02,0.35);
    osc(b,I+0.01,"sine",1046.5,0,0,0.08,0.01,1.0);osc(b,I+0.03,"sine",1568,0,0,0.05,0.01,0.9);
    for(let i=0;i<NAME.length;i++){const at=A+TL+i*LS+LD,f=523.25*Math.pow(2,PENT[i]/12),pn=-0.5+i/(NAME.length-1);
      osc(b,at,"sine",f,0,0,0.2,0.004,0.5,pn);osc(b,at,"sine",f*2.76,0,0,0.05,0.002,0.16,pn);osc(b,at,"triangle",f*4.2,0,0,0.02,0.001,0.04,pn)}
    for(const f of[261.63,392,659.25])osc(b,A+TU,"triangle",f,0,0,0.035,0.5,1.9);
    osc(b,A+TG,"sine",380,900,0.07,0.18,0.004,0.16);hiss(b,A+TG,"highpass",3000,0,1,0.05,0.002,0.04);
    [2093,2637,3136,3951,4186].forEach((f,i)=>osc(b,A+TSC+0.1+i*0.055,"sine",f,0,0,0.045,0.004,0.5,-0.4+0.2*i));
    hiss(b,A+TSC+0.1,"highpass",5000,9000,0.8,0.035,0.2,0.6,-0.6,0.6)}
  function snd(t) {
    if (bus || !AC || AC.state !== "running") return;
    try { bus = AC.createGain(); bus.gain.value = 0.9; bus.connect(AC.destination); at0 = AC.currentTime + 0.05 - t; sounds(bus, at0); } catch (_) { bus = null; }
  }

  // ---- timeline
  const star = z => ({ x: (Math.random() * 2 - 1) * 900, y: (Math.random() * 2 - 1) * 1100, z, pz: z });
  for (let i = 0; i < 170; i++) ST.push(star(60 + Math.random() * 2940));
  let t = 0, skip = -1, hit = false, W = 0, L = [], last = performance.now(), ended = false;
  (function layout(){ctx.save();ctx.font=FONT;const ws=[...NAME].map(c=>ctx.measureText(c).width),sp=4;W=ws.reduce((a,b)=>a+b,0)+sp*(ws.length-1);
    let x=VW/2-W/2;L=ws.map(w=>{const c=x+w/2;x+=w+sp;return c});ctx.restore()})();
  wrap.addEventListener("pointerdown", () => {
    if (skip < 0 && t > 0.35) { skip = t; if (bus) try { bus.gain.setTargetAtTime(0, AC.currentTime, 0.05); } catch (_) {} }
  });

  function done() {
    if (ended) return; ended = true;
    if (bus) { const b = bus; bus = null; try { b.gain.setTargetAtTime(0, AC.currentTime, 0.04); setTimeout(() => { try { b.disconnect(); AC.close(); } catch (_) {} }, 600); } catch (_) {} }
    wrap.style.opacity = "0";
    setTimeout(() => wrap.remove(), 380);
  }

  function frame(now) {
    if (ended) return;
    if (cv.width < 2) fit();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    t += dt;
    if (!bus && t < 0.15 && skip < 0) snd(t);
    if (bus && AC.state === "running") { const a = AC.currentTime - at0; t += (a - t) * 0.1; }
    const spd = t < TI ? 300 + 2300 * Math.min(1, t / 0.9) : 40 + 2300 * Math.exp(-(t - TI) * 5);
    for (const s of ST) { s.pz = s.z; s.z -= spd * dt; if (s.z < 30) Object.assign(s, star(3000)); }
    if (!hit && t >= TI) { hit = true; for (let i = 0; i < 60; i++) { const a = Math.random() * Math.PI * 2, v = 200 + Math.random() * 520;
      SP.push({ x: VW / 2, y: Y(200), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 120, l: 0.5 + Math.random() * 0.55, m: 0, c: ["#ffd27a", "#ffffff", "#1db58f", "#ffb347"][i % 4] }); } }
    for (let i = SP.length - 1; i >= 0; i--) { const p = SP[i]; p.m += dt; p.vy += 520 * dt; p.vx *= 1 - dt * 1.5; p.x += p.vx * dt; p.y += p.vy * dt; if (p.m > p.l) SP.splice(i, 1); }
    if ((skip >= 0 && t - skip > 0.25) || t >= TE) { draw(); return done(); }
    draw();
    requestAnimationFrame(frame);
  }

  function draw() {
    const rm = RM ? 0.25 : 1, k0 = cv.width / VW;
    ctx.setTransform(k0, 0, 0, k0, 0, 0);
    const bg = ctx.createRadialGradient(VW/2, CY*0.8, 20, VW/2, CY, Math.max(640, VH*0.7)); bg.addColorStop(0, "#1c3a43"); bg.addColorStop(1, "#07121a");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, VW, VH);
    ctx.save();
    const a = t - TI; if (a > 0 && a < 0.6) { const m = 5 * Math.exp(-a * 8) * rm; ctx.translate((Math.random()*2-1)*m, (Math.random()*2-1)*m); }
    ctx.lineCap = "round";
    for (const s of ST) { const x=VW/2+F*s.x/s.z,y=CY+F*s.y/s.z,px=VW/2+F*s.x/s.pz,py=CY+F*s.y/s.pz,al=Math.min(1,(3000-s.z)/1400)*0.75;
      ctx.strokeStyle=`rgba(175,225,235,${al})`;ctx.lineWidth=Math.max(0.7,Math.min(3,900/s.z));ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x+0.01,y);ctx.stroke(); }
    if (a > 0) { const g=Math.min(1,a/0.25),r=ctx.createRadialGradient(VW/2,Y(205),10,VW/2,Y(205),260);r.addColorStop(0,`rgba(255,168,70,${0.34*g})`);r.addColorStop(1,"rgba(255,168,70,0)");ctx.fillStyle=r;ctx.fillRect(0,0,VW,VH); }
    if (a > 0 && a < 0.7) { const k=a/0.7,e=ease(k);ctx.lineWidth=7*(1-k);ctx.strokeStyle=`rgba(29,181,143,${0.8*(1-k)})`;ctx.beginPath();ctx.ellipse(VW/2,Y(276),30+520*e,(30+520*e)*0.2,0,0,Math.PI*2);ctx.stroke(); }
    if (a > 0 && a < 0.55) { const k=a/0.55,e=ease(k);ctx.lineWidth=9*(1-k);ctx.strokeStyle=`rgba(255,226,170,${0.85*(1-k)})`;ctx.beginPath();ctx.arc(VW/2,Y(200),40+300*e,0,Math.PI*2);ctx.stroke(); }
    const o = pose(t); if (o) { if (t < TI) { const g1 = pose(t - 0.02), g2 = pose(t - 0.04); if (g2) drawGC(g2, 0.12, 0); if (g1) drawGC(g1, 0.25, 0); }
      drawGC(o, 1, t > TSC && t < TSC + 0.45 ? (t - TSC) / 0.45 : 0); }
    ctx.lineWidth = 2.5; for (const p of SP) { ctx.strokeStyle=p.c;ctx.globalAlpha=Math.max(0,1-p.m/p.l);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*0.03,p.y-p.vy*0.03);ctx.stroke(); } ctx.globalAlpha = 1;
    if (a > 0 && a < 0.5) { const k=a/0.5,w=VW*ease(Math.min(1,a/0.18)),lg=ctx.createLinearGradient(VW/2-w/2,0,VW/2+w/2,0);lg.addColorStop(0,"rgba(255,240,210,0)");lg.addColorStop(0.5,`rgba(255,240,210,${0.9*(1-k)})`);lg.addColorStop(1,"rgba(255,240,210,0)");ctx.fillStyle=lg;ctx.fillRect(VW/2-w/2,Y(198),w,4); }
    ctx.font = FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const n = NAME.length;
    for (let i = 0; i < n; i++) { const la = t - (TL + i * LS); if (la < 0) continue;
      const k=Math.min(1,la/LD),e=ease(k),tx=L[i],x=VW/2+(tx-VW/2)*e,y=Y(210)+(Y(368)-Y(210))*e-70*Math.sin(Math.PI*e),dir=i%2?1:-1;
      let sx=Math.cos((1-e)*Math.PI*2*dir),sy=1,s=0.35+0.65*e,r=(1-e)*1.1*dir,dy=0;
      if (la > LD) { const b=la-LD,q=0.22*Math.exp(-10*b)*Math.cos(24*b);sx=1+q;sy=1-q;
        const w=t-TW-i*0.045;dy=-10*Math.exp(-Math.pow(w/0.07,2));
        if(b<0.3){ctx.strokeStyle=`rgba(255,230,180,${0.55*(1-b/0.3)})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(tx,Y(368),8+42*b/0.3,0,Math.PI*2);ctx.stroke()} }
      ctx.save();ctx.globalAlpha=Math.min(1,la/0.06);ctx.translate(x,y+dy);ctx.rotate(r);ctx.scale(sx*s,sy*s);
      ctx.fillStyle="rgba(0,0,0,.35)";ctx.fillText(NAME[i],2,4);ctx.fillStyle="#f2f6f7";ctx.fillText(NAME[i],0,0);ctx.restore(); }
    if (t > TU) { const e=ease(Math.min(1,(t-TU)/0.35)),w=W*0.62*e;ctx.fillStyle="#1db58f";ctx.beginPath();if(ctx.roundRect)ctx.roundRect(VW/2-w/2,Y(404),w,5,2.5);else ctx.rect(VW/2-w/2,Y(404),w,5);ctx.fill(); }
    if (t > TG) { const b=t-TG,s=1-Math.exp(-12*b)*Math.cos(16*b),dl=70*ease(Math.min(1,b/0.35));
      ctx.save();ctx.translate(VW/2,Y(318));ctx.scale(s,s);ctx.font=SUBFONT;ctx.fillStyle="#93b4be";ctx.fillText("A   G A M E   B Y",0,0);ctx.restore();
      ctx.fillStyle="rgba(147,180,190,.6)";ctx.fillRect(VW/2-84-dl,Y(317),dl,2);ctx.fillRect(VW/2+84,Y(317),dl,2); }
    if (t > TS && t < TS + 0.55) { const p=(t-TS)/0.55,x0=VW/2-W/2,bx=x0-120+(W+240)*p,g=ctx.createLinearGradient(bx-55,Y(330),bx+55,Y(400));
      g.addColorStop(0,"rgba(255,246,225,0)");g.addColorStop(0.5,"rgba(255,246,225,1)");g.addColorStop(1,"rgba(255,246,225,0)");
      ctx.font=FONT;ctx.fillStyle=g;for(let i=0;i<n;i++)ctx.fillText(NAME[i],L[i],Y(368));
      ctx.font=SUBFONT;ctx.fillText("A   G A M E   B Y",VW/2,Y(318)); }
    if (t > TS + 0.45 && t < TS + 0.95) { const b=(t-TS-0.45)/0.5,r=22*Math.sin(Math.PI*b),gx=VW/2+W/2+6,gy=Y(346);
      ctx.save();ctx.globalCompositeOperation="lighter";ctx.fillStyle="rgba(255,240,200,.9)";ctx.beginPath();ctx.moveTo(gx,gy-r);ctx.lineTo(gx+r*0.18,gy-r*0.18);ctx.lineTo(gx+r,gy);ctx.lineTo(gx+r*0.18,gy+r*0.18);
      ctx.lineTo(gx,gy+r);ctx.lineTo(gx-r*0.18,gy+r*0.18);ctx.lineTo(gx-r,gy);ctx.lineTo(gx-r*0.18,gy-r*0.18);ctx.closePath();ctx.fill();ctx.restore(); }
    ctx.restore();
    if (a > 0 && a < 0.3) { ctx.fillStyle = `rgba(255,248,235,${0.5*rm*(1-a/0.3)})`; ctx.fillRect(0, 0, VW, VH); }
    const vg=ctx.createRadialGradient(VW/2,CY,VH*0.3,VW/2,CY,VH*0.75);vg.addColorStop(0,"rgba(0,0,0,0)");vg.addColorStop(1,"rgba(0,0,0,.55)");ctx.fillStyle=vg;ctx.fillRect(0,0,VW,VH);
    let f = t < 0.3 ? 1 - t / 0.3 : 0; if (t > TH) f = Math.max(f, (t - TH) / (TE - TH)); if (skip >= 0) f = Math.max(f, (t - skip) / 0.25);
    if (t > 0.6 && t < TH && skip < 0) { ctx.font = SUBFONT; ctx.textAlign = "center"; ctx.fillStyle = "rgba(200,225,232,.35)"; ctx.fillText("tap to skip", VW / 2, VH - 60); }
    if (f > 0) { ctx.fillStyle = `rgba(14,16,22,${Math.min(1, f)})`; ctx.fillRect(0, 0, VW, VH); }
  }
  requestAnimationFrame(frame);
})();
