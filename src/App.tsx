import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { Dashboard } from './components/Dashboard';
import { Bookings } from './components/Bookings';
import { Expenses } from './components/Expenses';
import { Settings } from './components/Settings';
import { BottomNav } from './components/BottomNav';
import { AuthGate } from './components/AuthGate';
import { Header } from './components/Header';
import { SyncStatus } from './types';
import { subscribeRealtime, syncAll } from './sync';

export type Tab = 'dashboard' | 'bookings' | 'expenses' | 'settings';

function MainApp({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [status, setStatus] = useState<SyncStatus>('idle');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!navigator.onLine) {
        setStatus('offline');
        return;
      }
      setStatus('syncing');
      try {
        await syncAll();
        if (!cancelled) setStatus('synced');
      } catch {
        if (!cancelled) setStatus('error');
      }
    };
    run();

    const unsub = subscribeRealtime(() => {
      run();
    });

    const onOnline = () => run();
    const onOffline = () => setStatus('offline');
    const onFocus = () => run();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onFocus);
    };
  }, [session.user.id]);

  return (
    <div className="app">
      <Header session={session} status={status} />
      <main className="main">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'bookings' && <Bookings />}
        {tab === 'expenses' && <Expenses />}
        {tab === 'settings' && <Settings />}
      </main>
      <BottomNav tab={tab} onChange={setTab} />
    </div>
  );
}

export function App() {
  return <AuthGate>{(session) => <MainApp session={session} />}</AuthGate>;
}
