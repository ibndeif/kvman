import { fileEntrySchema, fileStatSchema, workspacePathSchema, type Json, type RpcCall, type RpcResult } from '@kvman/protocol';
import type { WorkspaceFiles } from '@kvman/sdk';
import { ProblemError } from '../../problems.ts';
import { hostProblem } from './host-problems.ts';
import type { InvocationState } from './invocation-state.ts';
import type { RpcClient } from './rpc-client.ts';

export type FilesParts = { state: InvocationState; client: RpcClient };

const entriesSchema = fileEntrySchema.array();
const pathsSchema = workspacePathSchema.array();

// ctx.files (05 §5.4, ADR 0136): every call goes to the kernel's workspace I/O edge, which checks the capability,
// jails the path, and guards .kvman/ with the trust gate.
export function createFiles({ state, client }: FilesParts): WorkspaceFiles {
  const { invoke } = state;
  const call = async (rpc: RpcCall): Promise<Json | undefined> => {
    state.open();
    const result: RpcResult = await client.call(invoke.invocationId, rpc);
    if (!result.ok) throw new ProblemError(result.problem);
    return result.value;
  };
  const text = (value: Json | undefined): string => {
    if (typeof value === 'string') return value;
    throw hostProblem(invoke.message, 'INTERNAL', 'the kernel answered a file read without text');
  };
  return {
    read: async (path) => text(await call({ name: 'workspace.read', path })),
    write: async (path, content) => {
      const body = typeof content === 'string' ? { text: content } : { base64: Buffer.from(content.buffer, content.byteOffset, content.byteLength).toString('base64') };
      await call({ name: 'workspace.write', path, content: body });
    },
    list: async (path = '.') => entriesSchema.parse(await call({ name: 'workspace.list', path })),
    stat: async (path) => {
      const value = await call({ name: 'workspace.stat', path });
      return value === undefined ? undefined : fileStatSchema.parse(value);
    },
    mkdir: async (path) => {
      await call({ name: 'workspace.mkdir', path });
    },
    rm: async (path, options = {}) => {
      await call({ name: 'workspace.rm', path, recursive: options.recursive ?? false });
    },
    glob: async (pattern) => pathsSchema.parse(await call({ name: 'workspace.glob', pattern })),
  };
}
