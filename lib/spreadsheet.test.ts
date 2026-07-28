import { describe, expect, it } from "vitest";

import { extractCodes, extractEmails, parseCsv } from "./spreadsheet";

describe("parseCsv", () => {
  it("parses quoted fields, escaped quotes and CRLF line endings", () => {
    const text = 'name,email\r\n"Dabit, Nader","nader@example.com"\r\n"He said ""hi""",x@y.co';
    expect(parseCsv(text)).toEqual([
      ["name", "email"],
      ["Dabit, Nader", "nader@example.com"],
      ['He said "hi"', "x@y.co"],
    ]);
  });

  it("drops rows that are entirely blank", () => {
    expect(parseCsv("a@b.co\n\n   \nc@d.co\n")).toEqual([["a@b.co"], ["c@d.co"]]);
  });

  it("strips the UTF-8 BOM Excel writes", () => {
    expect(parseCsv("\uFEFFemail\na@b.co")).toEqual([["email"], ["a@b.co"]]);
  });
});

describe("extractEmails", () => {
  it("finds emails in any column and lowercases them", () => {
    const rows = [
      ["Name", "Company", "Email"],
      ["Nader", "Cognition", "Nader@Example.com"],
      ["Ada", "", "Ada Lovelace <ada@example.com>"],
    ];
    expect(extractEmails(rows)).toEqual(["nader@example.com", "ada@example.com"]);
  });

  it("dedupes repeated addresses", () => {
    const rows = [["a@b.co"], ["A@B.co"], ["c@d.co"]];
    expect(extractEmails(rows)).toEqual(["a@b.co", "c@d.co"]);
  });
});

describe("extractCodes", () => {
  it("uses the column whose header is named like a code", () => {
    const rows = [
      ["email", "Credit Code"],
      ["a@b.co", "CODE-1"],
      ["c@d.co", "CODE-2"],
    ];
    expect(extractCodes(rows)).toEqual(["CODE-1", "CODE-2"]);
  });

  it("handles header names other than a bare \"code\"", () => {
    const rows = [
      ["email", "Code (USD)"],
      ["a@b.co", "CODE-1"],
    ];
    expect(extractCodes(rows)).toEqual(["CODE-1"]);
  });

  it("keeps every row of a headerless single-column file", () => {
    const rows = [["CODE-1"], ["CODE-2"], ["CODE-3"]];
    expect(extractCodes(rows)).toEqual(["CODE-1", "CODE-2", "CODE-3"]);
  });

  it("trims, dedupes and skips empty cells", () => {
    const rows = [["code"], [" CODE-1 "], ["CODE-1"], [""], ["CODE-2"]];
    expect(extractCodes(rows)).toEqual(["CODE-1", "CODE-2"]);
  });

  it("returns nothing for an empty file", () => {
    expect(extractCodes([])).toEqual([]);
  });
});
