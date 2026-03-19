import { motion } from 'framer-motion';

export default function MessageComposer({ draft, onDraftChange, onSend, onFiles, attachments, onRemoveAttachment }) {
  return (
    <footer className="border-t border-white/5 bg-[#202c33] px-3 py-3 md:px-4">
      {attachments.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {attachments.map((attachment) => (
            <motion.div key={attachment.id} layout className="relative shrink-0 rounded-2xl border border-white/10 bg-[#111b21] p-2">
              {attachment.kind === 'image' ? (
                <img src={attachment.url} alt={attachment.name} className="h-16 w-16 rounded-xl object-cover" />
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
        <button onClick={onSend} className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-emerald-500 px-4 text-sm font-medium text-[#081318] transition hover:bg-emerald-400">
          Enviar
        </button>
      </div>
    </footer>
  );
}
