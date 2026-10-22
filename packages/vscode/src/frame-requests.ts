// What the person asks of the frame (plan 15 §15.2, §15.4, and §15.6; ADR 0100, 22, 23, and 28; ADR 0101, 5): Open in
// browser and Settings need kvman's port and the frame's workspace (its latest `kvman.state`, else the start workspace);
// the pages menu, inserted text, and New need a frame that has said `kvman.state`. What can't be done yet waits, and each
// new frame waits for its own `kvman.state`. The New button shows while a ready frame offers it.

export type FrameMessage = { kind: 'kvman.pages' } | { kind: 'kvman.new' } | { kind: 'kvman.insert'; text: string };
export type FrameEffect = { kind: 'openExternal'; url: string } | { kind: 'openSettings'; url: string } | { kind: 'sendToFrame'; message: FrameMessage } | { kind: 'setCanNew'; value: boolean };
export type PageRequest = 'browser' | 'settings';

export class FrameRequests {
  #port: number | undefined;
  #startWorkspace = 'home';
  #workspace: string | undefined;
  #ready = false;
  #offersNew = false;
  #canNew = false;
  #asked = new Set<PageRequest>();
  #inserts: string[] = [];

  /** A `running` or `joined` line framed kvman at `url` in a new frame. */
  shown(url: string, port: number): FrameEffect[] {
    this.#port = port;
    this.#startWorkspace = new URL(url).searchParams.get('workspace') ?? 'home';
    return this.lost();
  }

  /** The frame said its workspace: the inserted text that waited is sent. */
  stated(workspaceId: string): FrameEffect[] {
    this.#workspace = workspaceId;
    this.#ready = true;
    const inserts = this.#inserts.splice(0).map((text): FrameEffect => ({ kind: 'sendToFrame', message: { kind: 'kvman.insert', text } }));
    return [...inserts, ...this.#newButton()];
  }

  /** kvman is gone, or a new frame is loading, so the frame takes nothing until it says its workspace. */
  lost(): FrameEffect[] {
    this.#ready = false;
    this.#offersNew = false;
    return this.#newButton();
  }

  /** The frame said whether it offers New. */
  offers(offersNew: boolean): FrameEffect[] {
    this.#offersNew = offersNew;
    return this.#newButton();
  }

  ask(request: PageRequest): void {
    this.#asked.add(request);
  }

  /** The pages asked for, now that kvman answers on its port. */
  flush(): FrameEffect[] {
    const port = this.#port;
    if (port === undefined) return [];
    const workspace = encodeURIComponent(this.#workspace ?? this.#startWorkspace);
    const effects: FrameEffect[] = [];
    if (this.#asked.has('browser')) effects.push({ kind: 'openExternal', url: `http://127.0.0.1:${String(port)}/?workspace=${workspace}` });
    if (this.#asked.has('settings')) effects.push({ kind: 'openSettings', url: `http://127.0.0.1:${String(port)}/kvwebui/settings?workspace=${workspace}&embed=parent` });
    this.#asked.clear();
    return effects;
  }

  /** Inserted text goes to a frame that is ready, and otherwise waits for one. */
  insert(text: string): FrameEffect[] {
    if (this.#ready) return [{ kind: 'sendToFrame', message: { kind: 'kvman.insert', text } }];
    this.#inserts.push(text);
    return [];
  }

  pages(): FrameEffect[] {
    return this.#ready ? [{ kind: 'sendToFrame', message: { kind: 'kvman.pages' } }] : [];
  }

  pressNew(): FrameEffect[] {
    return this.#canNew ? [{ kind: 'sendToFrame', message: { kind: 'kvman.new' } }] : [];
  }

  get ready(): boolean {
    return this.#ready;
  }

  // The button's state changes only when a ready frame starts or stops offering New.
  #newButton(): FrameEffect[] {
    const canNew = this.#ready && this.#offersNew;
    if (canNew === this.#canNew) return [];
    this.#canNew = canNew;
    return [{ kind: 'setCanNew', value: canNew }];
  }
}
