import {
  CloudCheck,
  CloudOff,
  CloudAlert,
  Cloud,
  RefreshCw,
} from 'lucide-react';
import { Session } from '@supabase/supabase-js';
import { SyncStatus } from '../types';
import { supabase } from '../supabase';

interface Props {
  session: Session;
  status: SyncStatus;
}

const STATUS_META: Record<
  SyncStatus,
  { Icon: typeof CloudCheck; text: string; cls: string; spin?: boolean }
> = {
  idle: { Icon: Cloud, text: '대기', cls: '' },
  syncing: { Icon: RefreshCw, text: '동기화 중', cls: 'syncing', spin: true },
  synced: { Icon: CloudCheck, text: '동기화됨', cls: 'synced' },
  offline: { Icon: CloudOff, text: '오프라인', cls: 'offline' },
  error: { Icon: CloudAlert, text: '오류', cls: 'error' },
};

export function Header({ session, status }: Props) {
  const meta = STATUS_META[status];
  const Icon = meta.Icon;

  const handleLogout = async () => {
    if (
      confirm(
        '로그아웃 할까요? 동기화된 데이터는 다시 로그인하면 그대로예요.',
      )
    ) {
      await supabase.auth.signOut();
      const dbs = indexedDB.databases ? await indexedDB.databases() : [];
      dbs.forEach((d) => d.name && indexedDB.deleteDatabase(d.name));
    }
  };

  return (
    <header className="app-header">
      <div className={`sync-pill ${meta.cls}`} title={meta.text}>
        <Icon
          size={14}
          className={meta.spin ? 'spin-icon' : undefined}
        />
        <span className="sync-text">{meta.text}</span>
      </div>
      <button
        className="header-user"
        onClick={handleLogout}
        title={`${session.user.email} (탭하여 로그아웃)`}
      >
        {session.user.email?.[0]?.toUpperCase() ?? '?'}
      </button>
    </header>
  );
}
