import type { Nodes } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const parser = unified().use(remarkParse).use(remarkGfm);

// Inline containers concatenate their children verbatim; block containers
// (root, lists, quotes, tables) separate theirs with a space.
const INLINE_CONTAINERS = new Set<Nodes["type"]>([
  "paragraph",
  "heading",
  "tableCell",
  "emphasis",
  "strong",
  "delete",
  "link",
  "linkReference",
]);

// Text as `MarkdownText` would show it: link labels and bare URLs kept,
// images and raw HTML dropped, every break (soft, hard, or between blocks)
// becoming a space.
function text(node: Nodes): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
    case "code":
      return node.value;
    case "break":
      return " ";
    case "image":
    case "imageReference":
    case "html":
    case "yaml":
    case "definition":
    case "footnoteReference":
    case "thematicBreak":
      return "";
    default:
      if (!("children" in node)) return "";
      return node.children
        .map(text)
        .join(INLINE_CONTAINERS.has(node.type) ? "" : " ");
  }
}

// One-line plain-text form of admin-authored Markdown, for summaries that
// cannot hold markup (e.g. inside another link). Parsed with the same
// pipeline `MarkdownText` renders with so the two never disagree.
export function markdownToPlainText(markdown: string): string {
  return text(parser.parse(markdown)).replace(/\s+/g, " ").trim();
}
