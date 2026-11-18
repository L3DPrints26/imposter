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
  // Relay for phones on different networks (college Wi-Fi, cell data), where a
  // direct connection can't get through. PeerJS's own free relay is dead
  // (2026-11-16), so it's our Metered TURN (free plan, hard-capped: it stops
  // at the limit, never charges). TURN logins always ship inside the page.
  const MT = { username: "9ed9a31bd959dc9cd59f8bf6", credential: "roOXagxvo6J80Lal" };
  const peerOpts = () => ({ debug: 0, config: { iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
    { urls: "turn:global.relay.metered.ca:80", ...MT },
    { urls: "turn:global.relay.metered.ca:80?transport=tcp", ...MT },
    { urls: "turn:global.relay.metered.ca:443", ...MT },
    { urls: "turns:global.relay.metered.ca:443?transport=tcp", ...MT }
  ], ...(window.IMP_RELAY_ONLY ? { iceTransportPolicy: "relay" } : {}) } });
  const ABC = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const MAXP = 15;
  const OFF_LIMIT = 120000, OFF_GRACE = 5000;   // a phone that goes off: 2:00 on screen, then 5 quiet seconds
  let P = null;                       // the party this phone is in
  let tick = null;                    // clock + cooldown on the game screen
  let lobbyMore = false;              // "More rules" stays open across redraws
  let shareOpen = false;              // Text / Email / Copy, when the phone has no share sheet
  // Everyone gets a colored bubble with their first letter.
  const AV = ["#FFC61A", "#35E8FF", "#3AC75A", "#FF8A3D", "#8E7CFF", "#4DA3FF", "#F2F4F8"];
  const avColor = name => AV[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AV.length];
  function bubbles(list, canKick, meId) {
    return list.map(p => `<div class="av ${p.on || p.kind === "local" ? "" : "off"}" data-pid="${p.id}" role="button" tabindex="0" aria-label="${esc(p.name)}: player card">
        <i style="background:${avColor(p.name)}">${esc(firstChar(p.name))}</i><span>${esc(p.name)}</span>
        <em>${p.kind === "host" ? "host" : p.kind === "local" ? (canKick ? "your phone" : "host's phone") : p.id === meId ? "you" : p.on ? "&nbsp;" : "offline"}</em>
        ${canKick && p.kind !== "host" ? `<button class="x" data-a="p-kick" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">&times;</button>` : ""}
      </div>`).join("");
  }
  const modeOf = s => s.far ? "far" : s.word ? "word" : "tag";
  // A player's card: full name and stats nobody can fake from their phone
  // (counted by the host), plus how many games they've played in all.
  function playerCard(id) {
    const p = (P.players || []).find(x => x.id === id);
    if (!p) return;
    const mins = p.joinedAt ? Math.max(0, Math.round((Date.now() - p.joinedAt) / 60000)) : null;
    const where = p.kind === "host" ? "Host" : p.kind === "local" ? "Plays on the host's phone" : p.on ? "Own phone" : "Offline";
    const old = document.querySelector(".aiwrap"); if (old) old.remove();
    const w = document.createElement("div");
    w.className = "aiwrap"; w.dataset.party = "1";
    w.innerHTML = `<div class="aisheet" role="dialog" aria-modal="true" aria-label="Player card">
      <div class="aihead"><span class="sp"></span><button data-x aria-label="Close">&times;</button></div>
      <div class="pcard">${avatar(p.name, "lg")}<h3>${esc(p.name)}</h3><p class="tagline">${where}</p>
        <div class="pstats">
          <div><b>${p.games || 0}</b><span>games in this party</span></div>
          <div><b>${p.total == null ? "&ndash;" : p.total}</b><span>games played in all</span></div>
          <div><b>${p.meetings || 0}</b><span>meetings called here</span></div>
          <div><b>${mins == null ? "&ndash;" : mins < 1 ? "new" : mins + " min"}</b><span>in this party</span></div>
        </div></div></div>`;
    w.addEventListener("click", e => { if (e.target === w || e.target.closest("[data-x]")) w.remove(); });
    document.body.appendChild(w);
  }
  app.addEventListener("click", e => {
    const av = e.target.closest(".av[data-pid]");
    if (!av || e.target.closest(".x") || !P) return;
    playerCard(av.dataset.pid);
  });

  /* ------------------------------------------------------------ helpers */
  const $p = s => app.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const newCode = () => Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join("");
  const send = (c, m) => { try { if (c && c.open) c.send(m); } catch (_) {} };
  const okStr = (v, max) => typeof v === "string" && v.length <= max;
  const REPORT = '<a class="textbtn" href="https://l3dprints26.github.io/imposter/help/?type=report#feedback" target="_blank" rel="noopener">Report a problem</a>';
  // This phone's key: a returning guest is matched by it, so a quick drop
  // (screen lock, Wi-Fi to cell) can't lock them out or let someone else
  // take their spot by typing their name.
  const KEY = store.get("imp_party_key", "") || (uid() + uid());
  const TAB = uid() + uid();          // this page only: a duplicated tab gets its own
  // Games this phone has been dealt into, ever. Shown on its player card.
  const myGames = () => Math.max(0, store.get("imp_games", 0) | 0);
  const countGame = () => store.set("imp_games", myGames() + 1);
  store.set("imp_party_key", KEY);
  // The host's own words go to other phones in a party, so they get the same
  // word check as clues; a word that fails is left out.
  const partyPool = () => {
    const pool = liveCats().map(c => !c.mine ? c : Object.assign({}, c, {
      name: NameCheck.clean(c.name) ? c.name : "Our words",
      words: c.words.filter(w => NameCheck.clean(w[0])) })).filter(c => c.words.length);
    return pool.length ? pool : CATS;
  };
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
  const keepAwake = on => on ? Awake.on() : Awake.off();
  // Coming back to the app after the screen went off: the phone may have
  // dropped its connection. The host reconnects under the same code; guests
  // are already retrying on their own.
  document.addEventListener("visibilitychange", () => {
    if (!P || document.hidden) return;
    keepAwake(true);
    if (P.role === "host" && P.peer) {
      if (P.peer.destroyed) openAs(0, P.code);
      else if (P.peer.disconnected) { try { P.peer.reconnect(); } catch (_) {} }
    }
    if (P.role === "guest" && P.me.id && !P.dead && (!P.conn || !P.conn.open) && P.screen !== "reconnect") guestLost(P.conn);
  });

  const attr = (sel, k) => { const e = $p(sel); return e ? e.dataset[k] || "" : ""; };
  const loadOn = text => { if (window.Loader && P) { P.loading = true; P.loadAt = Date.now(); Loader.show(text); } };
  const loadOff = () => {
    if (!P || !P.loading || !window.Loader) return;
    P.loading = false;
    setTimeout(() => Loader.hide(), Math.max(0, 1100 - (Date.now() - P.loadAt)));
  };
  function view(html, redrawFn, screen) {
    // A redraw of the same screen (a vote came in, someone rejoined) keeps what
    // this phone was in the middle of: a checked name, a half-typed clue.
    const same = !!(P && screen && P.screen === screen), c0 = $p("#pclue");
    const keep = same ? { pick: picked(), by: attr("[data-by]", "by"), clue: c0 ? c0.value : "", cfor: attr('[data-a="p-clue"]', "id") } : null;
    // The box being typed in (if any): put it back with its text and cursor, so a
    // redraw (someone else's clue, a vote) never closes the keyboard or wipes it.
    const ae = document.activeElement, typing = same && ae && app.contains(ae) && ae.id && /^(INPUT|TEXTAREA)$/.test(ae.tagName)
      ? { id: ae.id, v: ae.value, a: ae.selectionStart, b: ae.selectionEnd, top: ae.getBoundingClientRect().top } : null;
    if (!same) document.querySelectorAll(".aiwrap[data-party]").forEach(x => x.remove());
    stopTick();
    window.onblur = null; document.onvisibilitychange = null;
    if (P) P.screen = screen || "";
    if (screen) loadOff();                 // a real screen is up: the loading screen can go
    redraw = redrawFn || (() => {});
    app.innerHTML = html;
    if (!keep) return;
    if (keep.pick && attr("[data-by]", "by") === keep.by) {
      const o = [...app.querySelectorAll(".opt")].find(x => x.dataset.v === keep.pick);
      if (o) { o.classList.add("on"); o.setAttribute("aria-checked", "true"); const s = $p("[data-needs-pick]"); if (s) s.disabled = false; }
    }
    const c1 = $p("#pclue");
    if (keep.clue && c1 && attr('[data-a="p-clue"]', "id") === keep.cfor) c1.value = keep.clue;
    const t = typing && document.getElementById(typing.id);
    if (t && app.contains(t) && (typing.id !== "pclue" || attr('[data-a="p-clue"]', "id") === keep.cfor)) {
      t.value = typing.v; t.focus({ preventScroll: true });
      try { t.setSelectionRange(typing.a, typing.b); } catch (_) {}
      queueMicrotask(() => { const d = t.getBoundingClientRect().top - typing.top; if (Math.abs(d) > 2) window.scrollBy(0, d); });
    }
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
    P = { role: "host", me: { id: "host", name }, set: loadSet(), conns: new Map(), banned: new Set(), locked: false,
          players: [{ id: "host", name, kind: "host", on: true, key: KEY, joinedAt: Date.now(), games: 0, meetings: 0, total: myGames() }],
          round: null, code: "", peer: null };
    view(`${bar("")}<div class="grow"><div class="spin"></div><p class="c mut">Making your party...</p></div>`);
    loadOn("Making your party");
    openAs(0);
  }
  // keep: the code to reuse when the host's phone wakes back up, so the
  // party (and the round in progress) comes back under the same code.
  function openAs(tries, keep) {
    const code = keep || newCode();
    const peer = new Peer(PREFIX + code, peerOpts());
    peer.on("open", () => {
      if (!P || P.role !== "host") return peer.destroy();
      P.peer = peer; P.code = code;
      keepAwake(true);
      if (!keep) lobby();
    });
    peer.on("connection", conn => {
      conn.on("data", m => hostMsg(conn, m));
      conn.on("close", () => hostLost(conn));
      conn.on("error", () => hostLost(conn));
    });
    // Lost the PeerJS server (no signal outdoors): try again every 2 seconds,
    // not in a tight loop.
    peer.on("disconnected", () => setTimeout(() => {
      try { if (P && P.peer === peer && !peer.destroyed && peer.disconnected) peer.reconnect(); } catch (_) {}
    }, 2000));
    peer.on("error", e => {
      if (keep) { peer.destroy(); return setTimeout(() => P && P.role === "host" && P.code === keep && openAs(0, keep), 3000); }
      if (e.type === "unavailable-id" && tries < 6) { peer.destroy(); return openAs(tries + 1); }
      if (P && !P.code) return fail(netWhy(e));
    });
  }

  const present = () => P.players.filter(p => p.on || p.kind === "local");
  const nameTaken = (n, exceptId) => P.players.some(p => p.id !== exceptId && p.name.toLowerCase() === n.toLowerCase());
  function lobbyMsg() {
    return { t: "lobby", code: P.code, set: P.set, inRound: !!P.round,
             players: P.players.map(p => ({ id: p.id, name: p.name, kind: p.kind, on: p.on,
               offLeft: p.offAt && !p.on ? Math.max(0, OFF_LIMIT - (Date.now() - p.offAt)) : 0,
               joinedAt: p.joinedAt, games: p.games || 0, meetings: p.meetings || 0, total: p.total })) };
  }
  function broadcast(m) { P.conns.forEach(c => send(c, m)); }
  function shareLobby() { if (P && P.role === "host") broadcast(lobbyMsg()); }

  function hostMsg(conn, m) {
    if (!P || P.role !== "host" || !m || typeof m !== "object") return;
    conn.seen = Date.now();
    if (m.t === "pong") { conn.beats = true; return; }
    if (m.t === "join") {
      if (conn.pid) return;                                // this phone is already in
      if (!okStr(m.name, 60) || (m.key != null && !okStr(m.key, 40)) || (m.tab != null && !okStr(m.tab, 40))) return;
      const tab = m.tab || "", games = Math.max(0, Math.min(100000, Math.floor(+m.games) || 0));
      const r = NameCheck.check(m.name);
      if (!r.ok) return send(conn, { t: "reject", why: r.why, name: true });
      const key = m.key || "", lname = r.name.toLowerCase();
      if (P.banned.has(lname) || (key && P.banned.has("k:" + key)))
        return send(conn, { t: "reject", why: "The host removed you from this party." });
      // A phone that dropped out (screen locked, signal) comes back. Its key
      // finds it even before the old connection times out; pages too old to
      // send a key come back by name.
      // Only the same page, or a player who's gone offline, can take a spot
      // back. Before, a second tab with the same key knocked the first one out.
      const back = P.players.find(p => p.kind === "phone" &&
        (key ? p.key === key && (!p.on || p.tab === tab) : !p.on && !p.key && p.name.toLowerCase() === lname));
      if (back) {
        back.tab = tab; delete back.offAt;
        const old = P.conns.get(back.id);
        if (old && old !== conn) { old.pid = null; try { old.close(); } catch (_) {} }
        back.on = true; conn.pid = back.id; P.conns.set(back.id, conn);
        send(conn, { t: "welcome", id: back.id, code: P.code });
        send(conn, lobbyMsg());
        if (P.round) {
          const R = P.round;
          if (R.phase === "reveal" && R.revealMsg) send(conn, R.revealMsg);
          else if (R.cards[back.id]) send(conn, roundFor(back.id));
          else if (P.set.late) lateDeal(back.id, conn);
        }
        shareLobby(); refresh();
        return;
      }
      // One phone, one player: a second tab or window on the same phone can't
      // join again (stops one person filling the party from one spot).
      if (key && P.players.some(p => p.key === key && p.on))
        return send(conn, { t: "reject", why: "This phone is already in this party. One phone, one player." });
      if (P.locked) return send(conn, { t: "reject", why: "The host isn't letting new players in right now." });
      if (nameTaken(r.name)) return send(conn, { t: "reject", why: "That name is already taken in this party. Pick another.", name: true });
      if (P.players.length >= MAXP) return send(conn, { t: "reject", why: "This party is full (15 players)." });
      // During the reveal anyone can join and wait for the next game. Mid-game
      // only with "Allow late joining" on.
      if (P.round && P.round.phase !== "reveal" && !P.set.late) return send(conn, { t: "reject", why: "A game is going. Join when it ends." });
      const id = uid();
      P.players.push({ id, name: r.name, kind: "phone", on: true, key, tab, joinedAt: Date.now(), games: 0, meetings: 0, total: games });
      conn.pid = id; P.conns.set(id, conn);
      send(conn, { t: "welcome", id, code: P.code });
      send(conn, lobbyMsg());
      if (P.round && P.round.phase !== "reveal") lateDeal(id, conn);
      shareLobby(); refresh();
      return;
    }
    const pid = conn.pid;
    if (!pid) return;
    if (m.t === "meet") return callMeeting(pid, !!m.body);
    if (m.t === "clue") return okStr(m.text, 60) && takeClue(pid, m.text);
    // A vote the host can't take (the round moved on) puts that phone's
    // screen back the way the host sees it.
    if (m.t === "vote") { if (!(okStr(m.for, 60) && takeVote(pid, m.for)) && P.round) send(conn, roundFor(pid)); return; }
    if (m.t === "mvote") { if (!(okStr(m.v, 60) && takeMvote(pid, m.v)) && P.round) send(conn, roundFor(pid)); return; }
    if (m.t === "leave") {
      const pl = P.players.find(p => p.id === pid);
      P.conns.delete(pid);
      if (pl) { if (P.round) { pl.on = false; pl.offAt = Date.now() - OFF_LIMIT; } else P.players = P.players.filter(p => p.id !== pid); }
      try { conn.close(); } catch (_) {}
      shareLobby(); refresh();
    }
  }
  function hostLost(conn) {
    if (!P || P.role !== "host" || !conn.pid) return;
    if (P.conns.get(conn.pid) !== conn) return;     // already replaced by a rejoin
    P.conns.delete(conn.pid);
    const pl = P.players.find(p => p.id === conn.pid);
    if (pl) { pl.on = false; pl.offAt = Date.now(); }
    shareLobby(); if (P.round) syncAll(); else refresh();
  }
  // Every second on the host: anyone off for longer than 2:00 (+5 s) is removed.
  function sweepOff() {
    if (!P || P.role !== "host") return;
    const gone = P.players.filter(p => p.offAt && !p.on && Date.now() - p.offAt > OFF_LIMIT + OFF_GRACE);
    if (!gone.length) return;
    gone.forEach(pl => {
      P.players = P.players.filter(p => p.id !== pl.id);
      P.conns.delete(pl.id);
      const R = P.round;
      if (R) {
        if (R.mode === "tag") R.out[pl.id] = true;           // gone counts as out
        if (R.mv) R.mv.voters = R.mv.voters.filter(x => x !== pl.id);
        if (R.far && R.phase === "clues" && turnId() === pl.id) {
          R.clues.push({ id: pl.id, name: pl.name, text: "(left)" }); advanceTurn();
        }
      }
    });
    shareLobby();
    const R = P.round;
    if (R && R.mode === "tag" && R.phase === "mvote" && R.mv && R.mv.voters.every(v => R.mv.votes[v])) return mvCount();
    if (R && R.mode === "tag" && R.phase === "on" && tagWinnerP()) return finishVote("", [], "left");
    if (R && R.far && R.phase === "vote" && voters(R).length && voters(R).every(id => R.votes[id])) return countVotes();
    if (R) syncAll(); else refresh();
  }
  // Redraw the host's screen when it shows something that just changed.
  function refresh() { if (P && (P.screen === "lobby" || P.screen === "on")) redraw(); }

  function lobby(msg) {
    const S2 = P.set, n = present().length, maxImp = impMax(Math.max(n, 3));
    S2.imps = Math.min(maxImp, Math.max(1, S2.imps));
    const far = modeOf(S2) === "far";        // far apart: one imposter, one vote decides it
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
    rules.push(`<div class="rcard"><span class="rl">Imposters</span>${far ? mini("imps", 1, 1, 1) : mini("imps", S2.imps, 1, maxImp)}</div>`);
    if (mode !== "tag") rules.push(`<div class="rcard"><span class="rl">Imposter hint</span>${seg("p-hint", [["on", "On"], ["off", "Off"]], S2.hint ? "on" : "off")}</div>`);
    if (mode === "far") rules.push(`<div class="rcard"><span class="rl">Clues per player</span>${mini("rounds", S2.rounds, 1, 3)}</div>`);
    if (mode === "tag") rules.push(`<div class="rcard"><span class="rl">Meetings</span>${mini("meetings", S2.meetings, 0, 9)}</div>`,
      `<div class="rcard"><span class="rl">Voting</span>${seg("p-vmode", [["phone", "Phones"], ["loud", "Out loud"]], S2.vote === "loud" ? "loud" : "phone")}</div>`,
      `<div class="rcard"><span class="rl">Meetings per player</span>${mini("each", S2.each, 0, 3, "Any")}</div>`);
    view(`${bar("p-end", "Your party")}
      <div class="list" style="gap:8px">
        <div class="hero">
          <small>PARTY CODE</small>
          <p class="pcode">${P.code}</p>
          <div class="apps">
            <a class="app msg" href="sms:?&body=${encodeURIComponent(inviteText())}"><i>${I.msgIcon}</i>Messages</a>
            <a class="app mail" href="mailto:?subject=${encodeURIComponent("Join my Pocket Imposter game")}&body=${encodeURIComponent(inviteText())}"><i>${I.mailIcon}</i>Mail</a>
            <button class="app link" data-a="p-copy"><i>${I.linkIcon}</i>Copy link</button>
            <button class="app shmore" data-a="p-share"><i>${I.share}</i>More</button>
          </div>
          <p class="hint" id="pshare">${mode === "far" ? "They tap the link, type a name, and they're in." : "Or they tap Play together, Join, and type the code."}</p>
        </div>

        <p class="sec">Players <span>${P.players.length}</span></p>
        <div class="avs">${bubbles(P.players, true)}<button class="av add" data-a="p-add"><i>+</i><span>Add</span><em>on your phone</em></button></div>

        <p class="sec">Game</p>
        <div class="gmodes">
          ${tile("word", I.bubble, "Word", mode === "far" ? "type your clues" : "say your clues")}
          ${tile("tag", I.run, "Tag", "play outside")}
        </div>

        <p class="sec">Rules</p>
        <div class="rgrid">${rules.join("")}
          <div class="rcard" ${(rules.length - (mode !== "tag" ? 1 : 0)) % 2 ? "" : 'style="grid-column:1/-1"'}><span class="rl">New players</span>${seg("p-lock", [["open", "Open"], ["locked", "Locked"]], P.locked ? "locked" : "open")}</div>
          <div class="rcard" style="grid-column:1/-1"><span class="rl">Allow late joining</span>${seg("p-late", [["off", "Off"], ["on", "On"]], S2.late ? "on" : "off")}</div>
        </div>
        <p class="err">${esc(msg || "")}</p>
        ${REPORT}
      </div>
      <button class="bar" data-a="p-go" ${n >= 3 ? "" : "disabled"}>${n >= 3 ? "START" : "Need 3 players"}</button>`, () => lobby(), "lobby");
  }

  function addLocal(msg) {
    view(`${bar("p-lobby", "Add a player")}
      <div class="list">
        <h2>Who's playing on your phone?</h2>
        <p class="c mut small">They look at their card on your phone when the game starts.</p>
        <div class="names"><label><input id="pn" class="ftxt" maxlength="14" autocomplete="off" autocapitalize="words" enterkeyhint="done" placeholder="Their name"></label></div>
        <button class="bar ghost slim" data-a="p-rand">Random name</button>
        <p class="err" id="perr">${esc(msg || "")}</p>
      </div>
      <button class="bar" data-a="p-add-ok">Add</button>`, () => addLocal(msg), "add");
    $p("#pn").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addLocalOk(); } });
  }
  function addLocalOk() {
    const r = NameCheck.check($p("#pn").value);
    if (!r.ok) return ($p("#perr").textContent = r.why);
    if (nameTaken(r.name)) return ($p("#perr").textContent = "Someone here already has that name.");
    if (P.players.length >= MAXP) return ($p("#perr").textContent = "The party is full (15 players).");
    P.players.push({ id: uid(), name: r.name, kind: "local", on: true, joinedAt: Date.now(), games: 0, meetings: 0, total: null });
    shareLobby(); lobby();
  }

  /* ------------------------------------------------------------ the round (host deals) */
  function deal() {
    const ps = present();
    const n = ps.length, imps = P.set.far ? 1 : Math.min(impMax(n), Math.max(1, P.set.imps));
    const impIds = new Set();
    while (impIds.size < imps) impIds.add(ps[rnd(n)].id);
    let cat = null, w = null, hint = "";
    const far = !!P.set.far;
    if (P.set.word || far) {
      const recent = store.get("imp_recent", []), pool = partyPool();
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
      names: Object.fromEntries(ps.map(p => [p.id, p.name])),
      meetLeft: P.set.meetings, each: P.set.each, used: {}, phase: far ? "clues" : "on", startedAt: Date.now(),
      cool: coolFor(n, imps), coolEnd: 0, caller: "", body: false,
      queue: ps.filter(p => p.kind !== "phone").map(p => p.id), dealing: true };
    ps.forEach(p => { p.games = (p.games || 0) + 1; if (p.total != null) p.total++; });
    countGame();
    P.conns.forEach((c, id) => { if (cards[id]) send(c, roundFor(id)); });
    nextHostCard();
    if (window.Loader) Loader.show("Dealing cards", 1200, { players: n, imps });
  }
  // Someone joins while a game is going ("Allow late joining"): they're crew,
  // dealt in right away. Far apart has a turn order, so they wait for the next one.
  function lateDeal(id, conn) {
    const R = P.round;
    if (!R || R.far || R.cards[id]) return;
    R.cards[id] = { imp: false, word: R.mode === "word" ? R.word : "", hint: "" };
    R.order.push(id); R.n++;
    if (R.names) R.names[id] = nameOf(id);
    const pl = P.players.find(p => p.id === id);
    if (pl) { pl.games = (pl.games || 0) + 1; if (pl.total != null) pl.total++; }
    send(conn, roundFor(id));
  }
  // During a game: a bar for each player whose phone went off, counting down.
  const offUntil = {};                 // id -> when the countdown hits 0:00 (this phone's clock)
  function offBanner() {
    if (!P || !P.round) return "";
    return (P.players || []).filter(p => p.kind === "phone" && !p.on && offUntil[p.id]).slice(0, 3).map(p =>
      `<div class="offbar">${I.alert}<span><b>${esc(p.name)}'s phone went off</b>
        <small>${esc(p.name)} gets removed in <span data-offid="${p.id}">${mmss(offUntil[p.id] - Date.now())}</span> unless they get back in.</small></span></div>`).join("");
  }
  function trackOff() {
    const now = Date.now();
    (P && P.players || []).forEach(p => {
      if (p.on || p.kind !== "phone") { delete offUntil[p.id]; return; }
      if (P.role === "host") { if (p.offAt) offUntil[p.id] = p.offAt + OFF_LIMIT; }
      else if (p.offBy) offUntil[p.id] = p.offBy;
    });
  }
  setInterval(() => {
    document.querySelectorAll("[data-offid]").forEach(el => { el.textContent = mmss((offUntil[el.dataset.offid] || 0) - Date.now()); });
    sweepOff();
  }, 1000);
  // Heartbeat. A phone whose screen goes off or that closes the app often
  // doesn't say goodbye, and the connection can take a long time to notice.
  // The host pings every 4 s; anyone quiet for 12 s counts as gone (and gets
  // the 2-minute countdown). Guests watch the host the same way. Only phones
  // that answer pings are judged this way, so an older version isn't dropped.
  const BEAT = 4000, QUIET = 12000;
  setInterval(() => {
    if (!P) return;
    const now = Date.now();
    if (P.role === "host" && P.code) {
      broadcast({ t: "ping" });
      P.conns.forEach(c => { if (c.beats && c.seen && now - c.seen > QUIET) { hostLost(c); try { c.close(); } catch (_) {} } });
    }
    if (P.role === "guest" && P.me && P.me.id && P.conn && P.conn.beats && !P.leaving && !P.dead && P.screen !== "reconnect" &&
        P.conn.seen && now - P.conn.seen > QUIET) guestLost(P.conn);
  }, BEAT);
  // The party code during a game, when late joining is on.
  // Tapping it opens a card to copy the code or send the invite.
  const lateChip = () => (P && P.set && P.set.late && P.code
    ? `<button class="latecode" data-a="p-latecode" aria-label="Share the party code ${esc(P.code)}">Late joining on &middot; code <b>${esc(P.code)}</b>${I.share}</button>` : "") + (trackOff(), offBanner());
  function codeSheet() {
    const old = document.querySelector(".aiwrap");
    if (old) old.remove();
    const w = document.createElement("div");
    w.className = "aiwrap"; w.dataset.party = "1";
    w.innerHTML = `<div class="aisheet" role="dialog" aria-modal="true" aria-label="Invite someone">
      <div class="aihead"><span><b>Invite someone</b><small>${P.round && P.round.far ? "They join the next game" : "They join this game right away"}</small></span><span class="sp"></span><button data-x aria-label="Close">&times;</button></div>
      <div class="shbody">
        <button class="codebig" data-share="code"><small>PARTY CODE</small><b>${esc(P.code)}</b><span>${I.copy} Copy code</span></button>
        <div class="apps">
          <a class="app msg" href="sms:?&body=${encodeURIComponent(inviteText())}"><i>${I.msgIcon}</i>Messages</a>
          <a class="app mail" href="mailto:?subject=${encodeURIComponent("Join my Pocket Imposter game")}&body=${encodeURIComponent(inviteText())}"><i>${I.mailIcon}</i>Mail</a>
          <button class="app link" data-share="link"><i>${I.linkIcon}</i>Copy link</button>
          <button class="app shmore" data-share="more"><i>${I.share}</i>More</button>
        </div>
        <p class="shnote" id="shnote">Or they tap Play together, Join, and type the code.</p>
      </div></div>`;
    w.addEventListener("click", e => {
      if (e.target === w || e.target.closest("[data-x]")) return w.remove();
      const b = e.target.closest("[data-share]");
      if (!b || !P) return;
      const note = t => { const n = w.querySelector("#shnote"); if (n) n.textContent = t; };
      const copy = (t, done) => { try { navigator.clipboard.writeText(t).then(() => note(done), () => note(t)); } catch (_) { note(t); } };
      if (b.dataset.share === "code") return copy(P.code, "Code copied.");
      if (b.dataset.share === "link") return copy(inviteText(), "Link copied. Paste it in a text or email.");
      if (typeof Native !== "undefined" && Native && Native.share) return Native.share({ text: inviteText(), url: inviteUrl() }).catch(() => note(inviteUrl()));
      if (navigator.share) return navigator.share({ title: "Pocket Imposter", text: inviteText(), url: inviteUrl() }).catch(() => {});
      note(inviteUrl());
    });
    document.body.appendChild(w);
  }
  function roundFor(id) {
    const R = P.round;
    return { t: "round", mode: R.mode, card: R.cards[id] || null, cat: R.cat, first: R.first, n: R.n,
      impCount: R.impCount, meetLeft: R.meetLeft, each: R.each, used: R.used[id] || 0, startedAt: R.startedAt,
      cool: R.cool, phase: R.phase, caller: R.caller, body: R.body,
      far: R.far, rounds: R.rounds, clues: R.clues, turnId: turnId(), turnName: nameOf(turnId()),
      people: voters(R).map(i => ({ id: i, name: nameOf(i) })), votesIn: Object.keys(R.votes).length,
      votesNeeded: voters(R).length, myVote: R.votes[id] || null, dealing: !!R.dealing, clueTotal: R.order.length * (R.rounds || 1),
      out: Object.keys(R.out || {}), mv: R.mv ? { inn: Object.keys(R.mv.votes).length, need: R.mv.voters.length, voters: R.mv.voters } : null,
      myMv: !!(R.mv && R.mv.votes[id]), result: R.result, graceLeft: Math.max(0, (R.graceEnd || 0) - Date.now()), vote: P.set.vote };
  }
  // The host's own card, then anyone playing on the host's phone, one by one.
  function nextHostCard() {
    const R = P.round, id = R.queue.shift();
    if (!id) { R.dealing = false; P.conns.forEach((c, cid) => { if (R.cards[cid]) send(c, roundFor(cid)); }); return gameOn(); }
    const pl = P.players.find(p => p.id === id);
    if (pl.kind === "host") return showCard(R.cards[id], "Your card", nextHostCard, R);
    view(`${bar("")}
      <div class="grow">
        <p class="c mut" style="font-size:20px;font-weight:600">Hand your phone to</p>
        <div class="whobox">${avatar(pl.name, "lg")}<p class="who">${esc(pl.name)}</p></div>
      </div>
      <button class="bar" data-a="p-handed">Then tap here</button>`, () => {}, "pass");
    P.afterHand = () => showCard(R.cards[id], esc(pl.name) + "'s card", nextHostCard, R);
  }

  /* ------------------------------------------------------------ far apart: clues and votes (host) */
  const nameOf = id => { const pl = P.players.find(p => p.id === id); return pl ? pl.name : (P.round && P.round.names && P.round.names[id]) || (P.round && P.round.people ? (P.round.people.find(x => x.id === id) || {}).name || "" : ""); };
  // Far apart: who can still vote (and be voted for) - everyone dealt in who's still in the party.
  const voters = R => R.order.filter(id => P.players.some(p => p.id === id));
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
    advanceTurn();
    syncAll();
  }
  // Next turn. Someone no longer in the party is skipped on the spot; someone
  // who just went offline can be skipped by the host.
  function advanceTurn() {
    const R = P.round;
    for (let g = 0; g <= R.order.length * R.rounds; g++) {
      R.turn++;
      if (R.turn >= R.order.length * R.rounds) { R.phase = "vote"; return; }
      const id = turnId();
      if (P.players.some(p => p.id === id)) return;
      R.clues.push({ id, name: nameOf(id), text: "(left)" });
    }
  }
  function skipTurn() {
    const R = P.round, id = turnId();
    if (!R || !id) return;
    R.clues.push({ id, name: nameOf(id), text: "(skipped)" });
    advanceTurn(); syncAll();
  }
  function takeVote(pid, target) {
    const R = P.round;
    if (!R || !R.far || R.phase !== "vote" || R.votes[pid] || !R.order.includes(pid) || !voters(R).includes(target) || pid === target) return false;
    R.votes[pid] = target;
    if (voters(R).every(v => R.votes[v])) { countVotes(); return true; }
    syncAll();
    return true;
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
    R.revealMsg = r;                     // for anyone who rejoins now
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
    const peek = myCard() ? `<div class="card peekcard" id="card" aria-live="off"></div>
      <button class="peek" id="hold">Hold to check your card</button>` : "";
    let body;
    if (R.mode === "word") {
      body = `<p class="cat"><span class="k">Category</span><span class="v">${esc(R.cat)}</span></p>
        <div class="card" style="min-height:0"><p style="font-size:22px;font-weight:600">${esc(R.first)} starts.</p>
        <p class="mut">One clue each. ${R.impCount} imposter${R.impCount === 1 ? "" : "s"}.</p></div>
        <p class="c mut small">Go around, one word each. Talk it over, then point on three.</p>`;
    } else {
      // The host's buttons work for everyone playing on the host's phone.
      const mine = isHost ? P.players.filter(p => p.kind !== "phone").map(p => p.id) : [P.me.id];
      const usedBy = id => isHost ? (R.used[id] || 0) : (R.used || 0);
      const meOut = mine.every(isOut);
      const canEm = !R.dealing && R.meetLeft > 0 && mine.some(id => !isOut(id) && (!R.each || usedBy(id) < R.each));
      body = `<div class="calls">
          <button class="call em" data-a="p-meet" ${canEm ? "" : "disabled"}>${I.alarm}<span class="k">Emergency meeting</span>
            <span class="s">${R.meetLeft} left${R.each ? " &middot; " + R.each + " per player" : ""}</span></button>
          <button class="call body" data-a="p-body" ${meOut || R.dealing ? "disabled" : ""}>${I.alert}<span class="k">Report a body</span><span class="s">${meOut ? "you're out" : R.dealing ? "cards still going out" : "free, any time"}</span></button>
        </div>
        ${coolTile(R)}`;
    }
    view(`${bar("", "")}
      ${lateChip()}
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
    const people = R.people || voters(R).map(i => ({ id: i, name: nameOf(i) }));
    const tid = isHost ? turnId() : R.turnId, tname = isHost ? nameOf(tid) : R.turnName;
    const clues = (R.clues || []).map(c => `<div><i>${esc(c.name.slice(0, 2))}</i><span>${esc(c.text)}</span><small class="mut">${esc(c.name)}</small></div>`).join("");
    const peek = myCard() ? `<div class="card peekcard" id="card" aria-live="off"></div><button class="peek" id="hold">Hold to check your card</button>` : "";
    let body = "", foot = "";
    if (R.phase === "clues") {
      const mine = tid === me || (isHost && (P.players.find(p => p.id === tid) || {}).kind === "local");
      const total = isHost ? R.order.length * (R.rounds || 1) : (R.clueTotal || people.length * (R.rounds || 1)), done = (R.clues || []).length;
      body = `<p class="c mut small">Clue ${Math.min(done + 1, total)} of ${total}. One word or two, about the secret word.</p>
        ${mine ? `<div class="names" style="margin-top:6px"><label><input id="pclue" class="ftxt" maxlength="30" autocomplete="off"
            enterkeyhint="send" placeholder="${tid === me ? "Your clue" : esc(tname) + "'s clue"}"></label></div>
          <p class="err" id="perr"></p>
          <button class="bar sendclue" data-a="p-clue" data-id="${tid}">Send${tid === me ? "" : " for " + esc(tname)}</button>`
        : `<p class="c" style="font-size:20px;font-weight:700;margin:8px 0">${esc(tname)} is thinking...</p>`}
        ${isHost && !mine ? `<button class="textbtn" data-a="p-skip">Skip ${esc(tname)}${(P.players.find(p => p.id === tid) || {}).on ? "" : " (offline)"}</button>` : ""}`;
    } else if (R.phase === "vote") {
      // who still needs a vote on this phone
      const here = isHost ? P.players.filter(p => p.kind !== "phone" && R.order.includes(p.id)).map(p => p.id) : [me];
      const voted = id => isHost ? !!R.votes[id] : !!R.myVote;
      const next = here.find(id => !voted(id));
      if (next) {
        body = `<h2 class="ask">${next === me ? "Who's the imposter?" : esc(nameOf(next)) + ", who's the imposter?"}</h2>
          ${pickList(people.filter(x => x.id !== next).map(x => ({ v: x.id, label: esc(x.name), av: x.name })))}`;
        foot = `<button class="bar" data-a="p-fv" data-by="${next}" data-needs-pick disabled>Submit vote</button>`;
      } else {
        const inn = isHost ? Object.keys(R.votes).length : R.votesIn, need = isHost ? voters(R).length : R.votesNeeded;
        body = `<p class="c" style="font-size:20px;font-weight:700;margin:8px 0">Votes in: ${inn} of ${need}</p>
          ${isHost ? "" : '<p class="c mut small">Waiting for everyone to vote.</p>'}`;
        if (isHost) foot = '<button class="bar ghost" data-a="p-count">Count the votes now</button>';
      }
    }
    view(`${bar("", "")}
      ${lateChip()}
      <p class="cat"><span class="k">Category</span><span class="v">${esc(R.cat)}</span></p>
      <div class="chat">${clues || '<p class="c mut small">No clues yet. ' + esc(R.first) + " goes first.</p>"}</div>
      ${body}
      <div class="grow" style="justify-content:flex-end">${peek}
        <p class="c small">${isHost ? '<button class="textbtn" data-a="p-reveal" style="padding:6px">End round</button> &nbsp;·&nbsp; ' : ""}${REPORT.replace('class="textbtn"', 'class="textbtn" style="padding:6px"')}</p></div>
      ${foot}`, farScreen, "on");
    if (peek) holdWire(cardInner(myCard(), R));
    const inp = $p("#pclue");
    if (inp) {
      const turn = R.startedAt + ":" + (R.clues || []).length + ":" + tid;
      if (P.focusTurn !== turn) { P.focusTurn = turn; inp.focus(); }      // a new turn: straight to typing
      inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $p('[data-a="p-clue"]').click(); } });
    }
  }

  function coolTile(R) {
    const gl = graceLeft(R);
    if (gl) return graceTile(gl);
    // Someone playing on the host's phone would be seen tapping it.
    if (P.role === "host" && P.players.some(p => p.kind === "local")) return coolNote(R.cool, true);
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
    if (!R || R.mode !== "tag" || R.phase !== "on" || R.dealing || isOut(pid)) return;
    if (!body) {
      if (R.meetLeft <= 0) return;
      if (R.each && (R.used[pid] || 0) >= R.each) return;
      R.meetLeft--; R.used[pid] = (R.used[pid] || 0) + 1;
      const caller = P.players.find(p => p.id === pid);
      if (caller) caller.meetings = (caller.meetings || 0) + 1;
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
        <span class="sub">${isOut(p.id) ? "Out of the game" : meetsLeft(R.each, R.used[p.id] || 0)}</span></span></button>`;
    }).join("");
    view(`${bar("p-on", "Meeting")}<div class="list"><h2>Who's calling it?</h2>
      <p class="c mut small">People with their own phone call it from there.</p><div class="names">${rows}</div></div>`, hostMeetPick, "pick");
  }
  function meeting(loud) {
    const R = P.round, isHost = P.role === "host";
    R.coolEnd = 0;                       // a cooldown from before the meeting is over
    const loudVote = (P.set && P.set.vote === "loud") || R.vote === "loud";
    app.dataset.mode = R.body ? "body" : "em";
    view(`${bar("")}
      ${lateChip()}
      <div class="grow" style="gap:16px">
        ${meetHead(R.body, R.caller)}
        ${meetSteps(loudVote, R.meetLeft, 0)}
        <button class="bar ghost slim" data-a="p-hush">${I.mute}Stop the siren</button>
      </div>
      ${isHost ? (P.set.vote === "loud" ? '<button class="bar" data-a="p-mv-loud">Who\'s out?</button>' : '<button class="bar" data-a="p-mv-start">Start the vote</button>')
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
    if (!R || R.phase !== "mvote" || !R.mv.voters.includes(pid) || R.mv.votes[pid]) return false;
    if (v !== "skip" && v !== "tagged" && (!aliveIds().includes(v) || v === pid)) return false;
    if (v === "tagged" && R.cards[pid] && R.cards[pid].imp) return false;     // imposters can't be tagged
    R.mv.votes[pid] = v;
    if (v === "tagged") {
      R.out[pid] = true;
      // Enough tags can hand the imposters the win before the vote ends.
      if (tagWinnerP()) { R.mv = null; finishVote("", [], true); return true; }
    }
    if (Object.keys(R.mv.votes).length >= R.mv.voters.length) { mvCount(); return true; }
    syncAll();
    return true;
  }
  function tagWinnerP() {
    const R = P.round; let imp = 0, crew = 0;
    R.order.forEach(id => { if (!isOut(id)) (R.cards[id] && R.cards[id].imp) ? imp++ : crew++; });
    return imp === 0 ? "crew" : imp >= crew ? "imp" : "";
  }
  function mvCount() {
    const R = P.round, t = {}; let skips = 0;
    Object.values(R.mv.votes).forEach(v => {
      if (v === "tagged") return;
      if (v === "skip" || isOut(v)) skips++;          // voted for someone who's out by now
      else t[v] = (t[v] || 0) + 1;
    });
    const ranked = Object.entries(t).map(([id, n]) => ({ id, n })).filter(x => !isOut(x.id)).sort((a, b) => b.n - a.n);
    let out = "";
    if (ranked.length && (ranked.length === 1 || ranked[0].n > ranked[1].n) && ranked[0].n > skips) out = ranked[0].id;
    if (out) R.out[out] = true;
    R.mv = null;
    finishVote(out, ranked.map(x => nameOf(x.id) + " " + x.n).concat(skips ? ["Skip " + skips] : []));
  }
  function finishVote(outId, tally, early) {
    const R = P.round;
    R.result = { out: outId ? nameOf(outId) : "", tally: tally || [], win: tagWinnerP(), early: !!early, left: early === "left" };
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
      const nextImp = isHost ? !!(R.cards[next] && R.cards[next].imp) : !!(R.card && R.card.imp);
      const items = ids.filter(id => !isOut(id) && id !== next).map(id => ({ v: id, label: esc(nameOf(id)), av: nameOf(id) }))
        .concat([{ v: "skip", label: "Skip vote", cls: "skip" }])
        .concat(nextImp ? [] : [{ v: "tagged", label: "I got tagged", sub: "so I'm out", cls: "skip" }]);
      body = `<h2 class="ask">${next === me ? "Who do you vote out?" : esc(nameOf(next)) + ", who do you vote out?"}</h2>
        ${next !== me ? '<p class="mut small">Hand the phone over. Votes are secret.</p>' : ""}
        ${pickList(items)}`;
      foot = `<button class="bar" data-a="p-mv" data-by="${next}" data-needs-pick disabled>Submit vote</button>`;
    } else {
      const inn = isHost ? Object.keys(R.mv.votes).length : (R.mv ? R.mv.inn : 0), need = isHost ? R.mv.voters.length : (R.mv ? R.mv.need : 0);
      body = `<div class="grow"><p class="c" style="font-size:22px;font-weight:700">Votes in: ${inn} of ${need}</p>
        <p class="c mut small">${isOut(me) ? "You're out, so you don't vote." : "Waiting for everyone else."}</p></div>`;
      if (isHost) foot = '<button class="bar ghost" data-a="p-mv-count">Count the votes now</button>';
    }
    view(`${bar("", "Vote")}${lateChip()}<div class="list">${body}</div>${foot}`, mvoteScreen, "mvote");
  }
  function loudTagged() {
    const R = P.round;
    view(`${bar("p-meeting", "")}<div class="list"><h2 class="ask">Anyone tagged?</h2>
      <p class="c mut small">Check everyone who got tagged. Nobody? Just tap Next.</p>
      ${pickList(aliveIds().map(id => ({ v: id, label: esc(nameOf(id)), av: nameOf(id), cls: (R.tg || []).includes(id) ? "on" : "" })), true)}</div>
      <button class="bar" data-a="p-mv-tagged">Next</button>`, loudTagged, "loudtag");
  }
  function loudPick() {
    const R = P.round;
    const items = aliveIds().filter(id => !(R.tg || []).includes(id)).map(id => ({ v: id, label: esc(nameOf(id)), av: nameOf(id) }))
      .concat([{ v: "none", label: "Nobody", sub: "skipped or a tie", cls: "skip" }]);
    view(`${bar("p-mv-loud", "")}<div class="list"><h2 class="ask">Who got voted out?</h2>${pickList(items)}</div>
      <button class="bar" data-a="p-mv-out" data-needs-pick disabled>Done</button>`, loudPick, "loudpick");
  }
  function resultScreen() {
    const R = P.round, isHost = P.role === "host", r = R.result || {};
    view(`${bar("", "")}
      <div class="grow">
        <p class="c" style="font-size:20px;font-weight:700;color:var(--acc);letter-spacing:.08em">${r.left ? "GAME OVER" : "VOTE RESULT"}</p>
        ${r.left ? '<p class="c" style="font-size:24px;font-weight:700">A player\'s phone was off too long</p>' : r.early ? '<p class="who">Vote stopped</p>'
          : `<div class="whobox">${r.out ? avatar(r.out, "lg") : ""}<p class="who">${r.out ? esc(r.out) : "No one"}</p></div><p class="c mut" style="font-size:18px">was voted out</p>`}
        ${r.tally && r.tally.length ? `<p class="c mut small">${r.tally.map(esc).join(" &nbsp;·&nbsp; ")}</p>` : ""}
        ${r.win ? `<p class="c" style="font-size:22px;font-weight:700;color:var(${r.win === "crew" ? "--crew" : "--imp"})">${
            r.win === "crew" ? "That was the last imposter. Crew win!" : "Imposters win! There are at least as many of them as crew."}</p>`
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
        <p class="c mut">${P.round && P.round.mode === "word" ? "This shows everyone the word and who the imposters were." : "This shows everyone who the imposters were."}</p>
        <button class="bar ghost" data-a="p-reveal-yes" style="margin-top:8px">Yes, reveal</button>
      </div>
      <button class="bar" data-a="p-on">Keep playing</button>`, revealAsk, "ask");
  }

  /* ------------------------------------------------------------ reveal */
  function revealNow() {
    const R = P.round; R.phase = "reveal";
    const r = { t: "reveal", mode: R.mode, word: R.word, cat: R.cat, imps: R.imps };
    R.revealMsg = r;
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
            r.out ? esc(r.out) + " was voted out. " + (r.caught ? "Crew win!" : "Wrong one. Imposters win!") : (r.tally && r.tally.length ? "It's a tie, so nobody's out. Imposters win!" : "No votes, so nobody's out. Imposters win!")}</p>
          <p class="c mut small">${(r.tally || []).map(x => esc(x.name) + " " + x.votes).join(" &nbsp;·&nbsp; ")}</p>` : ""}
        <p class="c mut" style="font-size:20px;font-weight:600;margin-top:10px">${r.imps.length === 1 ? "Imposter" : "Imposters"}</p>
        <div class="imps">${r.imps.map(n => `<span>${avatar(n, "md")}${esc(n)}</span>`).join("")}</div>
      </div>
      ${isHost ? '<button class="bar" data-a="p-again">Next game</button>' : '<p class="c mut small" style="margin:8px 0">Waiting for the host to start the next game.</p>'}`,
      () => reveal(r), "reveal");
    fitWord();
  }

  /* ------------------------------------------------------------ guest */
  function join(name, msg) {
    if (window.Loader) Loader.hide();                   // a failed join comes back here: never leave the loader up
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
    loadOn("Joining " + code);
    connectGuest();
  }
  function connectGuest() {
    if (P.peer) { try { P.peer.destroy(); } catch (_) {} }
    const peer = new Peer(peerOpts());
    P.peer = peer;
    setTimeout(() => { if (P && P.peer === peer && !P.me.id && !P.screen) { P.slow = true; guestLost(P.conn); } }, 20000);
    peer.on("open", () => {
      const conn = peer.connect(PREFIX + P.code, { reliable: true });
      P.conn = conn;
      conn.on("open", () => { send(conn, { t: "join", name: P.me.name, key: KEY, tab: TAB, games: myGames() }); });
      conn.on("data", m => { conn.seen = Date.now(); guestMsg(m); });
      conn.on("close", () => guestLost(conn));
      conn.on("error", () => guestLost(conn));
    });
    peer.on("error", e => {
      if (P && P.peer === peer && !P.me.id) { try { peer.destroy(); } catch (_) {} return join(P.me.name, netWhy(e)); }
      if (P && P.peer === peer) guestLost(P.conn);
    });
  }
  function guestLost(conn) {
    if (!P || P.role !== "guest" || P.conn !== conn || P.leaving || P.dead) return;
    if (!P.me.id) {                                      // never got in: back to the code screen
      if (!P.screen) { try { P.peer.destroy(); } catch (_) {} join(P.me.name, P.slow ? "Couldn't reach the host's phone. Check the code, then try again. If you're far apart, both of you try Wi-Fi instead of cell data." : netWhy()); }
      return;
    }
    // Two minutes from the moment the host's phone went quiet, counted on
    // screen, then the party is over for this phone.
    if (!P.lostAt) P.lostAt = Date.now();
    const LIMIT = OFF_LIMIT, left = () => LIMIT - (Date.now() - P.lostAt);
    if (left() <= -OFF_GRACE) {                         // 0:00 on screen, then 5 quiet seconds
      // Over for good: no more retries restarting the countdown.
      P.lostAt = 0; P.dead = true;
      try { P.peer && P.peer.destroy(); } catch (_) {}
      return view(`${bar("p-leave")}<div class="grow"><h2>The party ended</h2>
        <p class="c mut">The host's phone was off for 2 minutes.</p></div>
        <button class="bar" data-a="p-retry">Try again</button>`, null, "lost");
    }
    const clock = () => { const s = Math.max(0, Math.ceil(left() / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
    if (P.screen !== "reconnect") {
      view(`${bar("")}
        <div class="grow">
          <p class="c" style="font-size:20px;font-weight:700;color:var(--imp);letter-spacing:.06em">HOST'S PHONE WENT OFF</p>
          <p class="who" id="lostclock">${clock()}</p>
          <p class="c mut">Host, turn your phone back on and open the app. If it's not back in time, everyone gets kicked out.</p>
          <div class="wait"><div class="spin"></div>Trying to reconnect</div>
        </div>`, null, "reconnect");
      tick = setInterval(() => {
        const c = $p("#lostclock");
        if (!c || !P || !P.lostAt) return stopTick();
        c.textContent = clock();
        if (left() <= -OFF_GRACE) { stopTick(); guestLost(P.conn); }
      }, 500);
    }
    setTimeout(() => { if (P && P.role === "guest" && !P.leaving && !P.dead && P.lostAt) connectGuest(); }, 2500);
  }
  function guestMsg(m) {
    if (!P || P.role !== "guest" || !m || typeof m !== "object") return;
    if (m.t === "ping") { if (P.conn) P.conn.beats = true; return send(P.conn, { t: "pong" }); }
    if (m.t === "reject") {
      const name = P.me.name, code = P.code;
      P.leaving = true;                                   // the close that follows isn't a lost connection
      try { P.peer.destroy(); } catch (_) {}
      if (m.name) return nameScreen(n => linkGo(code, n), m.why);    // new name, straight back in
      return join(name, m.why);
    }
    if (m.t === "welcome") { P.me.id = m.id; P.lostAt = 0; keepAwake(true); return; }
    if (m.t === "lobby") {
      P.players = m.players; P.set = m.set; P.inRound = !!m.inRound;
      m.players.forEach(p => { if (p.offLeft) p.offBy = Date.now() + p.offLeft; });
      // Between games (or before the first) the lobby is the screen; during a
      // game this is just the player list changing, so the game stays up.
      if (!m.inRound) { P.round = null; Siren.stop(); return guestLobby(); }
      if (!P.round && P.screen !== "reveal") return guestLobby();   // joined during the reveal
      if (["on", "meeting", "mvote", "result"].includes(P.screen)) redraw();
      return;
    }
    if (m.t === "round") {
      const fresh = !P.round || P.round.startedAt !== m.startedAt;
      P.round = Object.assign({}, m, { coolEnd: P.round && !fresh ? P.round.coolEnd : 0,
        graceEnd: m.graceLeft ? Date.now() + m.graceLeft : 0 });
      if (!fresh && P.screen === "card") return;          // they'll see it after "Got it"
      if (fresh && m.card) {
        if (store.get("imp_last_deal", 0) !== m.startedAt) { store.set("imp_last_deal", m.startedAt); countGame(); }
        if (window.Loader) Loader.show("Dealing cards", 1100, { players: m.n, imps: m.impCount });
        return showCard(m.card, "Your card", gameOn, P.round);
      }
      if (m.phase === "meeting") return meeting(false);
      return gameOn();
    }
    if (m.t === "meeting") {
      if (!P.round) return;
      Object.assign(P.round, { phase: "meeting", caller: m.by, body: m.body, meetLeft: m.left, used: m.used });
      return meeting(true);
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
        <div class="wait" style="margin-top:12px"><div class="spin"></div>${P.inRound ? "A game is going. You're in the next one." : "Waiting for the host to start"}</div>
        ${REPORT}
      </div>`, guestLobby, "lobby");
  }

  /* ------------------------------------------------------------ leaving */
  function endParty() {
    if (!P) return home();
    const old = P;
    if (old.role === "host") broadcast({ t: "ended" });
    else { old.leaving = true; send(old.conn, { t: "leave" }); }
    setTimeout(() => { try { old.peer && old.peer.destroy(); } catch (_) {} if (P === old) P = null; }, 300);
    keepAwake(false); Siren.stop();
    home();
  }
  function fail(why) {
    loadOff();
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
    if (a === "p-retry")   { P.lostAt = 0; P.dead = false; view(`${bar("")}<div class="grow"><div class="spin"></div><p class="c mut">Reconnecting...</p></div>`); return connectGuest(); }
    if (a === "p-leave" || a === "p-end") return endParty();
    if (!P) return;
    if (a === "p-lobby")   return lobby();
    if (a === "p-add")     return addLocal();
    if (a === "p-add-ok")  return addLocalOk();
    if (a === "p-kick") {
      const id = b.dataset.id, c = P.conns.get(id), pl = P.players.find(p => p.id === id);
      // Removed means removed: the same name or phone can't come back in.
      if (pl && pl.kind === "phone") { P.banned.add(pl.name.toLowerCase()); if (pl.key) P.banned.add("k:" + pl.key); }
      send(c, { t: "kicked" }); setTimeout(() => { try { c && c.close(); } catch (_) {} }, 200);
      P.conns.delete(id); P.players = P.players.filter(p => p.id !== id);
      shareLobby(); return lobby();
    }
    if (a === "p-where") { P.set.far = b.dataset.v === "far"; if (P.set.far) P.set.word = true; saveSet(); shareLobby(); return lobby(); }
    if (a === "p-share") {
      if (typeof Native !== "undefined" && Native && Native.share) { Native.share({ text: inviteText(), url: inviteUrl() }).catch(() => copyInvite()); return; }
      if (navigator.share) { navigator.share({ title: "Pocket Imposter", text: inviteText(), url: inviteUrl() }).catch(() => {}); return; }
      return copyInvite();                        // no share sheet: copy it instead
    }
    if (a === "p-gmode") {
      const v = b.dataset.v;
      P.set.word = v !== "tag"; if (v === "tag") P.set.far = false;
      saveSet(); shareLobby(); return lobby();
    }
    if (a === "p-copy")  return copyInvite();
    if (a === "p-latecode") return codeSheet();
    if (a === "p-clue") {
      const inp = $p("#pclue"), t = inp ? inp.value.replace(/\s+/g, " ").trim() : "";
      if (!t) return;
      if (!NameCheck.clean(t)) return ($p("#perr").textContent = "Try a different clue.");
      if (P.role === "host") return takeClue(b.dataset.id, t);
      inp.disabled = true; b.disabled = true;
      return send(P.conn, { t: "clue", text: t });
    }
    if (a === "p-count") return countVotes();
    if (a === "p-lock")  { P.locked = b.dataset.v === "locked"; return lobby(); }
    if (a === "p-late")  { P.set.late = b.dataset.v === "on"; saveSet(); shareLobby(); return lobby(); }
    if (a === "p-skip")  return P.role === "host" && skipTurn();
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
      if (P.role === "host") {
        const id = P.players.filter(p => p.kind !== "phone").map(p => p.id).find(x => !isOut(x));
        return id && callMeeting(id, true);
      }
      return send(P.conn, { t: "meet", body: true });
    }
    if (a === "p-hush")    return Siren.stop();
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
    if (a === "p-meeting") return meeting(false);
    if (a === "p-mv-loud") { Siren.stop(); P.round.tg = P.round.tg || []; return loudTagged(); }
    if (a === "p-mv-tagged") {
      // Kept to one side until the vote is in, so Back can still change it.
      const R = P.round;
      R.tg = [...app.querySelectorAll(".opt.on")].map(o => o.dataset.v);
      R.tg.forEach(id => { R.out[id] = true; });
      if (tagWinnerP()) { R.tg = []; return finishVote("", [], true); }
      R.tg.forEach(id => { delete R.out[id]; });
      return loudPick();
    }
    if (a === "p-mv-out") {
      const v = picked(), R = P.round;
      if (!v) return;
      (R.tg || []).forEach(id => { R.out[id] = true; }); R.tg = [];
      if (v !== "none") R.out[v] = true;
      return finishVote(v === "none" ? "" : v, []);
    }
    if (a === "p-mv-done") {
      const R = P.round; R.phase = "on"; R.result = null; R.graceEnd = Date.now() + GRACE * 1000;
      return syncAll();
    }
    if (a === "p-reveal") return revealAsk();
    if (a === "p-reveal-yes") return revealNow();
    if (a === "p-again") {
      P.round = null;
      P.players = P.players.filter(p => p.on || p.kind === "local" || p.offAt);
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
  function linkGo(code, name) {
    P = { role: "guest", me: { id: "", name }, players: [], set: {}, round: null, code, peer: null, conn: null };
    store.set("imp_party_code", code);
    view(`${bar("")}<div class="grow"><div class="spin"></div><p class="c mut">Joining ${esc(code)}...</p></div>`);
    loadOn("Joining " + code);
    connectGuest();
  }
  function fromLink(code) { nameScreen(name => linkGo(code, name)); }

  // What the Ask helper may know about the party: only what everyone in it
  // can already see. Never a card, the word, or who the imposters are.
  function info() {
    if (!P || !P.role || !P.code) return null;
    const R = P.round, s = P.set || {}, host = P.role === "host";
    const o = { role: P.role, code: P.code, me: P.me && P.me.name, screen: P.screen, locked: !!P.locked,
      players: (P.players || []).map(p => p.name + (p.kind === "local" ? " (plays on the host's phone)" : p.on === false ? " (offline)" : "")),
      mode: modeOf(s), imposters: s.far ? 1 : s.imps, hint: !!s.hint, meetings: s.meetings, each: s.each, vote: s.vote, cluesEach: s.rounds || 1 };
    if (R && R.phase !== "reveal") Object.assign(o, { phase: R.phase, n: R.n, impCount: R.impCount, meetLeft: R.meetLeft,
      cat: R.cat, first: R.first, clues: (R.clues || []).length,
      turn: R.far && R.phase === "clues" ? (host ? nameOf(turnId()) : R.turnName) : "",
      out: (host ? Object.keys(R.out || {}) : (R.out || [])).map(nameOf) });
    return o;
  }

  window.Party = { start, fromLink, active: () => !!P, info };

  // Opened from an invite link (?join=ABCD): straight to the name, then in.
  const inv = (new URLSearchParams(location.search).get("join") || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (inv.length === 4) { try { history.replaceState(null, "", location.pathname); } catch (_) {} fromLink(inv); }
})();
