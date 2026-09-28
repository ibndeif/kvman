import { defineExtension } from '@kvman/sdk';

// Files B (E29): a page on /files/:b, clashing with Files A's wildcard route.
export default defineExtension({ name: '@acme/files-b', namespace: 'files-b', title: 'Files B', description: 'A page on the second files route.' }, (ext) => {
  ext.registerPage('files-b.home', {
    description: 'The Files B home page.', route: '/files/:b', title: 'Files B',
    view: { type: 'stack', children: [{ type: 'text', text: 'Files B.' }] },
  });
});
