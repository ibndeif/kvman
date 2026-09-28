import { z, type Ctx } from '@kvman/sdk';

const sendSchema = z.object({ kind: z.enum(['toast', 'notify', 'dismiss', 'navigate']), value: z.json() });

// What the emitting fixtures take: sends passed on exactly as given, so the kernel's admission is what is tested.
export const emitInput = z.object({
  sends: z.array(sendSchema),
  note: z.string().optional(),
  via: z.enum(['send', 'command']).optional(),
  onReply: z.boolean().optional(),
});

type Emit = z.infer<typeof emitInput>;
type Send = z.infer<typeof sendSchema>;

function payloadOf(send: Send): z.infer<ReturnType<typeof z.json>> {
  if (send.kind === 'dismiss') return { key: send.value };
  if (send.kind === 'navigate') return { route: send.value };
  return send.value;
}

// ctx.ui.toast and ctx.ui.notify are ctx.send of their ui.* type; dismiss and navigate go through ctx.ui itself.
function viaUi(ctx: Ctx, send: Send): void {
  if (send.kind === 'dismiss' && typeof send.value === 'string') ctx.ui.dismiss(send.value);
  else if (send.kind === 'navigate' && typeof send.value === 'string') ctx.ui.navigate(send.value);
  else ctx.send(`ui.${send.kind}`, payloadOf(send));
}

export async function emit(input: Emit, ctx: Ctx): Promise<{ replies: unknown[] }> {
  if (input.note !== undefined) ctx.store.kv.set('note', input.note);
  const replies: unknown[] = [];
  for (const send of input.sends) {
    if (input.via === 'command') replies.push(await ctx.command(`ui.${send.kind}`, payloadOf(send)));
    else if (input.onReply === true) ctx.send(`ui.${send.kind}`, payloadOf(send), { onReply: { type: 'herald.replied' } });
    else viaUi(ctx, send);
  }
  return { replies };
}
