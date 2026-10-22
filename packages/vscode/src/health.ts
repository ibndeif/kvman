import { z } from 'zod';

// Whether a kvman answers on a port (plan 15 §15.5): `kernel.health.get`, called as any local program calls it, with
// the Host `127.0.0.1:<port>` and no Origin (plan 04 §4.2).

const answerSchema = z.object({ ok: z.literal(true) });

export async function isKvmanAlive(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${String(port)}/api/queries/kernel.health.get`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: {} }),
    });
    return answerSchema.safeParse(await response.json()).success;
  } catch (error) {
    // fetch reports a port nobody listens on as a TypeError, and a body that isn't JSON as a SyntaxError.
    if (error instanceof TypeError || error instanceof SyntaxError) return false;
    throw error;
  }
}
