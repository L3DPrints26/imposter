/* Party names: a random-name button, and a check that won't let you in with a
   name that isn't OK for a group game (ages 10 and up). It catches the
   obvious, plus the usual dodges: l33t letters, stretched letters and
   spaces or dots between letters.

   The word lists are stored backwards so they don't read as a wall of swearing
   to anyone opening this file. */
(function () {
  "use strict";
  const rev = s => s.split("").reverse().join("");
  // Blocked anywhere inside a name.
  const ANY_LIST = ["kcuf", "tihs", "hctib", "tnuc", "yssup", "erohw", "tuls", "ggin", "toggaf", "drater", "nrop", "sinep", "anigav", "elohssa", "dratsab", "tawt", "knaw", "zzij", "odlid", "ynroh", "ssip", "izan", "reltih", "kkk", "tsipar", "flesruoyllik", "kcid", "kcuc", "ekik", "kcabtew", "ynnart", "renaeb", "ekyd", "boob", "elppin", "yxes", "ysup", "elohsa", "togaf"].map(rev);
  // Blocked only as a whole word, because they hide inside fine words
  // (peacock, grape, hello, button, raccoon, Sussex, cucumber, canal).
  const WORD_SET = new Set(["kcoc", "epar", "ttub", "ssa", "muc", "xes", "nooc", "omoh", "cips", "knihc", "koog", "gaf", "nmad", "parc", "lleh", "stit", "edun", "dekan", "lana", "eoh", "kcus", "skcus"].map(rev));

  const LEET = { "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "5": "s",
                 "$": "s", "7": "t", "+": "t", "8": "b", "9": "g", "6": "g", "2": "z" };
  const norm = s => s.toLowerCase().replace(/[0-9!|@$+]/g, c => LEET[c] || c);
  const squash = s => s.replace(/(.)\1+/g, "$1");

  function check(raw) {
    const name = (raw || "").replace(/\s+/g, " ").trim();
    if (name.length < 2) return { ok: false, why: "Type a name, at least 2 letters." };
    if (name.length > 14) return { ok: false, why: "Keep it to 14 letters or fewer." };
    if (!/^[A-Za-z0-9 .'\-]+$/.test(name)) return { ok: false, why: "Letters, numbers and spaces only." };
    if (!/[A-Za-z]/.test(name)) return { ok: false, why: "Put at least one letter in it." };
    const n = norm(name);
    const flat = n.replace(/[^a-z]/g, "");
    const words = n.split(/[^a-z]+/).filter(Boolean);
    const bad =
      ANY_LIST.some(w => flat.includes(w) || squash(flat).includes(w)) ||
      words.some(w => WORD_SET.has(w) || WORD_SET.has(squash(w))) ||
      WORD_SET.has(flat) || WORD_SET.has(squash(flat));
    if (bad) return { ok: false, why: "Pick a different name. That one isn't allowed." };
    return { ok: true, name };
  }

  const ADJ = ["Sneaky", "Sly", "Shady", "Quiet", "Cool", "Lucky", "Silly", "Brave", "Swift", "Fuzzy",
    "Spicy", "Sleepy", "Jumpy", "Zippy", "Witty", "Bold", "Calm", "Tiny", "Mega", "Super", "Secret",
    "Rapid", "Cosmic", "Wild", "Clever", "Sunny", "Gold", "Turbo"];
  const NOUN = ["Panda", "Otter", "Falcon", "Ninja", "Penguin", "Taco", "Waffle", "Comet", "Tiger",
    "Llama", "Rocket", "Pickle", "Wizard", "Badger", "Koala", "Pirate", "Robot", "Dragon", "Bean",
    "Noodle", "Gecko", "Moose", "Shark", "Raven", "Muffin", "Yeti", "Walrus", "Pretzel"];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function random(taken) {
    const used = new Set((taken || []).map(t => t.toLowerCase()));
    for (let i = 0; i < 50; i++) {
      const n = pick(ADJ) + " " + pick(NOUN);
      if (n.length <= 14 && !used.has(n.toLowerCase())) return n;
    }
    return pick(ADJ) + " " + pick(NOUN);
  }

  window.NameCheck = { check, random };
})();
