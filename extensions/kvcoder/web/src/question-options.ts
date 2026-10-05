import { fields } from './kvman.ts';

// The parts of an `ask` question that its cards share (plan 08 §8.5).

export type QuestionOption = { id: string; label: string; description?: string };

/** The options of an `ask choice` question, or none for any other question. */
export function optionsOf(question: Record<string, unknown>): QuestionOption[] {
  const given: unknown[] = Array.isArray(question['options']) ? question['options'] : [];
  return given.map((value) => {
    const option = fields(value);
    return { id: String(option['id']), label: String(option['label']), ...(typeof option['description'] === 'string' ? { description: option['description'] } : {}) };
  });
}
