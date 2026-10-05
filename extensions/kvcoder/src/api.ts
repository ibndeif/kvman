import type { Json } from '@kvman/sdk';
import type { Message, Session, Turn } from './sessions/session-view.ts';

// kvcoder's public names for typed calls (plan 03 §3.2): a caller gets them after `import type {} from '@kvman/kvcoder'`.

type Empty = Record<string, never>;
type Thinking = 'off' | 'minimal' | 'low' | 'medium' | 'high';
type Status = 'idle' | 'running' | 'waiting';
type SessionId = { sessionId: string };
type Example = { description: string; input: Json };
type Binary = { check: string; install?: string; help?: string };
type Connector =
  | { name: string; description: string; commands: { name: string; command: string; examples?: Example[] }[] }
  | { name: string; description: string; binary: Binary };
type ConnectorRow = { name: string; description: string; owner: string; kind: 'commands' | 'binary'; commands?: { name: string; command: string; examples: Example[] }[]; binary?: Binary };
type Point = 'kvcoder.session.created' | 'kvcoder.session.deleted' | 'kvcoder.session.forked' | 'kvcoder.turn.started' | 'kvcoder.turn.ended' | 'kvcoder.session.waiting';
type Place = { global?: boolean; sessionId?: string };
type JobRow = { id: string; kind: 'process' | 'subagent'; title: string; call: string; status: string; startedAt: string; endedAt?: string; exitCode?: number; links: string[] };
type Send = { sessionId: string; text: string; fileIds?: string[] };
type McpServer = { name: string; description: string; command: string; args: string[]; env: string[] } | { name: string; description: string; url: string; headers: string[] };
type McpCheck = { status: 'ready'; tools: number } | { status: 'signInNeeded' } | { status: 'failed'; problem: { code: string; message: string; params?: Record<string, Json> } };

declare module '@kvman/sdk' {
  interface Commands {
    'kvcoder.session.create': { input: { title?: string }; output: Session };
    'kvcoder.session.rename': { input: { sessionId: string; title: string }; output: Empty };
    'kvcoder.session.configure': { input: { sessionId: string; model?: string; thinking?: Thinking }; output: Empty };
    'kvcoder.session.delete': { input: SessionId; output: Empty };
    'kvcoder.session.compact': { input: SessionId; output: { summarized: boolean } };
    'kvcoder.mcp.server.check': { input: { name: string }; output: McpCheck };
    'kvcoder.session.export': { input: SessionId; output: { fileId: string } };
    'kvcoder.session.fork': { input: { sessionId: string; throughSeq?: number }; output: Session };
    'kvcoder.message.send': { input: Send; output: Empty };
    'kvcoder.message.inject': { input: Send; output: Empty };
    'kvcoder.note.add': { input: { sessionId: string; key: string; params?: Record<string, Json> }; output: Empty };
    'kvcoder.turn.cancel': { input: SessionId; output: Empty };
    'kvcoder.job.cancel': { input: { sessionId: string; id: string }; output: Empty };
    'kvcoder.question.answer': { input: { questionId: string; answer: Json }; output: { jobId: string | null } };
    'kvcoder.connector.register': { input: Connector | { connectors: Connector[] }; output: Empty };
    'kvcoder.connector.unregister': { input: { name: string }; output: Empty };
    'kvcoder.section.set': { input: { id: string; title: string; order: number; content: string } & Place; output: Empty };
    'kvcoder.section.remove': { input: { id: string } & Place; output: Empty };
    'kvcoder.handler.register': { input: { point: Point; command: string }; output: Empty };
    'kvcoder.handler.unregister': { input: { point: Point }; output: Empty };
  }
  interface Queries {
    'kvcoder.session.list': { input: { limit: number }; output: Session[] };
    'kvcoder.session.get': { input: SessionId; output: Session };
    'kvcoder.session.count': { input: { status?: Status }; output: { count: number } };
    'kvcoder.message.list': { input: { sessionId: string; limit: number }; output: { messages: Message[]; omitted: number } };
    'kvcoder.job.list': { input: SessionId; output: JobRow[] };
    'kvcoder.job.get': { input: { sessionId: string; id: string }; output: JobRow & { output?: Json; problem?: Json } };
    'kvcoder.turn.list': { input: { sessionId: string; limit: number }; output: Turn[] };
    'kvcoder.prompt.get': { input: SessionId; output: { prompt: string; sections: { id: string; title: string; owner: string; reach: 'global' | 'workspace' | 'session'; size: number; included: boolean }[] } };
    'kvcoder.connector.list': { input: Empty; output: (ConnectorRow & { enabled: boolean })[] };
    'kvcoder.section.list': { input: { sessionId?: string }; output: { id: string; title: string; order: number; owner: string; global: boolean; sessionId?: string; size: number }[] };
    'kvcoder.handler.list': { input: Empty; output: { point: Point; command: string; owner: string }[] };
    'kvcoder.artifact.list': { input: SessionId; output: { id: string; title: string; format: 'markdown' | 'html' | 'url'; version: number; size: number; updatedAt: string }[] };
    'kvcoder.artifact.get': { input: { sessionId: string; id: string }; output: { id: string; title: string; format: 'markdown' | 'html' | 'url'; version: number; content: string; createdAt: string; updatedAt: string } };
  }
  interface Settings {
    'kvcoder.model': string | null;
    'kvcoder.thinking': Thinking;
    'kvcoder.maxSteps': number;
    'kvcoder.shell.approval': 'ask' | 'auto';
    'kvcoder.shell.path': string | null;
    'kvcoder.compactAt': number;
    'kvcoder.compactKeep': number;
    'kvcoder.connectors': { name: string; description: string; binary: Binary }[];
    'kvcoder.connectors.disabled': string[];
    'kvcoder.mcp.servers': McpServer[];
    'kvcoder.sessions.keep': number;
    'kvcoder.welcome': string | null;
  }
}
