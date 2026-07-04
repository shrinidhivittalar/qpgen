import { useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import type { TypeConfig, TypeResult, QuestionType } from '../types';

export interface GenerationState {
  setId:          string | null;
  fileName:       string | null;
  wordCount:      number | null;
  previewText:    string | null;
  typeConfig:     TypeConfig[];
  activeSchemeId: string | null;
  results:        Record<QuestionType, TypeResult>;
  isGenerating:   boolean;
  exportError:    string | null;
}

const emptyResults = (): Record<QuestionType, TypeResult> => ({
  fillInBlanks:      { status: 'idle' },
  multipleChoice:    { status: 'idle' },
  multiSelect:       { status: 'idle' },
  matchTheFollowing: { status: 'idle' },
  reordering:        { status: 'idle' },
  sorting:           { status: 'idle' },
  trueFalse:         { status: 'idle' },
});

export function useGeneration() {
  const [state, setState] = useState<GenerationState>({
    setId:          null,
    fileName:       null,
    wordCount:      null,
    previewText:    null,
    typeConfig:     [],
    activeSchemeId: null,
    results:        emptyResults(),
    isGenerating:   false,
    exportError:    null,
  });

  const uploadFile = useCallback(async (file: File): Promise<void> => {
    const form = new FormData();
    form.append('file', file);

    const res = await apiFetch('/api/source/upload', { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      throw new Error(body.error ?? 'Upload failed.');
    }
    const data = await res.json() as {
      setId: string; fileName: string; wordCount: number; previewText: string;
    };

    setState(s => ({
      ...s,
      setId:          data.setId,
      fileName:       data.fileName,
      wordCount:      data.wordCount,
      previewText:    data.previewText,
      activeSchemeId: null,
      results:        emptyResults(),
    }));
  }, []);

  const setTypeConfig = useCallback((config: TypeConfig[]) => {
    setState(s => ({ ...s, typeConfig: config }));
  }, []);

  // schemeId is null when the user skipped scheme selection or configured manually
  const applyScheme = useCallback((parsedConfig: TypeConfig[], schemeId: string | null = null) => {
    // Deduplicate by merging same-type entries (defensive against stale DB records
    // or multi-section blueprints where both sections map to the same type)
    const merged = new Map<string, TypeConfig>();
    for (const tc of parsedConfig) {
      const existing = merged.get(tc.type);
      if (existing) {
        existing.count += tc.count;
      } else {
        merged.set(tc.type, { ...tc });
      }
    }
    setState(s => ({ ...s, typeConfig: Array.from(merged.values()), activeSchemeId: schemeId }));
  }, []);

  const generate = useCallback(async (): Promise<void> => {
    setState(s => {
      const results = { ...s.results };
      for (const tc of s.typeConfig) {
        if (tc.count > 0) results[tc.type] = { status: 'generating' };
      }
      return { ...s, isGenerating: true, exportError: null, results };
    });

    try {
      const { setId, typeConfig, activeSchemeId } = state;

      const res = await apiFetch(`/api/sets/${setId}/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          typeConfig,
          ...(activeSchemeId ? { schemeId: activeSchemeId } : {}),
        }),
      });

      const body = await res.json() as {
        questionBlocks?:   Array<{ questionType: string; totalMarks: number; status: string; questions: unknown[] }>;
        generationErrors?: Array<{ type: string; requested: number; received: number; error: string }>;
        error?:            string;
      };

      if (!res.ok) throw new Error(body.error ?? `Generation failed (${res.status})`);

      setState(s => {
        const results = { ...s.results };
        for (const block of body.questionBlocks ?? []) {
          const type = block.questionType as QuestionType;
          results[type] = { status: 'success', questions: block.questions, totalMarks: block.totalMarks, received: block.questions.length };
        }
        for (const err of body.generationErrors ?? []) {
          const type = err.type as QuestionType;
          results[type] = { status: 'failed', requested: err.requested, received: err.received, error: err.error };
        }
        return { ...s, isGenerating: false, results };
      });
    } catch (err) {
      setState(s => {
        const results = { ...s.results };
        for (const type of Object.keys(results) as QuestionType[]) {
          if (results[type].status === 'generating') results[type] = { status: 'idle' };
        }
        return { ...s, isGenerating: false, exportError: err instanceof Error ? err.message : 'Generation failed.' };
      });
    }
  }, [state.setId, state.typeConfig, state.activeSchemeId]);

  const reset = useCallback(() => {
    setState({
      setId:          null,
      fileName:       null,
      wordCount:      null,
      previewText:    null,
      typeConfig:     [],
      activeSchemeId: null,
      results:        emptyResults(),
      isGenerating:   false,
      exportError:    null,
    });
  }, []);

  return { state, uploadFile, setTypeConfig, applyScheme, generate, reset };
}
