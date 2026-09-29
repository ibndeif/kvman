import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import type { Sender } from '@kvman/kernel';
import type { BlobInfo, Json } from '@kvman/protocol';
import { parsedPoint, type CrashPoint, type CrashPoints } from './crash-points.ts';
import { command, driver, person, query, replyValue, submit } from './kernel-calls.ts';
import { recordEvents, uiSends, untilIdle, UnregisteredCodeReports, type RecordedEvent, type RecordedUiSend } from './recorders.ts';
import { openRuntime, stopRuntime, type OpenRuntime, type RuntimeSettings } from './test-runtime.ts';
import { TestkitError } from './testkit-errors.ts';

/** Commands and queries sent by one sender in the test workspace; a problem reply is thrown as `TestkitProblem`. */
export interface TestSender {
  /** Sends a command and answers its reply's value. */
  command(type: string, payload?: Json): Promise<Json>;
  /** Runs a query and answers its value. */
  query(type: string, payload?: Json): Promise<Json>;
}

export type TestKernelParts = { open: OpenRuntime; settings: RuntimeSettings; crashes: CrashPoints; workspaceId: string; temporary: string[] };

/** A running test kernel (05 §5.10, ADR 0165): the real kernel on a temporary home, with one open workspace. */
export class TestKernel implements TestSender {
  /** The id of the workspace every call sends in. */
  readonly workspaceId: string;
  #open: OpenRuntime;
  readonly #settings: RuntimeSettings;
  readonly #crashes: CrashPoints;
  readonly #temporary: string[];
  readonly #events: RecordedEvent[] = [];
  readonly #reports: UnregisteredCodeReports;
  #unobserve: () => void;
  #closed = false;

  constructor(parts: TestKernelParts) {
    this.workspaceId = parts.workspaceId;
    this.#open = parts.open;
    this.#settings = parts.settings;
    this.#crashes = parts.crashes;
    this.#temporary = parts.temporary;
    this.#reports = new UnregisteredCodeReports(parts.settings.logged);
    this.#unobserve = recordEvents(parts.open.runtime, this.#events);
  }

  /** Sends as the person (`user:local`); with `locale`, that language is saved first, as the shell's switch does. */
  asUser(options: { locale?: string } = {}): TestSender {
    const withLocale = async (): Promise<void> => {
      const { locale } = options;
      if (locale === undefined || locale === this.#open.runtime.preferences.locale()) return;
      await command(this.#open.runtime, person, 'kernel.user.preferences.set', { locale }, this.workspaceId);
    };
    return {
      command: (type, payload = {}) => this.#settled(withLocale().then(() => command(this.#open.runtime, person, type, payload, this.workspaceId))),
      query: (type, payload = {}) => this.#settled(withLocale().then(() => query(this.#open.runtime, person, type, payload, this.workspaceId))),
    };
  }

  /** Sends a command as the testkit's driver extension, whose `calls` cover the extensions under test. */
  command(type: string, payload: Json = {}): Promise<Json> {
    return this.#settled(command(this.#open.runtime, driver, type, payload, this.workspaceId));
  }

  /** Runs a query as the driver extension. */
  query(type: string, payload: Json = {}): Promise<Json> {
    return this.#settled(query(this.#open.runtime, driver, type, payload, this.workspaceId));
  }

  /** The committed durable and transient events, oldest first, optionally of one type. */
  events(type?: string): RecordedEvent[] {
    this.#check();
    return this.#events.filter((event) => type === undefined || event.type === type);
  }

  /** The admitted `ui.*` sends, oldest first, optionally of one type. */
  ui(type?: RecordedUiSend['type']): RecordedUiSend[] {
    this.#check();
    return uiSends(this.#open.connection).filter((send) => type === undefined || send.type === type);
  }

  /** Blob uploads, as `PUT /blobs` stores them for the test workspace. */
  get blobs(): { put(bytes: Uint8Array, options: { mime: string }): Promise<BlobInfo> } {
    return {
      put: async (bytes, options) => {
        const { files } = this.#open.runtime;
        const intake = await files.store.intake();
        await intake.write(bytes);
        return files.upload(await intake.finish(), { mime: options.mime }, this.workspaceId);
      },
    };
  }

  /** Sends a command as the driver, stops the kernel abruptly when it reaches `point`, restarts it, and answers the reply. */
  crashDuring(type: string, point: CrashPoint, payload: Json = {}): Promise<Json> {
    return this.#settled(this.#crashDuring(type, point, payload));
  }

  /** Resolves once no message is due or running; deferred replies and delayed messages do not count. */
  idle(): Promise<void> {
    return this.#settled(untilIdle(this.#open.runtime, this.#open.connection));
  }

  /** Waits until idle, stops the kernel, deletes its temporary folders, and throws for any unregistered code no call reported. */
  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await untilIdle(this.#open.runtime, this.#open.connection);
    this.#unobserve();
    await stopRuntime(this.#open);
    for (const folder of this.#temporary) rmSync(folder, { recursive: true, force: true });
    this.#check();
  }

  async #crashDuring(type: string, point: CrashPoint, payload: Json): Promise<Json> {
    const parsed = parsedPoint(point);
    const idempotencyKey = randomUUID();
    const reached = new Promise<boolean>((resolve) => {
      this.#crashes.arm({ idempotencyKey, point: parsed, crash: () => resolve(true), missed: () => resolve(false) });
    });
    const messageId = await this.#send(driver, type, payload, idempotencyKey);
    if (!(await reached)) {
      await this.#open.runtime.awaitReply(messageId);
      throw new TestkitError(`${type} ended without reaching ${point}: the point was never reached`);
    }
    await this.#restart();
    return replyValue(this.#open.runtime, messageId);
  }

  async #send(sender: Sender, type: string, payload: Json, idempotencyKey: string): Promise<string> {
    try {
      return await submit(this.#open.runtime, sender, type, payload, this.workspaceId, idempotencyKey);
    } catch (error) {
      this.#crashes.disarm();
      throw error;
    }
  }

  // ADR 0166: the crash leaves what a SIGKILL leaves; the new runtime recovers it like any restart.
  async #restart(): Promise<void> {
    this.#unobserve();
    await stopRuntime(this.#open);
    this.#open = await openRuntime(this.#settings);
    this.#unobserve = recordEvents(this.#open.runtime, this.#events);
  }

  #check(): void {
    const reports = this.#reports.take();
    if (reports.length > 0) throw this.#reports.error(reports);
  }

  async #settled<Value>(work: Promise<Value>): Promise<Value> {
    let value: Value;
    try {
      value = await work;
    } catch (error) {
      const reports = this.#reports.take();
      throw reports.length > 0 ? this.#reports.error(reports, error) : error;
    }
    this.#check();
    return value;
  }
}
