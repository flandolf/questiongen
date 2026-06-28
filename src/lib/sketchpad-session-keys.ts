// ─── Sketchpad session-key helpers ───────────────────────────────────────────
// Centralises the format of sketchpad session keys so that GeneratorView,
// WrongQuestionView, and the persistence layer agree on the namespace.
//
// IMPORTANT: keys must remain stable across view/page transitions. Including
// mutable content-derived hashes can cause keys to drift after hydration /
// normalisation and make sketches appear to reset.

import type { GeneratedQuestion, McQuestion } from '@/types';

export type SketchMode = 'written' | 'multiple-choice';

/**
 * Build the namespaced session key for a given question + mode.
 * Used by GeneratorView and any other view that hosts a sketchpad per question.
 */
export function buildSketchpadSessionKey(
  mode: SketchMode,
  question: Pick<GeneratedQuestion, 'id'> | Pick<McQuestion, 'id'>,
): string {
  return `sketch-${mode}-${question.id}`;
}

/** Sketchpad mode for the WrongQuestion reattempt view. */
export type ReattemptSketchMode = SketchMode;

export function buildWrongQuestionSketchKey(
  mode: ReattemptSketchMode,
  questionId: string,
): string {
  return `wrong-${mode}-${questionId}`;
}
