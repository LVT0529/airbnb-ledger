import { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { Bookings } from './components/Bookings';
import { Expenses } from './components/Expenses';
import { Settings } from './components/Settings';
import { BottomNav } from './components/BottomNav';

export type Tab = 'dashboard' | 'bookings' | 'expenses' | 'settings';

export function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  return (
    <div className="app">
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
