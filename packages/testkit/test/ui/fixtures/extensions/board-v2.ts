import { defineExtension } from '@kvman/sdk';
import { registerBoard } from './board-common.ts';

export default defineExtension({ name: '@acme/board', namespace: 'board', title: '$t.meta.title', description: 'Board UI fixture, second version.' }, (ext) => registerBoard(ext, { share: true }));
