import React from 'react';
import { motion } from 'framer-motion';

export default function AuthCard({ onLogin, onRegister, loading, error }) {
  const fields = (form, setForm, mode) => (
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); mode === 'login' ? onLogin(form) : onRegister(form); }}>
      <input className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/60" placeholder="Usuario" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} />
      {mode === 'register' && <input className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/60" placeholder="Nome exibido" value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} />}
      <input type="password" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/60" placeholder="Senha" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
      <button disabled={loading} className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-medium text-[#081318] transition hover:bg-emerald-400 disabled:opacity-60">{loading ? 'Processando...' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
    </form>
  );

  const [loginForm, setLoginForm] = React.useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = React.useState({ username: '', displayName: '', password: '' });
  const [mode, setMode] = React.useState('login');

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b141a] px-4 py-8 md:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,211,102,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(0,168,132,0.18),transparent_22%),linear-gradient(180deg,#0b141a_0%,#111b21_100%)]" />
      <div className="absolute top-0 h-28 w-full bg-[#00a884]" />

      <div className="relative z-10 flex w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-[#111b21]/95 shadow-[0_28px_80px_rgba(0,0,0,0.45)] backdrop-blur">
        <section className="hidden w-[44%] flex-col justify-between bg-[#0f1a20] p-8 lg:flex">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-emerald-400">Nemo Chat</p>
            <h1 className="mt-6 text-5xl font-semibold leading-tight text-white">
              O visual moderno do chat agora tambem guia a entrada principal.
            </h1>
            <p className="mt-6 max-w-md text-sm leading-7 text-slate-400">
              Login, cadastro e conversa em tempo real em uma experiencia unica, escura, fluida e inspirada no WhatsApp Web.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/8 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-xl text-emerald-300">💬</div>
              <div>
                <p className="text-sm font-medium text-white">Tempo real com identidade visual unificada</p>
                <p className="text-xs text-slate-400">Sidebar, bolhas, status online, digitando e navegação mobile-first.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-[#202c33] px-4 py-3 text-sm text-slate-200">Conecte, envie mensagens e continue de onde parou.</div>
              <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-[#005c4b] px-4 py-3 text-sm text-white">O site principal agora compartilha a mesma linguagem visual do chat.</div>
            </div>
          </div>
        </section>

        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="w-full bg-[#111b21] p-5 sm:p-7 lg:w-[56%] lg:p-10">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">Nemo Chat</p>
              <h1 className="mt-4 text-4xl font-semibold text-white">Entrar</h1>
              <p className="mt-3 text-sm leading-7 text-slate-400">Seu site principal agora abre com o mesmo visual moderno do chat.</p>
            </div>

            <div className="hidden lg:block">
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">Acesso</p>
              <h2 className="mt-4 text-4xl font-semibold text-white">Entre na sua conta</h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">Sessao persistente, usuarios salvos no MongoDB e mesma identidade visual em toda a plataforma.</p>
            </div>

            <div className="mt-7 grid grid-cols-2 rounded-2xl bg-white/5 p-1">
              <button onClick={() => setMode('login')} className={`rounded-2xl px-4 py-3 text-sm transition ${mode === 'login' ? 'bg-emerald-500 text-[#081318]' : 'text-slate-300 hover:bg-white/5'}`}>Login</button>
              <button onClick={() => setMode('register')} className={`rounded-2xl px-4 py-3 text-sm transition ${mode === 'register' ? 'bg-emerald-500 text-[#081318]' : 'text-slate-300 hover:bg-white/5'}`}>Cadastro</button>
            </div>

            <div className="mt-5">{mode === 'login' ? fields(loginForm, setLoginForm, 'login') : fields(registerForm, setRegisterForm, 'register')}</div>
            {error && <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}
          </div>
        </motion.section>
      </div>
    </main>
  );
}
