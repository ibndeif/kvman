// A fake of the parts of the `vscode` module the extension uses (ADR 0099, 35). Tests reach its state through `fake`.

type Listener<Event> = (event: Event) => void;
type Disposable = { dispose(): void };

function emitter<Event>() {
  const listeners = new Set<Listener<Event>>();
  const on = (listener: Listener<Event>): Disposable => {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  };
  return { on, fire: (event: Event) => listeners.forEach((listener) => listener(event)), count: () => listeners.size };
}

export class Uri {
  readonly scheme: string;
  readonly fsPath: string;
  readonly text: string;
  private constructor(scheme: string, fsPath: string, text: string) {
    this.scheme = scheme;
    this.fsPath = fsPath;
    this.text = text;
  }
  static file(fsPath: string): Uri {
    return new Uri('file', fsPath, `file://${fsPath}`);
  }
  static parse(text: string): Uri {
    return new Uri(new URL(text).protocol.replace(':', ''), '', text);
  }
  static joinPath(base: Uri, ...parts: string[]): Uri {
    return Uri.file([base.fsPath, ...parts].join('/'));
  }
  toString(): string {
    return this.text;
  }
}

export class ShellExecution {
  readonly command: string;
  readonly args: string[];
  constructor(command: string, args: string[]) {
    this.command = command;
    this.args = args;
  }
}

export class Task {
  readonly definition: { type: string };
  readonly name: string;
  readonly execution: ShellExecution;
  constructor(definition: { type: string }, _scope: unknown, name: string, _source: string, execution: ShellExecution) {
    this.definition = definition;
    this.name = name;
    this.execution = execution;
  }
}

export const TaskScope = { Global: 1 };
export const ViewColumn = { Active: -1 };

export class Range {
  readonly start: { line: number; character: number };
  readonly end: { line: number; character: number };
  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
    this.start = { line: startLine, character: startCharacter };
    this.end = { line: endLine, character: endCharacter };
  }
}

type FakePanel = { title: string; reveals: number; disposed: boolean; webview: ReturnType<typeof webviewPart>; dispose(): void };

function webviewPart(posts: unknown[], messages: ReturnType<typeof emitter<unknown>>) {
  return {
    html: '',
    options: {},
    cspSource: 'https://web.source',
    asWebviewUri: (uri: Uri) => Uri.parse(`https://web.source${uri.fsPath}`),
    onDidReceiveMessage: messages.on,
    postMessage: (sent: unknown) => {
      posts.push(sent);
      return Promise.resolve(true);
    },
  };
}

const message = emitter<unknown>();
const visibility = emitter<undefined>();
const viewDisposed = emitter<undefined>();
const panelDisposed = emitter<undefined>();
const taskEnds = emitter<{ execution: { task: Task }; exitCode: number | undefined }>();

const viewPosts: unknown[] = [];

function webviewView() {
  const view = {
    visible: true,
    webview: webviewPart(viewPosts, message),
    onDidChangeVisibility: visibility.on,
    onDidDispose: viewDisposed.on,
  };
  return view;
}

type FakeEditor = { selection: Range & { isEmpty: boolean }; document: { uri: Uri; languageId: string; getText(range: Range): string } };

export const fake = {
  language: 'en',
  folders: undefined as { uri: Uri }[] | undefined,
  settings: {} as Record<string, unknown>,
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  executed: [] as string[],
  opened: [] as string[],
  documents: [] as string[],
  errors: [] as string[],
  warnings: [] as { text: string; options: unknown; buttons: string[] }[],
  answerWarning: (_buttons: string[]): string | undefined => undefined,
  tasks: [] as Task[],
  provider: undefined as { resolveWebviewView(view: unknown): void } | undefined,
  view: webviewView(),
  viewPosts,
  panels: [] as FakePanel[],
  panelMessages: emitter<unknown>(),
  infos: [] as string[],
  shown: [] as { path: string; options: unknown }[],
  runs: [] as { id: string; args: unknown[] }[],
  failing: new Set<string>(),
  contentProviders: new Map<string, { provideTextDocumentContent(uri: Uri): string }>(),
  editor: undefined as FakeEditor | undefined,
  /** The page sends a message, as the relay script does. */
  post: (sent: unknown) => message.fire(sent),
  /** The view is shown again. */
  show: () => visibility.fire(undefined),
  /** VS Code disposes the view, and the person closes the Settings tab. */
  disposeView: () => viewDisposed.fire(undefined),
  closePanel: () => panelDisposed.fire(undefined),
  /** How many listeners the view's and the Settings tab's events have. */
  listeners: () => ({ viewMessages: message.count(), visibility: visibility.count(), panelMessages: fake.panelMessages.count() }),
  /** A task ends: another extension's first, then the last one this extension ran. */
  endTask: (exitCode: number | undefined) => {
    taskEnds.fire({ execution: { task: new Task({ type: 'shell' }, 1, 'other', 'other', new ShellExecution('make', [])) }, exitCode: 0 });
    const last = fake.tasks.at(-1);
    if (last !== undefined) taskEnds.fire({ execution: { task: last }, exitCode });
  },
};

export const env = {
  get language() {
    return fake.language;
  },
  openExternal: (uri: Uri) => {
    fake.opened.push(uri.toString());
    return Promise.resolve(true);
  },
};

export const workspace = {
  get workspaceFolders() {
    return fake.folders;
  },
  getConfiguration: () => ({ get: (key: string) => fake.settings[key] }),
  registerTextDocumentContentProvider: (scheme: string, provider: { provideTextDocumentContent(uri: Uri): string }) => {
    fake.contentProviders.set(scheme, provider);
    return { dispose: () => undefined };
  },
  asRelativePath: (uri: Uri) => {
    const base = fake.folders?.[0]?.uri.fsPath;
    return base !== undefined && uri.fsPath.startsWith(`${base}/`) ? uri.fsPath.slice(base.length + 1) : uri.fsPath;
  },
};

export const window = {
  registerWebviewViewProvider: (_id: string, provider: { resolveWebviewView(view: unknown): void }) => {
    fake.provider = provider;
    return { dispose: () => undefined };
  },
  showWarningMessage: (text: string, options: unknown, ...buttons: string[]) => {
    fake.warnings.push({ text, options, buttons });
    return Promise.resolve(fake.answerWarning(buttons));
  },
  showErrorMessage: (text: string) => {
    fake.errors.push(text);
    return Promise.resolve(undefined);
  },
  showTextDocument: (uri: Uri, options?: unknown) => {
    fake.documents.push(uri.fsPath);
    fake.shown.push({ path: uri.fsPath, options });
    return Promise.resolve(undefined);
  },
  showInformationMessage: (text: string) => {
    fake.infos.push(text);
    return Promise.resolve(undefined);
  },
  createWebviewPanel: (_type: string, title: string) => {
    const panel: FakePanel = {
      title,
      reveals: 0,
      disposed: false,
      webview: webviewPart([], fake.panelMessages),
      dispose: () => {
        panel.disposed = true;
      },
    };
    fake.panels.push(panel);
    return { ...panel, get webview() { return panel.webview; }, reveal: () => void (panel.reveals += 1), onDidDispose: panelDisposed.on };
  },
  get activeTextEditor() {
    return fake.editor;
  },
};

export const commands = {
  registerCommand: (id: string, run: (...args: unknown[]) => unknown) => {
    fake.commands.set(id, run);
    return { dispose: () => undefined };
  },
  executeCommand: (id: string, ...args: unknown[]) => {
    fake.executed.push(id);
    fake.runs.push({ id, args });
    return fake.failing.has(id) ? Promise.reject(new Error(`${id} failed`)) : Promise.resolve(undefined);
  },
};

export const tasks = {
  executeTask: (task: Task) => {
    fake.tasks.push(task);
    return Promise.resolve({ task });
  },
  onDidEndTaskProcess: taskEnds.on,
};
