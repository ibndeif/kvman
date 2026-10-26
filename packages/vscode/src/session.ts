import { FrameRequests, type FrameEffect, type PageRequest } from './frame-requests.ts';
import { trustAnswer, type Line, type LineProblem, type TrustVersion } from './lines.ts';
import { isNewEnough, versionIn } from './version.ts';

// What the extension decides (plan 15 §15.3 to §15.5): each happening gives the view to show and the effects to carry
// out. Nothing here touches VS Code or a process, so every decision is tested on its own. A frame view carries the
// number of the start that made it, so each start's frame is loaded afresh (ADR 0101, 8). A joined kvman is framed once
// its version is known to be new enough, or unknown (ADR 0106, 5).

export type Action = 'install' | 'update' | 'start' | 'showLog' | 'nodejs' | 'openAnyway';

export type View =
  | { kind: 'remote' }
  | { kind: 'starting' }
  | { kind: 'missing' }
  | { kind: 'tooOld'; version: string; minimum: string }
  | { kind: 'oldRunning'; version: string; minimum: string }
  | { kind: 'installing' }
  | { kind: 'npmMissing'; update: boolean }
  | { kind: 'installFailed'; update: boolean }
  | { kind: 'failed'; problem: LineProblem }
  | { kind: 'stopped' }
  | { kind: 'frame'; url: string; port: number; start: number };

export type Effect =
  | { kind: 'checkVersion' }
  | { kind: 'install'; update: boolean }
  | { kind: 'start' }
  | { kind: 'askTrust'; versions: TrustVersion[] }
  | { kind: 'write'; text: string }
  | { kind: 'closeInput' }
  | { kind: 'checkHealth'; port: number }
  | { kind: 'checkJoined'; port: number; start: number }
  | { kind: 'openLog' }
  | FrameEffect;

export type Happening =
  | { kind: 'needed'; request?: PageRequest }
  | { kind: 'stated'; workspaceId: string }
  | { kind: 'insert'; text: string }
  | { kind: 'pages' }
  | { kind: 'new' }
  | { kind: 'actions'; offersNew: boolean }
  | { kind: 'lost' }
  | { kind: 'versionAnswered'; output: string | undefined }
  | { kind: 'installEnded'; code: number | undefined }
  | { kind: 'line'; line: Line }
  | { kind: 'unreadable' }
  | { kind: 'exited' }
  | { kind: 'healthAnswered'; alive: boolean }
  | { kind: 'joinedAnswered'; start: number; version: string | undefined }
  | { kind: 'trustAnswered'; accepted: boolean }
  | { kind: 'pressed'; action: Action }
  | { kind: 'closing' };

export type SessionOptions = { remote: boolean; extensionVersion: string; windows: boolean };

const nodejsAddress = 'https://nodejs.org';

type Joining = { url: string; port: number; start: number };

/** The frame's address: kvman's URL with `embed=parent`, so kvwebui runs embedded in the view (plan 06 §6.2). */
export function frameAddress(url: string): string {
  const address = new URL(url);
  address.searchParams.set('embed', 'parent');
  return address.href;
}

export class Session {
  #view: View;
  #owner = false;
  #versionChecked = false;
  #lastInstallUpdate = false;
  #starts = 0;
  #joining: Joining | undefined;
  readonly #frame = new FrameRequests();
  readonly #options: SessionOptions;

  constructor(options: SessionOptions) {
    this.#options = options;
    this.#view = options.remote ? { kind: 'remote' } : { kind: 'starting' };
  }

  get view(): View {
    return this.#view;
  }

  get owner(): boolean {
    return this.#owner;
  }

  handle(happening: Happening): Effect[] {
    if (this.#options.remote) return [];
    switch (happening.kind) {
      case 'needed':
        return this.#needed(happening.request);
      case 'stated':
        return this.#frame.stated(happening.workspaceId);
      case 'insert':
        return [...this.#frame.insert(happening.text), ...(this.#frame.ready ? [] : this.#needed())];
      case 'pages':
        return this.#frame.pages();
      case 'new':
        return this.#frame.pressNew();
      case 'actions':
        return this.#frame.offers(happening.offersNew);
      case 'lost':
        return this.#lost();
      case 'versionAnswered':
        return this.#versionAnswered(happening.output);
      case 'installEnded':
        return this.#installEnded(happening.code);
      case 'line':
        return this.#line(happening.line);
      case 'unreadable':
        return this.#stopped([{ kind: 'closeInput' }]);
      case 'exited':
        return this.#owner || (this.#view.kind === 'starting' && this.#joining === undefined) ? this.#stopped([]) : [];
      case 'healthAnswered':
        return happening.alive ? this.#frame.flush() : this.#start();
      case 'joinedAnswered':
        return this.#joinedAnswered(happening.start, happening.version);
      case 'trustAnswered':
        return [{ kind: 'write', text: trustAnswer(happening.accepted) }];
      case 'pressed':
        return this.#pressed(happening.action);
      case 'closing':
        return this.#owner ? [{ kind: 'closeInput' }] : [];
    }
  }

  #needed(request?: PageRequest): Effect[] {
    if (request !== undefined) this.#frame.ask(request);
    const view = this.#view;
    if (!this.#versionChecked && view.kind === 'starting') {
      this.#versionChecked = true;
      return [{ kind: 'checkVersion' }];
    }
    if (view.kind === 'frame') return this.#owner ? this.#frame.flush() : [{ kind: 'checkHealth', port: view.port }];
    if (request !== undefined && (view.kind === 'failed' || view.kind === 'stopped')) return this.#start();
    return [];
  }

  // The frame found kvman gone (ADR 0101, 3). A window that owns kvman learns that from its own process.
  #lost(): Effect[] {
    const view = this.#view;
    return view.kind === 'frame' && !this.#owner ? [{ kind: 'checkHealth', port: view.port }] : [];
  }

  #versionAnswered(output: string | undefined): Effect[] {
    const version = output === undefined ? undefined : versionIn(output);
    if (version === undefined) return this.#show({ kind: 'missing' });
    const minimum = this.#options.extensionVersion;
    if (!isNewEnough(version, minimum)) return this.#show({ kind: 'tooOld', version, minimum });
    return this.#start();
  }

  #installEnded(code: number | undefined): Effect[] {
    if (code === 0) return this.#start();
    const update = this.#lastInstallUpdate;
    const npmMissing = code === (this.#options.windows ? 9009 : 127);
    return this.#show(npmMissing ? { kind: 'npmMissing', update } : { kind: 'installFailed', update });
  }

  #line(line: Line): Effect[] {
    switch (line.kind) {
      case 'trust':
        return [{ kind: 'askTrust', versions: line.versions }];
      case 'running':
        return this.#framed(true, line.url, line.port);
      case 'joined':
        this.#joining = { url: line.url, port: line.port, start: this.#starts };
        return [{ kind: 'checkJoined', port: line.port, start: this.#starts }];
      case 'restarting':
        return [];
      case 'failed':
        this.#owner = false;
        return [...this.#frame.lost(), ...this.#show({ kind: 'failed', problem: line.problem })];
    }
  }

  // The joined kvman's version, unless a later start made the question moot. One older than the extension waits for
  // the person: Start again, or Open anyway.
  #joinedAnswered(start: number, version: string | undefined): Effect[] {
    const joining = this.#joining;
    if (joining === undefined || joining.start !== start) return [];
    const minimum = this.#options.extensionVersion;
    if (version !== undefined && !isNewEnough(version, minimum)) return this.#show({ kind: 'oldRunning', version, minimum });
    return this.#openJoined(joining);
  }

  #openJoined(joining: Joining): Effect[] {
    this.#joining = undefined;
    return this.#framed(false, joining.url, joining.port);
  }

  // A line of the start that made the frame, at its address, keeps the frame and whether it is ready (ADR 0101, 8).
  #framed(owner: boolean, url: string, port: number): Effect[] {
    this.#owner = owner;
    const view: View = { kind: 'frame', url: frameAddress(url), port, start: this.#starts };
    const current = this.#view;
    const kept = current.kind === 'frame' && current.url === view.url && current.start === view.start;
    const shown = kept ? [] : this.#frame.shown(url, port);
    this.#view = view;
    return [...shown, ...this.#frame.flush()];
  }

  #pressed(action: Action): Effect[] {
    switch (action) {
      case 'install':
      case 'update':
        this.#lastInstallUpdate = action === 'update';
        this.#view = { kind: 'installing' };
        return [{ kind: 'install', update: this.#lastInstallUpdate }];
      case 'start':
        return this.#start();
      case 'showLog':
        return [{ kind: 'openLog' }];
      case 'nodejs':
        return [{ kind: 'openExternal', url: nodejsAddress }];
      case 'openAnyway':
        return this.#view.kind === 'oldRunning' && this.#joining !== undefined ? this.#openJoined(this.#joining) : [];
    }
  }

  #start(): Effect[] {
    this.#versionChecked = true;
    this.#owner = false;
    this.#joining = undefined;
    this.#starts += 1;
    this.#view = { kind: 'starting' };
    return [...this.#frame.lost(), { kind: 'start' }];
  }

  #stopped(effects: Effect[]): Effect[] {
    this.#owner = false;
    this.#view = { kind: 'stopped' };
    return [...this.#frame.lost(), ...effects];
  }

  #show(view: View): Effect[] {
    this.#view = view;
    return [];
  }
}
