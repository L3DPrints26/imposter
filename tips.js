/* Tip jar: optional tips in the iPhone app, through Apple's in-app purchase
   (the native ImpNative plugin, StoreKit 2). Apple only allows set amounts, so
   it's four tips plus "More" for three bigger ones. Tips unlock nothing.

   On the website none of this shows: Apple doesn't let the app link out for
   payments, and website donations were turned down for now (2026-11-16).
   Prices come from the App Store in the player's own currency, never typed
   in here. Looks: the same sheet as Ask (ai.js), so this loads after it. */
(function () {
  "use strict";
  const C = window.Capacitor;
  const native = !!(C && C.isNativePlatform && C.isNativePlatform() && typeof C.nativePromise === "function");
  const call = (m, o) => C.nativePromise("ImpNative", m, o || {});
  const P = "com.gamercrafter.imposter.";
  const ico = d => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const HEART = '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor" stroke="none"/>';
  const TIPS = [
    { id: P + "tip099", name: "Small tip", icon: ico(HEART), c: "c1" },
    { id: P + "tip299", name: "Nice tip", icon: ico('<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.6 6.7 19.4l1.2-6L3.4 9.3l6-.7z" fill="currentColor" stroke="none"/>'), c: "c2" },
    { id: P + "tip499", name: "Big tip", icon: ico('<rect x="3.5" y="9" width="17" height="11" rx="2" fill="currentColor" stroke="none"/><path d="M12 9v11M2.5 9h19"/><path d="M12 9c-2-4-6-4-6-1.5S9 9 12 9zm0 0c2-4 6-4 6-1.5S15 9 12 9z"/>'), c: "c3" },
    { id: P + "tip999", name: "Huge tip", icon: ico('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="currentColor" stroke="none"/>'), c: "c4" },
    { id: P + "tip1999", name: "Awesome tip", icon: ico('<path d="M7 4h10v4a5 5 0 0 1-10 0z" fill="currentColor" stroke="none"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>'), c: "c2", more: true },
    { id: P + "tip2999", name: "Super tip", icon: ico('<path d="M6 3h12l3 5-9 13L3 8z" fill="currentColor" stroke="none"/>'), c: "c1", more: true },
    { id: P + "tip4999", name: "Legend tip", icon: ico('<path d="M12 2.5l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" fill="currentColor" stroke="none"/>'), c: "c4", more: true }
  ];
  let prices = null, loading = null, sheet = null, showMore = false;

  const css = `
.tipbtn{display:none}
.tips-on .tipbtn{display:inline-flex}
.tjic{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;color:#fff;flex:none;
  background:radial-gradient(circle at 32% 26%,#FFE9A0 0,#FFC61A 35%,#FF8A1F 100%);box-shadow:0 4px 16px rgba(255,170,30,.35),inset 0 2px 3px rgba(255,255,255,.55)}
.tjic svg{width:24px;height:24px}
.tjbody{display:grid;gap:14px;padding:14px 16px 18px;overflow-y:auto}
.tjbody>p{margin:0;color:#C3C9DE;font-size:16px;line-height:1.45;text-align:center}
.tjgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.tj{position:relative;overflow:hidden;display:grid;justify-items:center;gap:6px;padding:16px 10px 14px;border-radius:22px;border:0;
  font-family:inherit;color:#fff;cursor:pointer;transition:transform .08s}
.tj::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.2),transparent 45%)}
.tj i{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;background:rgba(255,255,255,.22)}
.tj i svg{width:26px;height:26px}
.tj b{font-size:16px}
.tj span{font-size:21px;font-weight:700}
.tj:active:not(:disabled){transform:translateY(4px)}
.tj:disabled{opacity:.5}
.tj.c1{background:linear-gradient(160deg,#35E8FF,#1C6BFF);color:#061433;box-shadow:0 6px 0 #0C318C}
.tj.c2{background:linear-gradient(160deg,#FFD84D,#FF9F1A);color:#1A1205;box-shadow:0 6px 0 #A85300}
.tj.c3{background:linear-gradient(160deg,#5CEB7C,#1FA33F);color:#06210E;box-shadow:0 6px 0 #11662A}
.tj.c4{background:linear-gradient(160deg,#9C8CFF,#5B45E0);color:#fff;box-shadow:0 6px 0 #33238F}
.tjmore{justify-self:center;padding:10px 20px;border-radius:999px;border:1px solid rgba(53,232,255,.3);background:rgba(53,232,255,.08);
  color:#D6FAFF;font-family:inherit;font-weight:700;font-size:15px}
.tjnote{font-size:13.5px!important;color:#8A92AC!important}
.tjdone{display:grid;justify-items:center;gap:12px;padding:10px 22px 22px;text-align:center}
.tjdone .tjic{width:76px;height:76px}
.tjdone .tjic svg{width:40px;height:40px}
.tjdone h3{margin:0;font-size:24px}
.tjdone p{margin:0;color:#B9C0D6;font-size:16px;line-height:1.45;max-width:32ch}
.cta.tipcta{background:linear-gradient(135deg,#2A2560,#1A1D45);color:#FFD84D;border:2px solid #FFC61A;
  box-shadow:0 6px 0 #07081A,0 10px 26px rgba(255,198,26,.16)}
.cta.tipcta svg{color:#FF5A45}
.tjcard{display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center;margin:18px 0 0;padding:16px;border-radius:22px;
  background:linear-gradient(135deg,#2A2560,#171A3D);border:1px solid rgba(255,198,26,.35)}
.tjcard b{display:block;font-size:18px}
.tjcard b+span{display:block;color:#AEB4D0;font-size:15px;line-height:1.4}
.tjcard button{grid-column:1/-1;height:50px;border-radius:16px;border:0;font-family:inherit;font-weight:700;font-size:17px;color:#1A1205;
  background:linear-gradient(180deg,#FFE070,#F2A900);box-shadow:0 5px 0 #B47A00}`;

  if (!native) return;                        // website: nothing at all
  document.documentElement.classList.add("tips-on");
  const st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function load() {
    if (window.IMP_TIP_MOCK) prices = window.IMP_TIP_MOCK;     // screenshots only
    if (prices) return Promise.resolve(prices);
    if (!loading) loading = call("tipProducts", { ids: TIPS.map(t => t.id) })
      .then(r => { const ps = r.products || []; if (!ps.length) { loading = null; return null; } prices = {}; ps.forEach(p => { prices[p.id] = p.price; }); return prices; })
      .catch(() => { loading = null; return null; });
    return loading;
  }
  load();                                     // so the prices are there when it opens

  function close() { if (sheet) { sheet.remove(); sheet = null; document.documentElement.style.overflow = ""; } }
  function frame(inner) {
    close();
    sheet = document.createElement("div");
    sheet.className = "aiwrap";
    sheet.innerHTML = `<div class="aisheet" role="dialog" aria-modal="true" aria-label="Tip jar">${inner}</div>`;
    sheet.addEventListener("click", e => { if (e.target === sheet || e.target.closest("[data-x]")) close(); });
    document.body.appendChild(sheet);
    document.documentElement.style.overflow = "hidden";
    return sheet.firstElementChild;
  }
  const head = `<div class="aihead"><span class="tjic">${ico(HEART)}</span><span><b>Tip jar</b><small>Thanks for playing</small></span>
    <span class="sp"></span><button data-x aria-label="Close">&times;</button></div>`;

  function done(h, p) {
    frame(`${head}<div class="tjdone"><span class="tjic">${ico(HEART)}</span><h3>${esc(h)}</h3><p>${esc(p)}</p>
      <div class="btns" style="display:grid;grid-template-columns:1fr;width:100%"><button class="ok" data-x style="height:52px;border-radius:18px;border:0;font-family:inherit;font-weight:700;font-size:17px;color:#1A1205;background:linear-gradient(180deg,#FFE070,#F2A900);box-shadow:0 5px 0 #B47A00">OK</button></div></div>`);
  }

  async function open() {
    const pr = await load();
    const tiles = TIPS.filter(t => showMore || !t.more).map(t => {
      const price = pr && pr[t.id];
      return `<button class="tj ${t.c}" data-tip="${t.id}" ${price ? "" : "disabled"}><i>${t.icon}</i><b>${esc(t.name)}</b><span>${esc(price || "...")}</span></button>`;
    }).join("");
    const box = frame(`${head}<div class="tjbody">
      <p>Pocket Imposter is free, with no ads. A tip helps me keep making it better.</p>
      ${pr ? "" : '<p style="color:#FFC61A;font-weight:600">The tip jar can\'t reach the App Store right now. Check your internet and try again.</p>'}
      <div class="tjgrid">${tiles}</div>
      ${showMore ? "" : '<button class="tjmore" data-more>More</button>'}
      <p class="tjnote">Tips don't unlock anything. They're just a thank-you.</p></div>`);
    box.addEventListener("click", async e => {
      if (e.target.closest("[data-more]")) { showMore = true; return open(); }
      const b = e.target.closest("[data-tip]");
      if (!b || b.disabled) return;
      box.querySelectorAll("[data-tip]").forEach(x => { x.disabled = true; });
      try {
        const r = await call("tip", { id: b.dataset.tip });
        if (r.result === "thanks") return done("Thank you!", "That means a lot. You just helped keep Pocket Imposter free, with no ads.");
        if (r.result === "pending") return done("Waiting for approval", "This tip needs approval first. If it's approved, it goes through on its own.");
        open();                                // cancelled: back to the jar
      } catch (_) {
        done("That didn't go through", "Nothing was charged. Check your internet and try again.");
      }
    });
  }

  // Help page: a card that opens the jar.
  const fb = document.querySelector("#feedback");
  if (fb && !document.querySelector(".tjcard")) {
    const card = document.createElement("div");
    card.className = "tjcard";
    card.innerHTML = `<span class="tjic">${ico(HEART)}</span><span><b>Like the game?</b><span>Pocket Imposter is free, with no ads. You can leave a tip.</span></span>
      <button data-tipjar>Tip the Dev</button>`;
    fb.insertAdjacentElement("beforebegin", Object.assign(document.createElement("section"), { className: "narrow" })).appendChild(card);
  }

  // Home page: a Tip the Dev button next to Play and How to play.
  const ctas = document.querySelector(".hero .ctas");
  if (ctas && !ctas.querySelector("[data-tipjar]")) {
    const b = document.createElement("button");
    b.className = "cta tipcta"; b.setAttribute("data-tipjar", "");
    b.innerHTML = ico(HEART) + "Tip the Dev";
    ctas.appendChild(b);
  }

  document.addEventListener("click", e => {
    if (!e.target.closest("[data-tipjar]")) return;
    e.preventDefault();
    showMore = false;
    open();
  });
  window.ImpTips = { open, ids: TIPS.map(t => t.id) };
})();
