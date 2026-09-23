import { normalizeXHandle } from "@/lib/attendee-identity";

export type ImportKind = "emails" | "handles" | "codes";

// Minimal RFC 4180-style CSV parser (quoted fields, escaped quotes, CRLF).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const EMAIL_RE = /[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']+/;

// Scan every cell for an email-shaped value, so any column layout works
// (headers, extra columns, or "Name <email@x.com>" cells).
export function extractEmails(rows: string[][]): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const row of rows) {
    for (const cell of row) {
      const match = cell.match(EMAIL_RE);
      if (!match) continue;
      const email = match[0].toLowerCase();
      if (!seen.has(email)) {
        seen.add(email);
        emails.push(email);
      }
    }
  }
  return emails;
}

const HANDLE_HEADER_RE =
  /^(?:x|twitter|(?:(?:x|twitter)[\s_-]*)?(?:handles?|usernames?))$/i;
const HANDLE_TOKEN_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/@?[a-z0-9_]{1,15}(?!\w)|(?<![\w.])@[a-z0-9_]{1,15}(?!\w)/i;

// X handles: use a column headed exactly "handle"/"username"/"x"/"twitter"
// (optionally "x handle", "twitter username", ...) when there is one; its
// cells may omit the "@". Otherwise scan every cell for an "@handle" or
// x.com/twitter.com profile URL.
export function extractXHandles(rows: string[][]): string[] {
  const seen = new Set<string>();
  const handles: string[] = [];
  const push = (raw: string) => {
    const handle = normalizeXHandle(raw);
    if (handle && !seen.has(handle)) {
      seen.add(handle);
      handles.push(handle);
    }
  };
  const headerIndex =
    rows[0]?.findIndex((cell) => HANDLE_HEADER_RE.test(cell.trim())) ?? -1;
  if (headerIndex !== -1) {
    for (const row of rows.slice(1)) push(row[headerIndex] ?? "");
    return handles;
  }
  for (const row of rows) {
    for (const cell of row) {
      const match = cell.match(HANDLE_TOKEN_RE);
      if (match) push(match[0]);
    }
  }
  return handles;
}

// Prefer a column whose header is named like "code"; otherwise use the first
// column. Single-column files without a header keep every row.
export function extractCodes(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  const headerIndex = rows[0].findIndex((cell) =>
    /^[\w\s]*codes?$/i.test(cell.trim())
  );
  const dataRows = headerIndex === -1 ? rows : rows.slice(1);
  const colIndex = headerIndex === -1 ? 0 : headerIndex;
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const row of dataRows) {
    const code = (row[colIndex] ?? "").trim();
    if (code && !seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }
  return codes;
}

function isXlsx(file: File): boolean {
  return (
    /\.xlsx$/i.test(file.name) ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

type SheetCell = string | number | boolean | Date | null;

function toStringRows(data: SheetCell[][]): string[][] {
  return data
    .map((row) =>
      row.map((cell) => {
        if (cell == null) return "";
        if (cell instanceof Date) return cell.toISOString();
        if (typeof cell === "number" && Number.isInteger(cell))
          return cell.toFixed(0);
        return String(cell).trim();
      })
    )
    .filter((row) => row.some((cell) => cell !== ""));
}

// Parse an uploaded CSV/TXT/XLSX file into emails, X handles or codes. For
// XLSX, emails and handles are scanned across every sheet; codes come from a
// sheet named like "codes" if one exists, otherwise the first sheet.
export async function fileToItems(
  file: File,
  kind: ImportKind
): Promise<string[]> {
  const extractAttendees = kind === "handles" ? extractXHandles : extractEmails;
  if (!isXlsx(file)) {
    const rows = parseCsv(await file.text());
    return kind === "codes" ? extractCodes(rows) : extractAttendees(rows);
  }
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  if (kind !== "codes") {
    // Each worksheet has its own header row, so extract per sheet.
    return Array.from(
      new Set(
        sheets.flatMap((sheet) =>
          extractAttendees(toStringRows(sheet.data as SheetCell[][]))
        )
      )
    );
  }
  const codeSheet =
    sheets.find((sheet) => /codes?/i.test(sheet.sheet)) ?? sheets[0];
  if (!codeSheet) return [];
  return extractCodes(toStringRows(codeSheet.data as SheetCell[][]));
}
