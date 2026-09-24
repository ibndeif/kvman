import { actionSchema } from './action.ts';
import { viewTextSchema } from './bound-values.ts';

export const textPropFormat = 'kvman-text';
export const actionPropFormat = 'kvman-action';

export const textPropSchema = viewTextSchema.meta({ format: textPropFormat });

export const actionPropSchema = actionSchema.meta({ format: actionPropFormat });
