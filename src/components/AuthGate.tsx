import { ReactNode, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { Login } from './Login';

interface Props {
  children: (session: Session) => ReactNode;
}

export function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    const onStorage = async (e: StorageEvent) => {
      if (e.key && e.key.includes('supabase')) {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  if (loading) {
    return (
      <div className="login">
        <div className="muted">로딩 중…</div>
      </div>
    );
  }

  if (!session) return <Login />;
  return <>{children(session)}</>;
}
