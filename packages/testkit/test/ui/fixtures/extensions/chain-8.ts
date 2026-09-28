import { defineExtension, z } from '@kvman/sdk';

// Chain 8 (E28): a public composite nesting chain-7.box, requiring it.
export default defineExtension({ name: '@acme/chain-8', namespace: 'chain-8', title: 'Chain 8', description: 'The eighth link of the composite chain.' }, (ext) => {
  ext.requireComponents(['chain-7.box'], { reason: 'Nests the previous box.' });
  ext.registerComponent('chain-8.box', {
    description: 'Chain box 8.', visibility: 'public',
    props: z.object({ label: z.string() }),
    view: { type: 'chain-7.box', label: '$props.label' },
  });
});
