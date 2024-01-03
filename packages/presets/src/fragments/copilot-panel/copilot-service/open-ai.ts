import { html } from 'lit';
import { OpenAI } from 'openai';

import { pngBase64ToFile } from '../edgeless/edit-image.js';
import {
  createVendor,
  EmbeddingServiceKind,
  Image2TextServiceKind,
  Text2ImageServiceKind,
  TextServiceKind,
} from './service-base.js';

export const openaiVendor = createVendor<{
  apiKey: string;
}>({
  key: 'OpenAI',
  color: '#202123',
  initData: () => ({ apiKey: '' }),
  renderConfigEditor: (data, refresh) => {
    return html`
      <div style="display:flex;flex-direction: column;gap: 12px;">
        <div>
          <label for="key">Key</label>
          <input
            type="text"
            id="key"
            .value="${data.apiKey}"
            @input="${(e: Event) => {
              const input = e.target as HTMLInputElement;
              data.apiKey = input.value;
              refresh();
            }}"
          />
        </div>
      </div>
    `;
  },
});
const askGPT3_5turbo = async (
  apiKey: string,
  messages: Array<OpenAI.ChatCompletionMessageParam>
) => {
  const openai = new OpenAI({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true,
  });
  const result = await openai.chat.completions.create({
    messages,
    model: 'gpt-3.5-turbo-1106',
    temperature: 0,
    max_tokens: 4096,
  });
  return result.choices[0].message;
};

TextServiceKind.implService({
  name: 'GPT3.5 Turbo',
  method: data => ({
    generateText: async messages => {
      const result = await askGPT3_5turbo(data.apiKey, messages);
      return result.content ?? '';
    },
  }),
  vendor: openaiVendor,
});
TextServiceKind.implService({
  name: 'GPT4',
  method: data => ({
    generateText: async messages => {
      const result = await askGPT3_5turbo(data.apiKey, messages);
      return result.content ?? '';
    },
  }),
  vendor: openaiVendor,
});

Text2ImageServiceKind.implService({
  name: 'DALL-E3',
  method: data => ({
    generateImage: async prompt => {
      const apiKey = data.apiKey;
      const openai = new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true,
      });
      const result = await openai.images.generate({
        prompt,
        model: 'dall-e-3',
        response_format: 'b64_json',
      });
      return pngBase64ToFile(result.data[0].b64_json ?? '', 'img');
    },
  }),
  vendor: openaiVendor,
});
const embeddings = async (apiKey: string, textList: string[]) => {
  const openai = new OpenAI({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true,
  });
  const result = await openai.embeddings.create({
    input: textList,
    model: 'text-embedding-ada-002',
    encoding_format: 'float',
  });
  return result.data.map(v => v.embedding);
};
EmbeddingServiceKind.implService({
  name: 'Ada 002',
  method: data => ({
    generateEmbedding: async text => {
      const result = await embeddings(data.apiKey, [text]);
      return result[0];
    },
    generateEmbeddings: async textList => {
      return embeddings(data.apiKey, textList);
    },
  }),
  vendor: openaiVendor,
});

Image2TextServiceKind.implService({
  name: 'GPT4 Vision',
  method: data => ({
    generateText: async messages => {
      const apiKey = data.apiKey;
      const openai = new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true,
      });
      const result = await openai.chat.completions.create({
        messages,
        model: 'gpt-4-vision-preview',
        temperature: 0,
        max_tokens: 4096,
      });
      return result.choices[0].message.content ?? '';
    },
  }),
  vendor: openaiVendor,
});