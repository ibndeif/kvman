import { defineExtension, z } from '@kvman/sdk';

// Chain 4 (E28): a public composite nesting chain-3.box, requiring it.
export default defineExtension({ name: '@acme/chain-4', namespace: 'chain-4', title: 'Chain 4', description: 'The fourth link of the composite chain.' }, (ext) => {
  ext.requireComponents(['chain-3.box'], { reason: 'Nests the previous box.' });
  ext.registerComponent('chain-4.box', {
    description: 'Chain box 4.', visibility: 'public',
    props: z.object({ label: z.string() }),
    view: { type: 'chain-3.box', label: '$props.label' },
  });
});
