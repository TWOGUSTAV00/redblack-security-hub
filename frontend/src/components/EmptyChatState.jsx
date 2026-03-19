export default function EmptyChatState() {
  return (
    <div className="flex flex-1 items-center justify-center bg-[#0b141a] px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/5 text-3xl text-emerald-400">??</div>
        <h2 className="text-2xl font-semibold text-white">WhatsApp-style chat pronto</h2>
        <p className="mt-3 text-sm leading-7 text-slate-400">
          Escolha uma conversa na lateral ou pesquise um contato para iniciar uma nova troca em tempo real.
        </p>
      </div>
    </div>
  );
}
