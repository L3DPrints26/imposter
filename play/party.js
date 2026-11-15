/* Party mode: everyone plays on their own phone.

   One phone hosts. It makes a 4-letter code; everyone else types it in on their
   own phone and joins. Phones talk to each other directly (WebRTC through
   PeerJS: their free public server only introduces the phones, then steps out;
   nothing is stored anywhere). The host's phone runs the game and deals every
   card, so each phone only ever receives its own card.

   People without a phone can still play: the host adds them, and they look at
   their card on the host's phone, pass-and-play style.

   Everyone needs a name to get in, typed or random, and the name check in
   names.js has to pass. The host can remove anyone. */
"use strict";
(function () {
  const PREFIX = "pocket-imposter-v1-";
  const ABC = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const MAXP = 15;
  let P = null;                       // the party this phone is in
  let tick = null;                    // clock + cooldown on the game screen

  /* ------------------------------------------------------------ helpers */
  const $p = s => app.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const newCode = () => Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join("");
  const send = (c, m) => { try { if (c && c.open) c.send(m); } catch (_) {} };
  const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const coolFor = (n, imps) => (n <= 6 ? 45 : n <= 10 ? 30 : 20) + (imps - 1) * 10;
  const SET_KEY = "imp_party_set";
  const loadSet = () => Object.assign({ word: true, imps: 1, hint: true, meetings: 3, each: 0 }, store.get(SET_KEY, {}));
  const saveSet = () => store.set(SET_KEY, P.set);
  function stopTick() { if (tick) { clearInterval(tick); tick = null; } }

  // Keep the screen on while in a party: a phone that locks drops off.
  let wake = null;
  async function keepAwake(on) {
    try {
      if (on && navigator.wakeLock && !wake) {
        wake = await navigator.wakeLock.request("screen");
        wake.addEventListener("release", () => { wake = null; });
      }
      if (!on && wake) { await wake.release(); wake = null; }
    } catch (_) {}
  }
  document.addEventListener("visibilitychange", () => { if (P && !document.hidden) keepAwake(true); });

  function view(html, redrawFn, screen) {
    stopTick();
    window.onblur = null; document.onvisibilitychange = null;
    if (P) P.screen = screen || "";
    redraw = redrawFn || (() => {});
    app.innerHTML = html;
  }
  const bar = (back, title) => topBar(back, title || "", "");
  const netWhy = e => e && e.type === "peer-unavailable" ? "No party with that code. Check it and try again."
    : e && e.type === "browser-incompatible" ? "This browser can't do party mode. Try Safari or Chrome."
    : "Couldn't connect. Check your internet and try again.";

  /* ------------------------------------------------------------ start + names */
  function start() {
    if (!window.Peer) return view(`${bar("home")}<div class="grow"><h2>Party mode needs the internet</h2>
      <p class="c mut">Connect and try again.</p></div>`);
    view(`${bar("home", "Play together")}
      <div class="grow">
        <h2>One phone each</h2>
        <p class="c mut small">No passing the phone around. Everyone sees their card on their own phone, and anyone can call a meeting from theirs.</p>
        ${CATS ? '<button class="big y" data-a="p-host">Host<small>start a party</small></button>' : ""}
        <button class="big o" data-a="p-join">Join<small>type a code</small></button>
      </div>`, start);
  }

  // Everyone needs a name first, and it has to pass the check.
  function nameScreen(next, msg, taken) {
    const saved = store.get("imp_party_name", "");
    view(`${bar("p-start", "Your name")}
      <div class="list">
        <h2>What's your name?</h2>
        <p class="c mut small">Everyone in the party sees it.</p>
        <div class="names"><label><input id="pn" class="ftxt" maxlength="14" autocomplete="off" autocapitalize="words"
               enterkeyhint="go" placeholder="Your name" value="${esc(saved)}"></label></div>
        <button class="bar ghost slim" data-a="p-rand">Random name</button>
        <p class="err" id="perr">${esc(msg || "")}</p>
      </div>
      <button class="bar" data-a="p-name-ok">Next</button>`, () => nameScreen(next, msg, taken), "name");
    P = P || {};
    P.nextAfterName = next;
    P.taken = taken || [];
    const inp = $p("#pn");
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $p('[data-a="p-name-ok"]').click(); } });
  }
  function nameOk() {
    const r = NameCheck.check($p("#pn").value);
    if (!r.ok) { $p("#perr").textContent = r.why; return; }
    store.set("imp_party_name", r.name);
    const next = P.nextAfterName;
    next(r.name);
  }

  /* ------------------------------------------------------------ host */
  function host(name) {
    P = { role: "host", me: { id: "host", name }, set: loadSet(), conns: new Map(),
          players: [{ id: "host", name, kind: "host", on: true }], round: null, code: "", peer: null };
    view(`${bar("")}<div class="grow"><div class="spin"></div><p class="c mut">Making your party...</p></div>`);
    openAs(0);
  }
  function openAs(tries) {
    const code = newCode();
    const peer = new Peer(PREFIX + code, { debug: 0 });
    peer.on("open", () => {
      if (!P || P.role !== "host") return peer.destroy();
      P.peer = peer; P.code = code;
      keepAwake(true);
      lobby();
    });
    peer.on("connection", conn => {
      conn.on("data", m => hostMsg(conn, m));
      conn.on("close", () => hostLost(conn));
      conn.on("error", () => hostLost(conn));
    });
    peer.on("disconnected", () => { try { if (P && P.peer === peer) peer.reconnect(); } catch (_) {} });
    peer.on("error", e => {
      if (e.type === "unavailable-id" && tries < 6) { peer.destroy(); return openAs(tries + 1); }
      if (P && !P.code) return fail(netWhy(e));
    });
  }

  const present = () => P.players.filter(p => p.on || p.kind === "local");
  const nameTaken = (n, exceptId) => P.players.some(p => p.id !== exceptId && p.name.toLowerCase() === n.toLowerCase());
  function lobbyMsg() {
    return { t: "lobby", code: P.code, set: P.set, inRound: !!P.round,
             players: P.players.map(p => ({ id: p.id, name: p.name, kind: p.kind, on: p.on })) };
  }
  function broadcast(m) { P.conns.forEach(c => send(c, m)); }
  function shareLobby() { if (P && P.role === "host") broadcast(lobbyMsg()); }

  function hostMsg(conn, m) {
    if (!P || P.role !== "host" || !m || typeof m !== "object") return;
    if (m.t === "join") {
      const r = NameCheck.check(String(m.name || ""));
      if (!r.ok) return send(conn, { t: "reject", why: r.why, name: true });
      // A phone that dropped out (screen locked, signal) comes back by name.
      const back = P.players.find(p => p.kind === "phone" && !p.on && p.name.toLowerCase() === r.name.toLowerCase());
      if (back) {
        back.on = true; conn.pid = back.id; P.conns.set(back.id, conn);
        send(conn, { t: "welcome", id: back.id, code: P.code });
        send(conn, lobbyMsg());
        if (P.round) send(conn, roundFor(back.id));
        shareLobby(); refresh();
        return;
      }
      if (nameTaken(r.name)) return send(conn, { t: "reject", why: "Someone here already has that name. Pick another.", name: true });
      if (P.players.length >= MAXP) return send(conn, { t: "reject", why: "This party is full (15 players)." });
      if (P.round) return send(conn, { t: "reject", why: "A game is going. Join when it ends." });
      const id = uid();
      P.players.push({ id, name: r.name, kind: "phone", on: true });
      conn.pid = id; P.conns.set(id, conn);
      send(conn, { t: "welcome", id, code: P.code });
      shareLobby(); refresh();
      return;
    }
    const pid = conn.pid;
    if (!pid) return;
    if (m.t === "meet") return callMeeting(pid, !!m.body);
    if (m.t === "leave") {
      const pl = P.players.find(p => p.id === pid);
      P.conns.delete(pid);
      if (pl) { if (P.round) pl.on = false; else P.players = P.players.filter(p => p.id !== pid); }
      try { conn.close(); } catch (_) {}
      shareLobby(); refresh();
    }
  }
  function hostLost(conn) {
    if (!P || P.role !== "host" || !conn.pid) return;
    if (P.conns.get(conn.pid) !== conn) return;     // already replaced by a rejoin
    P.conns.delete(conn.pid);
    const pl = P.players.find(p => p.id === conn.pid);
    if (pl) { if (P.round) pl.on = false; else P.players = P.players.filter(p => p.id !== conn.pid); }
    shareLobby(); refresh();
  }
  // Redraw the host's screen when it shows something that just changed.
  function refresh() { if (P && (P.screen === "lobby" || P.screen === "on")) redraw(); }

  function lobby(msg) {
    const S2 = P.set, n = present().length, maxImp = Math.max(1, Math.floor(Math.max(n, 3) / 2));
    S2.imps = Math.min(maxImp, Math.max(1, S2.imps));
    const step = (k, v, lo, hi, zero) =>
      `<div class="step"><button data-a="p-dec" data-k="${k}" ${v <= lo ? "disabled" : ""} aria-label="Fewer">&minus;</button>
       <output>${v === 0 && zero ? zero : v}</output>
       <button data-a="p-inc" data-k="${k}" ${v >= hi ? "disabled" : ""} aria-label="More">+</button></div>`;
    const rows = P.players.map(p => `<label><span>${p.kind === "host" ? "&#9733;" : p.kind === "local" ? "&#9742;" : p.on ? "&#9679;" : "&#9675;"}</span>
        <b style="flex:1;font-weight:600">${esc(p.name)}${p.kind === "local" ? ' <small class="mut">on your phone</small>' : ""}${p.on || p.kind === "local" ? "" : ' <small class="mut">offline</small>'}</b>
        ${p.kind === "host" ? "" : `<button class="icon" data-a="p-kick" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">&times;</button>`}</label>`).join("");
    view(`${bar("p-end", "Your party")}
      <div class="list">
        <p class="c mut small">Everyone else opens Play, taps Play together, then Join, and types:</p>
        <p class="pcode">${P.code}</p>
        <div class="names">${rows}</div>
        <button class="bar ghost slim" data-a="p-add">+ Add someone without a phone</button>
        <div class="btns"><button class="tog ${S2.word ? "on" : ""}" data-a="p-mode" data-v="word">Word</button>
          <button class="tog ${S2.word ? "" : "on"}" data-a="p-mode" data-v="tag">Tag</button></div>
        <div class="row"><div><b>Imposters</b><div class="sub">up to half the players</div></div>${step("imps", S2.imps, 1, maxImp)}</div>
        ${S2.word
          ? `<div class="row"><div><b>Hint word</b><div class="sub">${S2.hint ? "Imposter gets a hint" : "Imposter: no hint"}</div></div>
             <button class="tog ${S2.hint ? "on" : ""}" data-a="p-hint">${S2.hint ? "On" : "Off"}</button></div>`
          : `<div class="row"><div><b>Meetings</b><div class="sub">total for the group</div></div>${step("meetings", S2.meetings, 0, 9)}</div>
             <div class="row"><div><b>Per player</b><div class="sub">${S2.each ? "most one player can call" : "no limit per player"}</div></div>${step("each", S2.each, 0, 3, "Off")}</div>`}
        <p class="err">${esc(msg || "")}</p>
      </div>
      <button class="bar" data-a="p-go" ${n >= 3 ? "" : "disabled"}>${n >= 3 ? "START" : "Need 3 players"}</button>`, () => lobby(), "lobby");
  }

  function addLocal(msg) {
    view(`${bar("p-lobby", "Add a player")}
      <div class="list">
        <h2>Who's playing on your phone?</h2>
        <p class="c mut small">They look at their card on your phone when the game starts.</p>
        <div class="names"><label><input id="pn" class="ftxt" maxlength="14" autocomplete="off" autocapitalize="words" placeholder="Their name"></label></div>
        <button class="bar ghost slim" data-a="p-rand">Random name</button>
        <p class="err" id="perr">${esc(msg || "")}</p>
      </div>
      <button class="bar" data-a="p-add-ok">Add</button>`, () => addLocal(msg), "add");
  }
  function addLocalOk() {
    const r = NameCheck.check($p("#pn").value);
    if (!r.ok) return ($p("#perr").textContent = r.why);
    if (nameTaken(r.name)) return ($p("#perr").textContent = "Someone here already has that name.");
    if (P.players.length >= MAXP) return ($p("#perr").textContent = "The party is full (15 players).");
    P.players.push({ id: uid(), name: r.name, kind: "local", on: true });
    shareLobby(); lobby();
  }

  /* ------------------------------------------------------------ the round (host deals) */
  function deal() {
    const ps = present();
    const n = ps.length, imps = Math.min(Math.max(1, Math.floor(n / 2)), Math.max(1, P.set.imps));
    const impIds = new Set();
    while (impIds.size < imps) impIds.add(ps[rnd(n)].id);
    let cat = null, w = null, hint = "";
    if (P.set.word) {
      const recent = store.get("imp_recent", []), pool = liveCats();
      for (let t = 0; t < 40; t++) { cat = pool[rnd(pool.length)]; w = cat.words[rnd(cat.words.length)]; if (!recent.includes(w[0])) break; }
      recent.push(w[0]); store.set("imp_recent", recent.slice(-16));
      hint = P.set.hint && w[1].length ? w[1][rnd(w[1].length)] : "";
    }
    const cards = {};
    ps.forEach(p => {
      const imp = impIds.has(p.id);
      cards[p.id] = { imp, word: !imp && w ? w[0] : "", hint: imp ? hint : "" };
    });
    P.round = { mode: P.set.word ? "word" : "tag", cards, cat: cat ? cat.name : "", word: w ? w[0] : "",
      imps: ps.filter(p => impIds.has(p.id)).map(p => p.name), first: ps[rnd(n)].name, n, impCount: imps,
      meetLeft: P.set.meetings, each: P.set.each, used: {}, phase: "on", startedAt: Date.now(),
      cool: coolFor(n, imps), coolEnd: 0, caller: "", body: false,
      queue: ps.filter(p => p.kind !== "phone").map(p => p.id) };
    P.conns.forEach((c, id) => { if (cards[id]) send(c, roundFor(id)); });
    nextHostCard();
  }
  function roundFor(id) {
    const R = P.round;
    return { t: "round", mode: R.mode, card: R.cards[id] || null, cat: R.cat, first: R.first, n: R.n,
      impCount: R.impCount, meetLeft: R.meetLeft, each: R.each, used: R.used[id] || 0, startedAt: R.startedAt,
      cool: R.cool, phase: R.phase, caller: R.caller, body: R.body };
  }
  // The host's own card, then anyone playing on the host's phone, one by one.
  function nextHostCard() {
    const R = P.round, id = R.queue.shift();
    if (!id) return gameOn();
    const pl = P.players.find(p => p.id === id);
    if (pl.kind === "host") return showCard(R.cards[id], "Your card", nextHostCard, R);
    view(`${bar("")}
      <div class="grow">
        <p class="c mut" style="font-size:20px;font-weight:600">Hand your phone to</p>
        <p class="who">${esc(pl.name)}</p>
      </div>
      <button class="bar" data-a="p-handed">Then tap here</button>`, () => {}, "pass");
    P.afterHand = () => showCard(R.cards[id], esc(pl.name) + "'s card", nextHostCard, R);
  }

  /* ------------------------------------------------------------ cards */
  function cardInner(card, R) {
    if (R.mode === "word" && !card.imp) return `<p class="lbl">Word</p><p class="word" data-fit>${esc(card.word)}</p>`;
    if (R.mode === "word" && card.imp && card.hint) return `<p class="lbl imp">IMPOSTER</p><p class="word" data-fit>Hint: ${esc(card.hint)}</p>`;
    return `<p class="role" style="color:var(${card.imp ? "--imp" : "--crew"})">${card.imp ? "IMPOSTER" : "CREW"}</p>
            <p class="mut small">${card.imp ? (R.mode === "word" ? "No hint. Bluff off the category." : "Tag them. Blend in.") : "Find the imposters."}</p>`;
  }
  function holdWire(inner) {
    const hold = $p("#hold"), box = $p("#card"), blank = box.innerHTML;
    const show = e => { e.preventDefault(); hold.classList.add("on"); box.innerHTML = inner; fitWord(); };
    const hide = () => { hold.classList.remove("on"); box.innerHTML = blank; };
    hold.addEventListener("pointerdown", show);
    ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"].forEach(t => hold.addEventListener(t, hide));
    hold.addEventListener("contextmenu", e => e.preventDefault());
    window.onblur = hide;
    document.onvisibilitychange = () => { if (document.hidden) hide(); };
  }
  function showCard(card, title, done, R) {
    view(`${bar("")}
      <p class="cat"><span class="k">${R.mode === "word" ? "Category" : "Tag mode"}</span><span class="v">${R.mode === "word" ? esc(R.cat) : esc(title)}</span></p>
      <div class="grow">
        <div class="card" id="card" aria-live="off"><p class="lbl">${R.mode === "word" ? esc(title) : "Your role"}</p><p class="mut small">Hold the button to see it.</p></div>
        <button class="hold" id="hold" aria-label="Hold to see your card">HOLD</button>
      </div>
      <button class="bar" data-a="p-seen">Got it</button>`, () => showCard(card, title, done, R), "card");
    P.afterSeen = done;
    holdWire(cardInner(card, R));
  }

  /* ------------------------------------------------------------ game on */
  const myCard = () => P.role === "host" ? P.round.cards.host : P.round.card;
  function gameOn() {
    const R = P.round, isHost = P.role === "host";
    if (R.phase === "meeting") return meeting(false);
    if (R.phase === "reveal") return;
    const peek = myCard() ? `<button class="peek" id="hold">Hold to check your card</button>
      <div class="card peekcard" id="card" aria-live="off"></div>` : "";
    let body;
    if (R.mode === "word") {
      body = `<p class="cat"><span class="k">Category</span><span class="v">${esc(R.cat)}</span></p>
        <div class="card" style="min-height:0"><p style="font-size:22px;font-weight:600">${esc(R.first)} starts.</p>
        <p class="mut">One clue each. ${R.impCount} imposter${R.impCount === 1 ? "" : "s"}.</p></div>
        <p class="c mut small">Go around, one word each. Talk it over, then point on three.</p>`;
    } else {
      const myUsed = isHost ? 0 : (R.used || 0);
      const canEm = R.meetLeft > 0 && (!R.each || isHost || myUsed < R.each);
      body = `<div class="calls">
          <button class="call em" data-a="p-meet" ${canEm ? "" : "disabled"}>${I.alarm}<span class="k">Emergency meeting</span>
            <span class="s">${R.meetLeft} left${R.each ? ", " + R.each + " each" : ""}</span></button>
          <button class="call body" data-a="p-body">${I.alert}<span class="k">Report a body</span><span class="s">free, any time</span></button>
        </div>
        ${coolTile(R)}`;
    }
    view(`${bar("", "")}
      <div class="gohead"><b>GAME ON</b><span id="clock">${mmss(Date.now() - R.startedAt)}</span></div>
      ${body}
      <div class="grow" style="justify-content:flex-end">${peek}</div>
      ${isHost ? '<button class="bar" data-a="p-reveal">Reveal</button>' : '<p class="c mut small" style="margin:8px 0">The host taps Reveal at the end.</p>'}`, gameOn, "on");
    if (peek) holdWire(cardInner(myCard(), R));
    startTick();
  }
  function coolTile(R) {
    const left = R.coolEnd ? Math.max(0, Math.ceil((R.coolEnd - Date.now()) / 1000)) : 0;
    return ringTile(left, R.cool, "p-cool");
  }
  function startTick() {
    stopTick();
    tick = setInterval(() => {
      const R = P && P.round, c = $p("#clock");
      if (!R || !c) return stopTick();
      c.textContent = mmss(Date.now() - R.startedAt);
      if (R.coolEnd) {
        const l = Math.max(0, Math.ceil((R.coolEnd - Date.now()) / 1000));
        ringSet(l, R.cool);
        if (!l) { R.coolEnd = 0; if (navigator.vibrate) navigator.vibrate(200); }
      }
    }, 250);
  }

  /* ------------------------------------------------------------ meetings */
  // Only the host decides; everyone else asks it.
  function callMeeting(pid, body) {
    const R = P.round;
    if (!R || R.mode !== "tag" || R.phase !== "on") return;
    if (!body) {
      if (R.meetLeft <= 0) return;
      if (R.each && (R.used[pid] || 0) >= R.each) return;
      R.meetLeft--; R.used[pid] = (R.used[pid] || 0) + 1;
    }
    const pl = P.players.find(p => p.id === pid);
    R.phase = "meeting"; R.caller = pl ? pl.name : "Someone"; R.body = body;
    P.conns.forEach((c, id) => send(c, { t: "meeting", by: R.caller, body, left: R.meetLeft, used: R.used[id] || 0 }));
    meeting(true);
  }
  function hostMeetPick() {
    const R = P.round;
    const mine = P.players.filter(p => p.kind !== "phone");
    if (mine.length === 1) return callMeeting("host", false);
    const rows = mine.map(p => {
      const ok = !R.each || (R.used[p.id] || 0) < R.each;
      return `<button class="go" data-a="p-meet-by" data-id="${p.id}" ${ok ? "" : "disabled"}><span><b>${esc(p.name)}</b>
        <span class="sub">${R.each ? (ok ? (R.each - (R.used[p.id] || 0)) + " left" : "used up") : ""}</span></span></button>`;
    }).join("");
    view(`${bar("p-on", "Meeting")}<div class="list"><h2>Who's calling it?</h2>
      <p class="c mut small">People with their own phone call it from there.</p><div class="names">${rows}</div></div>`, hostMeetPick, "pick");
  }
  function meeting(loud) {
    const R = P.round, isHost = P.role === "host";
    view(`${bar("")}
      <div class="grow">
        <p class="c" style="font-size:20px;font-weight:700;color:var(--imp);letter-spacing:.08em">${R.body ? "BODY REPORTED" : "EMERGENCY MEETING"}</p>
        <p class="who">${esc(R.caller)}</p>
        <p class="c mut" style="font-size:18px">${R.body ? "found a body" : "called it"}</p>
        <div class="card" style="min-height:0;gap:6px">
          <p style="font-size:19px;font-weight:600">Everyone come together.</p>
          <p class="mut small">Talk it over, then point at once on three. Most votes is out.
          Finish with &ldquo;3, 2, 1, UP!&rdquo;, then no tagging for 15 seconds.</p>
        </div>
        <p class="c mut small">${R.meetLeft} emergency meeting${R.meetLeft === 1 ? "" : "s"} left</p>
        <button class="bar ghost slim" data-a="p-hush">Stop the siren</button>
      </div>
      ${isHost ? `<button class="bar" data-a="p-meetover">Meeting's over</button>` : '<p class="c mut small" style="margin:8px 0">The host ends the meeting.</p>'}`,
      () => meeting(false), "meeting");
    if (loud) Siren.play(8);
  }

  /* ------------------------------------------------------------ reveal */
  function reveal(r) {
    const isHost = P.role === "host";
    view(`${bar("")}
      <div class="grow">
        ${r.mode === "word" ? `<p class="c mut" style="font-size:18px;font-weight:600">The word was</p>
          <p class="word c" data-fit style="font-size:52px;font-weight:700;color:var(--acc);white-space:nowrap">${esc(r.word)}</p>` : ""}
        <p class="c mut" style="font-size:20px;font-weight:600;margin-top:10px">${r.imps.length === 1 ? "Imposter" : "Imposters"}</p>
        <p class="c" style="font-size:36px;font-weight:700;color:var(--imp);text-wrap:balance">${r.imps.map(esc).join(", ")}</p>
      </div>
      ${isHost ? '<button class="bar" data-a="p-again">Next game</button>' : '<p class="c mut small" style="margin:8px 0">Waiting for the host to start the next game.</p>'}`,
      () => reveal(r), "reveal");
    fitWord();
  }

  /* ------------------------------------------------------------ guest */
  function join(name, msg) {
    P = { role: "guest", me: { id: "", name }, players: [], set: {}, round: null, code: "", peer: null, conn: null, tries: 0 };
    view(`${bar("p-start", "Join")}
      <div class="list">
        <h2>Type the code</h2>
        <p class="c mut small">It's on the host's phone.</p>
        <input id="pc" class="code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false"
               placeholder="ABCD" value="${esc(store.get("imp_party_code", ""))}">
        <p class="err" id="perr">${esc(msg || "")}</p>
      </div>
      <button class="bar" data-a="p-join-go">Join as ${esc(name)}</button>`, () => join(name, msg), "code");
    const inp = $p("#pc");
    inp.addEventListener("input", () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4); });
    inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $p('[data-a="p-join-go"]').click(); } });
  }
  function joinGo() {
    const code = $p("#pc").value.toUpperCase().replace(/[^A-Z]/g, "");
    if (code.length !== 4) return ($p("#perr").textContent = "Codes are 4 letters.");
    store.set("imp_party_code", code);
    P.code = code;
    view(`${bar("")}<div class="grow"><div class="spin"></div><p class="c mut">Joining ${esc(code)}...</p></div>`);
    connectGuest();
  }
  function connectGuest() {
    if (P.peer) { try { P.peer.destroy(); } catch (_) {} }
    const peer = new Peer({ debug: 0 });
    P.peer = peer;
    peer.on("open", () => {
      const conn = peer.connect(PREFIX + P.code, { reliable: true });
      P.conn = conn;
      conn.on("open", () => { P.tries = 0; send(conn, { t: "join", name: P.me.name }); });
      conn.on("data", guestMsg);
      conn.on("close", () => guestLost(conn));
      conn.on("error", () => guestLost(conn));
    });
    peer.on("error", e => {
      if (P && P.peer === peer && !P.me.id) return join(P.me.name, netWhy(e));
      if (P && P.peer === peer) guestLost(P.conn);
    });
  }
  function guestLost(conn) {
    if (!P || P.role !== "guest" || P.conn !== conn || P.leaving) return;
    if (!P.me.id) return;                                // never got in
    if (++P.tries > 10) {
      return view(`${bar("p-leave")}<div class="grow"><h2>Lost the party</h2>
        <p class="c mut">Couldn't reach the host's phone. Make sure it's still open with the screen on.</p></div>
        <button class="bar" data-a="p-retry">Try again</button>`, null, "lost");
    }
    view(`${bar("")}<div class="grow"><div class="spin"></div><p class="c mut">Reconnecting...</p></div>`, null, "reconnect");
    setTimeout(() => { if (P && P.role === "guest" && !P.leaving) connectGuest(); }, 2500);
  }
  function guestMsg(m) {
    if (!P || P.role !== "guest" || !m || typeof m !== "object") return;
    if (m.t === "reject") {
      try { P.peer.destroy(); } catch (_) {}
      const name = P.me.name;
      if (m.name) return nameScreen(n => join(n), m.why);
      return join(name, m.why);
    }
    if (m.t === "welcome") { P.me.id = m.id; keepAwake(true); return; }
    if (m.t === "lobby") {
      P.players = m.players; P.set = m.set;
      // Between games (or before the first) the lobby is the screen; during a
      // game this is just the player list changing, so the game stays up.
      if (!m.inRound) { P.round = null; Siren.stop(); return guestLobby(); }
      return;
    }
    if (m.t === "round") {
      const fresh = !P.round || P.round.startedAt !== m.startedAt;
      P.round = Object.assign({}, m, { coolEnd: P.round && !fresh ? P.round.coolEnd : 0 });
      if (m.phase === "meeting") return meeting(false);
      if (fresh && m.card) return showCard(m.card, "Your card", gameOn, P.round);
      return gameOn();
    }
    if (m.t === "meeting") {
      if (!P.round) return;
      Object.assign(P.round, { phase: "meeting", caller: m.by, body: m.body, meetLeft: m.left, used: m.used });
      return meeting(true);
    }
    if (m.t === "meetover") {
      if (!P.round) return;
      P.round.phase = "on"; P.round.meetLeft = m.left;
      Siren.stop();
      return gameOn();
    }
    if (m.t === "reveal") { if (P.round) P.round.phase = "reveal"; Siren.stop(); return reveal(m); }
    if (m.t === "kicked") { P.leaving = true; try { P.peer.destroy(); } catch (_) {} P = null; keepAwake(false);
      return view(`${bar("home")}<div class="grow"><h2>You were removed</h2><p class="c mut">The host took you out of the party.</p></div>`); }
    if (m.t === "ended") { P.leaving = true; try { P.peer.destroy(); } catch (_) {} P = null; keepAwake(false); Siren.stop();
      return view(`${bar("home")}<div class="grow"><h2>The party ended</h2><p class="c mut">The host closed it.</p></div>`); }
  }
  function guestLobby() {
    const rows = P.players.map(p => `<label><span>${p.kind === "host" ? "&#9733;" : p.kind === "local" ? "&#9742;" : p.on ? "&#9679;" : "&#9675;"}</span>
      <b style="flex:1;font-weight:600">${esc(p.name)}${p.id === P.me.id ? ' <small class="mut">you</small>' : ""}</b></label>`).join("");
    view(`${bar("p-leave", "Party " + esc(P.code))}
      <div class="list">
        <h2>You're in</h2>
        <p class="c mut small">Waiting for the host to start. ${P.set.word ? "Word" : "Tag"} mode.</p>
        <div class="names">${rows}</div>
      </div>`, guestLobby, "lobby");
  }

  /* ------------------------------------------------------------ leaving */
  function endParty() {
    if (!P) return home();
    if (P.role === "host") { broadcast({ t: "ended" }); setTimeout(() => { try { P && P.peer && P.peer.destroy(); } catch (_) {} P = null; }, 300); }
    else { P.leaving = true; send(P.conn, { t: "leave" }); setTimeout(() => { try { P && P.peer && P.peer.destroy(); } catch (_) {} P = null; }, 300); }
    keepAwake(false); Siren.stop();
    home();
  }
  function fail(why) {
    try { P && P.peer && P.peer.destroy(); } catch (_) {}
    P = null;
    view(`${bar("p-start")}<div class="grow"><h2>Couldn't start a party</h2><p class="c mut">${esc(why)}</p></div>`);
  }

  /* ------------------------------------------------------------ taps */
  app.addEventListener("click", e => {
    const b = e.target.closest("[data-a^='p-']");
    if (!b || b.disabled) return;
    const a = b.dataset.a;
    if (a === "p-start") { if (P && P.peer) { try { P.peer.destroy(); } catch (_) {} } P = null; return start(); }
    if (a === "p-host")  return nameScreen(host);
    if (a === "p-join")  return nameScreen(n => join(n));
    if (a === "p-rand")  { const i = $p("#pn"); if (i) i.value = NameCheck.random(P && P.players ? P.players.map(p => p.name) : []); return; }
    if (a === "p-name-ok") return nameOk();
    if (a === "p-join-go") return joinGo();
    if (a === "p-retry")   { P.tries = 0; view(`${bar("")}<div class="grow"><div class="spin"></div><p class="c mut">Reconnecting...</p></div>`); return connectGuest(); }
    if (a === "p-leave" || a === "p-end") return endParty();
    if (!P) return;
    if (a === "p-lobby")   return lobby();
    if (a === "p-add")     return addLocal();
    if (a === "p-add-ok")  return addLocalOk();
    if (a === "p-kick") {
      const id = b.dataset.id, c = P.conns.get(id);
      send(c, { t: "kicked" }); setTimeout(() => { try { c && c.close(); } catch (_) {} }, 200);
      P.conns.delete(id); P.players = P.players.filter(p => p.id !== id);
      shareLobby(); return lobby();
    }
    if (a === "p-mode")  { P.set.word = b.dataset.v === "word"; saveSet(); shareLobby(); return lobby(); }
    if (a === "p-hint")  { P.set.hint = !P.set.hint; saveSet(); shareLobby(); return lobby(); }
    if (a === "p-inc" || a === "p-dec") {
      const k = b.dataset.k, lim = { imps: [1, 7], meetings: [0, 9], each: [0, 3] }[k];
      P.set[k] = Math.min(lim[1], Math.max(lim[0], P.set[k] + (a === "p-inc" ? 1 : -1)));
      saveSet(); shareLobby(); return lobby();
    }
    if (a === "p-go")      { if (present().length < 3) return lobby("You need at least 3 players."); return deal(); }
    if (a === "p-handed")  return P.afterHand && P.afterHand();
    if (a === "p-seen")    return P.afterSeen && P.afterSeen();
    if (a === "p-on")      return gameOn();
    if (a === "p-meet") {
      if (P.role === "host") return hostMeetPick();
      return send(P.conn, { t: "meet", body: false });
    }
    if (a === "p-meet-by") return callMeeting(b.dataset.id, false);
    if (a === "p-body") {
      if (P.role === "host") return callMeeting("host", true);
      return send(P.conn, { t: "meet", body: true });
    }
    if (a === "p-hush")    return Siren.stop();
    if (a === "p-meetover") {
      const R = P.round; R.phase = "on"; Siren.stop();
      broadcast({ t: "meetover", left: R.meetLeft });
      return gameOn();
    }
    if (a === "p-cool") {
      const R = P.round;
      if (!R.coolEnd || R.coolEnd <= Date.now()) { R.coolEnd = Date.now() + R.cool * 1000; ringSet(R.cool, R.cool); }
      return;
    }
    if (a === "p-reveal") {
      const R = P.round; R.phase = "reveal";
      const r = { t: "reveal", mode: R.mode, word: R.word, cat: R.cat, imps: R.imps };
      broadcast(r); Siren.stop();
      return reveal(r);
    }
    if (a === "p-again") {
      P.round = null;
      P.players = P.players.filter(p => p.on || p.kind === "local");
      shareLobby(); return lobby();
    }
  });

  window.Party = { start, active: () => !!P };
})();
