import type { Message, Problem } from '../src/index.ts';

export const messageId = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';
export const otherMessageId = '01JAZ3K4M5N6P7Q8R9S0T1V2W4';
export const workspaceId = 'a'.repeat(64);

export const commandMessage: Message = {
  v: 1,
  id: messageId,
  kind: 'command',
  type: 'pdf.translate',
  source: 'user:local/client:tab-1',
  workspaceId,
  lane: 'file:f1',
  payload: { fileId: 'f1', lang: 'ar' },
  correlationId: messageId,
  context: { locale: 'ar' },
  idempotencyKey: 'click-1',
  priority: 'interactive',
  deadlineAt: 1_790_000_060_000,
  createdAt: 1_790_000_000_000,
};

export const queryMessage: Message = {
  v: 1,
  id: messageId,
  kind: 'query',
  type: 'pdf.files.list',
  source: 'ext:@acme/pdf',
  workspaceId,
  payload: {},
  correlationId: messageId,
  context: { locale: 'en' },
  priority: 'normal',
  createdAt: 1_790_000_000_000,
};

export const durableEventMessage: Message = {
  v: 1,
  id: otherMessageId,
  kind: 'event',
  type: 'pdf.translated',
  source: 'ext:@acme/pdf',
  workspaceId,
  payload: { fileId: 'f1', blobId: 'b1' },
  correlationId: messageId,
  causationId: messageId,
  context: { locale: 'ar', sessionId: 's1' },
  priority: 'interactive',
  delivery: 'durable',
  createdAt: 1_790_000_000_100,
};

export const liveEventMessage: Message = {
  ...durableEventMessage,
  type: 'pdf.progress.updated',
  payload: { text: 'Bonjour' },
  delivery: 'live',
};

export const uiCommandMessage: Message = {
  v: 1,
  id: otherMessageId,
  kind: 'command',
  type: 'ui.toast',
  source: 'ext:@acme/pdf',
  target: 'user:local/client:tab-1',
  workspaceId,
  payload: { text: { $t: 'toast.translated', name: 'report.pdf' } },
  correlationId: messageId,
  causationId: messageId,
  context: { locale: 'ar' },
  priority: 'interactive',
  createdAt: 1_790_000_000_200,
};

export const continuationSendMessage: Message = {
  v: 1,
  id: otherMessageId,
  kind: 'command',
  type: 'shell.exec',
  source: 'ext:@kvman/agent',
  workspaceId,
  lane: `job:${otherMessageId}`,
  payload: { command: 'ls', title: 'List files' },
  correlationId: messageId,
  causationId: messageId,
  context: { locale: 'en', sessionId: 's1', rootSessionId: 's1' },
  onReply: { type: 'agent.tool.record', context: { sessionId: 's1', turnId: 't1', toolCallId: 'c1' } },
  idempotencyKey: `${messageId}:send:0`,
  priority: 'interactive',
  notBefore: 1_790_000_000_500,
  createdAt: 1_790_000_000_300,
};

export const validationProblem: Problem = {
  code: 'VALIDATION_FAILED',
  title: 'The request does not match its schema',
  hint: 'Check the fields listed in issues',
  params: { type: 'pdf.translate' },
  retryable: false,
  correlationId: messageId,
  messageId,
  issues: [
    { path: 'lang', message: 'Required', code: 'invalid_type', params: { expected: 'string' } },
    { path: 'types.0.type', message: 'event names end in a past participle', hint: 'did you mean "pdf.file.translated"?', severity: 'warning' },
  ],
};

export const reloadingProblem: Problem = {
  code: 'HANDLER_UNAVAILABLE',
  title: 'The handling extension is not available',
  retryable: true,
  retryAfterMs: 1000,
  correlationId: messageId,
};
