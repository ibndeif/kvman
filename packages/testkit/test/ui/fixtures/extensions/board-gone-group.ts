import { defineExtension } from '@kvman/sdk';
import { registerBoard } from './board-common.ts';

export default defineExtension({ name: '@acme/board', namespace: 'board', title: '$t.meta.title', description: 'Board UI fixture with a missing group.' }, (ext) => registerBoard(ext, { missingGroup: true }));
