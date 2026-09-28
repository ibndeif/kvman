import { defineExtension, z } from '@kvman/sdk';

// Chain 3 (E28): a public composite nesting chain-2.box, requiring it.
export default defineExtension({ name: '@acme/chain-3', namespace: 'chain-3', title: 'Chain 3', description: 'The third link of the composite chain.' }, (ext) => {
  ext.requireComponents(['chain-2.box'], { reason: 'Nests the previous box.' });
  ext.registerComponent('chain-3.box', {
    description: 'Chain box 3.', visibility: 'public',
    props: z.object({ label: z.string() }),
    view: { type: 'chain-2.box', label: '$props.label' },
  });
});
