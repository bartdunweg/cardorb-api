import { describe, expect, it } from "vitest";
import { cardProperties, rowFromPage, type NotionPage } from "./notion";

const page = (props: NotionPage["properties"], over: Partial<NotionPage> = {}): NotionPage => ({
  id: "page-1",
  created_time: "2019-04-02T10:00:00.000Z",
  properties: props,
  ...over,
});

const title = (s: string) => ({ title: [{ plain_text: s }] });
const rich = (s: string) => ({ rich_text: [{ plain_text: s }] });

describe("rowFromPage", () => {
  it("reads the eight facts that are actually somebody's", () => {
    const row = rowFromPage(
      page({
        Name: title("Pikachu"),
        Number: rich("088"),
        Set: { select: { name: "Base" } },
        Rarity: { select: { name: "Rare Holo" } },
        Gen: { select: { name: "Base" } },
        Type: { multi_select: [{ name: "Electric" }] },
        Collection: { checkbox: true },
        Excluded: { checkbox: false },
      }),
    );
    expect(row).toEqual({
      id: "page-1",
      name: "Pikachu",
      number: "088",
      setName: "Base",
      rarity: "Rare Holo",
      gen: "Base",
      types: ["Electric"],
      owned: true,
      excluded: false,
      acquiredAt: "2019-04-02T10:00:00.000Z",
    });
  });

  it("counts a row with no Collection checkbox as held", () => {
    // The default that has to survive the move. It is why the Postgres column
    // is `not null default true` rather than defaulting to false like every
    // other boolean in the schema.
    const row = rowFromPage(page({ Name: title("P"), Set: { select: { name: "Base" } } }));
    expect(row?.owned).toBe(true);
  });

  it("counts an unchecked Collection as wanted rather than held", () => {
    const row = rowFromPage(
      page({
        Name: title("P"),
        Set: { select: { name: "Base" } },
        Collection: { checkbox: false },
      }),
    );
    expect(row?.owned).toBe(false);
  });

  it("splits a multi-select back into a list", () => {
    // fieldOf() joins a multi-select with ", " because everything above it
    // wants one string. The row wants the list, so the join has to come apart
    // again here rather than at the eight places that read it.
    const row = rowFromPage(
      page({
        Name: title("P"),
        Set: { select: { name: "Base" } },
        Type: { multi_select: [{ name: "Fire" }, { name: "Water" }] },
      }),
    );
    expect(row?.types).toEqual(["Fire", "Water"]);
  });

  it("finds a column whatever it is called, as long as it starts the same way", () => {
    // The loose match earns its keep here rather than in cards.ts: these column
    // names belong to whoever connected the database.
    const row = rowFromPage(
      page({
        Name: title("P"),
        Set: { select: { name: "Base" } },
        "Card rarity": { select: { name: "Uncommon" } },
      }),
    );
    expect(row?.rarity).toBe("Uncommon");
  });

  it("refuses a row that cannot be placed or drawn", () => {
    // No set means nothing to group it under, no name means nothing to show.
    expect(rowFromPage(page({ Name: title("P") }))).toBeNull();
    expect(rowFromPage(page({ Set: { select: { name: "Base" } } }))).toBeNull();
    expect(rowFromPage(page({}))).toBeNull();
  });

  it("hands over a null date rather than inventing one", () => {
    // An invented acquired_at is worse than a missing one: the value series is
    // built on this column, and "today" for a card pulled in 2019 is a wrong
    // answer that looks like a right one.
    const row = rowFromPage(
      page({ Name: title("P"), Set: { select: { name: "Base" } } }, { created_time: undefined }),
    );
    expect(row?.acquiredAt).toBeNull();
  });
});

describe("cardProperties", () => {
  const draft = {
    name: "Pikachu",
    number: "088",
    set: "Sun & Moon, Promos",
    rarity: "Rare, Holo",
    gen: "Base",
    types: ["Fire,Water"],
    collection: true,
    excluded: false,
  };

  it("takes commas out of the selects on the way to Notion", () => {
    // Notion splits a select option on a comma, so a name with one in it
    // arrives as two options. The validation upstream deliberately no longer
    // does this: it is this store's rule, applied at this store's door.
    const props = cardProperties(draft);
    expect(props.Set?.select?.name).toBe("Sun & Moon Promos");
    expect(props.Rarity?.select?.name).toBe("Rare Holo");
    expect(props.Type?.multi_select?.[0]?.name).toBe("Fire Water");
  });

  it("leaves the title alone, which is rich text and splits on nothing", () => {
    const props = cardProperties({ ...draft, name: "Mr. Mime, ex" });
    expect(props.Name?.title?.[0]).toEqual({ text: { content: "Mr. Mime, ex" } });
  });

  it("leaves an empty select out rather than sending null", () => {
    // Both clear the column, but a write that never mentions a column cannot
    // be failed by that column having been renamed or removed.
    const props = cardProperties({ ...draft, rarity: "", gen: "", types: [], number: "" });
    expect(props).not.toHaveProperty("Rarity");
    expect(props).not.toHaveProperty("Gen");
    expect(props).not.toHaveProperty("Type");
    expect(props).not.toHaveProperty("Number");
  });
});
