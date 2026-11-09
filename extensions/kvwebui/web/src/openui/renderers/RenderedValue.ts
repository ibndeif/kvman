import type { RenderNodeResult } from '@openuidev/vue-lang';
import { defineComponent, type PropType } from 'vue';

// Renders a child value (an ElementNode, an array of them, or text) with the Renderer's own `renderNode` (plan 06 §6.1).
// A template cannot place the returned VNodes directly, so this tiny component calls it in a render function.

export const RenderedValue = defineComponent({
  name: 'RenderedValue',
  props: {
    value: { type: [String, Number, Boolean, Array, Object] as PropType<unknown>, required: true },
    renderNode: { type: Function as PropType<(value: unknown) => RenderNodeResult>, required: true },
  },
  setup: (props) => () => props.renderNode(props.value),
});
