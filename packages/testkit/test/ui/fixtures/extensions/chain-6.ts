import { defineExtension, z } from '@kvman/sdk';

// Chain 6 (E28): a public composite nesting chain-5.box, requiring it.
export default defineExtension({ name: '@acme/chain-6', namespace: 'chain-6', title: 'Chain 6', description: 'The sixth link of the composite chain.' }, (ext) => {
  ext.requireComponents(['chain-5.box'], { reason: 'Nests the previous box.' });
  ext.registerComponent('chain-6.box', {
    description: 'Chain box 6.', visibility: 'public',
    props: z.object({ label: z.string() }),
    view: { type: 'chain-5.box', label: '$props.label' },
  });
});
