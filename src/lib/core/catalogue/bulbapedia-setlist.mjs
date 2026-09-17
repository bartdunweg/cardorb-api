/**
 * Bulbapedia's set lists, read out of a set page's wikitext.
 *
 * Bart, 2026-09-14: naming is the foundation. Every set name, set size, card number and card name
 * the copy holds has to be true, and every place it differs from Bulbapedia has to be visible. This
 * reads the one part of a Bulbapedia set page that says those things, the card lists, so
 * scripts/bulbapedia-compare.mjs can put them beside the copy. Nothing read here is stored or shown
 * beyond that script's report of differences: the wiki's text is CC BY-NC-SA 2.5.
 *
 * A set page holds several lists, each a {{Setlist/header|title=…}} (or nmheader) followed by one
 * {{Setlist/entry|…}} (or nmentry) per card and a footer:
 *
 *   - the set itself ("Base Set", "EX Holon Phantoms");
 *   - its Japanese counterparts, where Bulbapedia files them on the English page ("Expansion Pack",
 *     "Blue Shock" and "Red Flash" on BREAKthrough), numbered "None" where the cards print none;
 *   - subsets with their own numbers ("Galarian Gallery", "Shiny Vault");
 *   - "Additional cards" and "Corrected error cards", marked promo=yes: reprints and stamps of
 *     cards already in a list, never a card of their own, so they are kept apart.
 *
 * An entry's name cell is written four ways, and the card's name is the same in each:
 *
 *   {{TCG ID|Neo Destiny|Dark Ampharos|1}}                    the second field
 *   [[Regigigas VSTAR (Crown Zenith 114)|Regigigas]]{{VSTAR}}  the link's page, without "(Set No)"
 *   {{Mega}}[[M Houndoom-EX (BREAKthrough 154)|Houndoom]]{{EX}} the same, prefix and suffix included
 *   {{TCG|Grass Energy}}, {{OBP|Darkness Energy|Basic}}         the first field
 *
 * Pure, and an .mjs so the script and its test read the same code (as english-card-name.mjs is).
 */

/** The wikitext without comments, which hold half-written templates often enough to matter. */
const stripComments = (s) => String(s ?? "").replace(/<!--[\s\S]*?-->/g, "");

/**
 * Every template at the top level of `text`, in order, each as its raw inner text (between the
 * outer braces). Links and nested templates stay inside their template.
 */
export function topLevelTemplates(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("{{", i);
    if (start < 0) break;
    let depth = 0;
    let j = start;
    let end = -1;
    while (j < text.length) {
      if (text.startsWith("{{", j)) {
        depth++;
        j += 2;
      } else if (text.startsWith("}}", j)) {
        depth--;
        j += 2;
        if (depth === 0) {
          end = j;
          break;
        }
      } else j++;
    }
    if (end < 0) break;
    out.push(text.slice(start + 2, end - 2));
    i = end;
  }
  return out;
}

/** A template's fields, split on the pipes that are not inside a nested template or a link. */
export function splitFields(inner) {
  const out = [];
  let cur = "";
  let braces = 0;
  let brackets = 0;
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === "{{" || two === "}}" || two === "[[" || two === "]]") {
      if (two === "{{") braces++;
      else if (two === "}}") braces--;
      else if (two === "[[") brackets++;
      else brackets--;
      cur += two;
      i++;
      continue;
    }
    if (inner[i] === "|" && braces === 0 && brackets === 0) {
      out.push(cur);
      cur = "";
    } else cur += inner[i];
  }
  out.push(cur);
  return out;
}

/** A template's name and its positional and named fields. */
function readTemplate(inner) {
  const [head = "", ...rest] = splitFields(inner);
  const positional = [];
  const named = {};
  for (const field of rest) {
    const m = /^\s*([A-Za-z0-9_ ]+?)\s*=([\s\S]*)$/.exec(field);
    if (m && !/[{[]/.test(m[1])) {
      const key = m[1];
      if (/^\d+$/.test(key)) positional[Number(key) - 1] = m[2];
      else named[key] = m[2];
    } else positional.push(field);
  }
  // Positional fields after a numbered one ("|6=note") land where the number says, and the
  // unnumbered ones before it keep their order.
  const name = head.trim().replace(/^./, (c) => c.toUpperCase());
  return { name, positional, named };
}

/** What a mechanic template after a name prints. */
const SUFFIXES = {
  ex: " ex",
  "Tera ex": " ex",
  EX: "-EX",
  GX: "-GX",
  TCGV: " V",
  V: " V",
  VMAX: " VMAX",
  VSTAR: " VSTAR",
  "V-UNION": " V-UNION",
  BREAK: " BREAK",
  "LV.X": " LV.X",
  LEGEND: " LEGEND",
  Star: " ☆",
  star: " ☆",
  "Gold Star": " ☆",
  d: " δ",
  delta: " δ",
  Delta: " δ",
  G: " G",
  GL: " GL",
  FB: " FB",
  C: " C",
  E4: " 4",
  "Prism Star": " ◇",
  Prism: " ◇",
};

/** Plain text of a cell with no link to go by: templates expanded where known, markup dropped. */
function plainText(cell) {
  let s = cell;
  s = s.replace(/\{\{Mega\}\}/g, "M ");
  s = s.replace(/\{\{([^{}|]+)\}\}/g, (all, name) => SUFFIXES[name.trim()] ?? "");
  // {{TCG|Grass Energy}}, {{OBP|Darkness Energy|Basic}}: the first field names the card.
  s = s.replace(/\{\{[^{}|]+\|([^{}|]*)(\|[^{}]*)?\}\}/g, (all, first) => first);
  s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1");
  return s;
}

/** The card's name out of one entry's name cell (see the header for the four ways). */
export function cardName(cell) {
  return cardEntry(cell).name;
}

/**
 * The card's name out of one entry's name cell, with what the list writes beside it:
 *
 *   note  the small print after the name: the card's form or subtitle where it has one (Gastrodon
 *         <small>East Sea</small>, Professor's Research <small>[Professor Magnolia]</small>), a
 *         promo's release where it has none ([Pokémon: The First Movie])
 *   from  the set a list of cards from many sets names in italics after each card (Blacksmith
 *         (''Flashfire'') on the Yellow A Alternate cards page)
 *
 * @returns {{ name: string, note?: string, from?: string }}
 */
export function cardEntry(cell) {
  // A promo's cell lists each version of the card on its own line ("[Staff]", "[Jumbo]"); the first
  // line is the card.
  const [first = ""] = String(cell ?? "")
    .split(/<br\s*\/?>/i)
    .filter((part) => part.trim());
  const small = /<small>([\s\S]*?)<\/small>/i.exec(first);
  const note = small ? tidy(plainText(small[1].replace(/<[^>]+>/g, "").replace(/'''?/g, ""))) : "";
  let s = first
    .replace(/<small>[\s\S]*?<\/small>/gi, "")
    .replace(/<[^>]+>/g, "")
    // A footnote mark after the name: Start Deck 100 Battle Collection marks the cards that come as a
    // holo with a dagger ("Exeggcute †", 218 of its 742 entries), which is no part of the name.
    .replace(/\s*[†‡]/g, "");
  const parent = /\s*\(''([^'()]+)''\)\s*$/.exec(s);
  if (parent) s = s.slice(0, parent.index);
  s = s.replace(/'''?/g, "");
  return {
    name: nameOfCell(s),
    ...(note ? { note } : {}),
    ...(parent ? { from: tidy(parent[1]) } : {}),
  };
}

/** The name in a cell cut to its first line, its small print and its parent set gone. */
function nameOfCell(s) {
  // The text shown may hold a bracketed part of its own ("[Ice]").
  const link = /\[\[([^\]|]+?)\s*\(([^()]*)\)\s*(\|(?:[^[\]]|\[[^\]]*\])*)?\]\]/.exec(s);
  if (link) {
    /* A cell that is one link and nothing more shows the card's whole name as the link's text, and
       that text is the name as printed where the page title cannot carry it: "Blaine's Quiz #1" on
       the page "Blaine's Quiz 1", "Ancient Technical Machine [Ice]" on "Ancient Technical Machine
       Ice". Only where both are the same name once # and brackets are set aside; a link drawn
       around part of a name ("Horror" {{e|Psychic}} "Energy") says less than its page. */
    const shown = link[3]?.slice(1).trim();
    const bare = (x) =>
      nameKey(x)
        .replace(/[#[\]]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (shown && s.trim() === link[0] && bare(shown) === bare(link[1])) return tidy(shown);
    return tidy(link[1]);
  }
  const id = /\{\{\s*TCG ID\s*\|([^{}]*)\}\}/i.exec(s);
  if (id) {
    // The second field is the whole name ("Yanmega ex"). A prefix or suffix template around it
    // ({{Mega}}, {{EX}}) counts where the name does not already carry it: a fifth field is the part
    // a suffix template follows ("{{TCG ID|Destined Rivals|Yanmega ex|3|Yanmega}}{{ex}}").
    const name = tidy(splitFields(id[1])[1] ?? "");
    const before = tidy(plainText(s.slice(0, id.index)));
    // What follows may also be the rest of a name drawn in pieces, an Energy icon and the same
    // card's id again ("Bubbly {{e|Water}} Energy"), which adds nothing to the second field.
    const after = plainText(
      s.slice(id.index + id[0].length).replace(/\{\{\s*(?:e|TCG ID)\s*\|[^{}]*\}\}/gi, ""),
    ).replace(/\s+$/, "");
    const prefix = before && !name.startsWith(before) ? `${before} ` : "";
    const suffix = after.trim() && !name.endsWith(after.trim()) ? after : "";
    return tidy(`${prefix}${name}${suffix}`);
  }
  // A plain template whose first field already carries the mechanic its suffix adds:
  // {{OBP|Tapu Lele-GX|SV-P Promo 133|Tapu Lele}}{{GX}} is Tapu Lele-GX, not Tapu Lele-GX-GX.
  const plain = /^\s*\{\{[^{}|]+\|([^{}|]*)(?:\|[^{}]*)?\}\}\s*(\{\{[^{}|]+\}\})\s*$/.exec(s);
  if (plain) {
    const name = tidy(plain[1]);
    const suffix = plainText(plain[2]).trim();
    if (suffix && name.endsWith(suffix)) return name;
  }
  return tidy(plainText(s));
}

const tidy = (s) => s.replace(/\s+/g, " ").trim();

/** "1/102" → number "1", printed total "102"; "None" and an empty cell → no number. */
export function readNumber(cell) {
  const s = tidy(plainText(String(cell ?? "")));
  if (!s || /^none$/i.test(s) || /^[\u2014–-]+$/.test(s))
    return { number: null, printedTotal: null };
  const slash = s.indexOf("/");
  if (slash < 0) return { number: s, printedTotal: null };
  return { number: s.slice(0, slash).trim(), printedTotal: s.slice(slash + 1).trim() || null };
}

/**
 * Every set list on a page, in page order.
 *
 * @returns {{ title: string, promo: boolean, entries: { number: string|null, printedTotal: string|null, name: string, note?: string, from?: string }[] }[]}
 */
export function parseSetlists(wikitext) {
  const lists = [];
  let current = null;
  /* A page that lays its lists side by side wraps them in {{Flexitem|…}} (30th Celebration, 2026-09),
     so the lists are one level down: a Flex template's own text is read as the page's. */
  const templates = (text) =>
    topLevelTemplates(text).flatMap((inner) =>
      /^\s*Flex/i.test(inner) ? templates(inner.slice(inner.indexOf("|") + 1)) : [inner],
    );
  for (const inner of templates(stripComments(wikitext))) {
    const t = readTemplate(inner);
    const kind = /^(?:Setlist|Halfdecklist)\/(nm)?(header|entry|footer)$/i.exec(t.name);
    if (!kind) continue;
    const part = kind[2].toLowerCase();
    if (part === "header") {
      current = {
        title: tidy(plainText(t.named.title ?? "")),
        promo: /^yes$/i.test((t.named.promo ?? "").trim()),
        entries: [],
      };
      lists.push(current);
    } else if (part === "footer") {
      current = null;
    } else if (current) {
      // nmentry: number, name, type, …; entry: number, symbol, name, type, …
      const nameAt = kind[1] ? 1 : 2;
      const { number, printedTotal } = readNumber(t.positional[0]);
      const { name, ...beside } = cardEntry(t.positional[nameAt]);
      /* The symbol column of an entry is the regulation mark from Sword & Shield on ("J"), and "-"
         where the card prints none (a Classic Collection reprint). */
      const symbol = kind[1] ? "" : tidy(plainText(t.positional[1] ?? ""));
      const mark = /^[A-Z]$/.test(symbol) ? { mark: symbol } : symbol === "-" ? { mark: null } : {};
      // A promo list holds rows for numbers not yet announced, with nothing in them.
      if (name) current.entries.push({ number, printedTotal, name, ...beside, ...mark });
    }
  }
  return lists;
}

/** The infobox's own fields that name the set: its English name and the Japanese one. */
export function parseInfobox(wikitext) {
  const box = topLevelTemplates(stripComments(wikitext))
    .map(readTemplate)
    .find((t) => /^TCGExpansionInfobox$/i.test(t.name));
  if (!box) return { setname: null, jasetname: null };
  const field = (k) => {
    const v = box.named[k];
    return v == null ? null : tidy(plainText(v.replace(/<br\s*\/?>/gi, " "))) || null;
  };
  return { setname: field("setname"), jasetname: field("jasetname") };
}

/**
 * A number as both sides can agree on it: case folded and leading zeros gone from the digits, so
 * "001", "1" and "TG01"/"tg1" meet. The exact spelling is compared on its own.
 */
export function numberKey(n) {
  const s = String(n ?? "")
    .trim()
    .toUpperCase();
  const m = /^([A-Z-]*?)0*(\d+)([A-Z]*)$/.exec(s);
  return m ? `${m[1]}${m[2]}${m[3]}` : s;
}

/**
 * A name as both sides can agree on it: Unicode folded, one apostrophe, one star, case, and hyphens
 * and spaces as one separator, so "Mewtwo ★" and "Mewtwo☆", "Pokémon-EX" and "Pokémon EX" meet. What
 * this folds is a spelling difference; what it leaves is a naming one.
 */
export function nameKey(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .replace(/…/g, "...")
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/♢/g, "◇")
    .replace(/\s+([♂♀])/g, "$1")
    .replace(/\s+star$/i, " ☆")
    .replace(/\sE4(?=\s|$)/g, " 4")
    .replace(/\[([^\]]*)\]/g, "$1")
    .replace(/\(([^()]*)\)/g, "$1")
    .replace(/★/g, "☆")
    .replace(/\s*☆\s*/g, " ☆ ")
    .replace(/\s*δ\s*/g, " δ ")
    .toLowerCase()
    .replace(/[-‐‑–\u2014\s]+/g, " ")
    .replace(/\s*&\s*/g, " & ")
    .replace(/\.\s*/g, ". ")
    .trim();
}

/**
 * How the mapping names one list of a page: its title, and " #2" after it for the second list with
 * that title (Forbidden Light's page titles its English list and its Japanese one alike).
 */
export function listRef(lists, list) {
  const same = lists.filter((l) => l.title === list.title);
  const n = same.indexOf(list) + 1;
  return n > 1 ? `${list.title} #${n}` : list.title;
}

/** The list a mapping's reference names, or undefined. */
export function findList(lists, ref) {
  const m = /^(.*) #(\d+)$/.exec(ref);
  const [title, n] = m ? [m[1], Number(m[2])] : [ref, 1];
  return lists.filter((l) => l.title === title)[n - 1];
}
