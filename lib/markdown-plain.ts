// One-line plain-text form of admin-authored Markdown, for summaries that
// cannot hold markup (e.g. inside another link). Keeps link text and bare
// URLs, drops the syntax.
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|`)(.+?)\1/g, "$2")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
