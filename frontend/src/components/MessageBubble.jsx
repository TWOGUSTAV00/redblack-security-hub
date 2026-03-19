import { motion } from 'framer-motion';
import clsx from 'clsx';

function formatTime(value) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export default function MessageBubble({ message, mine, showAvatar, senderName }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={clsx('flex gap-2', mine ? 'justify-end' : 'justify-start')}>
      {!mine && <div className="w-8 text-[11px] text-slate-500">{showAvatar ? senderName : ''}</div>}
      <div className={clsx('max-w-[82%] rounded-2xl px-3 py-2 shadow-sm md:max-w-[68%]', mine ? 'rounded-br-md bg-[#005c4b] text-white' : 'rounded-bl-md bg-[#202c33] text-slate-100')}>
        {message.text ? <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p> : null}
        {message.attachments?.length ? (
          <div className={clsx('grid gap-2', message.text ? 'mt-2' : '')}>
            {message.attachments.map((attachment, index) => (
              attachment.kind === 'image' ? (
                <img key={`${attachment.url}-${index}`} src={attachment.url} alt={attachment.name || 'imagem'} className="max-h-72 w-full rounded-xl object-cover" />
              ) : attachment.kind === 'audio' ? (
                <audio key={`${attachment.url}-${index}`} src={attachment.url} controls className="w-full max-w-xs rounded-xl" preload="metadata" />
              ) : (
                <a key={`${attachment.url}-${index}`} href={attachment.url} target="_blank" rel="noreferrer" className="rounded-xl bg-black/20 px-3 py-2 text-xs text-emerald-100 underline underline-offset-2">
                  {attachment.name || 'Arquivo'}
                </a>
              )
            ))}
          </div>
        ) : null}
        <div className="mt-1 flex justify-end gap-2 text-[11px] text-white/60">
          <span>{formatTime(message.createdAt)}</span>
        </div>
      </div>
    </motion.div>
  );
}
