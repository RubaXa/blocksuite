import type {
  BeforeinputHookCtx,
  CompositionEndHookCtx,
  HookContext,
} from '@blocksuite/virgo';

import { isStrictUrl } from '../../../utils/url.js';
import type { AffineTextAttributes } from './types.js';

const EDGE_IGNORED_ATTRIBUTES = ['code', 'reference'] as const;
const GLOBAL_IGNORED_ATTRIBUTES = ['reference'] as const;

const autoIdentifyLink = (ctx: HookContext<AffineTextAttributes>) => {
  // auto identify link only on pressing space
  if (ctx.data !== ' ') {
    return;
  }

  // space is typed at the end of link, remove the link attribute on typed space
  if (ctx.attributes?.link) {
    if (ctx.inlineRange.index === ctx.inlineEditor.yText.length) {
      delete ctx.attributes['link'];
    }
    return;
  }

  const [line] = ctx.inlineEditor.getLine(ctx.inlineRange.index);

  const verifyData = line.textContent
    .slice(0, ctx.inlineRange.index)
    .split(' ');

  const verifyStr = verifyData[verifyData.length - 1];

  const isUrl = isStrictUrl(verifyStr);

  if (!isUrl) {
    return;
  }

  const startIndex = ctx.inlineRange.index - verifyStr.length;

  ctx.inlineEditor.formatText(
    {
      index: startIndex,
      length: verifyStr.length,
    },
    {
      link: verifyStr,
    }
  );
};

let ifPrefixSpace = false;
export const onVBeforeinput = (
  ctx: BeforeinputHookCtx<AffineTextAttributes>
) => {
  const { inlineEditor, inlineRange, data, raw } = ctx;
  const deltas = inlineEditor.getDeltasByInlineRange(inlineRange);

  // Overwrite the default behavior (Insert period when consecutive spaces) of IME.
  if (raw.inputType === 'insertText' && data === ' ') {
    ifPrefixSpace = true;
  } else if (data !== '. ' && data !== '。 ') {
    ifPrefixSpace = false;
  }
  if (ifPrefixSpace && (data === '. ' || data === '。 ')) {
    ctx.data = ' ';
  }

  if (data && data.length > 0 && data !== '\n') {
    if (
      deltas.length > 1 || // cursor is in the between of two deltas
      (deltas.length === 1 && inlineRange.index !== 0) // cursor is in the end of line or in the middle of a delta
    ) {
      // each new text inserted by virgo will not contain any attributes,
      // but we want to keep the attributes of previous text or current text where the cursor is in
      // here are two cases:
      // 1. aaa**b|bb**ccc --input 'd'--> aaa**bdbb**ccc, d should extend the bold attribute
      // 2. aaa**bbb|**ccc --input 'd'--> aaa**bbbd**ccc, d should extend the bold attribute
      const { attributes } = deltas[0][0];
      if (
        deltas.length !== 1 ||
        inlineRange.index === inlineEditor.yText.length
      ) {
        // `EDGE_IGNORED_ATTRIBUTES` is which attributes should be ignored in case 2
        EDGE_IGNORED_ATTRIBUTES.forEach(attr => {
          delete attributes?.[attr];
        });
      }

      // `GLOBAL_IGNORED_ATTRIBUTES` is which attributes should be ignored in case 1, 2
      GLOBAL_IGNORED_ATTRIBUTES.forEach(attr => {
        delete attributes?.[attr];
      });

      ctx.attributes = attributes ?? {};
    }
  }
  autoIdentifyLink(ctx);

  return ctx;
};

export const onVCompositionEnd = (
  ctx: CompositionEndHookCtx<AffineTextAttributes>
) => {
  const { inlineEditor, inlineRange, data } = ctx;
  const deltas = inlineEditor.getDeltasByInlineRange(inlineRange);

  if (data && data.length > 0 && data !== '\n') {
    if (deltas.length > 1 || (deltas.length === 1 && inlineRange.index !== 0)) {
      const newAttributes = deltas[0][0].attributes;
      if (
        deltas.length !== 1 ||
        inlineRange.index === inlineEditor.yText.length
      ) {
        EDGE_IGNORED_ATTRIBUTES.forEach(attr => {
          delete newAttributes?.[attr];
        });
      }

      GLOBAL_IGNORED_ATTRIBUTES.forEach(attr => {
        delete newAttributes?.[attr];
      });

      ctx.attributes = newAttributes ?? {};
    }
  }

  autoIdentifyLink(ctx);

  return ctx;
};