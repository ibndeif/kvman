import { defineExtension, z } from '@kvman/sdk';

// Chain 5 (E28): a public composite nesting chain-4.box, requiring it.
export default defineExtension({ name: '@acme/chain-5', namespace: 'chain-5', title: 'Chain 5', description: 'The fifth link of the composite chain.' }, (ext) => {
  ext.requireComponents(['chain-4.box'], { reason: 'Nests the previous box.' });
  ext.registerComponent('chain-5.box', {
    description: 'Chain box 5.', visibility: 'public',
    props: z.object({ label: z.string() }),
    view: { type: 'chain-4.box', label: '$props.label' },
  });
});
