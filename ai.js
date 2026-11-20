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
  // ⚠ This app ships the plain site, not Capacitor's JS library, so there is no
  // Capacitor.registerPlugin (build 22's AI never connected because of that).
  // The native bridge always has nativePromise, so calls go through it.
  const NATIVE = (() => {
    try {
      if (typeof Native !== "undefined" && Native) return Native;      // the play page made it already
      const C = window.Capacitor;
      if (!C || !C.isNativePlatform || !C.isNativePlatform() || typeof C.nativePromise !== "function") return null;
      const call = m => o => C.nativePromise("ImpNative", m, o || {});
      return { aiStatus: call("aiStatus"), aiAsk: call("aiAsk"), aiReset: call("aiReset"), aiWarm: call("aiWarm") };
    } catch (_) { return null; }
  })();
  let status = NATIVE ? "checking" : "web";
  // Tests in a desktop browser can stand in for the iPhone's model.
  const nat = () => window.IMP_AI_MOCK || NATIVE;

  // What's missing, and exactly how to fix it. Apple doesn't let apps open
  // the Apple Intelligence setting directly, so the steps start at Settings.
  const SETTINGS = 'Open <b>Settings</b>, the gray gear app on your Home Screen.';
  const WHY = {
    web: { t: "AI help is in the iPhone app",
      p: "It runs on the iPhone itself, so it needs the Pocket Imposter app on an iPhone 15 Pro or newer, with Apple Intelligence on." },
    update: { t: "Update Pocket Imposter",
      p: "This copy of the app doesn't have the AI part yet.",
      steps: ["Open the <b>App Store</b> and tap your picture at the top right.", "Find <b>Pocket Imposter</b> and tap <b>Update</b>.", "Open Pocket Imposter again and tap the bubble."] },
    os: { t: "Update your iPhone first",
      p: "This iPhone can run AI help, but it needs iOS 26 or newer.",
      steps: [SETTINGS, "Tap <b>General</b>, then <b>Software Update</b>.", "Tap <b>Update Now</b> and let the iPhone restart.",
              "Then turn on Apple Intelligence: <b>Settings</b> &rsaquo; <b>Apple Intelligence &amp; Siri</b> &rsaquo; turn on <b>Apple Intelligence</b>.",
              "Come back here and tap <b>Check again</b>."], again: true },
    device: { t: "AI help needs a newer iPhone",
      p: "Apple's on-device AI runs on iPhone 15 Pro, 15 Pro Max, every iPhone 16 and 17, and iPhone Air. Everything else in the app works the same.",
      steps: ["To see which iPhone this is: <b>Settings</b> &rsaquo; <b>General</b> &rsaquo; <b>About</b> &rsaquo; <b>Model Name</b>."] },
    off: { t: "Turn on Apple Intelligence",
      p: "This iPhone can run AI help. Apple Intelligence just has to be switched on.",
      steps: [SETTINGS, "Scroll down and tap <b>Apple Intelligence &amp; Siri</b>.",
              "Tap the <b>Apple Intelligence</b> switch so it turns green, and follow what it says on screen.",
              "Stay on Wi-Fi while it downloads. It can take a few minutes.",
              "Come back here and tap <b>Check again</b>."], again: true },
    downloading: { t: "Almost ready",
      p: "Apple Intelligence is on, but it's still downloading to this iPhone.",
      steps: ["Keep the iPhone on Wi-Fi. Plugging it in speeds it up.",
              "To see how it's going: <b>Settings</b> &rsaquo; <b>Apple Intelligence &amp; Siri</b>.",
              "When it's done, come back and tap <b>Check again</b>."], again: true },
    language: { t: "Change the iPhone's language",
      p: "Apple Intelligence doesn't support the language this iPhone is set to.",
      steps: [SETTINGS, "Tap <b>General</b>, then <b>Language &amp; Region</b>, and set <b>iPhone Language</b> to English.",
              "Go back to Settings, tap <b>Apple Intelligence &amp; Siri</b>, and set its <b>Language</b> to English too.",
              "Come back here and tap <b>Check again</b>."], again: true },
    unavailable: { t: "AI help isn't available right now",
      p: "Apple Intelligence can't run on this iPhone at the moment.",
      steps: [SETTINGS, "Tap <b>Apple Intelligence &amp; Siri</b> and check that <b>Apple Intelligence</b> is on.",
              "Come back here and tap <b>Check again</b>."], again: true },
    checking: { t: "One sec", p: "Checking if this iPhone can run AI help." }
  };

  // iPhone 15 Pro is "iPhone16,1"; every model since is 16 or higher.
  const newEnough = m => { const x = /^iPhone(\d+),/.exec(m || ""); return !x || +x[1] >= 16; };
  let checking = null;
  function check() {
    checking = (async () => {
      if (!nat()) return setStatus("web");
      try {
        const r = await nat().aiStatus();
        let st = (r && r.status) || "unavailable";
        if (st === "os" && !newEnough(r.machine)) st = "device";
        setStatus(st);
      } catch (_) {
        setStatus("update");      // the app's AI part isn't there: don't blame the phone
      }
    })();
    return checking;
  }
  function setStatus(st) {
    status = st;
    document.documentElement.classList.toggle("ai-off", st !== "ready");
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
- If the rules and facts don't cover it, say you're not sure and point to How to play. Never guess.
- Only ask a question back if you can't answer without it.
- Players make typos and use slang. Work out what they mean.
- "Shorter" means say your last answer in fewer words. "Simpler" means use easier words, like for a 9-year-old.
- Name buttons exactly as they appear, in quotes.

When the facts include "Worked out", those numbers are exact. Use them as they are.

THE GAME: works with 3 to 15 players (a party too). Two games, Word and Tag. To change the number of players, tap + or - next to Players on the setup screen.

WORD (sit together, say clues)
Setup: Home > "Word". Set Players, Imposters and "Imposter gets": Hint (a one-word hint), Nothing (just the category) or Close word (the imposter gets a different word from the same category, sees it like a normal word, and doesn't know they're the imposter). "Categories" turns word lists on or off; "Make your own" adds your own words, and "Share my words" turns them into a code a friend can paste in. "Player names" is optional. Tap "START".
Cards: "Hand the phone to [name]", that player taps "I have the phone", holds "HOLD" to see their card, lets go, taps "Next player". Crew see the word. Imposters see IMPOSTER and maybe a hint. Everyone sees the category. In Word, imposters don't know who the other imposters are.
"Game started" says who goes first. Everyone says one word about the secret word, one at a time. Then everyone points at who they think is lying on 3. Tap "Reveal", then "Yes, reveal" to see the word and the imposters. "NEW GAME" deals a new word.
Crew win if they vote out every imposter. Imposters win if they survive the vote.

TAG (play outside, run and tag)
Setup: Home > "Tag". Players, Imposters, Meetings (how many the group can call, 0 to 9). "More rules": How to vote ("Secret" on the phone or "Out loud"), Tag timer (the phone counts down between tags; off by default because on one shared phone people could see who taps it), "Meetings each" (the most one person can call; Any means no limit).
Cards say CREW or IMPOSTER. With 2 or more imposters, each imposter's card shows "Your team" so they don't tag each other. Then leave the phone where everyone can reach it.
Imposters tag people by touching them, so everyone has to be in the same place. A tagged player lies down right there. Imposters can fake a death too. After a tag, an imposter waits before tagging again: 45 seconds with 3 to 6 players, 30 with 7 to 10, 20 with 11 to 15, plus 10 more for each imposter after the first.
"Report a body" is always allowed. "Emergency meeting" uses one of the group's meetings and asks "Who called the meeting?". A siren plays for 8 seconds; "Stop the siren" stops it sooner. "Called by mistake? Cancel it" gives the meeting back.
Secret vote: "Start the vote", pass the phone, each person taps "I have the phone", then a name, "Skip vote" or "I got tagged" (they're out), then "Submit vote".
Out loud: tap "Who's out?", tap everyone who got tagged, tap "Next", then pick who the group voted out, or "Nobody".
Most votes is out. A tie means nobody is out. The result shows after the vote, never in the middle of a meeting, so a faked death isn't given away.
Then everyone says "3, 2, 1, UP!" and "Back to the game" starts 15 seconds of no tagging. Out players are ghosts: no voting, no meetings.
Crew win when every imposter is out. Imposters win when the imposters still in are at least as many as the crew still in. The phone doesn't say if a voted-out player was an imposter until "Reveal".

PLAY TOGETHER (everyone on their own phone, needs internet)
Home > "Play together". "Host" makes a 4-letter party code. Invite with "Messages", "Mail", "Copy link" or "More"; they tap the link, type a name and they're in. Or they tap "Join" and type the code. Names are 2 to 14 letters ("Random name" works). Up to 15 players.
The host can "Add" someone with no phone (they use the host's phone to see their card) and remove anyone with the x. "More rules" has "Who can join": Nobody, Before start, or Anytime (people can join a game that's going; tap the code at the top to invite them).
Word with "Where is everyone?" set to "Far apart" is for friends in different places: one imposter, everyone takes turns typing a clue, then votes on their own phone. Tag needs everyone in the same place.
During a game, "Hold to check your card" shows your card again. If a phone drops, open the game, tap "Join", type the same code and you're back in. If the host's phone goes off, the others see a 2-minute countdown.
"Report a problem" reports a player.

THE APP
The menu has Word, Tag and Play together, plus How to play, Help, Share and Tip the Dev. During a game the Home button keeps the game going: the menu shows "Game in progress" with "Back to it". Everything works offline except Play together.
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
      (S.word ? `, imposter gets ${S.close ? "a close word" : S.hint ? "a hint" : "nothing"}` +
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
    let lo = Math.max(1, I - out.length), hi = Math.min(I, Math.floor((still - 1) / 2));
    if (hi < lo) hi = lo;
    f.push(`Still in: ${still} of ${n}. Out: ${list(out.map(pname))}.` +
      (tagged.length ? ` Said they got tagged (could be a faked death; the phone never says): ${list(tagged.map(pname))}.` : "") +
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
      : `, imposter gets ${p.close ? "a close word" : p.hint ? "a hint" : "nothing"}` + (p.mode === "far" ? `, ${p.cluesEach} clue${p.cluesEach === 1 ? "" : "s"} each` : "")) + ".");
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

  /* ------------------------------------------------------------ instant answers
     The phone's model is small and fumbles easy questions. The ones people
     actually ask are answered here, straight from the game, with no model. */
  const NEXT = {
    home: 'Pick a game: "Word" to sit together and give clues, "Tag" to play outside, or "Play together" if everyone has a phone.',
    setup: 'Set how many players and imposters, then tap "START".',
    namesScreen: 'Type everyone\'s names in the order you\'re sitting, then tap "Done".',
    catsScreen: 'Tap categories to turn them on or off, then tap "Done".',
    customScreen: 'Type a name and at least 2 words, one per line, then tap "Save".',
    importScreen: 'Paste the code your friend sent, then tap "Use these words".',
    pass: 'Give the phone to the person shown. They tap "I have the phone".',
    card: 'Hold "HOLD" to see your card, let go, then tap "Next player".',
    started: 'Everyone says one word about the secret word, one at a time. Then point at who you think is lying on 3, and tap "Reveal".',
    play: 'Go play! Imposters tag people. Find someone lying down? Tap "Report a body". Want to talk it over? Tap "Emergency meeting".',
    meetPick: 'Tap the name of whoever called the meeting.',
    meeting: 'Everyone comes together and talks it over. Then tap "Start the vote", or "Who\'s out?" if you vote out loud.',
    mvPass: 'Give the phone to the person shown. They tap "I have the phone" and vote in secret.',
    mvVote: 'Tap who you want out, "Skip vote", or "I got tagged" if you got tagged. Then tap "Submit vote".',
    mvTagged: 'Tap everyone who got tagged, then "Next". If nobody did, just tap "Next".',
    mvLoud: 'Pick who the group voted out, or "Nobody", then tap "Done".',
    mvResult: 'Everyone says "3, 2, 1, UP!" Then tap "Back to the game" for 15 seconds of no tagging.',
    revealAsk: 'Tap "Yes, reveal" to see the word and the imposters, or "Keep playing".',
    reveal: 'Tap "NEW GAME" to play again.'
  };
  function partyNext(p) {
    const host = p.role === "host";
    switch (p.screen) {
      case "lobby": return host ? 'Send people the code with "Messages" or "Mail", or they tap "Play together", "Join" and type it. Once 3 or more are in, tap "START".'
                                : "You're in. Wait for the host to tap START.";
      case "name": return 'Type your name or tap "Random name", then tap "Next".';
      case "code": return 'Type the 4-letter code from the host\'s phone, then tap "Join".';
      case "add": return 'Type their name, then tap "Add". They\'ll use your phone to see their card.';
      case "pass": return 'Give your phone to the person shown. They tap "I have the phone".';
      case "card": return 'Hold "HOLD" to see your card, then tap "Got it".';
      case "on":
        if (p.mode === "far") return p.turn ? (p.turn === p.me ? "It's your turn. Type a one or two word clue about the secret word and tap Send." : `It's ${p.turn}'s turn to type a clue. Yours comes up when it's your turn.`) : "Vote for who you think is the imposter.";
        if (p.mode === "tag") return 'Go play! Imposters tag people. Find someone lying down? Tap "Report a body". Want to talk it over? Tap "Emergency meeting".';
        return 'Everyone says one word about the secret word, one at a time. Then point at who you think is lying on 3.' + (host ? ' Tap "Reveal" when you\'re done.' : "");
      case "pick": return "Tap the name of whoever called the meeting.";
      case "meeting": return "Talk it over, then vote.";
      case "mvote": return 'Vote on your phone: tap a name, "Skip vote" or "I got tagged", then submit it.';
      case "result": return 'Everyone says "3, 2, 1, UP!" and the game goes on.';
      case "reveal": return host ? 'Tap "Next game" to play again.' : "Wait for the host to start the next game.";
      default: return "";
    }
  }
  const SECRET = "The phone keeps that secret until Reveal.";
  const HOW_WORD = 'Word: everyone gets the same secret word except the imposters. Take turns saying one word about it. The imposters fake it. Then point at who you think is lying, and tap "Reveal".';
  const HOW_TAG = 'Tag: play outside. Imposters secretly tag people, who lie down. Anyone can call a meeting or report a body, then everyone votes someone out. Crew win when every imposter is out.';
  let lastQuick = "";
  function quick(text) {
    const t = " " + String(text).toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ") + " ";
    const p = window.Party && Party.info ? Party.info() : null;
    const one = typeof S !== "undefined" && document.querySelector("#app") ? S : null;
    const k = screenKey(), word = p ? p.mode !== "tag" : one && k !== "home" ? !!one.word : null;
    const inTag = p ? p.mode === "tag" && !!p.phase : !!(one && !one.word && typeof G !== "undefined" && G && IN_ROUND.has(k));
    if (/^ (shorter|simpler) $/.test(t)) return lastQuick || null;
    if (/ (whats|what is|tell me|say) (the )?(secret )?word | who (is|are|s) (the )?imp| whos (the )?imp| who is lying /.test(t)) return SECRET;
    if (/ (what (do|should) (i|we) do|now what|what now|whats next|what next|next step|what do i press|what do i tap|what do i do now) /.test(t)) {
      const a = p ? partyNext(p) : NEXT[k];
      if (a) return a;
    }
    // numbers in the question: players, imposters, cooldown
    const pm = t.match(/ (\d+) (players?|ppl|people|persons?|kids|friends|guys|of us) /), im = t.match(/ (\d+) (imposters?|impostors?|imps?) /);
    const n = pm ? +pm[1] : 0, kk = im ? +im[1] : 0;
    if (n && (n < 3 || n > 15)) return `The game needs 3 to 15 players.${n < 3 ? " Grab " + (3 - n) + " more!" : ""}`;
    if (n && kk) return kk > maxImp(n) ? `No, ${kk} is too many for ${n} players. The most is ${maxImp(n)}.` : `Yes, ${n} players can have ${kk} imposter${kk === 1 ? "" : "s"}.`;
    if (n && / imp| how many /.test(t) && !/ cool| wait /.test(t)) return `With ${n} players you can have up to ${maxImp(n)} imposter${maxImp(n) === 1 ? "" : "s"}.`;
    if (/ cool ?down | cool off | how long .*wait| wait .*tag| tag again /.test(t)) {
      const pn = n || (p ? p.n || p.players.length : one ? one.players : 0), pk = kk || (p ? p.impCount || p.imposters : one ? one.imps : 0);
      if (pn >= 3 && pk) return `After a tag, an imposter waits ${coolOf(pn, pk)} seconds before tagging again (${pn} players, ${pk} imposter${pk === 1 ? "" : "s"}).`;
      return "After a tag, an imposter waits before tagging again: 45 seconds with 3 to 6 players, 30 with 7 to 10, 20 with 11 to 15, plus 10 for each extra imposter.";
    }
    if (/ how many (people|players|ppl)| (min|max)(imum)? (players|people)| how many can play /.test(t)) return "Pocket Imposter works with 3 to 15 players.";
    if (/ close word /.test(t)) return "With Close word, the imposter gets a different word from the same category, like Cat instead of Dog. It looks like a normal word, so they don't even know they're the imposter. The reveal shows both words.";
    if (/ (team|teammate|each other|other imp|partner)/.test(t) && / imp|team|teammate|partner/.test(t))
      return word === false ? 'Yes. In Tag, each imposter\'s card shows "Your team", so you don\'t tag each other.' : 'In Word, imposters don\'t know who the others are. In Tag, each imposter\'s card shows "Your team".';
    if (/ word or tag | difference | which (game|mode) | what is tag | whats tag | what is word | whats word /.test(t)) return HOW_WORD + " " + HOW_TAG;
    if (/ how (do (i|we|you) |to )play | rules | how does (this|it|the game) work | how (do|does) (this|it) work /.test(t)) return word === false ? HOW_TAG : word ? HOW_WORD : HOW_WORD + " " + HOW_TAG;
    if (/ fake (a |my )?death | fake (being )?dead | pretend (to be )?dead /.test(t)) return 'Yes, imposters can fake a death. In the vote they can pick "I got tagged" like anyone else, and nothing is given away until the vote result.';
    if (/ (see|check|look at) (my )?(card|word|role) again | forgot (my )?(word|card|role) /.test(t))
      return p && p.phase ? 'Hold "Hold to check your card" at the bottom of the screen.' : "Once the phone moves on, cards can't be shown again. If someone forgot, tap the home button and start a new game.";
    if (/ invite | (add|get) (my )?friends? (in|to)| how (do|can) (they|people|my friends?|others) join | join (my|the|a) (game|party) /.test(text.toLowerCase() + " ") || / invite /.test(t)) {
      if (p && p.role === "host") return 'Tap "Messages" or "Mail" to send the invite. They tap the link, type a name and they\'re in. Or they tap "Play together", "Join" and type ' + p.code + ".";
      if (p) return `Have them tap "Play together", then "Join", and type ${p.code}.`;
      return 'Tap "Play together", then "Host". Send the code with "Messages" or "Mail", and your friends tap the link to join.';
    }
    if (/ far (apart|away) | different (place|places|house|houses|city|state)| long distance /.test(t)) return 'Use "Play together" and pick Word with "Where is everyone?" set to "Far apart". Everyone types their clues on their own phone. Tag needs everyone in the same place.';
    if (/ how (do (we|i) |to )vote | voting /.test(t)) return word ? "Point at who you think is lying on 3. Most points is out." + (p ? "" : ' Then tap "Reveal".') : (one && one.vote === "loud") || (p && p.vote === "loud") ? 'Tap "Who\'s out?", tap everyone who got tagged, then pick who the group voted out.' : 'Tap "Start the vote" and pass the phone. Each person taps "I have the phone", picks someone, "Skip vote" or "I got tagged", then "Submit vote".';
    if (/ (end|stop|finish|quit) (the )?(game|round) | how (do|to) reveal /.test(t)) return p && p.role !== "host" ? 'Only the host can end it. They tap "Reveal".' : 'Tap "Reveal", then "Yes, reveal".';
    if (/ report (a )?body /.test(t)) return '"Report a body" is for when you find someone lying down. It\'s always allowed and starts a meeting.';
    if (/ emergency meeting | call a meeting /.test(t) && !/ left /.test(t)) return '"Emergency meeting" brings everyone together to talk and vote. The group only gets so many, set on the setup screen.';
    if (/ meetings? left /.test(t)) { const m = p ? p.meetLeft : (typeof G !== "undefined" && G ? G.meet : null); if (m != null) return `${m} emergency meeting${m === 1 ? "" : "s"} left. "Report a body" is always allowed.`; }
    if (/ whose turn | who goes /.test(t) && p && p.turn) return p.turn === p.me ? "It's your turn to type a clue." : `It's ${p.turn}'s turn.`;
    if (/ share (my )?words | friends? code | my own words | custom words | make (my|your) own /.test(t)) return 'Go to "Word", then "Categories", then "Make your own". Add a name and words, tap "Save". "Share my words" makes a code; your friend taps "Got a code from a friend?" and pastes it.';
    return null;
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
  // Start the model loading the moment the chat opens (a cold start was 6+ s).
  let warmed = false;
  const warm = () => {
    if (warmed || log.some(m => m.who === "ai")) return;
    warmed = true;
    try { const p = nat().aiWarm && nat().aiWarm({ instructions: RULES }); if (p && p.catch) p.catch(() => { warmed = false; }); } catch (_) { warmed = false; }
  };

  const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // Plain text in, a few line breaks and bullets out.
  const fmt = t => esc(t.trim()).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^\s*[-*•]\s+/gm, "• ").replace(/\n/g, "<br>");

  const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9zM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z"/></svg>';
  const SEND = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';

  // Arcade colors: cyan bubble, gold for you. No pink, nothing that flashes.
  const css = `
.aiorb{position:relative;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:#fff;flex:none;
  background:radial-gradient(circle at 32% 26%,#D4FBFF 0,#35E8FF 26%,#1C86FF 70%,#1640B5 100%);
  box-shadow:0 0 0 1px rgba(53,232,255,.45),0 4px 16px rgba(53,232,255,.38),inset 0 -4px 7px rgba(8,18,80,.5),inset 0 2px 3px rgba(255,255,255,.55)}
.aiorb svg{width:56%;height:56%;filter:drop-shadow(0 1px 1px rgba(0,30,90,.55))}
.aiorb::after{content:"";position:absolute;left:22%;top:12%;width:30%;height:18%;border-radius:50%;background:rgba(255,255,255,.55);filter:blur(1px)}
.ai-off .aiorb{background:radial-gradient(circle at 32% 26%,#A7ADBA 0,#6C7282 40%,#3B404D 100%);color:#E3E6EC;
  box-shadow:0 0 0 1px rgba(255,255,255,.14),0 3px 10px rgba(0,0,0,.4),inset 0 -4px 7px rgba(0,0,0,.35)}
.aiorb.sm{width:26px;height:26px}
.aiorb.lg{width:64px;height:64px}
.aibubble{position:fixed;right:14px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:60;width:60px;height:60px;
  padding:0;border:0;background:none;border-radius:50%;cursor:pointer;-webkit-tap-highlight-color:transparent}
.aibubble .aiorb{width:60px;height:60px}
.aibubble:active .aiorb,.aibtn:active .aiorb{transform:scale(.92)}
@media(min-width:900px){.aibubble{bottom:28px;right:28px}}
.aiwrap{position:fixed;left:0;right:0;top:0;height:100%;z-index:9999;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;
  padding:12px 12px calc(12px + env(safe-area-inset-bottom));background:rgba(3,4,16,.62);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.aisheet{position:relative;display:flex;flex-direction:column;width:100%;max-width:520px;max-height:86%;overflow:hidden;
  border-radius:30px;color:#F2F4F8;font-family:inherit;
  background:radial-gradient(120% 55% at 50% -12%,rgba(53,232,255,.20),transparent 62%),linear-gradient(180deg,#121640,#0B0D26);
  border:1px solid rgba(53,232,255,.30);box-shadow:0 24px 70px rgba(0,0,0,.65),0 0 46px rgba(53,232,255,.14)}
.aihead{display:flex;align-items:center;gap:12px;padding:16px 14px 12px 16px;border-bottom:1px solid rgba(53,232,255,.10)}
.aihead .aiorb{width:42px;height:42px}
.aihead b{font-size:20px;letter-spacing:.01em}
.aihead small{display:flex;align-items:center;gap:6px;font-size:12.5px;color:#8FE9F7;font-weight:600}
.aihead small i{width:7px;height:7px;border-radius:50%;background:#3AC75A;box-shadow:0 0 6px #3AC75A}
.aihead .sp{flex:1}
.aihead button{height:36px;min-width:36px;padding:0 12px;border-radius:999px;border:1px solid rgba(53,232,255,.22);
  background:rgba(53,232,255,.07);color:#CFF8FF;font-family:inherit;font-weight:600;font-size:14px;line-height:1}
.ailog{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding:14px 14px 10px;-webkit-overflow-scrolling:touch}
.airow{display:flex;align-items:flex-end;gap:8px;max-width:92%}
.airow.me{align-self:flex-end;flex-direction:row-reverse}
.aimsg{position:relative;padding:11px 15px;border-radius:22px;font-size:16px;line-height:1.42;overflow-wrap:anywhere}
.airow.ai .aimsg{background:linear-gradient(180deg,#1E2560,#181E4E);border:1px solid rgba(53,232,255,.18);border-bottom-left-radius:7px}
.airow.me .aimsg{background:linear-gradient(180deg,#FFD447,#FFC21A);color:#17140A;font-weight:600;border-bottom-right-radius:7px;
  box-shadow:0 4px 14px rgba(255,198,26,.18)}
.aidots{display:inline-flex;gap:5px;padding:5px 2px}
.aidots i{width:7px;height:7px;border-radius:50%;background:#8FE9F7;opacity:.55}
.aidots i:nth-child(2){opacity:.75}.aidots i:nth-child(3){opacity:.95}
.aichips{display:flex;flex-wrap:wrap;gap:8px;padding:2px 14px 10px}
.aichips button{padding:9px 13px;border-radius:999px;background:rgba(53,232,255,.08);color:#D6FAFF;font-family:inherit;
  font-weight:600;font-size:14px;line-height:1.1;border:1px solid rgba(53,232,255,.26)}
.aiform{display:flex;gap:8px;padding:4px 12px 14px}
.aiform input{flex:1;min-width:0;height:50px;padding:0 18px;border-radius:25px;border:1px solid rgba(53,232,255,.22);
  background:#070920;color:#F2F4F8;font-family:inherit;font-weight:500;font-size:16px;outline:none}
.aiform input::placeholder{color:#7F87A6}
.aiform input:focus{border-color:#35E8FF;box-shadow:0 0 0 3px rgba(53,232,255,.15)}
.aiform button{width:50px;height:50px;border-radius:50%;border:0;display:grid;place-items:center;color:#06213A;
  background:radial-gradient(circle at 32% 26%,#D4FBFF 0,#35E8FF 40%,#1C9BFF 100%);box-shadow:0 4px 14px rgba(53,232,255,.35)}
.aiform button:disabled{opacity:.4}
.aiform button svg{width:22px;height:22px}
.aiwhy{display:grid;justify-items:center;gap:12px;padding:6px 20px 20px;text-align:center;overflow-y:auto}
.aiwhy h3{margin:2px 0 0;font-size:22px;line-height:1.2}
.aiwhy p{margin:0;color:#B9C0D6;font-size:16px;line-height:1.45;max-width:36ch}
.aisteps{list-style:none;margin:4px 0 0;padding:0;display:grid;gap:10px;width:100%;text-align:left;counter-reset:s}
.aisteps li{counter-increment:s;display:grid;grid-template-columns:30px 1fr;gap:12px;align-items:start;padding:12px 14px;
  border-radius:16px;background:rgba(53,232,255,.06);border:1px solid rgba(53,232,255,.14);font-size:16px;line-height:1.4;color:#E6E9F2}
.aisteps li::before{content:counter(s);width:30px;height:30px;border-radius:50%;display:grid;place-items:center;
  background:#35E8FF;color:#06213A;font-weight:700;font-size:15px}
.aisteps li b{color:#fff}
.aiwhy .still{color:#FFC61A;font-weight:600;font-size:15px}
.aiwhy .btns{display:grid;grid-template-columns:1fr;gap:8px;width:100%;margin-top:4px}
.aihead small,.aihead button{white-space:nowrap}
.aihead button{flex:none}
.aihead>span:nth-child(2){min-width:0}
.aihead small{overflow:hidden;text-overflow:ellipsis}
.ailog{min-height:64px}
@media (max-height:560px){
 .aiwrap{padding:max(6px,env(safe-area-inset-top)) 8px 6px}
 .aisheet{max-height:100%}
 .aihead{padding:8px 10px 8px 12px} .aihead .aiorb{width:32px;height:32px}
 .aichips{flex-wrap:nowrap;overflow-x:auto} .aichips button{flex:none}
 .aisheet:has(.aiform input:focus) .aichips{display:none}}
.aiwhy .ok{height:52px;border-radius:18px;border:0;font-family:inherit;font-weight:700;font-size:17px;color:#06213A;
  background:radial-gradient(circle at 30% 0%,#D4FBFF 0,#35E8FF 45%,#1C9BFF 100%)}
.aiwhy .ok.ghost{background:rgba(255,255,255,.06);color:#CFD4E2;border:1px solid rgba(255,255,255,.12)}
.aiwhy .note{font-size:13.5px;color:#8A92AC}`;
  const ORB = (cls) => `<span class="aiorb ${cls || ""}">${SPARK}</span>`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  function close() {
    if (!sheet) return;
    sheet.remove(); sheet = null;
    document.documentElement.style.overflow = "";
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
    // ⚠ The keyboard: the overlay covers exactly the part of the screen you
    // can see, so the chat sits right above the keyboard. Build 23 added the
    // keyboard height on top of iOS sliding the page, which pushed the chat
    // off the top. (The app also shrinks itself for the keyboard natively.)
    const vv = window.visualViewport, box = sheet.firstElementChild, wrap = sheet;
    document.documentElement.style.overflow = "hidden";
    if (vv) {
      const fit = () => {
        if (!sheet) { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); return; }
        wrap.style.top = vv.offsetTop + "px";
        wrap.style.height = vv.height + "px";
      };
      vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit); fit();
    }
    return box;
  }

  // Grayed out: say why right away, and exactly how to fix it.
  function why(again) {
    const w = WHY[status] || WHY.unavailable;
    const learn = document.querySelector('a[href*="how-to-play"]');
    const box = frame(`<div class="aihead"><span class="sp"></span><button data-x aria-label="Close">&times;</button></div>
      <div class="aiwhy">${ORB("lg")}<h3>${esc(w.t)}</h3><p>${esc(w.p)}</p>
        ${w.steps ? `<ol class="aisteps">${w.steps.map(x => `<li><span>${x}</span></li>`).join("")}</ol>` : ""}
        ${again ? '<p class="still">Not ready yet. Check the steps above, then try again.</p>' : ""}
        ${status === "off" ? '<p class="note">Apple doesn\'t let apps open that setting for you, so it\'s a few taps in Settings.</p>' : ""}
        ${!w.steps && learn ? `<p class="note">The rules are in <a href="${learn.getAttribute("href")}" style="color:#35E8FF">How to play</a>.</p>` : ""}
        <div class="btns">${w.again ? '<button class="ok" data-recheck>Check again</button><button class="ok ghost" data-x>Close</button>'
                                    : '<button class="ok" data-x>OK</button>'}</div></div>`);
    const st = box.querySelector(".still"); if (st) st.scrollIntoView({ block: "center" });
    const rb = box.querySelector("[data-recheck]");
    if (rb) rb.addEventListener("click", async () => {
      rb.disabled = true; rb.textContent = "Checking...";
      await check();
      if (status === "ready") open(); else why(true);
    });
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
    const row = (who, html) => `<div class="airow ${who}">${who === "ai" ? ORB("sm") : ""}<div class="aimsg">${html}</div></div>`;
    lg.innerHTML = (log.length ? "" : row("ai", "Hi! Ask me anything about Pocket Imposter: the rules, what to tap, or what's going on in your game.")) +
      log.map(m => row(m.who, m.who === "ai" ? fmt(m.text) : esc(m.text))).join("") +
      (busy ? row("ai", '<span class="aidots" aria-label="Thinking"><i></i><i></i><i></i></span>') : "");
    lg.scrollTop = lg.scrollHeight;
    sheet.querySelector(".aichips").innerHTML = busy ? "" : chips();
    sheet.querySelector(".aiform button").disabled = busy;
  }

  async function open() {
    if (status === "checking" && checking) await checking;
    if (status !== "ready") return why();
    const box = frame(`<div class="aihead">${ORB()}<span><b>Ask</b><small><i></i>Runs on this iPhone</small></span>
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
        log = []; lastFacts = ""; saveLog(); warmed = false;
        try { const r = nat().aiReset(); if (r && r.then) r.then(warm, warm); } catch (_) {}
        render();
      }
    });
    render();
    warm();
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
    let q = null;
    try { q = quick(text); } catch (_) {}
    if (q) {                                   // a sure answer: no model, no wait
      lastQuick = q;
      log.push({ who: "ai", text: q }); saveLog(); render();
      return;
    }
    lastQuick = "";
    busy = true; render();
    const math = questionMath(text);
    const now = facts() + (math.length ? "\nWorked out for this question: " + math.join(" ") : "");
    const fresh = !log.some(m => m.who === "ai") && !warmed;
    const prompt = (now === lastFacts && !fresh ? "Facts: same as before.\n\n" : "Facts:\n" + now + "\n\n") + "Question: " + text;
    let reply;
    try {
      // A model that never answers can't lock the chat: give up after 40 s.
      const slow = new Promise((_, no) => setTimeout(() => no({ code: "slow" }), 40000));
      reply = (await Promise.race([nat().aiAsk({ prompt, instructions: RULES, fresh }), slow])).text;
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
        : code === "slow" ? (warmed = false, (() => { try { nat().aiReset(); } catch (_) {} })(), "That took too long. Try again.")
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

  window.ImpAI = { open, facts, check, questionMath, quick, status: () => status, RULES, SPARK };
})();
