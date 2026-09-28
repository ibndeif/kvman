import { defineExtension, z } from '@kvman/sdk';

// Chain 9 (E28): a public composite nesting chain-8.box, requiring it; enabling it nests 9 composite levels.
export default defineExtension({ name: '@acme/chain-9', namespace: 'chain-9', title: 'Chain 9', description: 'The ninth link of the composite chain.' }, (ext) => {
  ext.requireComponents(['chain-8.box'], { reason: 'Nests the previous box.' });
  ext.registerComponent('chain-9.box', {
    description: 'Chain box 9.', visibility: 'public',
    props: z.object({ label: z.string() }),
    view: { type: 'chain-8.box', label: '$props.label' },
  });
});
