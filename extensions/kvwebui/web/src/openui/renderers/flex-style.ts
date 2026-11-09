import type { StackProps } from '../definitions/layout.ts';

// The flex style OpenUI's containers share (plan 06 §6.1, ADR 0124, 16): OpenUI's spacing and alignment names turned
// into CSS, with each container passing its own defaults.

type FlexProps = Pick<StackProps, 'direction' | 'gap' | 'align' | 'justify' | 'wrap'>;
type Align = NonNullable<FlexProps['align']>;
type Justify = NonNullable<FlexProps['justify']>;
type Gap = NonNullable<FlexProps['gap']>;

export type FlexDefaults = {
  align?: Align;
  justify?: Justify;
  wrap?: 'wrap' | 'nowrap';
  wrapBetweenStart?: boolean;
};

const gaps: Record<Gap, string> = { none: '0px', xs: '4px', s: '8px', m: '12px', l: '16px', xl: '24px', '2xl': '32px' };
const aligns: Record<Align, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', baseline: 'baseline' };
const justifies: Record<Justify, string> = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around', evenly: 'space-evenly' };

/** The style of a flex container, with `defaults` filling in what the caller leaves out. */
export function flexStyle(props: FlexProps, defaults: FlexDefaults = {}): Record<string, string | undefined> {
  const wrapped = props.wrap === true;
  const align = props.align ?? defaults.align;
  const justify = props.justify ?? defaults.justify;
  const spaced = wrapped && defaults.wrapBetweenStart === true && justify === 'between' ? 'start' : justify;
  return {
    display: 'flex',
    flexDirection: props.direction ?? 'column',
    flexWrap: wrapped ? 'wrap' : defaults.wrap,
    gap: gaps[props.gap ?? 'm'],
    alignItems: align === undefined ? undefined : aligns[align],
    justifyContent: spaced === undefined ? undefined : justifies[spaced],
  };
}
