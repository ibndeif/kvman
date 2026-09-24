import { z } from 'zod';
import { liveAddressPattern, typeNamePattern, typePatternPattern } from './naming/name-patterns.ts';

export const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/, 'expected a ULID');

export const workspaceIdSchema = z.string().regex(/^[0-9a-f]{64}$/, 'expected a workspace id (64 lowercase hex characters)');

export const epochMsSchema = z.number().int().nonnegative();

export const typeNameSchema = z.string().regex(typeNamePattern, 'expected a message type such as "pdf.translate"');

export const typePatternSchema = z.string().regex(typePatternPattern, 'expected a message type or a "<prefix>.*" pattern');

export const liveAddressSchema = z.string().regex(liveAddressPattern, 'expected a live event address "<event type>:<key>"');
