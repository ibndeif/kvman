import { defineExtension, z } from '@kvman/sdk';
import { registerProbeSandbox } from './probe-sandbox.ts';
import { registerProbeStore } from './probe-store.ts';

// The sample extension of M2.4: the same code in every isolation mode, with handlers that try what a sandbox refuses.
export default defineExtension({ name: '@acme/probe', namespace: 'probe', title: 'Probe', description: 'Probes its host.' }, (ext) => {
  ext.requestIsolation('shared', { reason: 'Runs in every isolation mode.' });
  ext.requestCapability('files.read', { reason: 'Reads files.' });
  ext.requestCapability('process', { reason: 'Starts processes.' });
  ext.requestCapability('network', { reason: 'Reaches the network.' });
  ext.registerEvent('probe.worked', { description: 'probe.work ran.', payload: z.object({ text: z.string() }) });
  ext.registerEvent('probe.progress', { description: 'Progress as it streams.', delivery: 'live', chunk: 'text' });
  registerProbeStore(ext);
  registerProbeSandbox(ext);
  ext.registerCommand('probe.tool', { description: 'An agent tool.', input: z.object({}), agentTool: { title: 'Probe tool' }, handle: async () => ({ tool: true }) });
  ext.registerQuery('probe.lookup', {
    description: 'A read-only agent tool.', input: z.object({}), output: z.object({ found: z.boolean() }), agentTool: { title: 'Probe lookup' }, handle: async () => ({ found: true }),
  });
  ext.registerCommand('probe.global.tool', {
    description: 'An agent tool without a workspace.', input: z.object({}), scope: 'global', agentTool: { title: 'Probe global tool' }, handle: async () => ({ tool: true }),
  });
  ext.registerCommand('probe.approve', { description: 'Only a person approves.', input: z.object({}), access: 'user', handle: async () => ({}) });
});
