import { Tab } from '../App';

const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: 'dashboard', label: '대시보드', icon: '📊' },
  { value: 'calendar', label: '캘린더', icon: '🗓️' },
  { value: 'bookings', label: '예약', icon: '📋' },
  { value: 'expenses', label: '비용', icon: '💸' },
  { value: 'settings', label: '설정', icon: '⚙️' },
];

interface Props {
  tab: Tab;
  onChange: (t: Tab) => void;
}

export function BottomNav({ tab, onChange }: Props) {
  return (
    <nav className="bottom-nav">
      {TABS.map((t) => (
        <button
          key={t.value}
          className={tab === t.value ? 'active' : ''}
          onClick={() => onChange(t.value)}
        >
          <span className="icon">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
