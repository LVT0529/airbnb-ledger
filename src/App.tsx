import { useEffect, useRef, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { Dashboard } from './components/Dashboard';
import { Calendar } from './components/Calendar';
import { Bookings } from './components/Bookings';
import { Expenses } from './components/Expenses';
import { Settings } from './components/Settings';
import { BottomNav } from './components/BottomNav';
import { AuthGate } from './components/AuthGate';
import { Header } from './components/Header';
import { SyncStatus } from './types';
import { subscribeRealtime, syncAll, syncAllIcals } from './sync';

export type Tab = 'dashboard' | 'calendar' | 'bookings' | 'expenses' | 'settings';

function MainApp({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [status, setStatus] = useState<SyncStatus>('idle');
  const lastIcalSyncRef = useRef<number>(0);

  const properties = useLiveQuery(() => db.properties.toArray()) ?? [];

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

  // 자동 iCal 동기화: 1시간에 한번 + 첫 로드 시
  useEffect(() => {
    if (properties.length === 0) return;
    const hasIcal = properties.some((p) => !!p.icalUrl);
    if (!hasIcal) return;

    const now = Date.now();
    const HOUR = 60 * 60 * 1000;
    if (now - lastIcalSyncRef.current < HOUR) return;
    lastIcalSyncRef.current = now;

    syncAllIcals(properties).catch(() => {
      /* 자동 동기화 실패는 silent */
    });
  }, [properties]);

  return (
    <div className="app">
      <Header session={session} status={status} />
      <main className="main">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'calendar' && <Calendar />}
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
