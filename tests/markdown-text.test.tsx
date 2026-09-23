import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { MarkdownText } from "../components/MarkdownText";
import { markdownToPlainText } from "../lib/markdown-plain";

test("event descriptions turn pasted URLs and Markdown links into new-tab links", () => {
  const html = renderToStaticMarkup(
    <MarkdownText value={"Welcome! Agenda: https://example.com/agenda\nSlides at [our site](https://example.com/slides)."} />
  );
  expect(html.match(/<a href="https:\/\/example.com\/(agenda|slides)" target="_blank" rel="noopener noreferrer"/g)).toHaveLength(2);
  expect(html).toContain(">https://example.com/agenda</a>");
  expect(html).toContain(">our site</a>");
  expect(html).toContain("\nSlides at");
});

test("event descriptions drop raw HTML and unsafe link schemes", () => {
  const html = renderToStaticMarkup(
    <MarkdownText value={'<img src="https://example.com/t" onerror="alert(1)"> [x](javascript:alert(1))'} />
  );
  expect(html).not.toMatch(/href=|<img|onerror=/i);
});

test("markdownToPlainText keeps link text and bare URLs for one-line summaries", () => {
  expect(markdownToPlainText("See [the agenda](https://example.com/a) or https://example.com/b\n\n- **Bring** a laptop\n> Doors at 6"))
    .toBe("See the agenda or https://example.com/b Bring a laptop Doors at 6");
  expect(markdownToPlainText("Walk-up")).toBe("Walk-up");
});

test("markdownToPlainText matches what MarkdownText renders for tricky syntax", () => {
  expect(markdownToPlainText("*Welcome* — [map](https://example.com/A_(B))")).toBe("Welcome — map");
  expect(markdownToPlainText("# Day 1\n\n1) Doors\n2) Talks\n\n\\*not emphasis\\*")).toBe("Day 1 Doors Talks *not emphasis*");
  expect(markdownToPlainText("```\ncode\n```\n\n![alt](https://example.com/i.png) <b>raw</b>")).toBe("code raw");
});
