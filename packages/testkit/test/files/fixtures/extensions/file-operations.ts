import { z, type Ctx, type Ext } from '@kvman/sdk';
import { attempt } from './attempts.ts';

export const operation = z.object({
  op: z.enum(['read', 'write', 'list', 'stat', 'mkdir', 'rm', 'glob']), path: z.string().optional(), content: z.string().optional(),
  base64: z.string().optional(), size: z.number().optional(), pattern: z.string().optional(), recursive: z.boolean().optional(),
});

type Operation = z.infer<typeof operation>;

// One ctx.files call, as `{ value }` or the problem it threw (07 §7.2, ADR 0136).
export function runOperation(ctx: Ctx, { op, path = '.', content, base64, size, pattern = '*', recursive }: Operation): ReturnType<typeof attempt> {
  const { files } = ctx;
  return attempt(async () => {
    switch (op) {
      case 'read':
        return files.read(path);
      case 'write':
        await files.write(path, size !== undefined ? new Uint8Array(size) : base64 === undefined ? content ?? '' : Buffer.from(base64, 'base64'));
        return null;
      case 'list':
        return files.list(path);
      case 'stat':
        return (await files.stat(path)) ?? null;
      case 'mkdir':
        await files.mkdir(path);
        return null;
      case 'rm':
        await files.rm(path, recursive === undefined ? {} : { recursive });
        return null;
      case 'glob':
        return files.glob(pattern);
    }
  });
}

export function registerRun(ext: Ext, type: string): void {
  ext.registerCommand(type, { description: 'Runs one ctx.files call.', input: operation, handle: async (input, ctx) => runOperation(ctx, input) });
}
