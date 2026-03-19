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
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#111b21]/90 p-6 shadow-2xl backdrop-blur">
        <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">Nemo Chat</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Entrar</h1>
        <p className="mt-3 text-sm leading-7 text-slate-400">Chat em tempo real com persistencia no MongoDB, presenca online e UX inspirada no WhatsApp Web.</p>

        <div className="mt-6 grid grid-cols-2 rounded-2xl bg-white/5 p-1">
          <button onClick={() => setMode('login')} className={`rounded-2xl px-4 py-3 text-sm ${mode === 'login' ? 'bg-emerald-500 text-[#081318]' : 'text-slate-300'}`}>Login</button>
          <button onClick={() => setMode('register')} className={`rounded-2xl px-4 py-3 text-sm ${mode === 'register' ? 'bg-emerald-500 text-[#081318]' : 'text-slate-300'}`}>Cadastro</button>
        </div>

        <div className="mt-5">{mode === 'login' ? fields(loginForm, setLoginForm, 'login') : fields(registerForm, setRegisterForm, 'register')}</div>
        {error && <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}
      </motion.section>
    </main>
  );
}
