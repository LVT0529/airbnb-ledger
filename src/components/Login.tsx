import { FormEvent, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
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
      <div className="login-inner">
        <div className="login-brand">
          <div className="login-brand-mark">₩</div>
          <span className="login-brand-name">Host Ledger</span>
        </div>

        {stage === 'email' ? (
          <>
            <h1 className="login-headline">
              당신의 숙소,
              <br />
              <em>매일의 기록.</em>
            </h1>
            <p className="login-tagline">
              에어비앤비 호스트를 위한 개인 가계부.
              <br />
              매출과 비용, 게스트의 흐름을 한눈에.
            </p>

            <div className="login-card">
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
                  {loading ? '보내는 중…' : '인증 코드 받기 →'}
                </button>
              </form>
            </div>

            <p className="login-footer">Private · End-to-End on your devices</p>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setStage('email');
                setCode('');
                setError(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ink-muted)',
                fontSize: 13,
                fontFamily: 'var(--sans)',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: 0,
                marginBottom: -8,
                width: 'fit-content',
              }}
            >
              <ArrowLeft size={14} />
              이메일 다시 입력
            </button>

            <h1 className="login-headline">
              <em>받은 코드</em>를<br />
              입력해 주세요.
            </h1>
            <p className="login-tagline">
              <strong style={{ color: 'var(--ink)' }}>{email}</strong>
              <br />
              위 주소로 6~8자리 인증 코드를 보냈어요.
            </p>

            <div className="login-card">
              <form onSubmit={verifyCode} className="form">
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
                    style={{
                      fontSize: 26,
                      letterSpacing: 6,
                      textAlign: 'center',
                      fontFamily: 'var(--num)',
                      fontWeight: 500,
                      fontVariantNumeric: 'tabular-nums',
                    }}
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
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
