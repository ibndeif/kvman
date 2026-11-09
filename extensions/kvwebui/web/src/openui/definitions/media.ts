import { z } from 'zod/v4';
import { defineOpenuiComponent } from './define.ts';

// OpenUI's image components (plan 06 §6.1, ADR 0124, 4, 7, 11): OpenUI's names, schemas, and descriptions.

export const image = defineOpenuiComponent('Image', z.object({ alt: z.string(), src: z.string().optional() }), 'Image with alt text and optional URL');

export const imageBlock = defineOpenuiComponent('ImageBlock', z.object({ src: z.string(), alt: z.string().optional() }), 'Image block with loading state');

export const imageGallery = defineOpenuiComponent(
  'ImageGallery',
  z.object({ images: z.array(z.object({ src: z.string(), alt: z.string().optional(), details: z.string().optional() })) }),
  'Gallery grid of images with modal preview',
);

export type ImageProps = z.infer<typeof image.props>;
export type ImageBlockProps = z.infer<typeof imageBlock.props>;
export type ImageGalleryProps = z.infer<typeof imageGallery.props>;
