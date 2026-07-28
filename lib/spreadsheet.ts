// Minimal RFC 4180-style CSV parser (quoted fields, escaped quotes, CRLF).
// Excel writes a UTF-8 BOM, which would otherwise glue itself to the first cell.
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
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

// Header cells vary between exports: "Code", "Promo Code", "Code (USD)",
// "credit_code". Match any header that mentions a code.
const CODE_HEADER_RE = /codes?/i;

// Prefer a column whose header is named like "code"; otherwise use the first
// column. Single-column files without a header keep every row.
export function extractCodes(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  const headerIndex = rows[0].findIndex((cell) =>
    CODE_HEADER_RE.test(cell.trim())
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

// Parse an uploaded CSV/TXT/XLSX file into emails or codes. For XLSX, emails
// are scanned across every sheet; codes come from a sheet named like "codes"
// if one exists, otherwise the first sheet.
export async function fileToItems(
  file: File,
  kind: "emails" | "codes"
): Promise<string[]> {
  if (!isXlsx(file)) {
    const rows = parseCsv(await file.text());
    return kind === "emails" ? extractEmails(rows) : extractCodes(rows);
  }
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  if (kind === "emails") {
    return extractEmails(
      sheets.flatMap((sheet) => toStringRows(sheet.data as SheetCell[][]))
    );
  }
  const codeSheet =
    sheets.find((sheet) => /codes?/i.test(sheet.sheet)) ?? sheets[0];
  if (!codeSheet) return [];
  return extractCodes(toStringRows(codeSheet.data as SheetCell[][]));
}
