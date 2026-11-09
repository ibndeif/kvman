import { z } from 'zod/v4';
import { buttons, iconButton } from './buttons.ts';
import { areaChart, barChart, horizontalBarChart, lineChart, pieChart, radarChart, radialChart, scatterChart, singleStackedBarChart } from './charts.ts';
import { callout, cardHeader, codeBlock, inlineHeader, markDownRenderer, textCallout, textContent } from './content.ts';
import { tagBlock } from './data-display.ts';
import { followUpBlock } from './follow-ups.ts';
import { form } from './forms.ts';
import { entityList, listBlock } from './lists.ts';
import { editableTable, table } from './tables.ts';
import { separator, steps } from './layout-items.ts';

// The unions OpenUI's containers accept (plan 06 §6.1, ADR 0124, 4). Later milestones add their members in OpenUI's
// order; a component a milestone hasn't built is left out, so the reference names only built components.

export const contentChildUnion = z.union([
  textContent.props,
  markDownRenderer.props,
  cardHeader.props,
  callout.props,
  textCallout.props,
  codeBlock.props,
  separator.props,
  horizontalBarChart.props,
  radarChart.props,
  pieChart.props,
  radialChart.props,
  singleStackedBarChart.props,
  scatterChart.props,
  areaChart.props,
  barChart.props,
  lineChart.props,
  table.props,
  tagBlock.props,
  form.props,
  buttons.props,
  iconButton.props,
  steps.props,
  inlineHeader.props,
  entityList.props,
  editableTable.props,
]);

/** The chat content union without the section block, which holds the containers that would close the circle. */
export const chatNestedContentUnion = z.union([...contentChildUnion.options, listBlock.props, followUpBlock.props]);
