import {
  LayoutDashboard,
  CalendarDays,
  ListChecks,
  Wallet,
  Settings as SettingsIcon,
} from 'lucide-react';
import { Tab } from '../App';

const TABS: { value: Tab; label: string; Icon: typeof LayoutDashboard }[] = [
  { value: 'dashboard', label: '대시보드', Icon: LayoutDashboard },
  { value: 'calendar', label: '캘린더', Icon: CalendarDays },
  { value: 'bookings', label: '예약', Icon: ListChecks },
  { value: 'expenses', label: '비용', Icon: Wallet },
  { value: 'settings', label: '설정', Icon: SettingsIcon },
];

interface Props {
  tab: Tab;
  onChange: (t: Tab) => void;
}

export function BottomNav({ tab, onChange }: Props) {
  return (
    <nav className="bottom-nav">
      {TABS.map((t) => {
        const Icon = t.Icon;
        return (
          <button
            key={t.value}
            className={tab === t.value ? 'active' : ''}
            onClick={() => onChange(t.value)}
          >
            <Icon size={22} strokeWidth={tab === t.value ? 2.4 : 2} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
