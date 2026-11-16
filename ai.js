/* Ask: the AI helper.

   It runs on the iPhone itself, on Apple's on-device model (the app's native
   ImpNative plugin, see ios-app/native/AppDelegate.swift). Free, offline, no
   account, no limits, and nothing typed here leaves the phone.

   Where it can't run (the website, an iPhone older than the 15 Pro, iOS before
   26, Apple Intelligence switched off) the Ask button is grayed out, and
   tapping it says why right away.

   What the model is told:
     RULES   - the whole game and the app's screens, once per conversation.
     Facts   - sent with every question: the setup, what's on the screen, and
                the numbers worked out here (players still in, meetings left,
                how many imposters can still be in) so it never has to guess.
                Never the word or who the imposters are.
   The conversation lives in the native session, so follow-ups ("shorter",
   "what about Tag?") work. The visible chat is kept for this app launch. */
(function () {
  "use strict";

  /* ------------------------------------------------------------ native */
  const NATIVE = (() => {
    try {
      if (typeof Native !== "undefined" && Native) return Native;      // the play page made it already
      const C = window.Capacitor;
      return C && C.isNativePlatform && C.isNativePlatform() && C.registerPlugin ? C.registerPlugin("ImpNative") : null;
    } catch (_) { return null; }
  })();
  let status = NATIVE ? "checking" : "web";
  // Tests in a desktop browser can stand in for the iPhone's model.
  const nat = () => window.IMP_AI_MOCK || NATIVE;

  const WHY = {
    web:   ["AI help is in the iPhone app", "It runs on the iPhone itself, so it needs the Pocket Imposter app on an iPhone 15 Pro or newer with Apple Intelligence on."],
    os:    ["Update your iPhone first", "AI help runs on the phone itself. It needs iOS 26 or newer, on an iPhone 15 Pro or newer, with Apple Intelligence on."],
    device:["AI help needs iPhone 15 Pro or newer", "This iPhone can't run Apple's on-device AI. Everything else in the app works the same."],
    off:   ["Turn on Apple Intelligence", "Open Settings, then Apple Intelligence & Siri, and switch it on. Then come back and tap Ask."],
    downloading: ["Almost ready", "Apple Intelligence is still downloading to this iPhone. Try again in a few minutes."],
    language: ["Not in this language yet", "Apple's on-device AI doesn't support this iPhone's language yet. Switching the iPhone to English works."],
    unavailable: ["AI help isn't available", "Apple Intelligence isn't available on this iPhone right now."],
    checking: ["One sec", "Checking if this iPhone can run AI help."]
  };

  async function check() {
    if (!nat()) return setStatus("web");
    try { const r = await nat().aiStatus(); setStatus(r && r.status || "unavailable"); }
    catch (_) { setStatus("os"); }       // an older build without the AI part
  }
  function setStatus(s) {
    status = s;
    document.documentElement.classList.toggle("ai-off", s !== "ready");
  }
  document.documentElement.classList.add("ai-off");
  check();
  // Apple Intelligence may have been switched on in Settings meanwhile.
  document.addEventListener("visibilitychange", () => { if (!document.hidden && status !== "ready") check(); });

  /* ------------------------------------------------------------ the rules it knows */
  const RULES = `You are the Ask helper inside Pocket Imposter, a party game app. You help players with the rules, what to tap, and what's going on in their game.

How to answer:
- Answer the question directly, in 1 to 3 short sentences, or up to 5 short bullets for steps. Plain, friendly, everyday words. No emoji.
- Each question comes with "Facts" about this phone's game. Use them, but DO NOT repeat them back or list facts nobody asked about.
- For numbers, use the facts and the tables below. Never make up numbers, names or rules.
- "What now?" or "I'm on this screen": look at Screen and Buttons in the facts, and say the next thing to tap or do.
- You never know the secret word or who the imposters are.
- If the rules and facts don't cover it, say you're not sure and point to the "Learn" tab. Never guess.
- Only ask a question back if you can't answer without it.
- Players make typos and use slang. Work out what they mean.
- "Shorter" means say your last answer in fewer words. "Simpler" means use easier words, like for a 9-year-old.
- Name buttons exactly as they appear, in quotes.

When the facts include "Worked out", those numbers are exact. Use them as they are.

THE GAME: works with 3 to 15 players (a party too). Two games, Word and Tag. To change the number of players, tap + or - next to Players on the setup screen.

WORD (sit in a circle)
Setup: Home > "Word". Set Players, Imposters and Hint (on: the imposter gets a one-word hint; off: only the category). "Categories" picks which word lists are on; "Make your own" adds your own words (no hints for those). "Player names" is optional. Tap "START".
Cards: "Hand the phone to [name]", that player taps "Then tap here", holds "HOLD" to see their card, lets go, taps "Next player". Crew see the word. Imposters see IMPOSTER and maybe a hint. Everyone sees the category.
"Game started" says who goes first. Go around once, one clue word each about the secret word. Talk it over, then everyone points on three. Most votes is out. Tap "Reveal", then "Yes, reveal" to see the word and the imposters. "NEW GAME" deals a new word; no word repeats within 16 rounds.
Crew win if they vote out every imposter. Imposters win if they survive the vote. Optional house rule: a voted-out imposter still wins by naming the word.

TAG (outside)
Setup: Home > "Tag". Players, Imposters, Meetings (0 to 9, shared by the group). "More rules": Voting ("On phone" or "Out loud"), Tag timer (off by default. On one shared phone, people could see who taps it, so imposters count the cooldown in their heads. Turning it on is fine in Play together, where each imposter has their own phone), Meetings each (the most one player can call; Any means no limit).
Cards say CREW or IMPOSTER. Then leave the phone where everyone can reach it.
Imposters tag people by touching them, so Tag needs everyone in the same place. Tag can't be played far apart. A tagged player lies down right there. After a tag, an imposter waits out the tag cooldown before tagging again: 45 seconds with 3 to 6 players, 30 with 7 to 10, 20 with 11 to 15, plus 10 more for each imposter after the first.
"Report a body" is free, any time. "Emergency meeting" uses one of the group's meetings and asks "Who's calling it?". A siren plays for 8 seconds; "Stop the siren" on the meeting screen stops it sooner. "Called by mistake? Cancel it" gives the meeting back.
Voting on the phone: "Start the vote", pass the phone, each player taps a name or "Skip vote", then "Submit vote". A tagged player picks "I got tagged" instead and is out.
Voting out loud: tap "Who's out?", check who got tagged, tap "Next", then pick who got voted out, or "Nobody".
Most votes is out. If two or more players tie for the most votes, nobody is out. If at least as many players skip as voted for the top player, nobody is out. A vote for someone who turns out to be tagged counts as a skip.
Then everyone says "3, 2, 1, UP!" and tagged players stand up. "Back to the game" starts 15 seconds of no tagging.
Out players are ghosts: quiet, no voting, no meetings.
To end a round any time: tap "Reveal", then "Yes, reveal".
Crew win when every imposter is out. Imposters win as soon as the imposters still in are at least as many as the crew still in. The phone checks after every vote. It doesn't say if a voted-out player was an imposter until Reveal.

PLAY TOGETHER (one phone each, needs internet)
Home > "Play together". "Host" gets a 4-letter party code. Invite with "Messages", "Mail", "Copy link" or "More"; tapping the invite opens the game, they type a name and they're in. Or they tap "Join" and type the code. Everyone needs a name (2 to 14 letters; "Random name" works). Up to 15 players. New players join between rounds.
The host can "Add" a player with no phone (they look at their card on the host's phone), remove anyone with the x (they can't come back), and set "New players" to "Locked".
Word with "Where is everyone?" set to "Far apart" is for friends in different places: one imposter, players take turns typing a clue (1 to 3 each), then everyone votes on their own phone. A tie means the imposters win. The host can "Skip" someone's turn or "End round".
Tag in a party: everyone is in the same place (tagging is by touch); anyone calls a meeting or reports a body from their own phone, and everyone votes on theirs. Someone far away can't play Tag. They can play Word with "Far apart".
If a guest's phone dies or drops, they open the game, tap "Join", type the same code and they're back in, card and all. If the host's phone goes off, the others see a 2-minute countdown; the host just opens the app again.
"Report a problem" reports a player.

THE APP
Bottom tabs: Home, Learn (how to play), Play, Box, Help. During a round the Home button asks "Leave this round?". If the app closes mid-round, the Play screen shows "Back to the round". Everything works offline except Play together. Help has answers and a feedback form.
The Pocket Imposter box is a small handheld version of the game. The app doesn't need it.

HOW GOOD ANSWERS LOOK
Asked "can we do 2 imposters" with 4 players: Not with 4 players. The most is 1. Add a 5th player and you can have 2.
Asked "can 3 people play": Yes. Pocket Imposter works with 3 to 15 players.
Asked "can leo call another meeting" when Leo used his 1: No, Leo already used his 1 meeting. Someone else can call one, and anyone can tap "Report a body".
Asked "did we catch one?" after Sam was voted out: Nobody knows yet. The phone doesn't say if Sam was an imposter until Reveal. If the game keeps going, at least one imposter is still in.
Asked "whats the word" or "who's the imposter": The phone keeps that secret until Reveal.
Asked "what's the cooldown" when the game's cooldown is 40 seconds: After tagging someone, an imposter has to wait before tagging again. In this game that's 40 seconds.
Asked "ok now what" on Game on (Tag): Go play! Imposters tag people. Find someone lying down? Tap "Report a body". Want to talk it over? Tap "Emergency meeting".
Asked "how do i get my friend in, she lives far away" as host: Tap "Messages" or "Mail" and send her the invite. She taps the link, types a name and she's in. Play Word with "Where is everyone?" set to "Far apart".
Asked anything not about the game: I can only help with Pocket Imposter.
Start the answer right away. Never write "Facts:", "Q:", "A:" or "Asked".`;

  /* ------------------------------------------------------------ what's going on right now */
  const list = a => a.length ? a.join(", ") : "nobody";
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

  const SCREENS = {
    gate: "Unlock (type the code from a box)", home: "Play home (Word, Tag, Play together)", setup: "Setup",
    namesScreen: "Player names", catsScreen: "Categories", customScreen: "Make your own words",
    pass: "Hand the phone to the next player", card: "Card (hold HOLD to see it, then Next player)",
    started: "Game started (Word: go around with clues)", play: "Game on (Tag)", meetPick: "Who's calling the meeting?",
    meeting: "Meeting", mvPass: "Vote: hand the phone to the next voter", mvVote: "Vote: secret ballot",
    mvTagged: "Vote out loud: who got tagged?", mvLoud: "Vote out loud: who got voted out?", mvResult: "Vote result",
    revealAsk: "End the round? (Reveal)", leaveAsk: "Leave this round?", reveal: "Reveal (round over)"
  };
  const PARTY_SCREENS = {
    lobby: "Party lobby", name: "Type your name", code: "Type the party code", add: "Add a player without a phone",
    pass: "Hand the host's phone to the next player", card: "Card (hold HOLD, then Got it)", on: "Game on",
    pick: "Who's calling the meeting?", meeting: "Meeting", mvote: "Vote", loudtag: "Vote out loud: who got tagged?",
    loudpick: "Vote out loud: who got voted out?", result: "Vote result", ask: "End the round?", reveal: "Reveal (round over)",
    reconnect: "Host's phone went off (2-minute countdown)", lost: "The party ended"
  };
  const IN_ROUND = new Set(["pass", "card", "started", "play", "meetPick", "meeting", "mvPass", "mvVote", "mvTagged", "mvLoud", "mvResult", "revealAsk", "leaveAsk"]);

  function screenKey() {
    if (typeof redraw === "undefined") return "";
    const src = String(redraw);
    const m = src.match(/^function\s+(\w+)/) || src.match(/=>\s*(\w+)\(/);
    return m ? m[1] : "";
  }

  // Headings and buttons on screen, so "I'm on this page, now what?" works.
  // Never the card (only there while someone holds HOLD).
  function onScreen() {
    const root = document.querySelector("#app") || document.querySelector("main");
    if (!root) return [];
    const seen = new Set(), heads = [], btns = [];
    root.querySelectorAll("h1,h2,.who,.gohead b,.ask,.lede,.err,.pcode").forEach(e => {
      const t = (e.innerText || "").replace(/\s+/g, " ").trim();
      if (t && !seen.has(t) && !e.closest("#card")) { seen.add(t); heads.push(t); }
    });
    root.querySelectorAll("button,a.cta,a.app,a.fix,a.mode,summary").forEach(b => {
      if (b.closest("#card") || b.offsetParent === null) return;
      const t = (b.getAttribute("aria-label") || b.innerText || "").replace(/\s+/g, " ").trim();
      if (!t || /^(Fewer|More|Back|Home|Full screen|Leave full screen|Ask for help)$/.test(t) || seen.has(t)) return;
      seen.add(t); btns.push((b.disabled ? "(grayed out) " : "") + t);
    });
    const out = [];
    if (heads.length) out.push("On screen: " + heads.join(" | ").slice(0, 300));
    if (btns.length) out.push("Buttons: " + btns.join(", ").slice(0, 500));
    return out;
  }

  function oneGameFacts(key) {
    const f = [];
    if (typeof S === "undefined" || typeof G === "undefined") return f;
    const n = S.players, I = S.imps;
    f.push(`Setup on this phone: ${S.word ? "Word" : "Tag"}, ${n} players, ${plural(I, "imposter")} and ${n - I} crew` +
      (S.word ? `, imposter hint ${S.hint ? "on" : "off"}` +
                (typeof CATS !== "undefined" && CATS ? `, ${liveCats().length} of ${allCats().length} categories on` : "")
              : `, ${plural(S.meetings, "emergency meeting")} for the group` +
                (S.each ? `, at most ${S.each} per player` : ", no limit per player") +
                `, voting ${S.vote === "loud" ? "out loud" : "on the phone"}, tag timer ${S.timer ? "on" : "off"}, tag cooldown ${coolSecs()} seconds`) + ".");
    f.push(`Most imposters allowed with ${n} players: ${impMax(n)}.` + (n < 15 ? ` If you add a player (${n + 1}): ${impMax(n + 1)}.` : "") +
      (n > 3 ? ` If one leaves (${n - 1}): ${impMax(n - 1)}.` : ""));
    const names = []; for (let i = 0; i < n; i++) names.push(pname(i));
    f.push("Players: " + names.join(", ") + ".");
    if (!G || !IN_ROUND.has(key)) return f;
    if (S.word) {
      f.push(`This round: category ${G.cat}. ${pname(G.first)} gives the first clue. Cards looked at: ${Math.min(G.idx, n)} of ${n}.`);
      return f;
    }
    const out = [], tagged = [], voted = [];
    G.out.forEach((o, i) => { if (!o) return; out.push(i); ((G.why || {})[i] === "tagged" ? tagged : voted).push(i); });
    const still = n - out.length;
    let lo = Math.max(1, I - voted.length), hi = Math.min(I, Math.floor((still - 1) / 2));
    if (hi < lo) hi = lo;
    f.push(`Still in: ${still} of ${n}. Out: ${list(out.map(pname))}.` +
      (tagged.length ? ` Tagged (so crew, imposters can't be tagged): ${list(tagged.map(pname))}.` : "") +
      (voted.length ? ` Voted out (the phone doesn't say if they were imposters until Reveal): ${list(voted.map(pname))}.` : ""));
    f.push(`Imposters at the start: ${I}. Imposters still in: ${lo === hi ? "exactly " + lo : "between " + lo + " and " + hi}` +
      ` (the game is still going, so at least 1, and fewer than the crew still in).`);
    const calls = G.used.map((u, i) => u ? `${pname(i)} ${u}` : "").filter(Boolean);
    f.push(`Emergency meetings left: ${G.meet} of ${S.meetings}. Called so far: ${calls.length ? calls.join(", ") : "none"}. Reporting a body is free.`);
    // Who can call one right now, worked out here so the model just reads it.
    const can = [], cant = [];
    for (let i = 0; i < n; i++) {
      if (G.out[i]) cant.push(pname(i) + " (out)");
      else if (!G.meet) cant.push(pname(i) + " (none left)");
      else if (S.each && G.used[i] >= S.each) cant.push(pname(i) + ` (used ${G.used[i] === 1 ? "their 1" : "all " + G.used[i]})`);
      else can.push(pname(i));
    }
    f.push(`Can call an emergency meeting now: ${list(can)}.` + (cant.length ? ` Can't: ${cant.join(", ")}.` : ""));
    if (G.startedAt) f.push(`Time since the round started: ${Math.floor((Date.now() - G.startedAt) / 60000)} min.`);
    const gl = typeof graceLeft === "function" ? graceLeft(G) : 0;
    if (gl) f.push(`No tagging for ${gl} more seconds (just back from a meeting).`);
    return f;
  }

  function partyFacts(p) {
    const f = [];
    const mode = p.mode === "far" ? "Word, far apart (typed clues)" : p.mode === "word" ? "Word, same room" : "Tag";
    f.push(`In a Play together party as ${p.role === "host" ? "the host" : "a guest"}${p.me ? " named " + p.me : ""}. Party code ${p.code}. New players ${p.locked ? "locked" : "can join"}.`);
    f.push(`Players (${p.players.length}): ${list(p.players)}.`);
    f.push(`Game: ${mode}, ${plural(p.imposters, "imposter")}` + (p.mode === "tag"
      ? `, ${plural(p.meetings, "emergency meeting")}${p.each ? ", at most " + p.each + " each" : ""}, voting ${p.vote === "loud" ? "out loud" : "on phones"}`
      : `, hint ${p.hint ? "on" : "off"}` + (p.mode === "far" ? `, ${p.cluesEach} clue${p.cluesEach === 1 ? "" : "s"} each` : "")) + ".");
    if (p.phase) {
      f.push(`Round: ${p.phase === "clues" ? "typing clues" : p.phase === "vote" ? "voting" : p.phase === "on" ? "playing" : p.phase}. ${p.n} players, ${plural(p.impCount, "imposter")} at the start. Category ${p.cat}. ${p.first} went first.`);
      if (p.turn) f.push(`It's ${p.turn}'s turn to type a clue. Clues so far: ${p.clues}.`);
      if (p.mode === "tag") {
        const still = p.n - p.out.length;
        const lo = Math.max(1, p.impCount - p.out.length), hi = Math.max(lo, Math.min(p.impCount, Math.floor((still - 1) / 2)));
        f.push(`Out: ${list(p.out)}. Still in: ${still}. Imposters still in: ${lo === hi ? "exactly " + lo : "between " + lo + " and " + hi}. Emergency meetings left: ${p.meetLeft}.`);
      }
    }
    return f;
  }

  // Numbers in the question itself ("12 players 3 imposters", "we got 6
  // now"), worked out here: small models misread tables.
  const maxImp = n => Math.max(1, Math.floor((n - 1) / 2));
  const coolOf = (n, k) => (n <= 6 ? 45 : n <= 10 ? 30 : 20) + (k - 1) * 10;
  function questionMath(q) {
    const t = " " + String(q).toLowerCase() + " ", out = [];
    const pm = t.match(/(\d+)\s*(players?|ppl|people|persons?|kids|friends|guys|of us)\b/);
    const im = t.match(/(\d+)\s*(imposters?|impostors?|imps?)\b/);
    let n = pm ? +pm[1] : 0;
    const k = im ? +im[1] : 0;
    if (!n && /impost|\bimps?\b|cool ?down|cool off|wait/.test(t)) {
      const bare = (t.match(/\b\d+\b/g) || []).map(Number).filter(x => x !== k);
      if (bare.length === 1) n = bare[0];
    }
    // "what's the cooldown?" with no numbers: this game's own.
    if (!n && /cool ?down|cool off|how long.*wait|wait.*tag/.test(t)) {
      const p = window.Party && Party.info ? Party.info() : null;
      const pn = p ? (p.n || p.players.length) : typeof S !== "undefined" ? S.players : 0;
      const pk = p ? (p.impCount || p.imposters) : typeof S !== "undefined" ? S.imps : 0;
      if (pn >= 3 && pk) out.push(`Tag cooldown in this game (${pn} players, ${pk} imposter${pk === 1 ? "" : "s"}): ${coolOf(pn, pk)} seconds.`);
      return out;
    }
    if (!n) return out;
    if (n < 3 || n > 15) { out.push(`${n} players: the game needs 3 to 15.`); return out; }
    out.push(`With ${n} players: at most ${maxImp(n)} imposter${maxImp(n) === 1 ? "" : "s"}.`);
    if (k) out.push(k > maxImp(n) ? `${k} imposters is too many for ${n} players.`
                                  : `Tag cooldown with ${n} players and ${k} imposter${k === 1 ? "" : "s"}: ${coolOf(n, k)} seconds.`);
    else if (/cool|wait|tag/.test(t)) for (let i = 1; i <= Math.min(3, maxImp(n)); i++)
      out.push(`Tag cooldown with ${n} players and ${i} imposter${i === 1 ? "" : "s"}: ${coolOf(n, i)} seconds.`);
    return out;
  }

  function facts() {
    const f = [];
    const p = window.Party && Party.info ? Party.info() : null;
    if (p) {
      f.push("Screen: " + (PARTY_SCREENS[p.screen] || p.screen || "Play together"));
      f.push(...partyFacts(p));
    } else if (document.querySelector("#app")) {
      const k = screenKey();
      f.push("Screen: " + (SCREENS[k] || "the game"));
      f.push(...oneGameFacts(k));
    } else {
      const h = document.querySelector("main h1");
      f.push(`Screen: the "${(document.title || "").split("·")[0].trim()}" page${h ? " (" + h.innerText.trim() + ")" : ""}.`);
    }
    f.push(...onScreen());
    return f.join("\n");
  }

  /* ------------------------------------------------------------ the chat */
  const LOG_KEY = "imp_ai_log";
  let log = [];                      // {who: "me"|"ai", text}
  try { log = JSON.parse(sessionStorage.getItem(LOG_KEY) || "[]"); } catch (_) {}
  const saveLog = () => { try { sessionStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-30))); } catch (_) {} };
  let lastFacts = "", busy = false, sheet = null;

  const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // Plain text in, a few line breaks and bullets out.
  const fmt = t => esc(t.trim()).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^\s*[-*•]\s+/gm, "• ").replace(/\n/g, "<br>");

  const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9zM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/></svg>';
  const SEND = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';

  const css = `
.aiwrap{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;justify-content:flex-end;background:rgba(6,7,10,.55)}
.aisheet{position:relative;display:flex;flex-direction:column;max-height:82%;margin:0 auto;width:100%;max-width:560px;
  background:#181B23;color:#F2F4F8;border-radius:24px 24px 0 0;border-top:1px solid rgba(255,255,255,.08);
  padding:0 0 env(safe-area-inset-bottom);box-shadow:0 -12px 40px rgba(0,0,0,.45);font-family:inherit}
.aihead{display:flex;align-items:center;gap:10px;padding:14px 14px 10px 18px}
.aihead .aiic{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;color:#14161C;
  background:linear-gradient(135deg,#FFD65A,#FF9F2E)}
.aihead .aiic svg{width:20px;height:20px}
.aihead b{font-size:19px}
.aihead small{display:block;font-size:12px;color:#9AA1B2;font-weight:600}
.aihead .sp{flex:1}
.aihead button{height:36px;min-width:36px;padding:0 10px;border-radius:12px;background:#252935;color:#C9CEDA;font-family:inherit;font-weight:600;font-size:14px;line-height:1;border:0}
.ailog{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:6px 16px 10px;-webkit-overflow-scrolling:touch}
.aimsg{max-width:86%;padding:10px 14px;border-radius:18px;font-size:16px;line-height:1.4;overflow-wrap:anywhere}
.aimsg.ai{align-self:flex-start;background:#252935;border-bottom-left-radius:6px}
.aimsg.me{align-self:flex-end;background:#FFC61A;color:#14161C;font-weight:600;border-bottom-right-radius:6px}
.aimsg.note{align-self:stretch;max-width:none;background:none;color:#9AA1B2;font-size:13px;text-align:center;padding:2px}
.aidots{display:inline-flex;gap:5px;padding:4px 0}
.aidots i{width:7px;height:7px;border-radius:50%;background:#9AA1B2;animation:aib 1s infinite ease-in-out}
.aidots i:nth-child(2){animation-delay:.15s}.aidots i:nth-child(3){animation-delay:.3s}
@keyframes aib{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
.aichips{display:flex;flex-wrap:wrap;gap:8px;padding:2px 16px 10px}
.aichips button{padding:8px 12px;border-radius:999px;background:#252935;color:#F2F4F8;font-family:inherit;font-weight:600;font-size:14px;line-height:1.1;border:1px solid rgba(255,255,255,.06)}
.aiform{display:flex;gap:8px;padding:0 12px 12px}
.aiform input{flex:1;min-width:0;height:48px;padding:0 16px;border-radius:24px;border:1px solid rgba(255,255,255,.1);
  background:#0F1116;color:#F2F4F8;font-family:inherit;font-weight:500;font-size:16px;outline:none}
.aiform input:focus{border-color:#FFC61A}
.aiform button{width:48px;height:48px;border-radius:50%;border:0;display:grid;place-items:center;background:#FFC61A;color:#14161C}
.aiform button:disabled{opacity:.4}
.aiform button svg{width:22px;height:22px}
.aiwhy{display:grid;justify-items:center;gap:10px;padding:8px 24px 24px;text-align:center}
.aiwhy .aiic{width:56px;height:56px;border-radius:18px;display:grid;place-items:center;background:#252935;color:#7C8394}
.aiwhy .aiic svg{width:30px;height:30px}
.aiwhy h3{margin:0;font-size:21px}
.aiwhy p{margin:0;color:#B4BAC8;font-size:16px;line-height:1.45;max-width:34ch}
.aiwhy .ok{margin-top:6px;width:100%;height:50px;border-radius:16px;border:0;background:#FFC61A;color:#14161C;font-family:inherit;font-weight:700;font-size:17px}
[data-ai]{transition:opacity .2s}
.ai-off [data-ai]{opacity:.38;filter:grayscale(1)}
@media (prefers-reduced-motion:reduce){.aidots i{animation:none}}`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  function close() {
    if (!sheet) return;
    sheet.remove(); sheet = null;
    document.removeEventListener("keydown", onKey);
  }
  const onKey = e => { if (e.key === "Escape") close(); };

  function frame(inner) {
    close();
    sheet = document.createElement("div");
    sheet.className = "aiwrap";
    sheet.innerHTML = `<div class="aisheet" role="dialog" aria-modal="true" aria-label="Ask">${inner}</div>`;
    sheet.addEventListener("click", e => { if (e.target === sheet || e.target.closest("[data-x]")) close(); });
    document.body.appendChild(sheet);
    document.addEventListener("keydown", onKey);
    // Keep the box above the keyboard.
    const vv = window.visualViewport, box = sheet.firstElementChild;
    if (vv) {
      const fit = () => {
        if (!sheet) return vv.removeEventListener("resize", fit);
        const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        box.style.marginBottom = kb + "px";
        box.style.maxHeight = Math.max(240, vv.height - 48) + "px";
      };
      vv.addEventListener("resize", fit); fit();
    }
    return box;
  }

  // Grayed out: say why, right away.
  function why() {
    const [h, p] = WHY[status] || WHY.unavailable;
    const learn = document.querySelector('a[href*="how-to-play"]');
    frame(`<div class="aihead"><span class="sp"></span><button data-x aria-label="Close">&times;</button></div>
      <div class="aiwhy"><span class="aiic">${SPARK}</span><h3>${esc(h)}</h3><p>${esc(p)}</p>
        ${learn ? `<p style="font-size:14px">The rules are in <a href="${learn.getAttribute("href")}" style="color:#FFC61A">How to play</a>.</p>` : ""}
        <button class="ok" data-x>OK</button></div>`);
  }

  function chips() {
    const k = screenKey(), inTag = typeof S !== "undefined" && !S.word && IN_ROUND.has(k);
    const p = window.Party && Party.info ? Party.info() : null;
    const c = [];
    c.push("What do I do now?");
    if (inTag || (p && p.phase && p.mode === "tag")) c.push("How many imposters are left?", "How many meetings are left?");
    else if (p && p.phase && p.mode === "far") c.push("Whose turn is it?");
    else if (p) c.push("How do I invite people?");
    else c.push("How do I play?", "Word or Tag?");
    // Few buttons: after an answer, one question plus Shorter and Simpler.
    const shown = log.some(m => m.who === "ai") ? [c[0], "Shorter", "Simpler"] : c.slice(0, 3);
    return shown.map(t => `<button type="button" data-chip="${esc(t)}">${esc(t)}</button>`).join("");
  }

  function render() {
    if (!sheet) return;
    const lg = sheet.querySelector(".ailog");
    lg.innerHTML = (log.length ? "" : `<div class="aimsg ai">Hi! Ask me anything about Pocket Imposter: the rules, what to tap, or what's going on in your game.</div>`) +
      log.map(m => `<div class="aimsg ${m.who}">${m.who === "ai" ? fmt(m.text) : esc(m.text)}</div>`).join("") +
      (busy ? '<div class="aimsg ai"><span class="aidots"><i></i><i></i><i></i></span></div>' : "");
    lg.scrollTop = lg.scrollHeight;
    sheet.querySelector(".aichips").innerHTML = busy ? "" : chips();
    sheet.querySelector(".aiform button").disabled = busy;
  }

  function open() {
    if (status !== "ready") return why();
    const box = frame(`<div class="aihead"><span class="aiic">${SPARK}</span><span><b>Ask</b><small>Runs on this iPhone</small></span>
        <span class="sp"></span><button data-new>New chat</button><button data-x aria-label="Close">&times;</button></div>
      <div class="ailog" aria-live="polite"></div>
      <div class="aichips"></div>
      <form class="aiform"><input enterkeyhint="send" autocomplete="off" maxlength="300" placeholder="Ask anything about the game" aria-label="Your question">
        <button aria-label="Send">${SEND}</button></form>`);
    box.querySelector(".aiform").addEventListener("submit", e => {
      e.preventDefault();
      const inp = box.querySelector("input"), t = inp.value.trim();
      if (!t || busy) return;
      inp.value = "";
      ask(t);
    });
    box.addEventListener("click", e => {
      const c = e.target.closest("[data-chip]");
      if (c && !busy) return ask(c.dataset.chip);
      if (e.target.closest("[data-new]")) {
        log = []; lastFacts = ""; saveLog();
        try { nat().aiReset(); } catch (_) {}
        render();
      }
    });
    render();
  }

  // The on-device model sometimes echoes the prompt's labels ("Facts:",
  // "Q:", "A:") or says a line twice. Keep only the answer.
  function tidy(t) {
    let x = String(t || "").trim();
    const k = x.search(/(^|\n)\s*A:\s*/g) >= 0 ? x.lastIndexOf("A:") : -1;
    if (k >= 0 && /(^|\n)\s*(Facts|Q|Question|Asked)\b/.test(x.slice(0, k))) x = x.slice(k + 2);
    x = x.split("\n").filter(l => !/^\s*(Facts|Q|Question)\s*:/i.test(l)).join("\n").replace(/^\s*A:\s*/, "");
    const seen = new Set();
    x = x.split("\n").filter(l => { const k2 = l.trim().toLowerCase(); if (!k2) return true; if (seen.has(k2)) return false; seen.add(k2); return true; }).join("\n");
    return x.replace(/\n{3,}/g, "\n\n").trim();
  }

  async function ask(text) {
    log.push({ who: "me", text });
    busy = true; render();
    const math = questionMath(text);
    const now = facts() + (math.length ? "\nWorked out for this question: " + math.join(" ") : "");
    const fresh = !log.some(m => m.who === "ai");
    const prompt = (now === lastFacts && !fresh ? "Facts: same as before.\n\n" : "Facts:\n" + now + "\n\n") + "Question: " + text;
    let reply;
    try {
      reply = (await nat().aiAsk({ prompt, instructions: RULES, fresh })).text;
      lastFacts = now;
    } catch (e) {
      const code = e && e.code;
      if (code === "context") {
        // The chat outgrew the phone's model: start over, bringing the last
        // exchange along so a follow-up still makes sense.
        const prev = log.slice(-3, -1).map(m => (m.who === "me" ? "They asked: " : "You said: ") + m.text.slice(0, 300)).join("\n");
        try {
          reply = (await nat().aiAsk({ instructions: RULES, fresh: true,
            prompt: "Facts:\n" + now + "\n\n" + (prev ? "Earlier in this chat:\n" + prev + "\n\n" : "") + "Question: " + text })).text;
          lastFacts = now;
        } catch (_) { reply = null; }
      }
      if (!reply) reply = code === "guardrail" || code === "refusal" ? "I can't answer that one. Try asking it another way."
        : code === "busy" ? "Still working on the last one. Try again in a second."
        : code === "downloading" || code === "os" ? (check(), "AI help isn't ready on this iPhone right now. Try again in a few minutes.")
        : code === "language" ? "I can only answer in a language Apple Intelligence supports, like English."
        : "Something went wrong. Try again.";
    }
    log.push({ who: "ai", text: tidy(reply) || "Something went wrong. Try again." });
    saveLog();
    busy = false; render();
  }

  document.addEventListener("click", e => {
    if (!e.target.closest("[data-ai]")) return;
    e.preventDefault();
    open();
  });

  window.ImpAI = { open, facts, check, questionMath, status: () => status, RULES };
})();
