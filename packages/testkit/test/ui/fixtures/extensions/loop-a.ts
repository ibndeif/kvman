import { defineExtension, z } from '@kvman/sdk';

// Loop A (@acme/loop-a): a public composite using Loop B's, requiring it.
export default defineExtension({ name: '@acme/loop-a', namespace: 'loop-a', title: 'Loop A', description: 'Half of the composite cycle.' }, (ext) => {
  ext.requireComponents(['loop-b.box'], { reason: 'Nests the other box.' });
  ext.registerComponent('loop-a.box', {
    description: 'Loop A box.', visibility: 'public',
    props: z.object({ label: z.string() }),
    view: { type: 'loop-b.box', label: '$props.label' },
  });
});
