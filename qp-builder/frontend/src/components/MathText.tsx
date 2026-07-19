import katex from 'katex'

type Segment =
  | { type: 'text';    content: string }
  | { type: 'inline';  content: string }
  | { type: 'display'; content: string }

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = []
  // Match $$...$$ before $...$ to avoid partial matches
  const re = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    if (match.index > last)
      segments.push({ type: 'text', content: text.slice(last, match.index) })

    const raw = match[0]
    if (raw.startsWith('$$'))
      segments.push({ type: 'display', content: raw.slice(2, -2).trim() })
    else
      segments.push({ type: 'inline', content: raw.slice(1, -1).trim() })

    last = match.index + raw.length
  }

  if (last < text.length)
    segments.push({ type: 'text', content: text.slice(last) })

  return segments
}

function renderLatex(latex: string, display: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode:  display,
      throwOnError: false,
      trust:        false,
      strict:       false,
    })
  } catch {
    return `<span style="color:red;font-family:monospace">${latex}</span>`
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/\n/g, '<br/>')
}

// Use this in plain HTML contexts (e.g. the print/export function)
export function mathToHtml(text: string): string {
  return parseSegments(text)
    .map(seg =>
      seg.type === 'text'
        ? escapeHtml(seg.content)
        : renderLatex(seg.content, seg.type === 'display')
    )
    .join('')
}

interface Props {
  text:       string
  className?: string
}

export function MathText({ text, className }: Props) {
  const segments = parseSegments(text)

  // Fast path — no math delimiters, avoid dangerouslySetInnerHTML entirely
  if (segments.length === 1 && segments[0].type === 'text')
    return <span className={className}>{text}</span>

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: mathToHtml(text) }}
    />
  )
}
