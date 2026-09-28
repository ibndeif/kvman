import { actionSchema } from './action.ts';
import { viewTextSchema } from './bound-values.ts';
import { actionPropFormat, textPropFormat } from './prop-formats.ts';

export { actionPropFormat, textPropFormat };

export const textPropSchema = viewTextSchema;

export const actionPropSchema = actionSchema.meta({ format: actionPropFormat });
