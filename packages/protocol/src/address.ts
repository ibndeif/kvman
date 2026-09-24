import { z } from 'zod';

const packageName = z.string().regex(/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/);
const identity = z.string().regex(/^[^/:\s]+$/);

export const addressSchema = z.union([
  z.literal('kernel'),
  z.templateLiteral(['ext:', packageName]),
  z.templateLiteral(['user:', identity]),
  z.templateLiteral(['user:', identity, '/client:', identity]),
  z.templateLiteral(['proc:', identity]),
]);

export type Address = z.infer<typeof addressSchema>;
