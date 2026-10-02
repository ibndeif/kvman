import type { Ctx } from '@kvman/sdk';
import { registerArtifacts } from './artifacts/register-artifacts.ts';
import { registerConnectorRun } from './calls/connector-run.ts';
import { registerProcessHandlers, interruptLeftovers } from './jobs/process-handlers.ts';
import { registerJobs } from './jobs/register-jobs.ts';
import { registerMessages } from './messages/register-messages.ts';
import { registerPrompt } from './prompt/register-prompt.ts';
import { clearConnectors, registerConnectors } from './registry/register-connectors.ts';
import { registerSections } from './registry/register-sections.ts';
import { clearSessionPoints, registerSessionPoints } from './registry/session-points.ts';
import { registerSettings } from './register-settings.ts';
import { registerForkExport } from './sessions/register-fork-export.ts';
import { registerLifecycle } from './sessions/register-lifecycle.ts';
import { registerSessions } from './sessions/register-sessions.ts';
import { registerInterruptions } from './turns/register-interruptions.ts';
import { registerTurns } from './turns/register-turns.ts';
import { registerStep } from './turns/step.ts';
import { registerUi } from './ui/register-ui.ts';

export type { Message, Session, Turn } from './sessions/session-view.ts';
export type {} from './api.ts';

// kvcoder (plan 08): the app-building harness, with one shell tool, connectors, sections, and its conversation UI.
export default (ctx: Ctx): void => {
  registerSettings(ctx);
  registerSessions(ctx);
  registerForkExport(ctx);
  registerLifecycle(ctx);
  registerMessages(ctx);
  registerTurns(ctx);
  registerStep(ctx);
  registerConnectorRun(ctx);
  registerInterruptions(ctx);
  registerJobs(ctx);
  registerArtifacts(ctx);
  registerProcessHandlers(ctx);
  registerConnectors(ctx);
  registerSections(ctx);
  registerSessionPoints(ctx);
  registerPrompt(ctx);
  registerUi(ctx);
  ctx.registerHandler('kernel.started', {
    description: 'Clears the connectors and session handlers, which extensions register again at each start, and marks the processes that no longer run.',
    handle: async () => {
      await clearConnectors(ctx);
      await clearSessionPoints(ctx);
      await interruptLeftovers(ctx);
    },
  });
};
