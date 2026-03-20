import { useEffect, useRef, useState } from 'react';

function formatDuration(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function MessageComposer({ draft, onDraftChange, onSend, attachments, onFilesSelected, onRemoveAttachment, onAudioRecorded }) {
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      setRecordingSeconds(0);
      setRecording(true);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm' });
        if (file.size > 0) {
          onAudioRecorded(file);
        }
        setRecording(false);
        setRecordingSeconds(0);
        streamRef.current?.getTracks?.().forEach((track) => track.stop());
      };

      recorder.start();
      intervalRef.current = setInterval(() => {
        setRecordingSeconds((current) => current + 1);
      }, 1000);
    } catch (_error) {
      // browser blocked microphone
    }
  }

  function stopRecording(cancel = false) {
    if (!recorderRef.current) return;
    if (cancel) {
      chunksRef.current = [];
    }
    recorderRef.current.stop();
  }

  return (
    <footer className="border-t border-white/5 bg-[#202c33] px-3 py-3 md:px-4">
      {attachments.length > 0 ? (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {attachments.map((attachment) => (
            <div key={attachment.localId} className="relative shrink-0 rounded-2xl border border-white/10 bg-[#111b21] p-2">
              {attachment.previewType === 'image' ? (
                <img src={attachment.previewUrl} alt={attachment.file.name} className="h-20 w-20 rounded-xl object-cover" />
              ) : attachment.previewType === 'video' ? (
                <video src={attachment.previewUrl} className="h-20 w-24 rounded-xl object-cover" />
              ) : attachment.previewType === 'audio' ? (
                <div className="w-56 rounded-xl bg-[#1c2a33] p-3 text-xs text-slate-300">
                  <p className="mb-2 font-medium text-white">{attachment.file.name}</p>
                  <audio src={attachment.previewUrl} controls className="w-full" />
                </div>
              ) : (
                <div className="flex h-20 w-32 items-center justify-center rounded-xl bg-white/5 px-2 text-center text-xs text-slate-300">{attachment.file.name}</div>
              )}
              <button onClick={() => onRemoveAttachment(attachment.localId)} className="absolute -right-2 -top-2 rounded-full bg-rose-500 px-2 py-0.5 text-xs text-white">x</button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2 md:gap-3">
        <label className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/5 text-lg text-slate-300 transition hover:bg-white/10">
          +
          <input type="file" multiple className="hidden" onChange={(event) => onFilesSelected(event.target.files)} />
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
            <div className="inline-flex h-11 items-center justify-center rounded-full bg-rose-500/15 px-4 text-xs font-medium text-rose-200">{formatDuration(recordingSeconds)}</div>
            <button onClick={() => stopRecording(true)} className="inline-flex h-11 items-center justify-center rounded-full bg-white/5 px-4 text-sm text-slate-300 hover:bg-white/10">Cancelar</button>
            <button onClick={() => stopRecording(false)} className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-500 px-4 text-sm font-medium text-[#081318] hover:bg-emerald-400">Salvar</button>
          </>
        ) : (
          <button onClick={startRecording} className="inline-flex h-11 items-center justify-center rounded-full bg-white/5 px-4 text-sm text-slate-300 hover:bg-white/10">Mic</button>
        )}

        <button onClick={onSend} className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-500 px-4 text-sm font-medium text-[#081318] hover:bg-emerald-400">
          Enviar
        </button>
      </div>
    </footer>
  );
}
