import type { ComponentProps, ElementType } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Elements the AI summaries may use. The text comes from a model that reads untrusted page
// text, so everything else is dropped: raw HTML is never rendered (react-markdown shows it as
// escaped text), and links and images are not allowed (an image URL can leak data, a link can
// mislead). Disallowed elements keep their text (unwrapDisallowed).
//
// Short summaries (feed cards, change summaries): bullets, bold, italics.
// `rich` (the whole-document summary): README style with headings, quotes, rules and tables.
const SHORT = ["p", "ul", "ol", "li", "strong", "em", "br"];
const RICH = [
  ...SHORT,
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

// react-markdown passes every component a `node` prop; it must not reach the DOM element.
function styled<T extends ElementType>(Tag: T, className: string) {
  return function Styled(props: ComponentProps<T> & { node?: unknown }) {
    const { node, ...rest } = props;
    void node;
    const Component = Tag as ElementType;
    return <Component className={className} {...rest} />;
  };
}

const HEADING_TOP = "mt-4 mb-1 border-b pb-1 text-base font-semibold first:mt-0";
const HEADING_SUB = "mt-3 mb-1 text-sm font-semibold first:mt-0";

const components: Components = {
  p: styled("p", "my-1 first:mt-0 last:mb-0"),
  ul: styled("ul", "my-1 list-disc space-y-1 pl-5"),
  ol: styled("ol", "my-1 list-decimal space-y-1 pl-5"),
  strong: styled("strong", "font-semibold"),
  h1: styled("h3", HEADING_TOP),
  h2: styled("h3", HEADING_TOP),
  h3: styled("h4", HEADING_SUB),
  h4: styled("h4", HEADING_SUB),
  blockquote: styled("blockquote", "my-2 border-l-4 pl-3 opacity-80"),
  hr: styled("hr", "my-3"),
  th: styled("th", "border bg-muted/60 px-2 py-1 font-semibold"),
  td: styled("td", "border px-2 py-1 align-top"),
  // The wrapper lets a wide table scroll sideways instead of widening the page.
  table: ({ node, ...rest }) => {
    void node;
    return (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-left" {...rest} />
      </div>
    );
  },
};

export function MarkdownText({
  children,
  className = "",
  rich = false,
}: {
  children: string;
  className?: string;
  rich?: boolean;
}) {
  return (
    <div className={`text-sm leading-relaxed break-words ${className}`}>
      <ReactMarkdown
        allowedElements={rich ? RICH : SHORT}
        unwrapDisallowed
        remarkPlugins={rich ? [remarkGfm] : []}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
