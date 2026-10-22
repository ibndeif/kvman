import { FrameRequests, type FrameEffect, type PageRequest } from './frame-requests.ts';
import { trustAnswer, type Line, type LineProblem, type TrustVersion } from './lines.ts';
import { isNewEnough, requiredVersion, versionIn } from './version.ts';

// What the extension decides (plan 15 §15.3 to §15.5): each happening gives the view to show and the effects to carry
// out. Nothing here touches VS Code or a process, so every decision is tested on its own.

export type Action = 'install' | 'update' | 'start' | 'showLog' | 'nodejs';

export type View =
  | { kind: 'remote' }
  | { kind: 'starting' }
  | { kind: 'missing' }
  | { kind: 'tooOld'; version: string; minimum: string }
  | { kind: 'installing' }
  | { kind: 'npmMissing'; update: boolean }
  | { kind: 'installFailed'; update: boolean }
  | { kind: 'failed'; problem: LineProblem }
  | { kind: 'stopped' }
  | { kind: 'frame'; url: string; port: number };

export type Effect =
  | { kind: 'checkVersion' }
  | { kind: 'install'; update: boolean }
  | { kind: 'start' }
  | { kind: 'askTrust'; versions: TrustVersion[] }
  | { kind: 'write'; text: string }
  | { kind: 'closeInput' }
  | { kind: 'checkHealth'; port: number }
  | { kind: 'openLog' }
  | FrameEffect;

export type Happening =
  | { kind: 'needed'; request?: PageRequest }
  | { kind: 'stated'; workspaceId: string }
  | { kind: 'insert'; text: string }
  | { kind: 'pages' }
  | { kind: 'versionAnswered'; output: string | undefined }
  | { kind: 'installEnded'; code: number | undefined }
  | { kind: 'line'; line: Line }
  | { kind: 'unreadable' }
  | { kind: 'exited' }
  | { kind: 'healthAnswered'; alive: boolean }
  | { kind: 'trustAnswered'; accepted: boolean }
  | { kind: 'pressed'; action: Action }
  | { kind: 'closing' };

export type SessionOptions = { remote: boolean; extensionVersion: string; windows: boolean };

const nodejsAddress = 'https://nodejs.org';

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
      case 'versionAnswered':
        return this.#versionAnswered(happening.output);
      case 'installEnded':
        return this.#installEnded(happening.code);
      case 'line':
        return this.#line(happening.line);
      case 'unreadable':
        return this.#stopped([{ kind: 'closeInput' }]);
      case 'exited':
        return this.#owner || this.#view.kind === 'starting' ? this.#stopped([]) : [];
      case 'healthAnswered':
        return happening.alive ? this.#frame.flush() : this.#start();
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

  #versionAnswered(output: string | undefined): Effect[] {
    const version = output === undefined ? undefined : versionIn(output);
    if (version === undefined) return this.#show({ kind: 'missing' });
    if (!isNewEnough(version, this.#options.extensionVersion)) return this.#show({ kind: 'tooOld', version, minimum: requiredVersion(this.#options.extensionVersion) });
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
      case 'joined':
        this.#owner = line.kind === 'running';
        this.#frame.shown(line.url, line.port);
        this.#view = { kind: 'frame', url: frameAddress(line.url), port: line.port };
        return this.#frame.flush();
      case 'restarting':
        return [];
      case 'failed':
        this.#owner = false;
        this.#frame.lost();
        return this.#show({ kind: 'failed', problem: line.problem });
    }
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
    }
  }

  #start(): Effect[] {
    this.#versionChecked = true;
    this.#owner = false;
    this.#frame.lost();
    this.#view = { kind: 'starting' };
    return [{ kind: 'start' }];
  }

  #stopped(effects: Effect[]): Effect[] {
    this.#owner = false;
    this.#frame.lost();
    this.#view = { kind: 'stopped' };
    return effects;
  }

  #show(view: View): Effect[] {
    this.#view = view;
    return [];
  }
}
