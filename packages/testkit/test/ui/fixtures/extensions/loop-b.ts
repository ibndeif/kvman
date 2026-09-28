import { defineExtension, z } from '@kvman/sdk';

// Loop B (@acme/loop-b): a public composite using Loop A's, requiring it.
export default defineExtension({ name: '@acme/loop-b', namespace: 'loop-b', title: 'Loop B', description: 'The other half of the composite cycle.' }, (ext) => {
  ext.requireComponents(['loop-a.box'], { reason: 'Nests the other box.' });
  ext.registerComponent('loop-b.box', {
    description: 'Loop B box.', visibility: 'public',
    props: z.object({ label: z.string() }),
    view: { type: 'loop-a.box', label: '$props.label' },
  });
});
