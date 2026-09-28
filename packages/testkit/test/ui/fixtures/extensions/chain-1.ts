import { defineExtension, z } from '@kvman/sdk';

// Chain 1 (E28): the leaf of the nine-composite chain, using no other composite.
export default defineExtension({ name: '@acme/chain-1', namespace: 'chain-1', title: 'Chain 1', description: 'The leaf of the composite chain.' }, (ext) => {
  ext.registerComponent('chain-1.box', {
    description: 'Chain box 1.', visibility: 'public',
    props: z.object({ label: z.string() }),
    view: { type: 'text', text: '$props.label' },
  });
});
