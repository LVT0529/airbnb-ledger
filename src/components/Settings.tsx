import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Property } from '../types';
import { COUNTRIES, PLATFORMS } from '../data';
import { buildCSV } from '../utils';
import {
  addProperty,
  clearAll,
  deleteProperty,
  syncAll,
  syncAllIcals,
  updateProperty,
} from '../sync';
import { supabase } from '../supabase';
import { Modal } from './Modal';
import { AirbnbImportModal } from './AirbnbImportModal';

interface GmailConnection {
  email: string | null;
  total_processed: number;
  last_sync_at: string | null;
}

const COLORS = ['#FF5A5F', '#00A699', '#FC642D', '#5C6BC0', '#FFB400', '#7B61FF'];

type EditTarget = Property | 'new' | null;

export function Settings() {
  const properties = useLiveQuery(() => db.properties.toArray()) ?? [];
  const [editing, setEditing] = useState<EditTarget>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [icalUrl, setIcalUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showAirbnbImport, setShowAirbnbImport] = useState(false);
  const [gmail, setGmail] = useState<GmailConnection | null>(null);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailMessage, setGmailMessage] = useState<string | null>(null);

  const loadGmail = async () => {
    const { data: token } = await supabase
      .from('user_google_tokens')
      .select('email')
      .maybeSingle();
    if (!token) {
      setGmail(null);
      return;
    }
    const { data: state } = await supabase
      .from('gmail_sync_state')
      .select('total_processed, last_sync_at')
      .maybeSingle();
    setGmail({
      email: token.email ?? null,
      total_processed: state?.total_processed ?? 0,
      last_sync_at: state?.last_sync_at ?? null,
    });
  };

  useEffect(() => {
    loadGmail();
  }, []);

  // OAuth 콜백 처리: ?code=...&state=gmail-oauth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (code && state === 'gmail-oauth') {
      (async () => {
        setGmailBusy(true);
        setGmailMessage('Gmail 연동 처리 중…');
        try {
          const { data, error } = await supabase.functions.invoke(
            'oauth-callback',
            {
              body: {
                code,
                redirect_uri:
                  window.location.origin + window.location.pathname,
              },
            },
          );
          if (error) throw error;
          window.history.replaceState({}, '', window.location.pathname);
          await loadGmail();
          setGmailMessage(`Gmail 연동 완료: ${data?.email ?? ''}`);
        } catch (e) {
          setGmailMessage(
            'Gmail 연동 실패: ' + (e instanceof Error ? e.message : ''),
          );
        } finally {
          setGmailBusy(false);
        }
      })();
    }
  }, []);

  const startGmailOAuth = async () => {
    setGmailBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        url: string;
      }>('oauth-callback', { method: 'GET' });
      if (error) throw error;
      if (!data?.url) throw new Error('URL 생성 실패');
      window.location.href = data.url;
    } catch (e) {
      setGmailMessage(
        'OAuth URL 생성 실패: ' + (e instanceof Error ? e.message : ''),
      );
      setGmailBusy(false);
    }
  };

  const runGmailSync = async () => {
    setGmailBusy(true);
    setGmailMessage('Gmail 동기화 중…');
    try {
      const { data, error } = await supabase.functions.invoke('gmail-sync');
      if (error) throw error;
      setGmailMessage(
        `완료 — 처리 ${data.newProcessed ?? 0}건 · 업데이트 ${data.updated ?? 0}건 · 신규 ${data.inserted ?? 0}건${
          data.errors?.length ? ` · 오류 ${data.errors.length}건` : ''
        }`,
      );
      await loadGmail();
    } catch (e) {
      setGmailMessage(
        '동기화 실패: ' + (e instanceof Error ? e.message : ''),
      );
    } finally {
      setGmailBusy(false);
    }
  };

  const disconnectGmail = async () => {
    if (!confirm('Gmail 연동을 해제할까요? (저장된 예약은 유지)')) return;
    setGmailBusy(true);
    try {
      await supabase.from('user_google_tokens').delete().neq('user_id', '');
      await loadGmail();
      setGmailMessage('Gmail 연동 해제됨');
    } finally {
      setGmailBusy(false);
    }
  };

  const startEdit = (target: Property | 'new') => {
    setEditing(target);
    if (target === 'new') {
      setName('');
      setColor(COLORS[properties.length % COLORS.length]);
      setIcalUrl('');
    } else {
      setName(target.name);
      setColor(target.color);
      setIcalUrl(target.icalUrl ?? '');
    }
  };

  const saveProperty = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const url = icalUrl.trim() || undefined;
      if (editing === 'new') {
        await addProperty({ name: name.trim(), color, icalUrl: url });
      } else if (editing) {
        await updateProperty(editing.id, {
          name: name.trim(),
          color,
          icalUrl: url ?? '',
        });
      }
      setEditing(null);
    } catch (err) {
      alert(
        '저장 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSyncIcals = async () => {
    setSyncing(true);
    try {
      const result = await syncAllIcals(properties);
      const msg = `iCal 동기화 완료\n새 예약 ${result.added}건\n기존/스킵 ${result.skipped}건${
        result.errors.length ? `\n오류: ${result.errors.join(', ')}` : ''
      }`;
      alert(msg);
    } catch (err) {
      alert(
        '동기화 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'),
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteProperty = async (id: string) => {
    if (
      !confirm(
        '이 숙소를 삭제할까요? 관련된 예약과 비용도 함께 삭제됩니다.',
      )
    )
      return;
    setBusy(true);
    try {
      await deleteProperty(id);
    } catch (err) {
      alert(
        '삭제 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'),
      );
    } finally {
      setBusy(false);
    }
  };

  const shareFile = async (blob: Blob, filename: string, mime: string) => {
    if (typeof navigator.share === 'function') {
      try {
        const file = new File([blob], filename, { type: mime });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return;
        }
      } catch {
        /* fall through to download */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    const props = await db.properties.toArray();
    const bookings = await db.bookings.toArray();
    const expenses = await db.expenses.toArray();
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      properties: props,
      bookings,
      expenses,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const filename = `airbnb-ledger-${new Date().toISOString().slice(0, 10)}.json`;
    await shareFile(blob, filename, 'application/json');
  };

  const handleExportCSV = async () => {
    const props = await db.properties.toArray();
    const bookings = await db.bookings.toArray();
    const expenses = await db.expenses.toArray();

    const propMap = new Map(props.map((p) => [p.id, p.name]));
    const platformMap = new Map(PLATFORMS.map((p) => [p.value, p.label]));
    const countryMap = new Map(COUNTRIES.map((c) => [c.code, c.name]));

    const headers = [
      '날짜',
      '구분',
      '숙소',
      '카테고리',
      '게스트',
      '국가',
      '인원',
      '박수',
      '매출(KRW)',
      '비용(KRW)',
      '메모',
    ];

    const rows: unknown[][] = [];

    bookings.forEach((b) => {
      rows.push([
        b.checkIn,
        '예약',
        propMap.get(b.propertyId) ?? '',
        platformMap.get(b.platform) ?? b.platform,
        b.guestName,
        countryMap.get(b.country) ?? b.country,
        b.guests,
        b.nights,
        b.revenue,
        '',
        b.notes ?? '',
      ]);
    });

    expenses.forEach((e) => {
      rows.push([
        e.date,
        '비용',
        e.propertyId ? (propMap.get(e.propertyId) ?? '') : '공통',
        e.category,
        '',
        '',
        '',
        '',
        '',
        e.amount,
        e.notes ?? '',
      ]);
    });

    rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));

    const csv = buildCSV(headers, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const filename = `airbnb-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    await shareFile(blob, filename, 'text/csv');
  };

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (
        !confirm(
          '클라우드의 현재 데이터를 모두 덮어쓰고 이 백업으로 복원할까요?',
        )
      )
        return;
      setBusy(true);

      // 안전하게: 기존 클라우드 데이터 삭제 후 일괄 insert
      await clearAll();

      const userRes = await supabase.auth.getUser();
      const userId = userRes.data.user?.id;
      if (!userId) throw new Error('Not authenticated');

      if (Array.isArray(data.properties) && data.properties.length) {
        const rows = data.properties.map((p: Property) => ({
          user_id: userId,
          name: p.name,
          color: p.color,
        }));
        const r = await supabase.from('properties').insert(rows);
        if (r.error) throw r.error;
      }
      // 예약/비용은 propertyId가 변경되므로 import 시 매핑 어려움 → 백업/복원은 같은 환경에서만 권장
      // 단순화: 나머지 데이터는 import하지 않고 알림
      await syncAll();
      alert(
        '숙소 정보만 복원했어요. 예약/비용은 기존 ID 참조 문제로 복원하지 않았습니다.',
      );
    } catch (err) {
      alert(
        '복원 실패: ' + (err instanceof Error ? err.message : '파일 형식 오류'),
      );
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const handleClear = async () => {
    if (!confirm('정말 모든 데이터를 삭제할까요? 클라우드에서도 사라져요.'))
      return;
    if (
      !confirm(
        '한 번 더 확인합니다. 모든 숙소, 예약, 비용이 영구 삭제됩니다.',
      )
    )
      return;
    setBusy(true);
    try {
      await clearAll();
      alert('삭제 완료');
    } catch (err) {
      alert(
        '삭제 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <h1>설정</h1>

      <section className="section">
        <h2>숙소</h2>
        <div className="card">
          {properties.length === 0 && (
            <div className="empty" style={{ padding: 20 }}>
              숙소를 추가해주세요
            </div>
          )}
          {properties.map((p) => (
            <div key={p.id} className="property-row">
              <span className="property-row-name">
                <span className="dot" style={{ background: p.color }} />
                {p.name}
                {p.icalUrl && <span className="badge">📅</span>}
              </span>
              <span className="property-row-actions">
                <button
                  className="btn"
                  onClick={() => startEdit(p)}
                  disabled={busy}
                >
                  수정
                </button>
                <button
                  className="btn"
                  style={{ color: 'var(--neg)' }}
                  onClick={() => handleDeleteProperty(p.id)}
                  disabled={busy}
                >
                  삭제
                </button>
              </span>
            </div>
          ))}
          <button
            className="btn primary block"
            onClick={() => startEdit('new')}
            disabled={busy}
          >
            + 숙소 추가
          </button>
        </div>
      </section>

      {properties.some((p) => !!p.icalUrl) && (
        <section className="section">
          <h2>iCal 동기화</h2>
          <div className="card">
            <button
              className="btn primary block"
              onClick={handleSyncIcals}
              disabled={syncing}
            >
              {syncing ? '동기화 중…' : '지금 동기화'}
            </button>
            <p className="muted small">
              Airbnb iCal에 있는 예약을 자동으로 가져와요. 매출/게스트
              이름은 직접 채워야 합니다.
            </p>
          </div>
        </section>
      )}

      <section className="section">
        <h2>Gmail 자동 동기화</h2>
        <div className="card">
          {!gmail ? (
            <>
              <button
                className="btn primary block"
                onClick={startGmailOAuth}
                disabled={gmailBusy}
              >
                {gmailBusy ? '연결 중…' : 'Gmail 연결하기'}
              </button>
              <p className="muted small">
                Airbnb가 호스트에게 보내는 알림 메일에서 매출·게스트
                이름·체크인을 자동으로 추출합니다. 본인 Gmail의{' '}
                <strong>읽기 권한만</strong> 받고, 메일을 다른 곳에 보내지
                않습니다.
              </p>
            </>
          ) : (
            <>
              <div className="metric">
                <span>연결된 계정</span>
                <strong>{gmail.email ?? '—'}</strong>
              </div>
              <div className="metric">
                <span>처리한 메일</span>
                <strong>{gmail.total_processed}건</strong>
              </div>
              <div className="metric">
                <span>마지막 동기화</span>
                <strong>
                  {gmail.last_sync_at
                    ? new Date(gmail.last_sync_at).toLocaleString('ko-KR')
                    : '—'}
                </strong>
              </div>
              <button
                className="btn primary block"
                onClick={runGmailSync}
                disabled={gmailBusy}
                style={{ marginTop: 12 }}
              >
                {gmailBusy ? '동기화 중…' : '지금 동기화'}
              </button>
              <button
                className="btn block"
                onClick={disconnectGmail}
                disabled={gmailBusy}
              >
                연동 해제
              </button>
            </>
          )}
          {gmailMessage && (
            <p className="muted small" style={{ marginTop: 10 }}>
              {gmailMessage}
            </p>
          )}
        </div>
      </section>

      {properties.length > 0 && (
        <section className="section">
          <h2>Airbnb 수익 가져오기</h2>
          <div className="card">
            <button
              className="btn primary block"
              onClick={() => setShowAirbnbImport(true)}
            >
              CSV 가져오기 (매출 자동 채우기)
            </button>
            <p className="muted small">
              Airbnb 호스트 → 거래내역 → CSV 다운로드 후 업로드하면
              <br />
              ① iCal로 들어온 임시 예약의 매출이 자동으로 채워지고
              <br />
              ② 새 예약은 confirmed 상태로 추가됩니다.
            </p>
          </div>
        </section>
      )}

      <section className="section">
        <h2>내보내기</h2>
        <div className="card">
          <button className="btn primary block" onClick={handleExportCSV}>
            CSV 내보내기 (Excel/Sheets)
          </button>
          <button className="btn block" onClick={handleExport}>
            JSON 백업
          </button>
          <label className="btn block file-label">
            JSON 복원 (숙소만)
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleImport}
              hidden
            />
          </label>
          <p className="muted small">
            CSV: Google Sheets, Excel, Numbers에서 바로 열림. <br />
            데이터는 클라우드(Supabase)에 자동 저장되므로 평소엔 따로 백업 불필요.
          </p>
        </div>
      </section>

      <section className="section">
        <h2>위험 영역</h2>
        <div className="card">
          <button
            className="btn block"
            style={{ color: 'var(--neg)' }}
            onClick={handleClear}
            disabled={busy}
          >
            모든 데이터 삭제 (클라우드 포함)
          </button>
        </div>
      </section>

      {showAirbnbImport && (
        <AirbnbImportModal
          properties={properties}
          onClose={() => setShowAirbnbImport(false)}
        />
      )}

      {editing && (
        <Modal
          title={editing === 'new' ? '숙소 추가' : '숙소 수정'}
          onClose={() => setEditing(null)}
        >
          <form className="form" onSubmit={saveProperty}>
            <label>
              이름
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                placeholder="예: 강릉 1호점"
              />
            </label>
            <label>
              색상
              <div className="color-picker">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`color-swatch ${color === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </label>
            <label>
              iCal URLs <span className="muted">(선택, 한 줄에 하나씩)</span>
              <textarea
                value={icalUrl}
                onChange={(e) => setIcalUrl(e.target.value)}
                placeholder={
                  'https://www.airbnb.com/calendar/ical/...\nhttps://www.wehome.me/calendar/ical/...\nhttps://ycs.agoda.com/...\nhttps://ical.booking.com/...\nhttp://www.vrbo.com/icalendar/...\nhttps://mrmention-...amazonaws.com/...'
                }
                rows={6}
                autoComplete="off"
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
              <span className="muted small" style={{ marginTop: 4 }}>
                Airbnb · 위홈 · Agoda · VRBO · Booking.com · 미스터멘션
                지원. 한 줄에 한 URL씩.
              </span>
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                취소
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? '저장 중…' : '저장'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
