import type { Nodes } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const parser = unified().use(remarkParse).use(remarkGfm);

// Containers whose children are blocks; anything else is flattened as one run
// of text (a paragraph, heading, table cell, code block…).
const BLOCK_CONTAINERS = new Set<Nodes["type"]>([
  "root",
  "blockquote",
  "list",
  "listItem",
  "table",
  "tableRow",
  "footnoteDefinition",
]);

function* runs(node: Nodes): Generator<string> {
  if (BLOCK_CONTAINERS.has(node.type) && "children" in node) {
    for (const child of node.children) yield* runs(child);
  } else {
    yield toString(node, { includeImageAlt: false, includeHtml: false });
  }
}

// One-line plain-text form of admin-authored Markdown, for summaries that
// cannot hold markup (e.g. inside another link). Parsed with the same
// pipeline `MarkdownText` renders with, so link labels, bare URLs and
// escapes come out exactly as the claim page shows them; images are dropped.
export function markdownToPlainText(markdown: string): string {
  return [...runs(parser.parse(markdown))]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
