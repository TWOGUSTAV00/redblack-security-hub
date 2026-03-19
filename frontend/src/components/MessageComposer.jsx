import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

function formatRecordingTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function MessageComposer({ draft, onDraftChange, onSend, onFiles, attachments, onRemoveAttachment, onAudioRecorded }) {
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioPreview, setAudioPreview] = useState(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);
  const intervalRef = useRef(null);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    mediaRecorderRef.current?.stop?.();
    mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    if (audioPreview) URL.revokeObjectURL(audioPreview.url);
  }, [audioPreview]);

  async function startRecording() {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      setRecording(true);
      setRecordingSeconds(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start();
      intervalRef.current = setInterval(() => {
        setRecordingSeconds((current) => current + 1);
      }, 1000);
    } catch (_error) {
      // navigator permission denied or unsupported
    }
  }

  function stopRecording({ save = true } = {}) {
    if (!mediaRecorderRef.current) return;
    const recorder = mediaRecorderRef.current;
    recorder.onstop = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;
      chunksRef.current = [];
      setRecording(false);
      if (!save || !blob.size) {
        setRecordingSeconds(0);
        return;
      }
      const url = URL.createObjectURL(blob);
      const attachment = {
        id: `audio-${Date.now()}`,
        kind: 'audio',
        name: `audio-${Date.now()}.webm`,
        mimeType: 'audio/webm',
        size: blob.size,
        url,
        durationSeconds: recordingSeconds
      };
      setAudioPreview(attachment);
      onAudioRecorded?.(attachment);
      setRecordingSeconds(0);
    };
    recorder.stop();
  }

  return (
    <footer className="border-t border-white/5 bg-[#202c33] px-3 py-3 md:px-4">
      {attachments.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {attachments.map((attachment) => (
            <motion.div key={attachment.id} layout className="relative shrink-0 rounded-2xl border border-white/10 bg-[#111b21] p-2">
              {attachment.kind === 'image' ? (
                <img src={attachment.url} alt={attachment.name} className="h-16 w-16 rounded-xl object-cover" />
              ) : attachment.kind === 'audio' ? (
                <div className="w-72 rounded-xl bg-[#1c2a33] p-3">
                  <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
                    <span>Audio gravado</span>
                    <span>{formatRecordingTime(attachment.durationSeconds || 0)}</span>
                  </div>
                  <audio src={attachment.url} controls className="w-full" preload="metadata" />
                </div>
              ) : (
                <div className="flex h-16 w-28 items-center justify-center rounded-xl bg-white/5 px-2 text-center text-xs text-slate-300">{attachment.name}</div>
              )}
              <button onClick={() => onRemoveAttachment(attachment.id)} className="absolute -right-2 -top-2 rounded-full bg-rose-500 px-2 py-0.5 text-xs text-white">x</button>
            </motion.div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 md:gap-3">
        <label className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/5 text-lg text-slate-300 transition hover:bg-white/10">
          +
          <input type="file" multiple className="hidden" onChange={(event) => onFiles(event.target.files)} />
        </label>
        <div className="flex min-h-12 flex-1 items-end rounded-3xl bg-[#2a3942] px-4 py-2">
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            rows={1}
            placeholder="Digite uma mensagem"
            className="max-h-32 min-h-8 w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
          />
        </div>
        {recording ? (
          <>
            <div className="inline-flex h-11 min-w-20 items-center justify-center rounded-full bg-rose-500/15 px-4 text-xs font-medium text-rose-200">
              {formatRecordingTime(recordingSeconds)}
            </div>
            <button onClick={() => stopRecording({ save: false })} className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-white/5 px-4 text-sm text-slate-300 transition hover:bg-white/10">
              Cancelar
            </button>
            <button onClick={() => stopRecording({ save: true })} className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-emerald-500 px-4 text-sm font-medium text-[#081318] transition hover:bg-emerald-400">
              Salvar
            </button>
          </>
        ) : (
          <button onClick={startRecording} className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-white/5 px-4 text-sm text-slate-300 transition hover:bg-white/10">
            Mic
          </button>
        )}
        <button onClick={onSend} className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-emerald-500 px-4 text-sm font-medium text-[#081318] transition hover:bg-emerald-400">
          Enviar
        </button>
      </div>
    </footer>
  );
}
