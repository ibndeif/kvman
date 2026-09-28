import { defineExtension } from '@kvman/sdk';

// Files A (E29): a page on /files/:a.
export default defineExtension({ name: '@acme/files-a', namespace: 'files-a', title: 'Files A', description: 'A page on the first files route.' }, (ext) => {
  ext.registerPage('files-a.home', {
    description: 'The Files A home page.', route: '/files/:a', title: 'Files A',
    view: { type: 'stack', children: [{ type: 'text', text: 'Files A.' }] },
  });
});
