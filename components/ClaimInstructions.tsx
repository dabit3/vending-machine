import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CLAIM_INSTRUCTION_PRESETS, claimInstructionsMode } from "@/lib/claim-instructions";
import { cn } from "@/lib/utils";

export function ClaimInstructions({
  value,
  id,
  className,
}: {
  value: string;
  id?: string;
  className?: string;
}) {
  const mode = claimInstructionsMode(value);
  const text = mode === "pro" || mode === "max"
    ? CLAIM_INSTRUCTION_PRESETS[mode].text
    : value;
  return (
    <div id={id} className={cn("flex flex-col gap-4 text-sm leading-relaxed wrap-anywhere [&_p]:whitespace-pre-wrap", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        allowedElements={["p", "br", "strong", "em", "del", "a", "ul", "ol", "li", "blockquote", "code", "pre"]}
        unwrapDisallowed
        components={{
          a: ({ href, children }) => href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-link underline underline-offset-4">
              {children}
            </a>
          ) : <>{children}</>,
          ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
          ol: ({ children, start }) => <ol start={start} className="list-decimal pl-5">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="border-l-2 pl-4 text-muted-foreground">{children}</blockquote>,
          pre: ({ children }) => <pre className="overflow-x-auto rounded-md bg-muted p-3">{children}</pre>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
