import { useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import type { TypeConfig, TypeResult, QuestionType } from '../types';

export interface GenerationState {
  setId:         string | null;
  fileName:      string | null;
  wordCount:     number | null;
  previewText:   string | null;
  typeConfig:    TypeConfig[];
  results:       Record<QuestionType, TypeResult>;
  isGenerating:  boolean;
  exportError:   string | null;
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
    setId:        null,
    fileName:     null,
    wordCount:    null,
    previewText:  null,
    typeConfig:   [],
    results:      emptyResults(),
    isGenerating: false,
    exportError:  null,
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
      setId:       data.setId,
      fileName:    data.fileName,
      wordCount:   data.wordCount,
      previewText: data.previewText,
      results:     emptyResults(),
    }));
  }, []);

  const setTypeConfig = useCallback((config: TypeConfig[]) => {
    setState(s => ({ ...s, typeConfig: config }));
  }, []);

  const generate = useCallback(async (): Promise<void> => {
    setState(s => {
      // Mark all active types as "generating" immediately for UI feedback
      const results = { ...s.results };
      for (const tc of s.typeConfig) {
        if (tc.count > 0) {
          results[tc.type] = { status: 'generating' };
        }
      }
      return { ...s, isGenerating: true, exportError: null, results };
    });

    try {
      const setId     = state.setId;
      const typeConfig = state.typeConfig;

      const res = await apiFetch(`/api/sets/${setId}/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ typeConfig }),
      });

      const body = await res.json() as {
        questionBlocks?:   Array<{ questionType: string; totalMarks: number; status: string; questions: unknown[] }>;
        generationErrors?: Array<{ type: string; requested: number; received: number; error: string }>;
        error?:            string;
      };

      if (!res.ok) {
        throw new Error(body.error ?? `Generation failed (${res.status})`);
      }

      setState(s => {
        const results = { ...s.results };

        for (const block of body.questionBlocks ?? []) {
          const type = block.questionType as QuestionType;
          results[type] = {
            status:     'success',
            questions:  block.questions,
            totalMarks: block.totalMarks,
            received:   block.questions.length,
          };
        }

        for (const err of body.generationErrors ?? []) {
          const type = err.type as QuestionType;
          results[type] = {
            status:    'failed',
            requested: err.requested,
            received:  err.received,
            error:     err.error,
          };
        }

        return { ...s, isGenerating: false, results };
      });
    } catch (err) {
      // Reset all "generating" states back to idle on network/server error
      setState(s => {
        const results = { ...s.results };
        for (const type of Object.keys(results) as QuestionType[]) {
          if (results[type].status === 'generating') {
            results[type] = { status: 'idle' };
          }
        }
        return { ...s, isGenerating: false, exportError: err instanceof Error ? err.message : 'Generation failed.' };
      });
    }
  }, [state.setId, state.typeConfig]);

  const applyScheme = useCallback((parsedConfig: TypeConfig[]) => {
    setState(s => ({ ...s, typeConfig: parsedConfig }));
  }, []);

  const reset = useCallback(() => {
    setState({
      setId:        null,
      fileName:     null,
      wordCount:    null,
      previewText:  null,
      typeConfig:   [],
      results:      emptyResults(),
      isGenerating: false,
      exportError:  null,
    });
  }, []);

  return { state, uploadFile, setTypeConfig, applyScheme, generate, reset };
}
