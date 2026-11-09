import { defineComponent } from 'vue';

// OpenUI's items (TabItem, AccordionItem, StepsItem, FollowUpItem, SectionItem) draw nothing alone; their parent reads
// their props. OpenUI gives each `component: () => null`, so the renderer table gives them this same empty shape.
export const NullRenderer = defineComponent({ name: 'OpenuiNullRenderer', setup: () => () => null });
