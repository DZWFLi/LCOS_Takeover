import { expect, it, vi } from 'vitest';
import { VoiceTranscriptionProviderRegistry, VoiceTranscriptionService } from '../src/voice-transcription-service.js';
import { handleVoiceTranscriptionRoute, type VoiceTranscriptionRouteContext } from '../src/routes/voice-transcription.js';

it('reports missing voice service without asking for or consuming microphone data', async () => {
  const sendJson = vi.fn(); const readRawBody = vi.fn();
  const service = new VoiceTranscriptionService({ registry: new VoiceTranscriptionProviderRegistry() });
  const handled = await handleVoiceTranscriptionRoute({ method: 'GET', pathname: '/runtime/voice/capabilities',
    response: {}, helpers: { sendJson, readRawBody }, voiceTranscription: service,
  } as unknown as VoiceTranscriptionRouteContext);
  expect(handled).toBe(true);
  expect(sendJson).toHaveBeenCalledWith({}, 200, { ok: true, value: { available: false, providerIds: [] } });
  expect(readRawBody).not.toHaveBeenCalled();
});

it('advertises the configured transcription provider without running it', () => {
  const transcribe = vi.fn(async () => ({ text: 'hello' }));
  const service = new VoiceTranscriptionService({ registry: new VoiceTranscriptionProviderRegistry({
    providers: [{ id: 'installed-local', supports: () => 1, transcribe }],
  }) });
  expect(service.capabilities()).toEqual({ available: true, providerIds: ['installed-local'] });
  expect(transcribe).not.toHaveBeenCalled();
});
