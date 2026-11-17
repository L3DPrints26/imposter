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
  const ANY_LIST = ["yddid", "lddid", "kcvf", "kucf", "kuhp", "ggln", "ggjn", "lohzza", "knaks", "iatneh", "tohsmuc", "hcuod", "tnuhekim", "ssajhguh", "revodneb", "ztubruomyes", "kcuf", "tihs", "hctib", "tnuc", "yssup", "erohw", "tuls", "ggin", "toggaf", "drater", "nrop", "sinep", "anigav", "elohssa", "dratsab", "tawt", "zzij", "odlid", "ynroh", "ssip", "reltih", "kkk", "kcuc", "ekik", "kcabtew", "ynnart", "renaeb", "elppin", "yxes", "ysup", "elohsa", "togaf", "kuf", "kcf", "kcuhp", "quf", "tyhs", "t1hs", "hctaib", "hctb", "tnuk", "rohw", "t0ls", "aggin", "rgin", "agin", "nr0p", "nigav", "elohesra", "rotarbiv", "einroh", "dessip", "kc1d", "yttit", "seittit", "xxes", "msagro", "flim", "toht", "bojwolb", "bojdnah", "renob", "elcitset", "mutorcs", "nemes", "mreps", "modnoc", "tsecni", "elihpodep", "elifodep", "tselom", "edicius", "smk", "mrahfles", "flesymtuc", "tsirorret", "sisi", "akitsaws", "eniacoc", "gnob", "ysatsce", "lynatnef", "xanax", "daehkcarc", "eiggurd", "ftw", "ufts", "gfmo", "oafml", "lmf", "tihsllub", "ssabmud", "ssakcaj", "ssatrams", "ssadab", "daehtihs", "daehkcid", "elohttub", "gulpttub", "sbweb", "sboob", "reppirts", "rekooh", "etutitsorp", "yddadragus", "seussiyddad", "snafylno", "reredrum", "rebmob", "ssataf", "ostaf", "ssadral", "ypeerc", "timmad", "nmaddog", "ypparc", "rotaredom"].map(rev);
  // Blocked only as a whole word, because they hide inside fine words
  // (peacock, grape, hello, button, raccoon, Sussex, cucumber, canal).
  const WORD_SET = new Set(["kcoc", "epar", "ttub", "ssa", "muc", "xes", "nooc", "omoh", "cips", "knihc", "koog", "gaf", "nmad", "parc", "lleh", "stit", "edun", "dekan", "lana", "eoh", "kcus", "skcus", "esra", "koc", "tsipar", "suna", "smuc", "tit", "seoh", "izan", "sizan", "orgen", "deew", "nioreh", "kcarc", "htem", "top", "epod", "hgih", "evals", "sevals", "syk", "odep", "sodep", "knaw", "reknaw", "ekyd", "96yag", "syag", "sb", "fa", "htw", "uf", "kf", "ths", "pp", "eep", "oop", "poop", "sttub", "ytoob", "mub", "smub", "tun", "stun", "sllab", "llab", "kcas", "tsoh", "dom", "sved", "ved", "mg", "llik", "sllik", "eid", "seid", "daed", "htaed", "rellik", "toohs", "nug", "doolb", "bats", "pirts", "tnulb", "bmud", "rekcus", "pmip", "trocse", "peerc", "kaerf", "bmob", "ffats", "metsys", "troppus", "elppa", "laiciffo", "nimda", "erog", "redrum", "1ssup", "5inep", "denots", "resol", "ylgu", "sedun", "boob", "norom", "toidi", "diputs", "odriew", "vrep", "trevrep", "kcid", "kid", "ctib", "elfir", "retoohs", "flesruoyllik", "dsl", "namssa", "tahssa", "epiwssa", "nwolcssa", "sessa"].map(rev));

  const LEET = { "0": "o", "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "5": "s",
                 "$": "s", "7": "t", "+": "t", "8": "b", "9": "g", "6": "g", "2": "z" };
  const norm = s => s.toLowerCase().replace(/[0-9!|@$+]/g, c => LEET[c] || c);
  const squash = s => s.replace(/(.)\1+/g, "$1");
  // No links, emails, handles or phone numbers: names and clues go to other
  // people's phones.
  const CONTACT = /https?:|www\.|\.(com|net|org|io|gg|me|co|tv|app|xyz|ly)\b|@|\d{5,}|\d{3}[\s.-]\d{3}[\s.-]?\d{4}/i;

  // Accents off, and look-alike letters (fullwidth, dotless i, ß...) turned
  // into plain ones, so they can't hide a bad word.
  const LOOK = { "ı": "i", "ł": "l", "ø": "o", "ß": "ss", "æ": "ae", "œ": "oe", "đ": "d", "ƒ": "f" };
  const toPlain = t => String(t).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[ıłøßæœđƒ]/gi, c => LOOK[c.toLowerCase()] || c);
  // Real names and words that happen to contain a blocked piece.
  const OKW = /^(\w+shita|shital|fuku\w*|pornthip|semenov|milford|tanigawa|dev|ball|gore|blunt)$/;
  function check(raw) {
    const name = (raw || "").replace(/\s+/g, " ").trim();
    if (name.length < 2) return { ok: false, why: "Type a name, at least 2 letters." };
    if (name.length > 14) return { ok: false, why: "Keep it to 14 letters or fewer." };
    if (!/^[\p{Script=Latin}0-9 .'\-]+$/u.test(name)) return { ok: false, why: "Letters, numbers and spaces only." };
    if (!/\p{Script=Latin}/u.test(name)) return { ok: false, why: "Put at least one letter in it." };
    const plain = toPlain(name);                                        // Zoë -> Zoe, ｆ -> f
    if (/[^\x00-\x7f]/.test(plain)) return { ok: false, why: "Letters, numbers and spaces only." };
    if (CONTACT.test(name)) return { ok: false, why: "No links or long numbers in names." };
    if (/(^|\D)(69|420|666|80085|8008|5318008)(\D|$)/.test(name)) return { ok: false, why: "Pick a different name. That one isn't allowed." };
    const n = norm(plain);
    const words = n.split(/[^a-z]+/).filter(w => w && !OKW.test(w));
    const flat = words.join("");
    const rawWords = plain.toLowerCase().split(/[^a-z]+/).filter(w => w && !OKW.test(w));
    const trimmed = flat.replace(/^x+|x+$/g, "");
    const bad =
      ANY_LIST.some(w => flat.includes(w) || squash(flat).includes(w)) ||
      words.concat(rawWords, [trimmed]).some(w => WORD_SET.has(w) || WORD_SET.has(squash(w))) ||
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

  // Clues go to everyone's phone, so they get the same word check (no length
  // or letters-only rules: "hot sauce" and "50s" are fine clues).
  function clean(raw) {
    raw = toPlain(raw || "");
    if (/[^\x00-\x7f]/.test(raw)) return false;
    if (CONTACT.test(String(raw || ""))) return false;
    if (/(^|\D)(69|420|80085|5318008)(\D|$)/.test(String(raw || ""))) return false;
    const n = norm(String(raw || ""));
    const flat = n.replace(/[^a-z]/g, "");
    const words = n.split(/[^a-z]+/).filter(Boolean);
    return !(ANY_LIST.some(w => flat.includes(w) || squash(flat).includes(w)) ||
             words.some(w => WORD_SET.has(w) || WORD_SET.has(squash(w))));
  }

  window.NameCheck = { check, random, clean };
})();
