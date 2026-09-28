import { defineExtension, z } from '@kvman/sdk';

// Chain 2 (E28): a public composite nesting chain-1.box, requiring it.
export default defineExtension({ name: '@acme/chain-2', namespace: 'chain-2', title: 'Chain 2', description: 'The second link of the composite chain.' }, (ext) => {
  ext.requireComponents(['chain-1.box'], { reason: 'Nests the previous box.' });
  ext.registerComponent('chain-2.box', {
    description: 'Chain box 2.', visibility: 'public',
    props: z.object({ label: z.string() }),
    view: { type: 'chain-1.box', label: '$props.label' },
  });
});
