import { describe, expect, it } from "vitest";

import { extractCodes, extractEmails, parseCsv } from "@/lib/spreadsheet";

describe("parseCsv", () => {
  it("parses quoted fields, escaped quotes, and CRLF rows", () => {
    const rows = parseCsv('name,note\r\n"Ada, L","said ""hi"""\r\n');
    expect(rows).toEqual([
      ["name", "note"],
      ["Ada, L", 'said "hi"'],
    ]);
  });

  it("drops blank rows", () => {
    expect(parseCsv("a\n\n\nb\n")).toEqual([["a"], ["b"]]);
  });
});

describe("extractEmails", () => {
  it("finds emails in any column and lowercases them", () => {
    const rows = [
      ["Name", "Email"],
      ["Ada", "Ada@Example.com"],
      ["Grace", "Grace Hopper <grace@example.com>"],
    ];
    expect(extractEmails(rows)).toEqual([
      "ada@example.com",
      "grace@example.com",
    ]);
  });

  it("de-duplicates repeated addresses", () => {
    const rows = [["ada@example.com"], ["ADA@example.com"]];
    expect(extractEmails(rows)).toEqual(["ada@example.com"]);
  });
});

describe("extractCodes", () => {
  it("prefers a column headed like a code column", () => {
    const rows = [
      ["email", "Credit Code"],
      ["ada@example.com", "AAA-111"],
      ["grace@example.com", "BBB-222"],
    ];
    expect(extractCodes(rows)).toEqual(["AAA-111", "BBB-222"]);
  });

  it("keeps every row of a headerless single-column file", () => {
    expect(extractCodes([["AAA-111"], ["BBB-222"]])).toEqual([
      "AAA-111",
      "BBB-222",
    ]);
  });
});
