import type { Ctx } from '@kvman/sdk';
import { registerArtifacts } from './artifacts/register-artifacts.ts';
import { registerArtifactConnector } from './calls/artifact-connector.ts';
import { registerAskConnector } from './calls/ask.ts';
import { registerBackgroundConnector } from './calls/background-connector.ts';
import { registerConnectorHelp } from './calls/connector-help.ts';
import { registerFsConnector } from './calls/fs-connector.ts';
import { registerShellConnector } from './calls/shell-connector.ts';
import { registerSubagentConnector } from './calls/subagent.ts';
import { registerDocs } from './docs.ts';
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

// kvcoder (plan 08): the app-building harness, with one `run` tool over connectors, sections, and its conversation UI.
export default (ctx: Ctx): void => {
  registerSettings(ctx);
  registerSessions(ctx);
  registerForkExport(ctx);
  registerLifecycle(ctx);
  registerMessages(ctx);
  registerTurns(ctx);
  registerStep(ctx);
  registerShellConnector(ctx);
  registerFsConnector(ctx);
  registerArtifactConnector(ctx);
  registerBackgroundConnector(ctx);
  registerAskConnector(ctx);
  registerSubagentConnector(ctx);
  registerConnectorHelp(ctx);
  registerInterruptions(ctx);
  registerJobs(ctx);
  registerArtifacts(ctx);
  registerProcessHandlers(ctx);
  registerConnectors(ctx);
  registerSections(ctx);
  registerDocs(ctx);
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
