import type { FrameMessage } from './frame-requests.ts';
import type { KvmanProcess, ProcessHandlers } from './kvman-process.ts';
import { readLine, type TrustVersion } from './lines.ts';
import type { Effect, Happening, Session, View } from './session.ts';

// Carries out the session's effects (plan 15 §15.3 to §15.5) through the host, which is VS Code and the kvman program in
// the extension and fakes in tests. Each start is a run of its own: what an earlier run writes or does is ignored.

export type Host = {
  render(view: View): void;
  runVersion(): Promise<string | undefined>;
  runInstall(update: boolean): Promise<number | undefined>;
  startKvman(handlers: ProcessHandlers): KvmanProcess;
  askTrust(versions: TrustVersion[]): Promise<boolean>;
  isAlive(port: number): Promise<boolean>;
  openExternal(url: string): void;
  openLog(): void;
  openSettings(url: string): void;
  sendToFrame(message: FrameMessage): void;
  report(error: unknown): void;
};

export class Controller {
  readonly #session: Session;
  readonly #host: Host;
  #process: KvmanProcess | undefined;
  #run = 0;
  #shown: string | undefined;

  constructor(session: Session, host: Host) {
    this.#session = session;
    this.#host = host;
  }

  happen(happening: Happening): void {
    const effects = this.#session.handle(happening);
    this.#render();
    for (const effect of effects) this.#apply(effect);
  }

  // Setting a webview's page reloads it, so the frame is set only when the view changed.
  #render(): void {
    const view = this.#session.view;
    const key = JSON.stringify(view);
    if (key === this.#shown) return;
    this.#shown = key;
    this.#host.render(view);
  }

  #later<Value>(work: Promise<Value>, next: (value: Value) => Happening | undefined): void {
    work.then(
      (value) => {
        const happening = next(value);
        if (happening !== undefined) this.happen(happening);
      },
      (error: unknown) => this.#host.report(error),
    );
  }

  #apply(effect: Effect): void {
    switch (effect.kind) {
      case 'checkVersion':
        return this.#later(this.#host.runVersion(), (output) => ({ kind: 'versionAnswered', output }));
      case 'install':
        return this.#later(this.#host.runInstall(effect.update), (code) => ({ kind: 'installEnded', code }));
      case 'start':
        return this.#start();
      case 'askTrust':
        return this.#later(this.#host.askTrust(effect.versions), (accepted) => ({ kind: 'trustAnswered', accepted }));
      case 'write':
        return this.#process?.write(effect.text);
      case 'closeInput':
        return this.#process?.closeInput();
      case 'checkHealth':
        return this.#later(this.#host.isAlive(effect.port), (alive) => ({ kind: 'healthAnswered', alive }));
      case 'openExternal':
        return this.#host.openExternal(effect.url);
      case 'openLog':
        return this.#host.openLog();
      case 'openSettings':
        return this.#host.openSettings(effect.url);
      case 'sendToFrame':
        return this.#host.sendToFrame(effect.message);
    }
  }

  #start(): void {
    this.#run += 1;
    const run = this.#run;
    const current = (): boolean => run === this.#run;
    this.#process = this.#host.startKvman({
      line: (text) => {
        if (!current()) return;
        const line = readLine(text);
        this.happen(line === undefined ? { kind: 'unreadable' } : { kind: 'line', line });
      },
      exited: () => {
        if (current()) this.happen({ kind: 'exited' });
      },
    });
  }
}
