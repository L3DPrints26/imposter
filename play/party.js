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
  let lobbyMore = false;              // "More rules" stays open across redraws
  let shareOpen = false;              // Text / Email / Copy, when the phone has no share sheet
  // Everyone gets a colored bubble with their first letter.
  const AV = ["#FFC61A", "#35E8FF", "#3AC75A", "#FF8A3D", "#8E7CFF", "#4DA3FF", "#F2F4F8"];
  const avColor = name => AV[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AV.length];
  function bubbles(list, canKick, meId) {
    return list.map(p => `<div class="av ${p.on || p.kind === "local" ? "" : "off"}">
        <i style="background:${avColor(p.name)}">${esc(p.name[0].toUpperCase())}</i><span>${esc(p.name)}</span>
        <em>${p.kind === "host" ? "host" : p.kind === "local" ? "your phone" : p.id === meId ? "you" : p.on ? "&nbsp;" : "offline"}</em>
        ${canKick && p.kind !== "host" ? `<button class="x" data-a="p-kick" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">&times;</button>` : ""}
      </div>`).join("");
  }
  const modeOf = s => s.far ? "far" : s.word ? "word" : "tag";

  /* ------------------------------------------------------------ helpers */
  const $p = s => app.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const newCode = () => Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join("");
  const send = (c, m) => { try { if (c && c.open) c.send(m); } catch (_) {} };
  const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const coolFor = (n, imps) => (n <= 6 ? 45 : n <= 10 ? 30 : 20) + (imps - 1) * 10;
  const SET_KEY = "imp_party_set";
  const loadSet = () => Object.assign({ word: true, imps: 1, hint: true, meetings: 3, each: 0, far: false, rounds: 1, vote: "phone" }, store.get(SET_KEY, {}));
  // The invite: a link to the website's game with the code in it. Opening it
  // (in any phone's browser) goes straight to "What's your name?" and then
  // into the party.
  const SITE = "https://l3dprints26.github.io/imposter/play/";
  const inviteUrl = () => SITE + "?join=" + P.code;
  const inviteText = () => `Join my Pocket Imposter game! Tap the link, type your name, and you're in: ${inviteUrl()} (party code ${P.code})`;
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
    if (m.t === "clue") return takeClue(pid, String(m.text || ""));
    if (m.t === "vote") return takeVote(pid, String(m.for || ""));
    if (m.t === "mvote") return takeMvote(pid, String(m.v || ""));
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
    const S2 = P.set, n = present().length, maxImp = impMax(Math.max(n, 3));
    S2.imps = Math.min(maxImp, Math.max(1, S2.imps));
    const step = (k, v, lo, hi, zero) =>
      `<div class="step"><button data-a="p-dec" data-k="${k}" ${v <= lo ? "disabled" : ""} aria-label="Fewer">&minus;</button>
       <output>${v === 0 && zero ? zero : v}</output>
       <button data-a="p-inc" data-k="${k}" ${v >= hi ? "disabled" : ""} aria-label="More">+</button></div>`;
    const mode = modeOf(S2), mini = (k, v, lo, hi, zero) => step(k, v, lo, hi, zero);
    const tile = (v, icon, name, sub) => `<button class="gm ${(v === "word" ? mode !== "tag" : mode === v) ? "on" : ""}" data-a="p-gmode" data-v="${v}">${icon}${name}<small>${sub}</small></button>`;
    // Far apart is Word mode with the clues typed instead of said, so it's a
    // switch under Word, not a third game.
    const rules = [];
    if (mode !== "tag") rules.push(`<div class="rcard" style="grid-column:1/-1"><span class="rl">Where is everyone?</span>${seg("p-where", [["here", "Same room"], ["far", "Far apart"]], mode === "far" ? "far" : "here")}</div>`);
    rules.push(`<div class="rcard"><span class="rl">Imposters</span>${mini("imps", S2.imps, 1, maxImp)}</div>`);
    if (mode !== "tag") rules.push(`<div class="rcard"><span class="rl">Imposter hint</span>${seg("p-hint", [["on", "On"], ["off", "Off"]], S2.hint ? "on" : "off")}</div>`);
    if (mode === "far") rules.push(`<div class="rcard"><span class="rl">Clues each</span>${mini("rounds", S2.rounds, 1, 3)}</div>`);
    if (mode === "tag") rules.push(`<div class="rcard"><span class="rl">Meetings</span>${mini("meetings", S2.meetings, 0, 9)}</div>`,
      `<div class="rcard"><span class="rl">Voting</span>${seg("p-vmode", [["phone", "Phones"], ["loud", "Out loud"]], S2.vote === "loud" ? "loud" : "phone")}</div>`,
      `<div class="rcard"><span class="rl">Meetings each</span>${mini("each", S2.each, 0, 3, "Any")}</div>`);
    view(`${bar("p-end", "Your party")}
      <div class="list" style="gap:8px">
        <div class="hero">
          <small>PARTY CODE</small>
          <p class="pcode">${P.code}</p>
          <div class="apps">
            <a class="app msg" href="sms:?&body=${encodeURIComponent(inviteText())}"><i>${I.msgIcon}</i>Messages</a>
            <a class="app mail" href="mailto:?subject=${encodeURIComponent("Join my Pocket Imposter game")}&body=${encodeURIComponent(inviteText())}"><i>${I.mailIcon}</i>Mail</a>
            <button class="app link" data-a="p-copy"><i>${I.linkIcon}</i>Copy link</button>
            <button class="app more" data-a="p-share"><i>${I.share}</i>More</button>
          </div>
          <p class="hint" id="pshare">${mode === "far" ? "They tap the link, type a name, and they're in." : "Or they tap Play together, Join, and type the code."}</p>
        </div>

        <p class="sec">Players <span>${P.players.length}</span></p>
        <div class="avs">${bubbles(P.players, true)}<button class="av add" data-a="p-add"><i>+</i><span>Add</span><em>no phone</em></button></div>

        <p class="sec">Game</p>
        <div class="gmodes">
          ${tile("word", I.bubble, "Word", mode === "far" ? "type your clues" : "say your clues")}
          ${tile("tag", I.run, "Tag", "play outside")}
        </div>

        <p class="sec">Rules</p>
        <div class="rgrid">${rules.join("")}</div>
        <p class="err">${esc(msg || "")}</p>
      </div>
      <button class="bar" data-a="p-go" ${n >= 3 ? "" : "disabled"}>${n >= 3 ? "START" : "Need 3 players"}</button>`, () => lobby(), "lobby");
    const d = $p(".more");
    if (d) d.addEventListener("toggle", () => { lobbyMore = d.open; });
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
    const n = ps.length, imps = Math.min(impMax(n), Math.max(1, P.set.imps));
    const impIds = new Set();
    while (impIds.size < imps) impIds.add(ps[rnd(n)].id);
    let cat = null, w = null, hint = "";
    const far = !!P.set.far;
    if (P.set.word || far) {
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
    // Far apart: clues go round the group in a fixed order, starting with a
    // random player, so everyone sees whose turn it is.
    const start = rnd(n), order = ps.map((_, i) => ps[(start + i) % n].id);
    P.round = { mode: P.set.word || far ? "word" : "tag", cards, far, order, turn: 0, rounds: P.set.rounds || 1,
      clues: [], votes: {}, out: {}, mv: null, result: null, graceEnd: 0, cat: cat ? cat.name : "", word: w ? w[0] : "",
      imps: ps.filter(p => impIds.has(p.id)).map(p => p.name), first: ps[start].name, n, impCount: imps,
      meetLeft: P.set.meetings, each: P.set.each, used: {}, phase: far ? "clues" : "on", startedAt: Date.now(),
      cool: coolFor(n, imps), coolEnd: 0, caller: "", body: false,
      queue: ps.filter(p => p.kind !== "phone").map(p => p.id) };
    P.conns.forEach((c, id) => { if (cards[id]) send(c, roundFor(id)); });
    nextHostCard();
  }
  function roundFor(id) {
    const R = P.round;
    return { t: "round", mode: R.mode, card: R.cards[id] || null, cat: R.cat, first: R.first, n: R.n,
      impCount: R.impCount, meetLeft: R.meetLeft, each: R.each, used: R.used[id] || 0, startedAt: R.startedAt,
      cool: R.cool, phase: R.phase, caller: R.caller, body: R.body,
      far: R.far, rounds: R.rounds, clues: R.clues, turnId: turnId(), turnName: nameOf(turnId()),
      people: R.order.map(i => ({ id: i, name: nameOf(i) })), votesIn: Object.keys(R.votes).length,
      votesNeeded: R.order.length, myVote: R.votes[id] || null,
      out: Object.keys(R.out || {}), mv: R.mv ? { inn: Object.keys(R.mv.votes).length, need: R.mv.voters.length, voters: R.mv.voters } : null,
      myMv: !!(R.mv && R.mv.votes[id]), result: R.result, graceLeft: Math.max(0, (R.graceEnd || 0) - Date.now()), vote: P.set.vote };
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

  /* ------------------------------------------------------------ far apart: clues and votes (host) */
  const nameOf = id => { const pl = P.players.find(p => p.id === id); return pl ? pl.name : (P.round && P.round.people ? (P.round.people.find(x => x.id === id) || {}).name || "" : ""); };
  function turnId() {
    const R = P.round;
    if (!R || !R.far || R.phase !== "clues") return "";
    return R.order[R.turn % R.order.length];
  }
  // Every phone gets the whole state after each change; screens redraw from it.
  function syncAll() {
    P.conns.forEach((c, id) => { if (P.round.cards[id]) send(c, roundFor(id)); });
    if (["on", "meeting", "mvote", "result"].includes(P.screen)) gameOn();
  }
  function takeClue(pid, text) {
    const R = P.round;
    if (!R || !R.far || R.phase !== "clues" || turnId() !== pid) return;
    const t = text.replace(/\s+/g, " ").trim().slice(0, 30);
    if (!t || !NameCheck.clean(t)) return;
    R.clues.push({ id: pid, name: nameOf(pid), text: t });
    R.turn++;
    if (R.turn >= R.order.length * R.rounds) R.phase = "vote";
    syncAll();
  }
  function takeVote(pid, target) {
    const R = P.round;
    if (!R || !R.far || R.phase !== "vote" || R.votes[pid] || !R.order.includes(pid) || !R.order.includes(target) || pid === target) return;
    R.votes[pid] = target;
    if (Object.keys(R.votes).length >= R.order.length) return countVotes();
    syncAll();
  }
  function countVotes() {
    const R = P.round, tally = {};
    Object.values(R.votes).forEach(t => { tally[t] = (tally[t] || 0) + 1; });
    const ranked = R.order.map(id => ({ id, name: nameOf(id), votes: tally[id] || 0 })).sort((a, b) => b.votes - a.votes);
    const top = ranked[0] && ranked[0].votes ? ranked.filter(x => x.votes === ranked[0].votes) : [];
    const out = top.length === 1 ? top[0] : null;              // a tie means nobody is out
    const caught = !!(out && R.cards[out.id] && R.cards[out.id].imp);
    R.phase = "reveal";
    const r = { t: "reveal", mode: "word", word: R.word, cat: R.cat, imps: R.imps, far: true,
      tally: ranked.filter(x => x.votes), out: out ? out.name : "", caught };
    broadcast(r); Siren.stop();
    reveal(r);
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
    if (R.phase === "mvote") return mvoteScreen();
    if (R.phase === "result") return resultScreen();
    if (R.far) return farScreen();
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
      const meOut = isOut(isHost ? "host" : P.me.id);
      const canEm = !meOut && R.meetLeft > 0 && (!R.each || isHost || myUsed < R.each);
      body = `<div class="calls">
          <button class="call em" data-a="p-meet" ${canEm ? "" : "disabled"}>${I.alarm}<span class="k">Emergency meeting</span>
            <span class="s">${R.meetLeft} left${R.each ? ", " + R.each + " each" : ""}</span></button>
          <button class="call body" data-a="p-body" ${meOut ? "disabled" : ""}>${I.alert}<span class="k">Report a body</span><span class="s">${meOut ? "you're out" : "free, any time"}</span></button>
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
  // Far apart. Clues: whose turn it is, everything said so far, and a box when
  // it's your turn (or the turn of someone playing on the host's phone).
  // Vote: tap who you think it is; the host's phone also votes for its people.
  function farScreen() {
    const R = P.round, isHost = P.role === "host";
    const me = isHost ? "host" : P.me.id;
    const people = R.people || R.order.map(i => ({ id: i, name: nameOf(i) }));
    const tid = isHost ? turnId() : R.turnId, tname = isHost ? nameOf(tid) : R.turnName;
    const clues = (R.clues || []).map(c => `<div><i>${esc(c.name.slice(0, 2))}</i><span>${esc(c.text)}</span><small class="mut">${esc(c.name)}</small></div>`).join("");
    const peek = myCard() ? `<button class="peek" id="hold">Hold to check your card</button><div class="card peekcard" id="card" aria-live="off"></div>` : "";
    let body = "", foot = "";
    if (R.phase === "clues") {
      const mine = tid === me || (isHost && (P.players.find(p => p.id === tid) || {}).kind === "local");
      const total = people.length * (R.rounds || 1), done = (R.clues || []).length;
      body = `<p class="c mut small">Clue ${Math.min(done + 1, total)} of ${total}. One word or two, about the secret word.</p>
        ${mine ? `<div class="names" style="margin-top:6px"><label><input id="pclue" class="ftxt" maxlength="30" autocomplete="off"
            enterkeyhint="send" placeholder="${tid === me ? "Your clue" : esc(tname) + "'s clue"}"></label></div>
          <p class="err" id="perr"></p>`
        : `<p class="c" style="font-size:20px;font-weight:700;margin:8px 0">${esc(tname)} is thinking...</p>`}`;
      if (mine) foot = `<button class="bar" data-a="p-clue" data-id="${tid}">Send${tid === me ? "" : " for " + esc(tname)}</button>`;
    } else if (R.phase === "vote") {
      // who still needs a vote on this phone
      const here = isHost ? P.players.filter(p => p.kind !== "phone" && R.order.includes(p.id)).map(p => p.id) : [me];
      const voted = id => isHost ? !!R.votes[id] : !!R.myVote;
      const next = here.find(id => !voted(id));
      if (next) {
        body = `<h2 class="ask">${next === me ? "Who's the imposter?" : esc(nameOf(next)) + ", who's the imposter?"}</h2>
          ${pickList(people.filter(x => x.id !== next).map(x => ({ v: x.id, label: esc(x.name) })))}`;
        foot = `<button class="bar" data-a="p-fv" data-by="${next}" data-needs-pick disabled>Submit vote</button>`;
      } else {
        const inn = isHost ? Object.keys(R.votes).length : R.votesIn, need = isHost ? R.order.length : R.votesNeeded;
        body = `<p class="c" style="font-size:20px;font-weight:700;margin:8px 0">Votes in: ${inn} of ${need}</p>
          ${isHost ? "" : '<p class="c mut small">Waiting for everyone to vote.</p>'}`;
        if (isHost) foot = '<button class="bar ghost" data-a="p-count">Count the votes now</button>';
      }
    }
    view(`${bar("", "")}
      <p class="cat"><span class="k">Category</span><span class="v">${esc(R.cat)}</span></p>
      <div class="chat">${clues || '<p class="c mut small">No clues yet. ' + esc(R.first) + " goes first.</p>"}</div>
      ${body}
      <div class="grow" style="justify-content:flex-end">${peek}</div>
      ${foot}`, farScreen, "on");
    if (peek) holdWire(cardInner(myCard(), R));
    const inp = $p("#pclue");
    if (inp) {
      inp.focus();
      inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $p('[data-a="p-clue"]').click(); } });
    }
  }

  function coolTile(R) {
    const gl = graceLeft(R);
    if (gl) return graceTile(gl);
    // Someone playing on the host's phone would be seen tapping it.
    if (P.role === "host" && P.players.some(p => p.kind === "local")) return coolNote(R.cool);
    const left = R.coolEnd ? Math.max(0, Math.ceil((R.coolEnd - Date.now()) / 1000)) : 0;
    return ringTile(left, R.cool, "p-cool");
  }
  function startTick() {
    stopTick();
    tick = setInterval(() => {
      const R = P && P.round, c = $p("#clock");
      if (!R || !c) return stopTick();
      c.textContent = mmss(Date.now() - R.startedAt);
      if (R.graceEnd) {
        const gl = graceLeft(R);
        if (gl > 0) return graceSet(gl);
        R.graceEnd = 0; if (navigator.vibrate) navigator.vibrate(200);
        return gameOn();
      }
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
    if (!R || R.mode !== "tag" || R.phase !== "on" || isOut(pid)) return;
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
      const ok = !isOut(p.id) && (!R.each || (R.used[p.id] || 0) < R.each);
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
          <p class="mut small">${P.set && P.set.vote === "loud" || R.vote === "loud" ? "Talk it over, then point at once on three. Most votes is out."
            : "Talk it over. Then everyone votes on their phone."}</p>
        </div>
        <p class="c mut small">${R.meetLeft} emergency meeting${R.meetLeft === 1 ? "" : "s"} left</p>
        <button class="bar ghost slim" data-a="p-hush">Stop the siren</button>
      </div>
      ${isHost ? (P.set.vote === "loud" ? '<button class="bar" data-a="p-mv-loud">Who got voted out?</button>' : '<button class="bar" data-a="p-mv-start">Start the vote</button>')
        : `<p class="c mut small" style="margin:8px 0">${(R.vote || P.set.vote) === "loud" ? "Talk it over. The host taps who's voted out." : "Talk it over. The vote opens on your phone."}</p>`}`,
      () => meeting(false), "meeting");
    if (loud) Siren.play(8);
  }

  /* ------------------------------------------------------------ meeting votes (Tag) */
  const isOut = id => { const R = P.round; return !!R && (Array.isArray(R.out) ? R.out.includes(id) : !!(R.out && R.out[id])); };
  const aliveIds = () => P.round.order.filter(id => !isOut(id));
  function startVote() {
    const R = P.round;
    R.phase = "mvote"; R.mv = { voters: aliveIds(), votes: {} };
    Siren.stop(); syncAll();
  }
  function takeMvote(pid, v) {
    const R = P.round;
    if (!R || R.phase !== "mvote" || !R.mv.voters.includes(pid) || R.mv.votes[pid]) return;
    if (v !== "skip" && v !== "tagged" && (!aliveIds().includes(v) || v === pid)) return;
    R.mv.votes[pid] = v;
    if (v === "tagged") R.out[pid] = true;
    if (Object.keys(R.mv.votes).length >= R.mv.voters.length) return mvCount();
    syncAll();
  }
  function tagWinnerP() {
    const R = P.round; let imp = 0, crew = 0;
    R.order.forEach(id => { if (!isOut(id)) (R.cards[id] && R.cards[id].imp) ? imp++ : crew++; });
    return imp === 0 ? "crew" : imp >= crew ? "imp" : "";
  }
  function mvCount() {
    const R = P.round, t = {}; let skips = 0;
    Object.values(R.mv.votes).forEach(v => { if (v === "skip") skips++; else if (v !== "tagged") t[v] = (t[v] || 0) + 1; });
    const ranked = Object.entries(t).map(([id, n]) => ({ id, n })).filter(x => !isOut(x.id)).sort((a, b) => b.n - a.n);
    let out = "";
    if (ranked.length && (ranked.length === 1 || ranked[0].n > ranked[1].n) && ranked[0].n > skips) out = ranked[0].id;
    if (out) R.out[out] = true;
    R.mv = null;
    finishVote(out, ranked.map(x => nameOf(x.id) + " " + x.n).concat(skips ? ["Skip " + skips] : []));
  }
  function finishVote(outId, tally) {
    const R = P.round;
    R.result = { out: outId ? nameOf(outId) : "", tally: tally || [], win: tagWinnerP() };
    R.phase = "result";
    syncAll();
  }
  function mvoteScreen() {
    const R = P.round, isHost = P.role === "host", me = isHost ? "host" : P.me.id;
    const voters = isHost ? R.mv.voters : (R.mv ? R.mv.voters : []);
    const here = isHost ? P.players.filter(p => p.kind !== "phone" && voters.includes(p.id)).map(p => p.id) : (voters.includes(me) ? [me] : []);
    const done = id => isHost ? !!R.mv.votes[id] : !!R.myMv;
    const next = here.find(id => !done(id));
    let body, foot = "";
    if (next) {
      const ids = R.order || (R.people || []).map(x => x.id);
      const items = ids.filter(id => !isOut(id) && id !== next).map(id => ({ v: id, label: esc(nameOf(id)) }))
        .concat([{ v: "skip", label: "Skip vote", cls: "skip" }]);
      body = `<h2 class="ask">${next === me ? "Who do you vote out?" : esc(nameOf(next)) + ", who do you vote out?"}</h2>
        ${next !== me ? '<p class="mut small">Hand the phone over. Votes are secret.</p>' : ""}
        ${pickList(items)}
        <button class="textbtn" data-a="p-mv" data-by="${next}" data-v="tagged">I got tagged, so I'm out</button>`;
      foot = `<button class="bar" data-a="p-mv" data-by="${next}" data-needs-pick disabled>Submit vote</button>`;
    } else {
      const inn = isHost ? Object.keys(R.mv.votes).length : (R.mv ? R.mv.inn : 0), need = isHost ? R.mv.voters.length : (R.mv ? R.mv.need : 0);
      body = `<div class="grow"><p class="c" style="font-size:22px;font-weight:700">Votes in: ${inn} of ${need}</p>
        <p class="c mut small">${isOut(me) ? "You're out, so you don't vote." : "Waiting for everyone else."}</p></div>`;
      if (isHost) foot = '<button class="bar ghost" data-a="p-mv-count">Count the votes now</button>';
    }
    view(`${bar("", "Vote")}<div class="list">${body}</div>${foot}`, mvoteScreen, "mvote");
  }
  function loudPick() {
    const R = P.round;
    const items = aliveIds().map(id => ({ v: id, label: esc(nameOf(id)) }))
      .concat([{ v: "none", label: "Nobody", sub: "skipped or a tie", cls: "skip" }]);
    view(`${bar("", "")}<div class="list"><h2 class="ask">Who got voted out?</h2>${pickList(items)}</div>
      <button class="bar" data-a="p-mv-out" data-needs-pick disabled>Done</button>`, loudPick, "loudpick");
  }
  function resultScreen() {
    const R = P.round, isHost = P.role === "host", r = R.result || {};
    view(`${bar("", "")}
      <div class="grow">
        <p class="c" style="font-size:20px;font-weight:700;color:var(--acc);letter-spacing:.08em">VOTE RESULT</p>
        <p class="who">${r.out ? esc(r.out) : "No one"}</p>
        <p class="c mut" style="font-size:18px">was voted out</p>
        ${r.tally && r.tally.length ? `<p class="c mut small">${r.tally.map(esc).join(" &nbsp;·&nbsp; ")}</p>` : ""}
        ${r.win ? `<p class="c" style="font-size:22px;font-weight:700;color:var(${r.win === "crew" ? "--crew" : "--imp"})">${
            r.win === "crew" ? "That was the last imposter. Crew win!" : "Imposters win! There are as many of them as crew left."}</p>`
          : `<div class="card" style="min-height:0;gap:6px"><p style="font-size:19px;font-weight:600">Everyone: &ldquo;3, 2, 1, UP!&rdquo;</p>
             <p class="mut small">Then no tagging for 15 seconds. Every phone counts it down.</p></div>`}
      </div>
      ${isHost ? (r.win ? '<button class="bar" data-a="p-reveal-yes">Reveal</button>' : '<button class="bar" data-a="p-mv-done">Back to the game</button>')
        : `<p class="c mut small" style="margin:8px 0">${r.win ? "The host reveals who the imposters were." : "The host takes everyone back to the game."}</p>`}`, resultScreen, "result");
  }
  // Reveal asks first in Tag, so a double tap can't end the round.
  function revealAsk() {
    view(`${bar("p-on", "")}
      <div class="grow">
        <h2>End the round?</h2>
        <p class="c mut">This shows everyone who the imposters were.</p>
        <button class="bar ghost" data-a="p-reveal-yes" style="margin-top:8px">Yes, reveal</button>
      </div>
      <button class="bar" data-a="p-on">Keep playing</button>`, revealAsk, "ask");
  }

  /* ------------------------------------------------------------ reveal */
  function revealNow() {
    const R = P.round; R.phase = "reveal";
    const r = { t: "reveal", mode: R.mode, word: R.word, cat: R.cat, imps: R.imps };
    broadcast(r); Siren.stop();
    return reveal(r);
  }
  function reveal(r) {
    const isHost = P.role === "host";
    view(`${bar("")}
      <div class="grow">
        ${r.mode === "word" ? `<p class="c mut" style="font-size:18px;font-weight:600">The word was</p>
          <p class="word c" data-fit style="font-size:52px;font-weight:700;color:var(--acc);white-space:nowrap">${esc(r.word)}</p>` : ""}
        ${r.far ? `<p class="c" style="font-size:22px;font-weight:700;color:${r.caught ? "var(--crew)" : "var(--imp)"}">${
            r.out ? esc(r.out) + " was voted out. " + (r.caught ? "Crew win!" : "Wrong one. Imposters win!") : "It's a tie, so nobody's out. Imposters win!"}</p>
          <p class="c mut small">${(r.tally || []).map(x => esc(x.name) + " " + x.votes).join(" &nbsp;·&nbsp; ")}</p>` : ""}
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
      P.round = Object.assign({}, m, { coolEnd: P.round && !fresh ? P.round.coolEnd : 0,
        graceEnd: m.graceLeft ? Date.now() + m.graceLeft : 0 });
      if (!fresh && P.screen === "card") return;          // they'll see it after "Got it"
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
    const s = P.set || {}, mode = modeOf(s);
    const what = mode === "far" ? "Word, far apart: you type your clues" : mode === "word" ? "Word: say your clues out loud" : "Tag: play outside";
    view(`${bar("p-leave", "Party")}
      <div class="list" style="gap:8px">
        <div class="hero">
          <small>YOU'RE IN</small>
          <p class="pcode">${esc(P.code)}</p>
          <p class="hint">${esc(what)}</p>
        </div>
        <p class="sec">Players <span>${P.players.length}</span></p>
        <div class="avs">${bubbles(P.players, false, P.me.id)}</div>
        <div class="wait" style="margin-top:12px"><div class="spin"></div>Waiting for the host to start</div>
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
    if (a === "p-where") { P.set.far = b.dataset.v === "far"; if (P.set.far) P.set.word = true; saveSet(); shareLobby(); return lobby(); }
    if (a === "p-share") {
      if (navigator.share) { navigator.share({ title: "Pocket Imposter", text: inviteText(), url: inviteUrl() }).catch(() => {}); return; }
      return copyInvite();                        // no share sheet: copy it instead
    }
    if (a === "p-gmode") {
      const v = b.dataset.v;
      P.set.word = v !== "tag"; if (v === "tag") P.set.far = false;
      saveSet(); shareLobby(); return lobby();
    }
    if (a === "p-copy")  return copyInvite();
    if (a === "p-clue") {
      const inp = $p("#pclue"), t = inp ? inp.value.replace(/\s+/g, " ").trim() : "";
      if (!t) return;
      if (!NameCheck.clean(t)) return ($p("#perr").textContent = "Try a different clue.");
      if (P.role === "host") return takeClue(b.dataset.id, t);
      inp.disabled = true; b.disabled = true;
      return send(P.conn, { t: "clue", text: t });
    }
    if (a === "p-vote") {
      if (P.role === "host") return takeVote(b.dataset.by, b.dataset.for);
      P.round.myVote = b.dataset.for; farScreen();
      return send(P.conn, { t: "vote", for: b.dataset.for });
    }
    if (a === "p-count") return countVotes();
    if (a === "p-mode")  { P.set.word = b.dataset.v === "word"; saveSet(); shareLobby(); return lobby(); }
    if (a === "p-hint")  { P.set.hint = b.dataset.v ? b.dataset.v === "on" : !P.set.hint; saveSet(); shareLobby(); return lobby(); }
    if (a === "p-inc" || a === "p-dec") {
      const k = b.dataset.k, lim = { imps: [1, 7], meetings: [0, 9], each: [0, 3], rounds: [1, 3] }[k];
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
    if (a === "p-vmode") { P.set.vote = b.dataset.v || (P.set.vote === "loud" ? "phone" : "loud"); saveSet(); shareLobby(); return lobby(); }
    if (a === "p-mv-start") return startVote();
    if (a === "p-mv") {
      const v = b.dataset.v || picked();
      if (!v) return;
      if (P.role === "host") return takeMvote(b.dataset.by, v);
      P.round.myMv = true; mvoteScreen();
      return send(P.conn, { t: "mvote", v });
    }
    if (a === "p-fv") {
      const v = picked();
      if (!v) return;
      if (P.role === "host") return takeVote(b.dataset.by, v);
      P.round.myVote = v; farScreen();
      return send(P.conn, { t: "vote", for: v });
    }
    if (a === "p-mv-count") return mvCount();
    if (a === "p-mv-loud") { Siren.stop(); return loudPick(); }
    if (a === "p-mv-out") {
      const v = picked();
      if (!v) return;
      if (v !== "none") P.round.out[v] = true;
      return finishVote(v === "none" ? "" : v, []);
    }
    if (a === "p-mv-done") {
      const R = P.round; R.phase = "on"; R.result = null; R.graceEnd = Date.now() + GRACE * 1000;
      return syncAll();
    }
    if (a === "p-reveal") return P.round && P.round.mode === "tag" ? revealAsk() : revealNow();
    if (a === "p-reveal-yes") return revealNow();
    if (a === "p-again") {
      P.round = null;
      P.players = P.players.filter(p => p.on || p.kind === "local");
      shareLobby(); return lobby();
    }
  });

  function copyInvite() {
    const msg = $p("#pshare");
    const ok = () => { if (msg) msg.textContent = "Link copied. Paste it in a text or email."; };
    try { navigator.clipboard.writeText(inviteText()).then(ok, () => { if (msg) msg.textContent = inviteUrl(); }); }
    catch (_) { if (msg) msg.textContent = inviteUrl(); }
  }
  // Opened from an invite: just a name, then straight in.
  function fromLink(code) {
    nameScreen(name => {
      P = { role: "guest", me: { id: "", name }, players: [], set: {}, round: null, code, peer: null, conn: null, tries: 0 };
      store.set("imp_party_code", code);
      view(`${bar("")}<div class="grow"><div class="spin"></div><p class="c mut">Joining ${esc(code)}...</p></div>`);
      connectGuest();
    });
  }

  window.Party = { start, fromLink, active: () => !!P };

  // Opened from an invite link (?join=ABCD): straight to the name, then in.
  const inv = (new URLSearchParams(location.search).get("join") || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (inv.length === 4) { try { history.replaceState(null, "", location.pathname); } catch (_) {} fromLink(inv); }
})();
