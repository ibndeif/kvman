// The chunks a sign-in streams to its job (plan 07 §7.2, ADR 0009, 230). `message`, `label`, and `description` are the
// provider's own text, shown as it is, like a model's name.

/** A prompt's option: what the person picks (`id`) and sees. */
export type SigninOption = { id: string; label: string; description?: string };

/** A chunk kvai streams as `{ source: '@kvman/kvai', data }` while a sign-in runs. */
export type SigninEvent =
  | { type: 'auth_url'; url: string }
  | { type: 'device_code'; userCode: string; verificationUri: string; expiresInSeconds?: number }
  | { type: 'prompt'; kind: 'text' | 'manual_code'; message: string; placeholder?: string }
  | { type: 'prompt'; kind: 'select'; message: string; options: SigninOption[] }
  | { type: 'progress' };
