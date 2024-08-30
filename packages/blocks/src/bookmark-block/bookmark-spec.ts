import { BookmarkBlockSchema } from '@blocksuite/affine-model';
import { type BlockSpec, FlavourExtension } from '@blocksuite/block-std';
import { literal } from 'lit/static-html.js';

import './bookmark-edgeless-block.js';
import { BookmarkBlockService } from './bookmark-service.js';
import { commands } from './commands/index.js';

export const BookmarkBlockSpec: BlockSpec = {
  schema: BookmarkBlockSchema,
  view: {
    component: model =>
      model.parent?.flavour === 'affine:surface'
        ? literal`affine-edgeless-bookmark`
        : literal`affine-bookmark`,
  },
  commands,
  extensions: [FlavourExtension('affine:bookmark'), BookmarkBlockService],
};
