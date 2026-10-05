import { z, type Ctx, type Stored } from '@kvman/sdk';
import { invalid, tooLarge } from '../problems.ts';
import type { SectionDoc } from '../schemas/registry.ts';
import { findSession } from '../sessions/session-lookup.ts';
import { records, txRecords, type TxRecords } from '../store/collections.ts';
import { callerExtension, loadedOwners } from './loaded.ts';

// Sections (plan 08 §8.4, ADR 0009, 94): text in the system prompt, pushed by their owner. A global section is in every
// workspace's prompts, a session's only in that session's, and any other in its workspace's. Ids belong to their owner.

export const sectionLimit = 16 * 1024;
export const sectionsLimit = 64 * 1024;

/** A section as a prompt sees it. */
export type Section = { id: string; title: string; order: number; owner: string; global: boolean; sessionId: string | null; content: string; size: number };

const size = (content: string): number => Buffer.byteLength(content, 'utf8');

function sectionOf(doc: SectionDoc, global: boolean): Section {
  return { id: doc.sectionId, title: doc.title, order: doc.order, owner: doc.owner, global, sessionId: doc.sessionId, content: doc.content, size: size(doc.content) };
}

/** The sections a session's prompt reaches, by `order`, with entries of unloaded owners left out. */
export async function sectionsFor(ctx: Ctx, sessionId: string | null): Promise<Section[]> {
  const store = records(ctx.store);
  const global = (await store.globalSections.find({}, { limit: 1000 })).map((doc) => sectionOf(doc, true));
  const local = (await store.sections.find({ sessionId: null }, { limit: 1000 })).map((doc) => sectionOf(doc, false));
  const own = sessionId === null ? [] : (await store.sections.find({ sessionId }, { limit: 1000 })).map((doc) => sectionOf(doc, false));
  const sections = [...global, ...local, ...own];
  const loaded = await loadedOwners(ctx, sections.map((section) => section.owner));
  return sections
    .filter((section) => loaded.has(section.owner))
    .sort((first, second) => first.order - second.order || first.owner.localeCompare(second.owner) || first.id.localeCompare(second.id));
}

type Place = { global: boolean; sessionId: string | null };

function collectionFor(tx: TxRecords, place: Place) {
  return place.global ? tx.globalSections : tx.sections;
}

function findOwn(tx: TxRecords, owner: string, id: string, place: Place): Stored<SectionDoc> | undefined {
  return collectionFor(tx, place).find({ owner, sectionId: id, sessionId: place.sessionId }, { limit: 1 })[0];
}

// The sections that would share a prompt with one at `place`: global, the workspace's, and the session's (ADR 0009, 94).
function sharedTotal(tx: TxRecords, place: Place, replaced: Stored<SectionDoc> | undefined): number {
  const docs = [...tx.globalSections.find({}, { limit: 1000 }), ...tx.sections.find({ sessionId: null }, { limit: 1000 }), ...(place.sessionId === null ? [] : tx.sections.find({ sessionId: place.sessionId }, { limit: 1000 }))];
  return docs.filter((doc) => doc.id !== replaced?.id).reduce((total, doc) => total + size(doc.content), 0);
}

const placeSchema = { global: z.boolean().exactOptional(), sessionId: z.string().min(1).exactOptional() };

async function placeOf(ctx: Ctx, input: { global?: boolean | undefined; sessionId?: string | undefined }): Promise<Place> {
  if (input.global === true && input.sessionId !== undefined) throw invalid('A section is global or a session\'s, not both.');
  if (input.sessionId !== undefined) await findSession(ctx, input.sessionId);
  return { global: input.global === true, sessionId: input.sessionId ?? null };
}

export function registerSections(ctx: Ctx): void {
  ctx.registerCommand('kvcoder.section.set', {
    description: "Sets one of the caller's sections of the system prompt.",
    input: z.object({ id: z.string().min(1), title: z.string().min(1), order: z.number(), content: z.string(), ...placeSchema }),
    output: z.object({}),
    public: true,
    handle: async (input) => {
      const owner = callerExtension(ctx, 'sections');
      const place = await placeOf(ctx, input);
      if (size(input.content) > sectionLimit) throw tooLarge(`The section ${input.id} is over ${sectionLimit} bytes.`, sectionLimit);
      await ctx.store.transaction((tx) => {
        const store = txRecords(tx);
        const existing = findOwn(store, owner, input.id, place);
        if (sharedTotal(store, place, existing) + size(input.content) > sectionsLimit) throw tooLarge(`The sections of a prompt would pass ${sectionsLimit} bytes.`, sectionsLimit);
        const doc = { owner, sectionId: input.id, title: input.title, order: input.order, content: input.content, sessionId: place.sessionId };
        if (existing === undefined) collectionFor(store, place).insert(doc);
        else collectionFor(store, place).update(existing.id, doc);
      });
      return {};
    },
  });
  ctx.registerCommand('kvcoder.section.remove', {
    description: "Removes one of the caller's sections; a missing one does nothing.",
    input: z.object({ id: z.string().min(1), ...placeSchema }),
    output: z.object({}),
    public: true,
    handle: async (input) => {
      const owner = callerExtension(ctx, 'sections');
      const place = await placeOf(ctx, input);
      await ctx.store.transaction((tx) => {
        const store = txRecords(tx);
        const existing = findOwn(store, owner, input.id, place);
        if (existing !== undefined) collectionFor(store, place).delete(existing.id);
      });
      return {};
    },
  });
  ctx.registerQuery('kvcoder.section.list', {
    description: "Lists the sections a session's prompt reaches, or the workspace's without a session.",
    input: z.object({ sessionId: z.string().min(1).exactOptional() }),
    output: z.array(z.object({ id: z.string(), title: z.string(), order: z.number(), owner: z.string(), global: z.boolean(), sessionId: z.string().exactOptional(), size: z.number() })),
    public: true,
    handle: async ({ sessionId }) => {
      if (sessionId !== undefined) await findSession(ctx, sessionId);
      return (await sectionsFor(ctx, sessionId ?? null)).map(({ id, title, order, owner, global, sessionId: own, size: bytes }) => ({ id, title, order, owner, global, ...(own === null ? {} : { sessionId: own }), size: bytes }));
    },
  });
}
