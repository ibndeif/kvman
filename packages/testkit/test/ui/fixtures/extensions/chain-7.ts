import { defineExtension, z } from '@kvman/sdk';

// Chain 7 (E28): a public composite nesting chain-6.box, requiring it.
export default defineExtension({ name: '@acme/chain-7', namespace: 'chain-7', title: 'Chain 7', description: 'The seventh link of the composite chain.' }, (ext) => {
  ext.requireComponents(['chain-6.box'], { reason: 'Nests the previous box.' });
  ext.registerComponent('chain-7.box', {
    description: 'Chain box 7.', visibility: 'public',
    props: z.object({ label: z.string() }),
    view: { type: 'chain-6.box', label: '$props.label' },
  });
});
