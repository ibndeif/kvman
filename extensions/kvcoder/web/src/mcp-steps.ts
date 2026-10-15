import { fields } from './kvman.ts';

// The steps of an `mcp run` (ADR 0084, 1 and 3): each step's tool and arguments. A step the model is still writing
// may have no tool yet.

export type McpStep = { label: string; tool?: string; arguments: Record<string, unknown> };

/** The steps of an `mcp run`'s payload, numbered from 1; none when `steps` isn't a list. */
export function mcpSteps(payload: Record<string, unknown>): McpStep[] {
  const steps: unknown = payload['steps'];
  if (!Array.isArray(steps)) return [];
  return steps.map((step: unknown, index) => {
    const { tool, arguments: given } = fields(step);
    const number = `${index + 1}.`;
    if (typeof tool !== 'string' || tool.trim() === '') return { label: number, arguments: fields(given) };
    return { label: `${number} ${tool}`, tool, arguments: fields(given) };
  });
}
