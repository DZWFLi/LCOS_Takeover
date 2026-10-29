export interface VoiceRecording {
  readonly audio: Blob;
  readonly durationMs: number;
}

export interface VoiceInputHandle {
  start(): Promise<void>;
  stop(): void;
  cancel(): void;
}

export interface VoiceInputEvents {
  onStart(): void;
  onResult(recording: VoiceRecording): void;
  onEnd(): void;
  onError(code: string): void;
}

function supportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
    .find((type) => MediaRecorder.isTypeSupported(type));
}

export function isVoiceInputSupported(): boolean {
  return typeof navigator !== 'undefined'
    && navigator.mediaDevices?.getUserMedia !== undefined
    && typeof MediaRecorder !== 'undefined'
    && supportedMimeType() !== undefined;
}

/** Capture a short audio clip for the existing Core transcription endpoint. */
export function createVoiceInput(events: VoiceInputEvents): VoiceInputHandle | null {
  if (!isVoiceInputSupported()) return null;
  let recorder: MediaRecorder | undefined;
  let stream: MediaStream | undefined;
  let chunks: BlobPart[] = [];
  let startedAt = 0;
  let cancelled = false;

  const release = (): void => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    recorder = undefined;
  };

  return {
    start: async () => {
      if (recorder !== undefined) return;
      cancelled = false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { release(); return; }
        const mimeType = supportedMimeType();
        if (mimeType === undefined) { release(); events.onError('unsupported'); return; }
        recorder = new MediaRecorder(stream, { mimeType });
        chunks = [];
        recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
        recorder.onerror = () => { release(); events.onError('recording-failed'); };
        recorder.onstop = () => {
          const audio = new Blob(chunks, { type: mimeType.split(';', 1)[0] });
          const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
          release();
          if (!cancelled && audio.size > 0) events.onResult({ audio, durationMs });
          events.onEnd();
        };
        startedAt = performance.now();
        recorder.start();
        events.onStart();
      } catch (error: unknown) {
        release();
        events.onError(error instanceof DOMException && error.name === 'NotAllowedError' ? 'not-allowed' : 'recording-failed');
      }
    },
    stop: () => { if (recorder?.state === 'recording') recorder.stop(); },
    cancel: () => {
      cancelled = true;
      if (recorder?.state === 'recording') recorder.stop();
      else release();
    },
  };
}

export interface VoiceInsertionPoint {
  readonly start: number;
  readonly end: number;
}

/** Replace an active selection, insert at its caret, or append after prior blur. */
export function mergeVoiceText(
  draft: string,
  transcript: string,
  insertion?: VoiceInsertionPoint,
): { readonly text: string; readonly caret: number } {
  const clean = transcript.trim();
  if (insertion === undefined) {
    const separator = draft.length > 0 && !/\s$/.test(draft) ? ' ' : '';
    const text = `${draft}${separator}${clean}`;
    return { text, caret: text.length };
  }
  const start = Math.max(0, Math.min(draft.length, insertion.start));
  const end = Math.max(start, Math.min(draft.length, insertion.end));
  const text = `${draft.slice(0, start)}${clean}${draft.slice(end)}`;
  return { text, caret: start + clean.length };
}
