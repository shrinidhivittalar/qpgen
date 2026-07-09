import katex from 'katex';

// Splits text on $...$ (inline) and $$...$$ (block) delimiters,
// renders math segments with KaTeX, passes plain text through unchanged.
// dangerouslySetInnerHTML is safe here: KaTeX renders controlled SVG/HTML,
// not arbitrary user-provided markup.

interface Props {
  text: string;
  className?: string;
}

type Segment =
  | { kind: 'text';  content: string }
  | { kind: 'block'; math: string }
  | { kind: 'inline'; math: string };

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  // Process $$...$$ first (block), then $...$ (inline).
  const re = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ kind: 'text', content: text.slice(last, m.index) });
    }
    const raw = m[0];
    if (raw.startsWith('$$')) {
      segments.push({ kind: 'block',  math: raw.slice(2, -2) });
    } else {
      segments.push({ kind: 'inline', math: raw.slice(1, -1) });
    }
    last = m.index + raw.length;
  }

  if (last < text.length) {
    segments.push({ kind: 'text', content: text.slice(last) });
  }

  return segments;
}

function renderMath(math: string, displayMode: boolean): string {
  try {
    return katex.renderToString(math, { throwOnError: false, displayMode });
  } catch {
    return math;
  }
}

export function LatexText({ text, className }: Props) {
  const segments = parseSegments(text);

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          return <span key={i}>{seg.content}</span>;
        }
        if (seg.kind === 'block') {
          return (
            <span
              key={i}
              className="block my-1"
              dangerouslySetInnerHTML={{ __html: renderMath(seg.math, true) }}
            />
          );
        }
        return (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: renderMath(seg.math, false) }}
          />
        );
      })}
    </span>
  );
}
