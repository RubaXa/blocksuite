import type { EditorHost } from '@blocksuite/block-std';
import { WithDisposable } from '@blocksuite/block-std';
import { type AIError, openFileOrFiles } from '@blocksuite/blocks';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import {
  ChatAbortIcon,
  ChatClearIcon,
  ChatSendIcon,
  CloseIcon,
  ImageIcon,
} from '../_common/icons.js';
import { AIProvider } from '../provider.js';
import { reportResponse } from '../utils/action-reporter.js';
import { readBlobAsURL } from '../utils/image.js';
import { type ChatContextValue, type ChatMessage } from './chat-context.js';

const MaximumImageCount = 8;

function getFirstTwoLines(text: string) {
  const lines = text.split('\n');
  return lines.slice(0, 2);
}

@customElement('chat-panel-input')
export class ChatPanelInput extends WithDisposable(LitElement) {
  static override styles = css`
    .chat-panel-input {
      margin-top: 12px;
      position: relative;
      border-radius: 4px;
      display: flex;
      gap: 4px;
      flex-direction: column;
      padding: 8px;

      .chat-selection-quote {
        padding: 4px 0px 8px 0px;
        padding-left: 15px;
        max-height: 56px;
        font-size: 14px;
        font-weight: 400;
        line-height: 22px;
        color: var(--affine-text-secondary-color);
        position: relative;

        div {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-quote-close {
          position: absolute;
          right: 0;
          top: 0;
          cursor: pointer;
          display: none;
          width: 16px;
          height: 16px;
          border-radius: 4px;
          border: 1px solid var(--affine-border-color);
          background-color: var(--affine-white);
        }
      }

      .chat-selection-quote:hover .chat-quote-close {
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .chat-selection-quote::after {
        content: '';
        width: 2px;
        height: calc(100% - 10px);
        margin-top: 5px;
        position: absolute;
        left: 0;
        top: 0;
        background: var(--affine-quote-color);
        border-radius: 18px;
      }
    }

    .chat-panel-input-actions {
      display: flex;
      gap: 8px;
      align-items: center;

      div {
        width: 24px;
        height: 24px;
        cursor: pointer;
      }

      div:nth-child(2) {
        margin-left: auto;
      }

      .chat-history-clear {
        background-color: var(--affine-white);
      }

      .image-upload {
        background-color: var(--affine-white);
        display: flex;
        justify-content: center;
        align-items: center;
      }
    }

    .chat-panel-input {
      textarea {
        resize: none;
        width: 100%;
        line-height: 22px;
        border: none;
        font-size: 14px;
        font-weight: 400;
        font-family: var(--affine-font-family);
        color: var(--affine-text-primary-color);
        box-sizing: border-box;
        overflow-y: hidden;
      }

      textarea::placeholder {
        font-size: 14px;
        font-weight: 400;
        font-family: var(--affine-font-family);
        color: var(--affine-placeholder-color);
      }

      textarea:focus {
        outline: none;
      }
    }

    .chat-panel-images {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      position: relative;

      .image-container {
        width: 58px;
        height: 58px;
        border-radius: 4px;
        border: 1px solid var(--affine-border-color);
        cursor: pointer;
        overflow: hidden;
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;

        img {
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
        }
      }
    }

    .close-wrapper {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      border: 1px solid var(--affine-border-color);
      justify-content: center;
      align-items: center;
      display: none;
      position: absolute;
      background-color: var(--affine-white);
      z-index: 1;
      cursor: pointer;
    }

    .close-wrapper:hover {
      background-color: var(--affine-background-error-color);
      border: 1px solid var(--affine-error-color);
    }

    .close-wrapper:hover svg path {
      fill: var(--affine-error-color);
    }
  `;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @query('textarea')
  accessor textarea!: HTMLTextAreaElement;

  @query('.close-wrapper')
  accessor closeWrapper!: HTMLDivElement;

  @state()
  accessor curIndex = -1;

  @state()
  accessor isInputEmpty = true;

  @state()
  accessor focused = false;

  @property({ attribute: false })
  accessor chatContextValue!: ChatContextValue;

  @property({ attribute: false })
  accessor updateContext!: (context: Partial<ChatContextValue>) => void;

  @property({ attribute: false })
  accessor cleanupHistories!: () => Promise<void>;

  send = async () => {
    const { status, markdown } = this.chatContextValue;
    if (status === 'loading' || status === 'transmitting') return;

    const text = this.textarea.value;
    const { images } = this.chatContextValue;
    if (!text && images.length === 0) {
      return;
    }
    const { doc } = this.host;
    this.textarea.value = '';
    this.isInputEmpty = true;
    this.updateContext({
      images: [],
      status: 'loading',
      error: null,
      quote: '',
      markdown: '',
    });

    const attachments = await Promise.all(
      images?.map(image => readBlobAsURL(image))
    );

    const content = (markdown ? `${markdown}\n` : '') + text;

    this.updateContext({
      items: [
        ...this.chatContextValue.items,
        {
          role: 'user',
          content: content,
          createdAt: new Date().toISOString(),
          attachments,
        },
        { role: 'assistant', content: '', createdAt: new Date().toISOString() },
      ],
    });

    try {
      const abortController = new AbortController();
      const stream = AIProvider.actions.chat?.({
        input: content,
        docId: doc.id,
        attachments: images,
        workspaceId: doc.collection.id,
        host: this.host,
        stream: true,
        signal: abortController.signal,
        where: 'chat-panel',
        control: 'chat-send',
      });

      if (stream) {
        this.updateContext({ abortController });

        for await (const text of stream) {
          const items = [...this.chatContextValue.items];
          const last = items[items.length - 1] as ChatMessage;
          last.content += text;
          this.updateContext({ items, status: 'transmitting' });
        }

        this.updateContext({ status: 'success' });
      }
    } catch (error) {
      this.updateContext({ status: 'error', error: error as AIError });
    } finally {
      this.updateContext({ abortController: null });
    }
  };

  private _addImages(images: File[]) {
    const oldImages = this.chatContextValue.images;
    this.updateContext({
      images: [...oldImages, ...images].slice(0, MaximumImageCount),
    });
  }

  protected override render() {
    const { images, status } = this.chatContextValue;

    return html`<style>
        .chat-panel-send svg rect {
          fill: ${this.isInputEmpty && images.length === 0
            ? 'var(--affine-text-disable-color)'
            : 'var(--affine-primary-color)'};
        }

        .chat-panel-input {
          border: ${this.focused
            ? '1px solid var(--affine-primary-color)'
            : '1px solid var(--affine-border-color)'};
          box-shadow: ${this.focused ? 'var(--affine-active-shadow)' : 'none'};
          max-height: ${images.length > 0 ? '272px' : '200px'};
        }
      </style>
      <div class="chat-panel-input">
        <div
          class="chat-panel-images"
          @mouseleave=${() => {
            this.closeWrapper.style.display = 'none';
            this.curIndex = -1;
          }}
        >
          ${repeat(
            images,
            image => image.name,
            (image, index) =>
              html`<div
                class="image-container"
                @mouseenter=${(evt: MouseEvent) => {
                  const ele = evt.target as HTMLImageElement;
                  const rect = ele.getBoundingClientRect();
                  const parentRect = ele.parentElement!.getBoundingClientRect();
                  const left = Math.abs(rect.right - parentRect.left) - 8;
                  const top = Math.abs(parentRect.top - rect.top) - 8;
                  this.curIndex = index;
                  this.closeWrapper.style.display = 'flex';
                  this.closeWrapper.style.left = left + 'px';
                  this.closeWrapper.style.top = top + 'px';
                }}
              >
                <img src="${URL.createObjectURL(image)}" alt="${image.name}" />
              </div>`
          )}
          <div
            class="close-wrapper"
            @click=${() => {
              if (this.curIndex >= 0 && this.curIndex < images.length) {
                const newImages = [...images];
                newImages.splice(this.curIndex, 1);
                this.updateContext({ images: newImages });
                this.curIndex = -1;
                this.closeWrapper.style.display = 'none';
              }
            }}
          >
            ${CloseIcon}
          </div>
        </div>
        ${this.chatContextValue.quote
          ? html`<div class="chat-selection-quote">
              ${repeat(
                getFirstTwoLines(this.chatContextValue.quote),
                line => line,
                line => html`<div>${line}</div>`
              )}
              <div
                class="chat-quote-close"
                @click=${() => {
                  this.updateContext({ quote: '', markdown: '' });
                }}
              >
                ${CloseIcon}
              </div>
            </div>`
          : nothing}
        <textarea
          placeholder="What are your thoughts?"
          @input=${() => {
            this.isInputEmpty = !this.textarea.value;
            const { textarea } = this;
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
            if (this.scrollHeight >= 200) {
              textarea.style.height = '200px';
              textarea.style.overflowY = 'scroll';
            }
          }}
          @keydown=${async (evt: KeyboardEvent) => {
            if (evt.key === 'Enter' && !evt.shiftKey && !evt.isComposing) {
              evt.preventDefault();
              await this.send();
            }
          }}
          @focus=${() => {
            this.focused = true;
          }}
          @blur=${() => {
            this.focused = false;
          }}
          @paste=${(event: ClipboardEvent) => {
            const items = event.clipboardData?.items;
            if (!items) return;

            for (const index in items) {
              const item = items[index];
              if (item.kind === 'file' && item.type.indexOf('image') >= 0) {
                const blob = item.getAsFile();
                if (!blob) continue;
                this._addImages([blob]);
              }
            }
          }}
        ></textarea>
        <div class="chat-panel-input-actions">
          <div
            class="chat-history-clear"
            @click=${async () => {
              await this.cleanupHistories();
            }}
          >
            ${ChatClearIcon}
          </div>
          ${images.length < MaximumImageCount
            ? html`<div
                class="image-upload"
                @click=${async () => {
                  const images = await openFileOrFiles({
                    acceptType: 'Images',
                    multiple: true,
                  });
                  if (!images) return;
                  this._addImages(images);
                }}
              >
                ${ImageIcon}
              </div>`
            : nothing}
          ${status === 'transmitting'
            ? html`<div
                @click=${() => {
                  this.chatContextValue.abortController?.abort();
                  this.updateContext({ status: 'success' });
                  reportResponse('aborted:stop');
                }}
              >
                ${ChatAbortIcon}
              </div>`
            : html`<div @click="${this.send}" class="chat-panel-send">
                ${ChatSendIcon}
              </div>`}
        </div>
      </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-panel-input': ChatPanelInput;
  }
}
