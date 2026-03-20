import { motion } from 'framer-motion';
import clsx from 'clsx';

function formatTime(value) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export default function MessageBubble({ message, mine, onDeleteForMe, onDeleteForEveryone }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={clsx('max-w-[84%] rounded-3xl px-4 py-3 shadow-sm md:max-w-[68%]', mine ? 'rounded-br-md bg-[#005c4b] text-white' : 'rounded-bl-md bg-[#202c33] text-slate-100')}>
        {message.deletedForEveryone ? (
          <p className="text-sm italic text-white/60">Mensagem apagada para todos</p>
        ) : (
          <>
            {message.text ? <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p> : null}
            {message.media?.length ? (
              <div className={clsx('grid gap-2', message.text ? 'mt-3' : '')}>
                {message.media.map((item, index) => (
                  item.type === 'image' ? (
                    <img key={`${item.url}-${index}`} src={item.url} alt={item.name || 'imagem'} className="max-h-80 w-full rounded-2xl object-cover" />
                  ) : item.type === 'video' ? (
                    <video key={`${item.url}-${index}`} src={item.url} controls className="max-h-80 w-full rounded-2xl bg-black" />
                  ) : item.type === 'audio' ? (
                    <audio key={`${item.url}-${index}`} src={item.url} controls className="w-full" preload="metadata" />
                  ) : (
                    <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer" className="rounded-2xl bg-black/20 px-3 py-2 text-xs text-emerald-100 underline underline-offset-2">
                      {item.name || 'Arquivo'}
                    </a>
                  )
                ))}
              </div>
            ) : null}
          </>
        )}

        <div className="mt-2 flex items-center justify-end gap-3 text-[11px] text-white/60">
          {mine && !message.deletedForEveryone ? (
            <>
              <button onClick={() => onDeleteForMe(message)} className="hover:text-white/90">Apagar para mim</button>
              <button onClick={() => onDeleteForEveryone(message)} className="hover:text-white/90">Apagar para todos</button>
            </>
          ) : null}
          <span>{formatTime(message.createdAt)}</span>
        </div>
      </div>
    </motion.div>
  );
}
