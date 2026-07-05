export const BLOOM_VERBS = {
  easy: [
    'define', 'identify', 'list', 'state', 'name', 'recall', 'what is',
    'which of the following is', 'choose the correct',
  ],
  moderate: [
    'apply', 'classify', 'explain', 'calculate', 'interpret', 'demonstrate',
    'illustrate', 'predict', 'summarize', 'use the following scenario to',
  ],
  hard: [
    'differentiate', 'justify', 'evaluate', 'analyze', 'synthesize',
    'design', 'critique', 'compare and contrast', 'derive', 'construct an argument',
  ],
} as const;

export const DIFFICULTY_INSTRUCTIONS: Record<'easy' | 'moderate' | 'hard', string> = {
  easy: `Write DIRECT RECALL questions. Use stems built around verbs like: ${[...BLOOM_VERBS.easy].join(', ')}. The question should be answerable from a single fact stated in or directly implied by the source material, with NO calculation and NO combining of multiple concepts.`,
  moderate: `Write APPLICATION-level questions. Use stems built around verbs like: ${[...BLOOM_VERBS.moderate].join(', ')}. Frame the question around a brief realistic scenario requiring exactly ONE step of reasoning or calculation to answer — applying a single concept to a new situation, not just restating a definition.`,
  hard: `Write ANALYSIS/EVALUATION-level questions. Use stems built around verbs like: ${[...BLOOM_VERBS.hard].join(', ')}. The question MUST require combining two or more distinct concepts from the source material, OR a multi-step calculation (e.g. compute an intermediate value, then use it to compute a final answer), OR a justification that weighs multiple factors. A question answerable by recalling one isolated fact is NOT hard — reject that framing.`,
};
