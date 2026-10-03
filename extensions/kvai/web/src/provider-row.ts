import { fields } from './kvman.ts';

// A provider row of `kvai.provider.get` (plan 07 §7.2), shared by the provider page and the connection card.
export type ProviderRow = {
  id: string;
  title: string;
  builtIn: boolean;
  status: string;
  models: number;
  connection: 'apiKey' | 'oauth' | null;
  signIn: boolean;
  apiKey: boolean;
};

/** A provider row, or nothing when the answer has another shape. */
export function asRow(value: unknown): ProviderRow | undefined {
  const row = fields(value);
  const { id, title, builtIn, status, models, connection, signIn, apiKey } = row;
  if (typeof id !== 'string' || typeof title !== 'string' || typeof builtIn !== 'boolean') return undefined;
  if (typeof status !== 'string' || typeof models !== 'number') return undefined;
  if (connection !== 'apiKey' && connection !== 'oauth' && connection !== null) return undefined;
  if (typeof signIn !== 'boolean' || typeof apiKey !== 'boolean') return undefined;
  return { id, title, builtIn, status, models, connection, signIn, apiKey };
}
