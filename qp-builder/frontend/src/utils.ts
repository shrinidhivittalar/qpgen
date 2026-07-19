// Strips leading original number and collapses split MCQ options ("(A) \ntext" -> "(A) text")
export function cleanText(text: string): string {
  return text
    .replace(/^\d{1,2}\.\s*/, '')
    .replace(/\(([A-D])\)\s*\n\s*/g, '($1) ')
    .trim()
}

const STOP_WORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could','should',
  'may','might','shall','to','of','in','on','at','by','for','with',
  'from','as','or','and','but','not','it','its','this','that','these',
  'those','what','which','who','how','why','when','where',
])

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
  )
}

// Jaccard similarity between two question texts (0-1)
export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a)
  const setB = tokenize(b)
  if (!setA.size || !setB.size) return 0
  const intersection = [...setA].filter(w => setB.has(w)).length
  const union = new Set([...setA, ...setB]).size
  return intersection / union
}
