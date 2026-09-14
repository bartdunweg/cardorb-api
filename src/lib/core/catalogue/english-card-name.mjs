/**
 * The English name of a card from a catalogue that has none.
 *
 * TCGdex names a Japanese card in its own script and nowhere else: there is no
 * English catalogue holding リザードンex, because the English game never printed that card. The
 * app is English throughout (Bart's call, 2026-09-11), so the name is worked out from two places
 * that do write it in English, in this order:
 *
 *   1. The card's own TCGdex record, for a Pokémon: its national Dex number(s) name the species
 *      in English (pokedex.generated.json). A tag team joins its species with " & ".
 *   2. The printed name itself, where the record carries no Dex number: the species whose name in
 *      that script sits inside the card's name, longest first, as the Pokédex files a card
 *      (pokedex.ts). ヌイコグマ is Stufful because species-names.generated.json says so. Each half
 *      of a tag team on its own. Only for a Pokémon: ポケモンファンクラブ holds クラブ and is no
 *      Krabby, ペパーのサンドウィッチ holds サンド and is no Sandshrew (2026-09-14).
 *
 * Around the species go the words the card prints that are not the species: an owner or a kind
 * before it (エリカのナゾノクサ is Erika's Oddish, かがやくゲッコウガ is Radiant Greninja) and a
 * mechanic after it (ex, GX, VMAX, δ). Both come from fixed lists, never from whatever Latin
 * letters happen to end the name: TCGdex's printed name for the vintage sets is often English
 * already or a machine translation ("Clefable", "Rocket's Hitmonchan ex", おしっこ for Weezing),
 * and reading its Latin tail as a suffix wrote names twice over ("Clefable Clefable") or garbled
 * ("Hitmonchan s Hitmonchan ex", "Nidoran♀ f") before 2026-09-14.
 *
 * A trainer or an energy keeps its own name: nothing here can translate one, and a guess would be
 * a second identity to keep straight. Most names written before 2026-09-12 came off Cardmarket's
 * product list, through the Cardmarket id maps; those went with Cardmarket, and the names they
 * gave stay in the map as written where they agree with the card's own Dex numbers.
 *
 * Pure, and an .mjs so the script that writes the map and the test that guards the rules read
 * the same code (as price-basis.mjs is).
 */

/** Full-width folded to half-width and hiragana to katakana, so かがやく and カガヤク read alike. */
const kana = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

/**
 * The owners a card prints before its Pokémon, in Japanese and in the katakana TCGdex's machine
 * translation of the VS and e-Card sets writes (フォークナーのpidgeot is Falkner's Pidgeot, VS1).
 * Read off the Cardmarket names and TCGplayer's product names of the same cards, 2026-09-14.
 * ロケット団 is the Scarlet & Violet "Team Rocket's"; the vintage R団 and TCGdex's ロケット are
 * the Gym and Rocket Gang "Rocket's".
 */
const OWNERS = Object.entries({
  ロケット団: "Team Rocket's",
  R団: "Rocket's",
  ロケット: "Rocket's",
  マグマ団: "Team Magma's",
  アクア団: "Team Aqua's",
  N: "N's",
  エリカ: "Erika's",
  カスミ: "Misty's",
  タケシ: "Brock's",
  マチス: "Lt. Surge's",
  ナツメ: "Sabrina's",
  キョウ: "Koga's",
  コガ: "Koga's",
  カツラ: "Blaine's",
  ブレイン: "Blaine's",
  サカキ: "Giovanni's",
  ジョバンニ: "Giovanni's",
  ハヤト: "Falkner's",
  フォークナー: "Falkner's",
  ツクシ: "Bugsy's",
  アカネ: "Whitney's",
  ホイットニー: "Whitney's",
  マツバ: "Morty's",
  モーティ: "Morty's",
  シジマ: "Chuck's",
  チャック: "Chuck's",
  ミカン: "Jasmine's",
  ジャスミン: "Jasmine's",
  ヤナギ: "Pryce's",
  プライス: "Pryce's",
  イブキ: "Clair's",
  クレア: "Clair's",
  イツキ: "Will's",
  ウィル: "Will's",
  シバ: "Bruno's",
  ブルーノ: "Bruno's",
  カリン: "Karen's",
  カレン: "Karen's",
  ワタル: "Lance's",
  ランス: "Lance's",
  アンズ: "Janine's",
  ジャニーン: "Janine's",
  "イマクニ?": "Imakuni?'s",
  イマクニ: "Imakuni?'s",
  ホロン: "Holon's",
  ホップ: "Hop's",
  シロナ: "Cynthia's",
  リーリエ: "Lillie's",
  ヒビキ: "Ethan's",
  ナンジャモ: "Iono's",
  ペパー: "Arven's",
  アオキ: "Larry's",
  マリィ: "Marnie's",
  ダイゴ: "Steven's",
  トウホク: "Tohoku's",
  ヒロシマ: "Hiroshima's",
  フクオカ: "Fukuoka's",
})
  .map(([ja, en]) => [kana(ja), en])
  .sort((a, b) => b[0].length - a[0].length);

/**
 * The kinds a card prints before its Pokémon. かがやく is the Sword & Shield Radiant; 輝く and
 * ひかる are the neo Shining; わるい, ダーク and TCGdex's 暗い are the Team Rocket Dark.
 */
const KINDS = Object.entries({
  メガ: "Mega",
  アローラ: "Alolan",
  ガラル: "Galarian",
  ヒスイ: "Hisuian",
  パルデア: "Paldean",
  かがやく: "Radiant",
  ひかる: "Shining",
  輝く: "Shining",
  わるい: "Dark",
  ダーク: "Dark",
  暗い: "Dark",
  ライト: "Light",
  軽い: "Light",
  ブラック: "Black",
  ホワイト: "White",
  オリジン: "Origin Forme",
  いちげき: "Single Strike",
  れんげき: "Rapid Strike",
  はくば: "Ice Rider",
  こくば: "Shadow Rider",
  ウルトラ: "Ultra",
  名探偵: "Detective",
  ヒート: "Heat",
  ウォッシュ: "Wash",
  フロスト: "Frost",
  スピン: "Fan",
  カット: "Mow",
  "Dark ": "Dark",
  "Light ": "Light",
  "Shining ": "Shining",
})
  .map(([ja, en]) => [kana(ja), en])
  .sort((a, b) => b[0].length - a[0].length);

/**
 * The forms a card prints after its species, and where the English name puts them: オーガポン
 * みどりのめん is Teal Mask Ogerpon, ポワルン たいようのすがた is Castform Sunny Form, as
 * Cardmarket and TCGplayer write them.
 */
const FORMS = Object.entries({
  みどりのめん: ["before", "Teal Mask"],
  かまどのめん: ["before", "Hearthflame Mask"],
  いどのめん: ["before", "Wellspring Mask"],
  いしずえのめん: ["before", "Cornerstone Mask"],
  あかつきのつばさ: ["before", "Dawn Wings"],
  たそがれのたてがみ: ["before", "Dusk Mane"],
  アカツキ: ["before", "Bloodmoon"],
  たいようのすがた: ["after", "Sunny Form"],
  あまみずのすがた: ["after", "Rainy Form"],
  ゆきぐものすがた: ["after", "Snowy Form"],
}).map(([ja, form]) => [kana(ja), form]);

/**
 * The mechanics a card prints after its Pokémon, as the English card writes them, each matched
 * where it starts. A Latin one only where it stands apart from a word before it: "Politoed Ex"
 * ends in ex, "Clefable" in nothing. TCGdex's e-Card era writes ex as "Ex"; the card says ex.
 */
const SUFFIXES = [
  [/\(\s*デルタ種\s*\)$/, () => "δ"],
  [/(?<![A-Za-z0-9.])([XY]) ?(ex|EX)$/, (m) => `${m[1]} ${m[2]}`],
  [
    /(?<![A-Za-z0-9.\-])(V-UNION|VSTAR|VMAX|LV\.X|BREAK|LEGEND|GX|EX|ex|Ex|V)$/,
    (m) => (m[1] === "Ex" ? "ex" : m[1]),
  ],
  [/◇$/, () => "◇"],
  [/☆$/, () => "Star"],
  [/(?<![A-Za-z])Star$/, () => "Star", "star"],
  [/スター$/, () => "Star", "star"],
  [/δ$/, () => "δ"],
];

/**
 * The name split into what comes before the mechanics and the mechanics in English, in the order
 * printed: カリザードスター(デルタ種) is body カリザード with "Star δ". A spelled-out Star only
 * on a card TCGdex rates a star (`star`): its machine translations end Scyther and Cloyster in
 * スター too (スキスター, クロイスター, PCG1), and Flareon is ブースター (2026-09-14).
 */
function splitSuffix(name, { star = false } = {}) {
  let body = kana(name).trim();
  const found = [];
  let again = true;
  while (again && body) {
    again = false;
    for (const [re, en, only] of SUFFIXES) {
      if (only === "star" && !star) continue;
      const m = re.exec(body);
      if (!m) continue;
      const rest = body.slice(0, m.index).trim();
      // A whole name is never its own suffix: "v" is neo4's Unown V.
      if (!rest) continue;
      found.unshift(en(m));
      body = rest;
      again = true;
      break;
    }
  }
  return { body, suffix: found.join(" ") };
}

/**
 * The mechanics a card prints after its species, in English: "ex", "GX", "VMAX", "LV.X", "δ",
 * "Star", "◇". Empty where the name prints none, and where its Latin tail is a word of its own.
 */
export function printedSuffix(localName) {
  return splitSuffix(localName).suffix;
}

/**
 * The owner and kinds that open a name, in English, and what follows them. An owner the lists do
 * not know is left in the rest: a card of an unknown trainer is named by its species alone.
 */
function splitPrefix(text, { kinds = true } = {}) {
  let rest = kana(text).trim();
  const words = [];
  const latinOwner = /^([A-Z][A-Za-z.]*)(?:ノ|'s\s*|’s\s*)/.exec(rest);
  const owner = latinOwner ? null : OWNERS.find(([ja]) => rest.startsWith(`${ja}ノ`));
  if (latinOwner) {
    words.push(`${latinOwner[1]}'s`);
    rest = rest.slice(latinOwner[0].length).trim();
  } else if (owner) {
    words.push(owner[1]);
    rest = rest.slice(owner[0].length + 1).trim();
  }
  let again = kinds;
  while (again) {
    again = false;
    for (const [ja, en] of KINDS) {
      if (!rest.startsWith(ja)) continue;
      words.push(en);
      rest = rest.slice(ja.length).trim();
      again = true;
      break;
    }
  }
  return { words, rest };
}

/**
 * One Pokémon of a card in English: owner and kinds as printed, then the species. `localSpecies`
 * is the species' name in the card's script, to find where the prefix ends; where the name does
 * not hold it (a machine translation, or English) the prefix is read from the start.
 */
function onePokemon(part, english, localSpecies) {
  const text = kana(part);
  const at = localSpecies ? text.indexOf(kana(localSpecies)) : -1;
  const { words, rest } = splitPrefix(at >= 0 ? text.slice(0, at) : text);
  const after = (at >= 0 ? text.slice(at + kana(localSpecies).length) : rest).trim();
  const form = FORMS.find(([ja]) => after === ja)?.[1];
  /* neo's Unown prints its letter as its name, and TCGdex's machine translation keeps it last:
     "v" is Unown V, 未定のt is Unown T, ZなしZ is Unown Z (neo2 to neo4). */
  const letter = english === "Unown" ? /(?:^|[^A-Za-z])([A-Za-z!?])$/.exec(after) : null;
  return [
    ...words,
    ...(form?.[0] === "before" ? [form[1]] : []),
    english,
    ...(form?.[0] === "after" ? [form[1]] : []),
    ...(letter ? [letter[1].toUpperCase()] : []),
  ].join(" ");
}

/** The halves of a tag team, split at the ampersand. */
const halves = (body) =>
  body
    .split("&")
    .map((p) => p.trim())
    .filter(Boolean);

/**
 * A Pokémon's English name from its own record: species by Dex number with the owner and kinds the
 * name prints, tag teams joined with " & " and named in full (ルカリオ&メルメタルGX is Lucario &
 * Melmetal GX), the printed mechanics kept. Null for a trainer or an energy, or a record with no
 * Dex number. `localNames` is species-names.generated.json, to find each species in the name.
 *
 * @param {any} record
 * @param {readonly string[]} species
 * @param {readonly ({ ja?: string } | null | undefined)[]} [localNames]
 */
export function englishFromRecord(record, species, localNames = []) {
  // PMCG1-091 ピッピ人形 (Clefairy Doll) is a trainer TCGdex files under Clefairy's 35.
  if (record?.category && record.category !== "Pokemon") return null;
  const dex = Array.isArray(record?.dexId) ? record.dexId : [];
  const names = dex.map((n) => species[n - 1]).filter(Boolean);
  if (!names.length || names.length !== dex.length) return null;
  const { body, suffix } = splitSuffix(record.name, {
    star: /shiny|star/i.test(record.rarity ?? ""),
  });
  const parts = halves(body);
  const joined = names
    .map((english, i) => {
      const part = parts.length === names.length ? parts[i] : names.length === 1 ? body : "";
      /* A name that is exactly one species' own name is that species, whatever the Dex number
         says: TCGdex files ウオチルドンV (Arctovish V, S6K-017) under Arctozolt's 881 and
         ダストダス (Garbodor, SV-P-132) under Bunnelby's 659 (2026-09-14). A machine translation
         only holding one (カリザード for Charizard holds リザード, Charmeleon) is no such name. */
      const named = speciesNamed(part, localNames);
      if (named && species[named.id - 1])
        return onePokemon(part, species[named.id - 1], named.local);
      return onePokemon(part, english, localNames[dex[i] - 1]?.ja ?? null);
    })
    .join(" & ");
  return suffix ? `${joined} ${suffix}` : joined;
}

/**
 * The species whose Japanese name the part is, after its owner, kinds and form: ロケット団の
 * ミュウツー is Mewtwo, カリザード is none. Null where the part is not exactly a species' name.
 */
function speciesNamed(part, localNames) {
  if (!localNames.length) return null;
  const { rest } = splitPrefix(part);
  return (
    speciesIn("ja", localNames).find((s) => {
      if (!rest.startsWith(s.key)) return false;
      const after = rest.slice(s.key.length).trim();
      return !after || FORMS.some(([ja]) => after === ja);
    }) ?? null
  );
}

/** Which column of species-names.generated.json a catalogue reads. */
const COLUMN = { ja: "ja" };

const byLength = new Map();
/** Every species with a name in that script, longest first, so the longest match is the first hit. */
function speciesIn(lang, localNames) {
  const had = byLength.get(lang);
  if (had) return had;
  const column = COLUMN[lang];
  const built = localNames
    .map((row, i) => ({ id: i + 1, key: kana(row?.[column] ?? ""), local: row?.[column] ?? "" }))
    .filter((s) => s.key)
    .sort((a, b) => b.key.length - a.key.length);
  byLength.set(lang, built);
  return built;
}

/**
 * A Pokémon's English name from its printed name alone: the species named in that script inside
 * it, read after the owner and kinds (ブルーノのカイリキー holds ブルー, Snubbull, in its owner),
 * tag teams split at "&", the printed mechanics kept. Null where no species is found, and for
 * anything but a Pokémon (`category` as TCGdex writes it): a trainer or an energy whose name holds
 * a species' name is not that species.
 */
export function englishFromLocalName(lang, localName, localNames, species, category) {
  if (!COLUMN[lang] || typeof localName !== "string" || category !== "Pokemon") return null;
  const { body, suffix } = splitSuffix(localName);
  const parts = halves(body);
  if (!parts.length) return null;
  const table = speciesIn(lang, localNames);
  const names = parts.map((part) => {
    // Past the owner only: メガヤンマ is Yanmega, not a Mega Yanma.
    const { rest } = splitPrefix(part, { kinds: false });
    const hit = table.find((s) => rest.includes(s.key));
    return hit ? onePokemon(part, species[hit.id - 1], hit.local) : null;
  });
  if (names.some((n) => !n)) return null;
  return suffix ? `${names.join(" & ")} ${suffix}` : names.join(" & ");
}

/** A name's words, folded to letters and digits, the marks ◇ and δ kept as words of their own. */
const wordsOf = (name) =>
  String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9♀♂◇δ?!]/g, ""))
    .filter(Boolean);

/**
 * Whether a name already in the map stands against the one the rules give now. It stands where it
 * holds every word of the rules' name and adds only words of its own that are no repeat and no
 * stray letter: Cardmarket's "Victini ◇" and "Teal Mask Ogerpon ex" stand, the old rules' "Koffing
 * Koffing", "Nidoran♀ nidoranf", "Unown d" and "Machamp" for ブルーノのマチャンプ (Bruno's
 * Machamp) do not, and
 * neither does Cardmarket's "Melmetal GX" for ルカリオ&メルメタルGX or "Slurpuff" for ペロッパフ
 * (Swirlix, S11-047), which name another card. A trainer or an energy the old rules named as a
 * species (ポケモンファンクラブ as Krabby, E2-078) loses that name: `species` is
 * pokedex.generated.json, `pokemon` whether the card is one (2026-09-14).
 *
 * @param {string | null | undefined} stored
 * @param {string | null | undefined} derived
 * @param {{ pokemon?: boolean, species?: readonly string[] }} [options]
 */
export function keepsStoredName(stored, derived, { pokemon = true, species = [] } = {}) {
  if (!stored) return false;
  if (!pokemon) {
    const bare = wordsOf(stored).join(" ");
    return !species.some((name) => wordsOf(name).join(" ") === bare);
  }
  if (!derived) return true;
  const had = wordsOf(stored);
  const now = wordsOf(derived);
  if (!now.every((w) => had.includes(w))) return false;
  const extra = [...had];
  for (const w of now) extra.splice(extra.indexOf(w), 1);
  // Only case apart ("Electrode Ex", "Unown d"): the rules write it as the card does.
  if (!extra.length) return stored === derived;
  return extra.every(
    (w) =>
      !now.some((n) => {
        const bare = n.replace(/[♀♂]/g, "");
        return w.includes(bare) || bare.includes(w);
      }) &&
      (w.length > 1 || "◇δ".includes(w)),
  );
}

/**
 * The sets whose printed names TCGdex filled from English through a machine translation rather
 * than off the cards: E1 to E5, neo1 to neo4, VS1, web1 and PCG1 to PCG9. Measured 2026-09-14:
 * 1,290 of their 1,481 printed names were Latin text ("Clefable") or held no Japanese name of the
 * card's own species (おしっこ for Weezing, E1-069; 猟犬 for Houndour). PMCG kept its real names
 * (one miss in 188 cards), so it is not here.
 */
const MACHINE_NAMED = /^(?:E[1-5]|neo[1-4]|VS1|web1|PCG[1-9])$/;

/**
 * The printed name a card of those sets can show beside its English one: none where it is Latin
 * only, or where, for a Pokémon, it does not hold the Japanese name of a species its English name
 * names. Elsewhere, and where the English name names no species to check by, the name as TCGdex
 * has it. `species` is pokedex.generated.json and `localNames` species-names.generated.json.
 */
export function printedNameOf(setId, localName, englishName, category, species, localNames) {
  if (!localName || !MACHINE_NAMED.test(setId)) return localName ?? null;
  if (!/[぀-ヿ一-鿿]/.test(localName)) return null;
  if (category !== "Pokemon") return localName;
  const english = wordsOf(englishName).join("");
  const own = species
    .map((name, i) => ({ key: wordsOf(name).join("").replace(/[♀♂]/g, ""), i }))
    .filter((s) => s.key.length >= 3 && english.includes(s.key))
    .map((s) => kana(localNames[s.i]?.ja ?? ""))
    .filter(Boolean);
  if (!own.length) return localName;
  const printed = kana(localName);
  return own.some((ja) => printed.includes(ja)) ? localName : null;
}
