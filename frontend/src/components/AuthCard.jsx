import { useState } from 'react';
import { motion } from 'framer-motion';

export default function AuthCard({ onLogin, onRegister, loading, error }) {
  const [mode, setMode] = useState('login');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '' });

  function updateLogin(key, value) {
    setLoginForm((current) => ({ ...current, [key]: value }));
  }

  function updateRegister(key, value) {
    setRegisterForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a1014] px-4 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,211,102,0.22),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(0,168,132,0.18),transparent_20%),linear-gradient(180deg,#081015_0%,#111b21_100%)]" />
      <div className="absolute top-0 h-32 w-full bg-[#00a884]" />

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[36px] border border-white/10 bg-[#111b21]/95 shadow-[0_28px_80px_rgba(0,0,0,0.45)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden bg-[#0f1a20] p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-emerald-400">Nemo Messenger</p>
            <h1 className="mt-6 text-5xl font-semibold leading-tight text-white">
              Um chat novo, mais robusto, limpo e pronto para conversar de verdade.
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-slate-400">
              Base refeita para contatos, conversas, mensagens, uploads, audio e chamadas em uma experiência inspirada no WhatsApp Web.
            </p>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[28px] border border-white/8 bg-white/5 p-5">
              <p className="text-sm font-medium text-white">Tempo real e conversa estável</p>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                Presença online, digitando, mídia, áudio, exclusão de mensagem e base pronta para chamadas.
              </p>
            </div>
            <div className="ml-auto max-w-[82%] rounded-3xl rounded-br-md bg-[#005c4b] px-5 py-4 text-sm leading-6 text-white">
              Seu site agora entra por uma interface pensada para produção, não por um remendo do sistema antigo.
            </div>
          </div>
        </section>

        <section className="p-6 sm:p-8 lg:p-10">
          <div className="mx-auto max-w-md">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">Acesso</p>
            <h2 className="mt-4 text-4xl font-semibold text-white">
              {mode === 'login' ? 'Entrar no chat' : 'Criar sua conta'}
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Faça login para conversar com os usuários cadastrados e logados no site em um chat novo e profissional.
            </p>

            <div className="mt-7 grid grid-cols-2 rounded-2xl bg-white/5 p-1">
              <button onClick={() => setMode('login')} className={`rounded-2xl px-4 py-3 text-sm transition ${mode === 'login' ? 'bg-emerald-500 text-[#081318]' : 'text-slate-300 hover:bg-white/5'}`}>Login</button>
              <button onClick={() => setMode('register')} className={`rounded-2xl px-4 py-3 text-sm transition ${mode === 'register' ? 'bg-emerald-500 text-[#081318]' : 'text-slate-300 hover:bg-white/5'}`}>Cadastro</button>
            </div>

            {mode === 'login' ? (
              <form
                className="mt-6 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  onLogin(loginForm);
                }}
              >
                <input className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/60" placeholder="E-mail" value={loginForm.email} onChange={(event) => updateLogin('email', event.target.value)} />
                <input type="password" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/60" placeholder="Senha" value={loginForm.password} onChange={(event) => updateLogin('password', event.target.value)} />
                <button disabled={loading} className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-medium text-[#081318] transition hover:bg-emerald-400 disabled:opacity-60">
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>
            ) : (
              <form
                className="mt-6 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  onRegister(registerForm);
                }}
              >
                <input className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/60" placeholder="Nome" value={registerForm.name} onChange={(event) => updateRegister('name', event.target.value)} />
                <input className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/60" placeholder="E-mail" value={registerForm.email} onChange={(event) => updateRegister('email', event.target.value)} />
                <input type="password" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/60" placeholder="Senha" value={registerForm.password} onChange={(event) => updateRegister('password', event.target.value)} />
                <button disabled={loading} className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-medium text-[#081318] transition hover:bg-emerald-400 disabled:opacity-60">
                  {loading ? 'Criando...' : 'Criar conta'}
                </button>
              </form>
            )}

            {error ? <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
          </div>
        </section>
      </motion.div>
    </main>
  );
}
