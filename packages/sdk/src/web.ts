import type { Json } from './json.ts';
import type { Problem } from './problem.ts';
import type { CommandInputOf, InputOf, OutputOf } from './registry.ts';
import type { Workspace } from './rows.ts';

// Types for kvwebui's custom components (plan 06 §6.4, ADR 0009, 83): the view trees and the injected `kvman` object.
// Types only, so a component's build imports nothing from here at runtime.

/** Values in a view's inputs, params, or props: JSON, where `{ $param }` and `{ $row }` are resolved when used. */
export type ViewValues = Record<string, Json>;

/** A badge's color. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** A toast's level. */
export type ToastLevel = 'info' | 'success' | 'warning' | 'error';

/** How a column shows its value. */
export type Format = 'text' | 'number' | 'date' | 'bytes' | 'boolean';

/** A table column or detail field. */
export type ViewColumn = { field: string; title: string; format?: Format; secondary?: string; badges?: Record<string, { text: string; tone: Tone }> };

/** What a button or form does after its command succeeds. */
export type ViewThen = 'rerun' | { navigate: string; params?: ViewValues } | { toast: string; level?: ToastLevel };

/** A page to open: a full page id and its params. */
export type PageLink = { page: string; params?: ViewValues };

/** A button that runs a command. */
export type ButtonView = { type: 'button'; text: string; params?: ViewValues; command: string; input: ViewValues; confirm?: string; style?: 'primary' | 'secondary' | 'danger'; then?: ViewThen };

type Text = { text: string; params?: ViewValues };

/** A view tree of kvwebui's built-in components; every text is a translation key. */
export type View =
  | { type: 'stack'; direction: 'vertical' | 'horizontal'; gap?: 'sm' | 'md' | 'lg'; children: View[] }
  | { type: 'card'; title?: string; children: View[] }
  | ({ type: 'heading'; level: 1 | 2 | 3 } & Text)
  | ({ type: 'text' } & Text)
  | { type: 'markdown'; text?: string; params?: ViewValues; query?: string; input?: ViewValues; field?: string }
  | { type: 'table'; query: string; input: ViewValues; columns: ViewColumn[]; rowActions?: ButtonView[]; rowLink?: PageLink; empty?: string }
  | { type: 'list'; query: string; input: ViewValues; item: View; empty?: string }
  | { type: 'detail'; query: string; input: ViewValues; fields: ViewColumn[] }
  | { type: 'form'; command: string; fixed?: ViewValues; submit: string; then?: ViewThen }
  | ({ type: 'link'; to: PageLink } & Text)
  | ButtonView
  | { type: 'custom'; component: string; props: ViewValues };

/** An event of a job's stream: progress chunks, then one result or Problem. */
export type StreamEvent = { type: 'progress'; source: string; data: Json } | { type: 'result'; output: Json } | { type: 'problem'; problem: Problem };

/** The object kvwebui gives a custom component through `inject('kvman')`. */
export type Kvman = {
  /** Runs a command or query now; a command counts as one the UI ran (queries rerun, effects apply). */
  exec<Name extends string>(name: Name, input: InputOf<Name>): Promise<OutputOf<Name>>;
  /** Queues a command, resolves to its job id, and follows the job. */
  execAsync<Name extends string>(name: Name, input: CommandInputOf<Name>): Promise<string>;
  /** The job's stream events; it ends after the result or Problem, and closes when the component unmounts. */
  stream(jobId: string): AsyncIterable<StreamEvent>;
  /** Resolves when the job has ended, the page's queries have rerun, and its effects have applied. */
  follow(jobId: string): Promise<void>;
  /** Opens a page by its full id. */
  navigate(page: string, params?: Record<string, string>): void;
  /** Shows a toast with a translated text (level `info` by default). */
  toast(text: string, params?: Record<string, Json>, level?: ToastLevel): void;
  /** Opens or closes a panel by its full id. */
  panel(id: string, open: boolean): void;
  /** Translates a key with the UI language's catalog. */
  t(key: string, params?: Record<string, unknown>): string;
  /** The tab's workspace, a live read-only ref. */
  workspace: { readonly value: Workspace };
  /** A component that renders a view tree with kvwebui's built-in components. */
  View: new () => { $props: { view: View } };
};
