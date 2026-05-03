import { FormEvent, useState } from 'react';
import { supabase } from '../supabase';

export function Login() {
  const [email, setEmail] = useState(
    () => localStorage.getItem('lastEmail') ?? '',
  );
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo:
            window.location.origin + window.location.pathname,
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      localStorage.setItem('lastEmail', email.trim());
      setStage('code');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했어요');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'email',
      });
      if (error) throw error;
      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '코드가 올바르지 않아요');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-icon">₩</div>
        <h1>에어비앤비 가계부</h1>
        <p className="muted">기기 간 자동 동기화를 위해 로그인해주세요</p>

        {stage === 'email' ? (
          <form onSubmit={sendCode} className="form">
            <label>
              이메일
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@example.com"
                inputMode="email"
                autoComplete="email"
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button
              type="submit"
              className="btn primary block"
              disabled={loading}
            >
              {loading ? '보내는 중…' : '인증 코드 받기'}
            </button>
            <p className="muted small">
              입력하신 이메일로 인증 코드를 보내드려요.
            </p>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="form">
            <p className="muted small" style={{ textAlign: 'center' }}>
              <strong>{email}</strong>로 보낸 인증 코드를 입력하세요
            </p>
            <label>
              인증 코드
              <input
                type="text"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 10))
                }
                required
                autoFocus
                placeholder="00000000"
                inputMode="numeric"
                pattern="[0-9]{6,10}"
                autoComplete="one-time-code"
                maxLength={10}
                style={{ fontSize: 22, letterSpacing: 4, textAlign: 'center' }}
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button
              type="submit"
              className="btn primary block"
              disabled={loading || code.length < 6}
            >
              {loading ? '확인 중…' : '로그인'}
            </button>
            <button
              type="button"
              className="btn block"
              onClick={() => {
                setStage('email');
                setCode('');
                setError(null);
              }}
            >
              이메일 다시 입력
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
