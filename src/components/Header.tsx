import { Session } from '@supabase/supabase-js';
import { SyncStatus } from '../types';
import { supabase } from '../supabase';

interface Props {
  session: Session;
  status: SyncStatus;
}

const STATUS_LABEL: Record<SyncStatus, { icon: string; text: string; cls: string }> = {
  idle: { icon: '☁', text: '대기', cls: '' },
  syncing: { icon: '↻', text: '동기화 중', cls: 'syncing' },
  synced: { icon: '✓', text: '동기화됨', cls: 'synced' },
  offline: { icon: '⌀', text: '오프라인', cls: 'offline' },
  error: { icon: '!', text: '오류', cls: 'error' },
};

export function Header({ session, status }: Props) {
  const label = STATUS_LABEL[status];
  const handleLogout = async () => {
    if (confirm('로그아웃 할까요? 동기화된 데이터는 다시 로그인하면 그대로예요.')) {
      await supabase.auth.signOut();
      // IndexedDB 캐시 비우기
      const dbs = indexedDB.databases ? await indexedDB.databases() : [];
      dbs.forEach((d) => d.name && indexedDB.deleteDatabase(d.name));
    }
  };

  return (
    <header className="app-header">
      <div className={`sync-pill ${label.cls}`} title={`${label.text}`}>
        <span className="sync-icon">{label.icon}</span>
        <span className="sync-text">{label.text}</span>
      </div>
      <button className="header-user" onClick={handleLogout} title="로그아웃">
        {session.user.email?.[0]?.toUpperCase() ?? '?'}
      </button>
    </header>
  );
}
