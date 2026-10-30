import { type FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useLogin, useMe } from '../auth/useAuth';
import { Footer } from '../components/Footer';
import { Logo } from '../components/Logo';
import { ErrorMessage } from '../components/ui';
import { buttonClass, cardClass, cn, inputClass } from '../lib/ui';

export function LoginPage() {
  const me = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (me.data) return <Navigate to={from} replace />;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate(from, { replace: true }) });
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 pt-6">
      <div className={cn(cardClass, 'w-full max-w-[400px] px-7 py-8')}>
        <div className="mb-6 flex flex-col gap-5">
          <Logo />
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.01em]">Prijava</h1>
            <p className="mt-1 text-[0.95rem] text-muted">Prijavite se na svoj Trag nalog.</p>
          </div>
        </div>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Email
            <input
              className={cn(inputClass, 'h-11 px-3 text-base')}
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Lozinka
            <input
              className={cn(inputClass, 'h-11 px-3 text-base')}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {login.error && <ErrorMessage>{login.error.message}</ErrorMessage>}
          <button
            className={cn(buttonClass({ variant: 'primary' }), 'mt-1 h-[46px] font-semibold')}
            type="submit"
            disabled={login.isPending}
          >
            {login.isPending ? 'Prijavljivanje…' : 'Prijavi se'}
          </button>
        </form>
      </div>
      <Footer />
    </div>
  );
}
