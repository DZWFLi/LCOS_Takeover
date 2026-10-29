import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import { AudioSourceView } from './AudioSourceView';
import { DocumentSourceView } from './DocumentSourceView';
import { ImageSourceView } from './ImageSourceView';
import { TextSourceView } from './TextSourceView';
import { AudioSourceMorphology } from '../../nodes/source/AudioSourceMorphology';

describe('source presentation, not spatial ownership', () => {
  it('keeps source bodies and does not invent missing waveform or Pin membership', async () => {
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<>
        <TextSourceView family="text" title="标题" preview={'第一行\n第二行'} density="reading" />
        <DocumentSourceView family="document" title="文档" preview="正文" density="working" />
        <ImageSourceView family="image" title="图片" mediaSrc="data:image/png;base64," density="reading" />
        <AudioSourceView family="audio" title="声音" durationText="00:38" density="working" />
      </>));
      expect(host.querySelectorAll('[data-lcos-source-visual]')).toHaveLength(4);
      expect(host.querySelectorAll('[data-lcos-wave-bar]')).toHaveLength(0);
      expect(host.textContent).toContain('00:38');
      expect(host.querySelector('[data-waveform-source]')).toBeNull();
      expect(host.querySelector('[data-lcos-source-corner-marker]')).toBeNull();
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
  it('takes mark density from the owner, without a new viewport threshold', async () => {
    const host = document.createElement('div'); const root = createRoot(host);
    try {
      await act(async () => root.render(<TextSourceView family="text" title="标题"
        secondary="次级行" density="mark" />));
      expect(host.textContent).not.toContain('次级行');
      expect(host.querySelector('[data-density]')?.getAttribute('data-density')).toBe('mark');
    } finally { await act(async () => root.unmount()); }
  });
  it('retains the real browser-metadata duration path', async () => {
    const host = document.createElement('div'); const root = createRoot(host);
    try {
      await act(async () => root.render(<AudioSourceMorphology family="audio" title="声音"
        mediaSrc="/fixture.wav" density="working" />));
      const audio = host.querySelector('audio');
      expect(audio).not.toBeNull();
      Object.defineProperty(audio, 'duration', { value: 38, configurable: true });
      await act(async () => audio?.dispatchEvent(new Event('loadedmetadata')));
      expect(host.textContent).toContain('00:38');
      await act(async () => root.render(<AudioSourceMorphology family="audio" title="新声音"
        mediaSrc="/other.wav" density="working" />));
      expect(host.textContent).not.toContain('00:38');
    } finally { await act(async () => root.unmount()); }
  });
});
