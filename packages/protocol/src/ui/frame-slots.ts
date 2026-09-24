import { z } from 'zod';

export const contributionKindSchema = z.enum([
  'page', 'navGroup', 'navItem', 'separator', 'toolbarItem', 'statusItem', 'panel', 'action', 'renderer', 'component', 'settingsSection',
]);
export type ContributionKind = z.infer<typeof contributionKindSchema>;

export const frameSlotSchema = z.strictObject({
  name: z.string().regex(/^frame\.[a-z]+(?:\.[a-z]+)?$/),
  description: z.string().min(1),
  accepts: z.array(contributionKindSchema).min(1),
  max: z.number().int().positive().optional(),
});
export type FrameSlot = z.infer<typeof frameSlotSchema>;

export const frameSlots: readonly FrameSlot[] = [
  { name: 'frame.sidebar', description: 'The sidebar: nav groups, nav items, and separators; it scrolls.', accepts: ['navGroup', 'navItem', 'separator'] },
  { name: 'frame.topbar.start', description: 'Toolbar items at the start of the top bar.', accepts: ['toolbarItem'], max: 3 },
  { name: 'frame.topbar.end', description: 'Toolbar items at the end of the top bar; the rest go into a More menu.', accepts: ['toolbarItem'], max: 4 },
  { name: 'frame.main', description: 'Pages, by route, in the main pane and the side pane.', accepts: ['page'], max: 2 },
  { name: 'frame.statusbar.start', description: 'Status items at the start of the status bar; the rest go into a popover.', accepts: ['statusItem'], max: 6 },
  { name: 'frame.statusbar.end', description: 'Status items at the end of the status bar; the rest go into a popover.', accepts: ['statusItem'], max: 6 },
  { name: 'frame.overlay', description: 'Panels over every page, one shown at a time with a stepper.', accepts: ['panel'], max: 1 },
];
