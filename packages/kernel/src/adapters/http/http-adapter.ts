import { fastify, type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { KernelLogger } from '../../hosts/kernel-logger.ts';
import { maxPayloadBytes } from '../../router/admission-context.ts';
import type { KernelRuntime } from '../../runtime/kernel-runtime.ts';
import type { SchedulerTimers } from '../../scheduler/timers.ts';
import type { UlidGenerator } from '../../ulid.ts';
import { bindPort, type PortChoice } from '../../daemon/port-binding.ts';
import type { EventHub } from '../events/event-hub.ts';
import { registerBlobRoutes } from './blob-routes.ts';
import { registerCommandRoutes, type WaitingCommand } from './command-routes.ts';
import { edgeRefusal } from './edge-checks.ts';
import { EdgeProblems, sendProblem } from './problem-replies.ts';
import { registerReadRoutes } from './read-routes.ts';
import { registerStreamRoutes } from './stream-routes.ts';
import { registerUiRoutes } from './ui-routes.ts';

// What the routes reach once boot has finished (03 §3.9 step 8).
export type AdapterKernel = { runtime: KernelRuntime; hub: EventHub };

export type HttpAdapterOptions = { ids: UlidGenerator; timers: SchedulerTimers; logger: KernelLogger };

// What every route module shares.
export type RouteContext = {
  kernel(): AdapterKernel;
  problems: EdgeProblems;
  timers: SchedulerTimers;
  waiting: Set<WaitingCommand>;
};

// A 16 MB payload fits with its envelope; a larger body is PAYLOAD_TOO_LARGE before it is parsed (ADR 0055).
const bodyLimitBytes = maxPayloadBytes + 64 * 1024;

const healthRoute = '/api/v1/health';

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value.join(',') : value;
}

// The HTTP adapter (12 §12.2, §12.8): it binds before the lock is written, holds every request until boot has
// finished, checks Host, Origin, and Sec-Fetch-Site before anything else, and refuses new work once shutdown starts.
export class HttpAdapter {
  readonly #app: FastifyInstance;
  readonly #options: HttpAdapterOptions;
  readonly #problems: EdgeProblems;
  readonly #waiting = new Set<WaitingCommand>();
  readonly #booted: Promise<void>;
  #finishBoot: () => void = () => undefined;
  #kernel: AdapterKernel | undefined;
  #port = 0;
  #stopping = false;

  constructor(options: HttpAdapterOptions) {
    this.#options = options;
    this.#problems = new EdgeProblems(options.ids);
    this.#booted = new Promise((resolve) => {
      this.#finishBoot = resolve;
    });
    this.#app = fastify({ logger: false, bodyLimit: bodyLimitBytes, return503OnClosing: false });
    this.#app.addHook('onRequest', (request, reply) => this.#admit(request, reply));
    this.#app.addHook('onResponse', async (request, reply) => this.#logRequest(request, reply));
    this.#app.setErrorHandler((error: FastifyError, _request, reply) => this.#failed(error, reply));
    this.#app.setNotFoundHandler((_request, reply) => sendProblem(reply, this.#problems.refused('NOT_FOUND', 'no such route')));
    const context: RouteContext = { kernel: () => this.#attached(), problems: this.#problems, timers: options.timers, waiting: this.#waiting };
    registerCommandRoutes(this.#app, context);
    registerReadRoutes(this.#app, context);
    registerUiRoutes(this.#app, context);
    registerStreamRoutes(this.#app, context);
    registerBlobRoutes(this.#app, context);
  }

  get port(): number {
    return this.#port;
  }

  async bind(choice: PortChoice, correlationId: string): Promise<number> {
    await this.#app.ready();
    this.#port = await bindPort(this.#app.server, choice, correlationId);
    return this.#port;
  }

  // Boot finished: held requests go on (03 §3.9 step 8).
  open(kernel: AdapterKernel): void {
    this.#kernel = kernel;
    this.#finishBoot();
  }

  // Shutdown's first step (ADR 0090): new work is KERNEL_STOPPING; the listener stays open so /health still answers.
  stopAdmitting(): void {
    this.#stopping = true;
  }

  // A request still waiting for its reply answers 202 (ADR 0090).
  releaseWaiting(): void {
    for (const waiting of [...this.#waiting]) waiting.release();
  }

  // Requests still held by a boot that failed are refused as stopping.
  async close(): Promise<void> {
    this.#stopping = true;
    this.#finishBoot();
    await this.#app.close();
  }

  async #admit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const refusal = edgeRefusal({
      method: request.method, host: header(request, 'host'), origin: header(request, 'origin'), fetchSite: header(request, 'sec-fetch-site'),
      eventStream: request.url.split('?')[0] === '/api/v1/events',
    }, this.#port);
    if (refusal !== undefined) {
      await sendProblem(reply, this.#problems.refused('HOST_FORBIDDEN', refusal));
      return;
    }
    if (this.#kernel === undefined && !this.#stopping) {
      this.#options.logger.write({
        level: 'debug', message: 'a request waits for boot', fields: { method: request.method, route: request.routeOptions.url ?? 'unmatched' },
        attributes: { correlationId: this.#options.ids.next() },
      });
    }
    await this.#booted;
    const refused = this.#kernel === undefined || (this.#stopping && request.routeOptions.url !== healthRoute);
    if (refused) await sendProblem(reply, this.#problems.refused('KERNEL_STOPPING'));
  }

  // A body over the limit, a body that is not JSON, or one without a JSON content type (12 §12.2, ADR 0094).
  #failed(error: FastifyError, reply: FastifyReply): FastifyReply {
    if (error.statusCode === 413) return sendProblem(reply, this.#problems.tooLarge(maxPayloadBytes));
    if (error.statusCode === 400 || error.statusCode === 415) return sendProblem(reply, this.#problems.invalid(error.message));
    this.#options.logger.write({ level: 'error', message: 'an HTTP route failed', fields: { error: error.name }, attributes: { correlationId: this.#options.ids.next() } });
    return sendProblem(reply, this.#problems.refused('INTERNAL'));
  }

  // 13 §13.3, ADR 0093: method, route pattern, status, and duration; never the query, a header, or the body.
  #logRequest(request: FastifyRequest, reply: FastifyReply): void {
    this.#options.logger.write({
      level: 'info', message: 'request',
      fields: { method: request.method, route: request.routeOptions.url ?? 'unmatched', status: reply.statusCode, durationMs: Math.round(reply.elapsedTime) },
      attributes: { correlationId: this.#options.ids.next() },
    });
  }

  #attached(): AdapterKernel {
    if (this.#kernel === undefined) throw new Error('a route ran before boot finished');
    return this.#kernel;
  }
}
