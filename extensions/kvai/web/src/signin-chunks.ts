import { fields } from './kvman.ts';

// The sign-in chunks `kvai.provider.signin.start` streams (plan 07 §7.2, ADR 0009, 230), validated with type guards;
// anything else is ignored. Types only touch JSON, so the browser bundle imports nothing at runtime.
export type AuthUrlChunk = { type: 'auth_url'; url: string };

export type DeviceCodeChunk = { type: 'device_code'; userCode: string; verificationUri: string; expiresInSeconds?: number };

export type PromptOption = { id: string; label: string; description?: string };

export type PromptChunk =
  | { type: 'prompt'; kind: 'text'; message: string; placeholder?: string }
  | { type: 'prompt'; kind: 'manual_code'; message: string; placeholder?: string }
  | { type: 'prompt'; kind: 'select'; message: string; options: PromptOption[] };

export function asAuthUrl(data: unknown): AuthUrlChunk | undefined {
  const chunk = fields(data);
  if (chunk['type'] !== 'auth_url' || typeof chunk['url'] !== 'string') return undefined;
  return { type: 'auth_url', url: chunk['url'] };
}

export function asDeviceCode(data: unknown): DeviceCodeChunk | undefined {
  const chunk = fields(data);
  if (chunk['type'] !== 'device_code' || typeof chunk['userCode'] !== 'string' || typeof chunk['verificationUri'] !== 'string') return undefined;
  const expires = chunk['expiresInSeconds'];
  return { type: 'device_code', userCode: chunk['userCode'], verificationUri: chunk['verificationUri'], ...(typeof expires === 'number' ? { expiresInSeconds: expires } : {}) };
}

function asOption(value: unknown): PromptOption | undefined {
  const option = fields(value);
  if (typeof option['id'] !== 'string' || typeof option['label'] !== 'string') return undefined;
  const description = option['description'];
  return { id: option['id'], label: option['label'], ...(typeof description === 'string' ? { description } : {}) };
}

export function asPrompt(data: unknown): PromptChunk | undefined {
  const chunk = fields(data);
  if (chunk['type'] !== 'prompt' || typeof chunk['message'] !== 'string') return undefined;
  const placeholder = chunk['placeholder'];
  const extra = typeof placeholder === 'string' ? { placeholder } : {};
  if (chunk['kind'] === 'text' || chunk['kind'] === 'manual_code') return { type: 'prompt', kind: chunk['kind'], message: chunk['message'], ...extra };
  if (chunk['kind'] === 'select' && Array.isArray(chunk['options'])) {
    const options: PromptOption[] = [];
    for (const value of chunk['options']) {
      const option = asOption(value);
      if (option === undefined) return undefined;
      options.push(option);
    }
    return { type: 'prompt', kind: 'select', message: chunk['message'], options };
  }
  return undefined;
}

/** A `{ type: 'progress' }` tick with no text. */
export function isProgressTick(data: unknown): boolean {
  return fields(data)['type'] === 'progress';
}

/** Only `http:` and `https:` URLs are linked; anything else is not shown. */
export function isWebUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
