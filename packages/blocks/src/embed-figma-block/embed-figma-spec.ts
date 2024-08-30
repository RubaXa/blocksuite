import { EmbedFigmaBlockSchema } from '@blocksuite/affine-model';
import { type BlockSpec, FlavourExtension } from '@blocksuite/block-std';
import { literal } from 'lit/static-html.js';

import './embed-edgeless-figma-block.js';
import { EmbedFigmaBlockService } from './embed-figma-service.js';

export const EmbedFigmaBlockSpec: BlockSpec = {
  schema: EmbedFigmaBlockSchema,
  view: {
    component: model => {
      return model.parent?.flavour === 'affine:surface'
        ? literal`affine-embed-edgeless-figma-block`
        : literal`affine-embed-figma-block`;
    },
  },
  extensions: [FlavourExtension('affine:embed-figma'), EmbedFigmaBlockService],
};
