import { useState } from 'react';

export default function AuthCard({ onLogin, onRegister, loading, error }) {
  const [mode, setMode] = useState('login');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ username: '', displayName: '', password: '' });

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Nemo IA</p>
        <h1>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h1>
        <p className="auth-copy">Seu usuario fica salvo no MongoDB e a sessao continua no navegador.</p>

        <div className="auth-switch">
          <button className={mode === 'login' ? 'switch-active' : ''} onClick={() => setMode('login')}>Login</button>
          <button className={mode === 'register' ? 'switch-active' : ''} onClick={() => setMode('register')}>Cadastro</button>
        </div>

        {mode === 'login' ? (
          <form className="auth-form" onSubmit={(event) => { event.preventDefault(); onLogin(loginForm); }}>
            <input placeholder="Usuario" value={loginForm.username} onChange={(event) => setLoginForm({ ...loginForm, username: event.target.value })} />
            <input type="password" placeholder="Senha" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} />
            <button className="primary-button" disabled={loading}>Entrar</button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={(event) => { event.preventDefault(); onRegister(registerForm); }}>
            <input placeholder="Usuario" value={registerForm.username} onChange={(event) => setRegisterForm({ ...registerForm, username: event.target.value })} />
            <input placeholder="Nome exibido" value={registerForm.displayName} onChange={(event) => setRegisterForm({ ...registerForm, displayName: event.target.value })} />
            <input type="password" placeholder="Senha" value={registerForm.password} onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })} />
            <button className="primary-button" disabled={loading}>Criar conta</button>
          </form>
        )}

        {error && <div className="error-banner">{error}</div>}
      </section>
    </main>
  );
}
