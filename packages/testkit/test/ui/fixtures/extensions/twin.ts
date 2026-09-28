import { defineExtension } from '@kvman/sdk';

// Twin (@acme/route-twin): a page on /kit, clashing with Kit's page in the same workspace.
export default defineExtension({ name: '@acme/route-twin', namespace: 'route-twin', title: 'Twin', description: 'A page on the kit route.' }, (ext) => {
  ext.registerPage('route-twin.home', {
    description: 'The twin home page.', route: '/kit', title: 'Twin',
    view: { type: 'stack', children: [{ type: 'text', text: 'Twin home.' }] },
  });
});
