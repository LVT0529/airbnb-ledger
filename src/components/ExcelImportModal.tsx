import { ChangeEvent, useMemo, useState } from 'react';
import { Property } from '../types';
import { formatKRW } from '../utils';
import { parseExcelFile, ExcelImportPreview } from '../lib/excelImport';
import { addBooking, addExpense } from '../sync';
import { db } from '../db';
import { PLATFORMS } from '../data';
import { Modal } from './Modal';

const expenseSig = (e: {
  date: string;
  amount: number;
  category: string;
  notes?: string | null;
}) => `${e.date}|${e.amount}|${e.category}|${e.notes ?? ''}`.toLowerCase();

const bookingSig = (b: {
  checkIn: string;
  revenue: number;
  guestName: string;
  platform: string;
}) => `${b.checkIn}|${b.revenue}|${b.guestName}|${b.platform}`.toLowerCase();

interface Props {
  properties: Property[];
  onClose: () => void;
}

export function ExcelImportModal({ properties, onClose }: Props) {
  const [preview, setPreview] = useState<ExcelImportPreview | null>(null);
  const [propertyId, setPropertyId] = useState<string>(
    properties[0]?.id ?? '',
  );
  const [importExpenses, setImportExpenses] = useState(true);
  const [importBookings, setImportBookings] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{
    expensesInserted: number;
    bookingsInserted: number;
    expensesSkipped: number;
    bookingsSkipped: number;
    failed: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expenseCategoryStats = useMemo(() => {
    if (!preview) return [];
    const map = new Map<string, { count: number; sum: number }>();
    preview.expenses.forEach((e) => {
      const cur = map.get(e.category) ?? { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += e.amount;
      map.set(e.category, cur);
    });
    return Array.from(map.entries())
      .map(([cat, v]) => ({ cat, ...v }))
      .sort((a, b) => b.sum - a.sum);
  }, [preview]);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setBusy(true);
    try {
      const p = await parseExcelFile(f);
      setPreview(p);
    } catch (err) {
      setError('파일 읽기 실패: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    if (!propertyId) {
      setError('숙소를 선택해주세요');
      return;
    }
    setBusy(true);
    setError(null);
    let expensesInserted = 0;
    let bookingsInserted = 0;
    let expensesSkipped = 0;
    let bookingsSkipped = 0;
    let failed = 0;

    // 기존 데이터 시그니처를 미리 모아 중복 방지 (propertyId 무관)
    const [existingExpenses, existingBookings] = await Promise.all([
      db.expenses.toArray(),
      db.bookings.toArray(),
    ]);
    const expenseSeen = new Set(existingExpenses.map(expenseSig));
    const bookingSeen = new Set(existingBookings.map(bookingSig));

    const total =
      (importExpenses ? preview.expenses.length : 0) +
      (importBookings ? preview.bookings.length : 0);
    setProgress({ done: 0, total });

    if (importExpenses) {
      for (const ex of preview.expenses) {
        const notes = [ex.description, ex.notes].filter(Boolean).join(' · ');
        const sig = expenseSig({
          date: ex.date,
          amount: ex.amount,
          category: ex.category,
          notes,
        });
        if (expenseSeen.has(sig)) {
          expensesSkipped++;
          setProgress((p) => ({ ...p, done: p.done + 1 }));
          continue;
        }
        expenseSeen.add(sig);
        try {
          await addExpense({
            propertyId,
            category: ex.category,
            amount: ex.amount,
            date: ex.date,
            notes,
          });
          expensesInserted++;
        } catch {
          failed++;
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }

    if (importBookings) {
      for (const b of preview.bookings) {
        const sig = bookingSig({
          checkIn: b.checkIn,
          revenue: b.revenue,
          guestName: b.guestName,
          platform: b.platform,
        });
        if (bookingSeen.has(sig)) {
          bookingsSkipped++;
          setProgress((p) => ({ ...p, done: p.done + 1 }));
          continue;
        }
        bookingSeen.add(sig);
        try {
          await addBooking({
            propertyId,
            guestName: b.guestName,
            country: b.country,
            platform: b.platform,
            guests: b.guests,
            nights: b.nights,
            checkIn: b.checkIn,
            checkOut: b.checkOut,
            revenue: b.revenue,
            notes: b.rawMemo || undefined,
            confirmationCode: undefined,
            status: 'confirmed',
          });
          bookingsInserted++;
        } catch {
          failed++;
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }

    setResult({
      expensesInserted,
      bookingsInserted,
      expensesSkipped,
      bookingsSkipped,
      failed,
    });
    setBusy(false);
  };

  return (
    <Modal title="엑셀 가계부 가져오기" onClose={onClose}>
      {!preview && !result && (
        <div className="form">
          <p className="muted small" style={{ margin: '0 0 12px' }}>
            "편한가계부" 등 엑셀 파일을 업로드하면 비용·수입(예약)을 자동으로
            분류해 미리보기를 보여드려요.
          </p>
          <label className="btn primary block file-label">
            엑셀 파일 선택 (.xlsx)
            <input
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={handleFile}
              disabled={busy}
            />
          </label>
          {busy && <p className="muted small">읽는 중…</p>}
          {error && <div className="error">{error}</div>}
        </div>
      )}

      {preview && !result && (
        <div className="form">
          {/* 통계 카드 */}
          <div className="card" style={{ margin: 0, padding: 14 }}>
            <div className="metric">
              <span>전체 행</span>
              <strong>{preview.totalRows}건</strong>
            </div>
            <hr />
            <div className="metric">
              <span>예약 (수입)</span>
              <strong style={{ color: 'var(--pos)' }}>
                {preview.bookingCount}건 · {formatKRW(preview.bookingTotal)}
              </strong>
            </div>
            <div className="metric">
              <span>비용 (지출)</span>
              <strong className="neg">
                {preview.expenseCount}건 · −{formatKRW(preview.expenseTotal)}
              </strong>
            </div>
            {preview.invalidCount > 0 && (
              <div className="metric">
                <span>건너뜀</span>
                <strong className="muted">{preview.invalidCount}건</strong>
              </div>
            )}
            <hr />
            <div className="metric small muted">
              <span>합계 검증</span>
              <span>
                {preview.bookingCount +
                  preview.expenseCount +
                  preview.invalidCount}
                건 / {preview.totalRows}건
              </span>
            </div>
          </div>

          {/* 플랫폼별 매출 */}
          {Object.keys(preview.bookingsByPlatform).length > 0 && (
            <>
              <div className="muted small" style={{ margin: 0 }}>
                플랫폼별 매출:
              </div>
              <div className="card" style={{ margin: 0, padding: 12 }}>
                {Object.entries(preview.bookingsByPlatform)
                  .sort((a, b) => b[1] - a[1])
                  .map(([plat, sum]) => {
                    const p = PLATFORMS.find((x) => x.value === plat);
                    return (
                      <div key={plat} className="metric">
                        <span>
                          {p?.emoji} {p?.label ?? plat}
                        </span>
                        <strong>{formatKRW(sum)}</strong>
                      </div>
                    );
                  })}
              </div>
            </>
          )}

          {/* 비용 카테고리별 */}
          {expenseCategoryStats.length > 0 && (
            <>
              <div className="muted small" style={{ margin: 0 }}>
                비용 카테고리:
              </div>
              <div className="card" style={{ margin: 0, padding: 12 }}>
                {expenseCategoryStats.map(({ cat, count, sum }) => (
                  <div key={cat} className="metric">
                    <span>{cat}</span>
                    <strong>
                      {count}건 · {formatKRW(sum)}
                    </strong>
                  </div>
                ))}
              </div>
            </>
          )}

          {preview.unmappedCategories.length > 0 && (
            <p className="muted small" style={{ margin: 0 }}>
              "기타"로 분류된 원본:{' '}
              {preview.unmappedCategories.slice(0, 6).join(', ')}
              {preview.unmappedCategories.length > 6 &&
                ` 외 ${preview.unmappedCategories.length - 6}개`}
            </p>
          )}

          {preview.invalidSamples.length > 0 && (
            <details className="card" style={{ margin: 0, padding: 12 }}>
              <summary className="small" style={{ cursor: 'pointer' }}>
                건너뛴 {preview.invalidCount}건 자세히 보기
              </summary>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {preview.invalidSamples.map((s, i) => (
                  <div
                    key={i}
                    className="small"
                    style={{
                      borderLeft: '2px solid var(--ink-soft)',
                      paddingLeft: 8,
                    }}
                  >
                    <div>
                      <strong>{s.reason}</strong>{' '}
                      <span className="muted">
                        [type: "{s.rawType || '(빈값)'}"]
                      </span>
                    </div>
                    <div className="muted">
                      {s.date || '(날짜없음)'} · {s.category || '-'}
                      {s.subcategory && ` / ${s.subcategory}`} ·{' '}
                      {formatKRW(s.amount)}
                    </div>
                    {s.description && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {s.description}
                      </div>
                    )}
                  </div>
                ))}
                {preview.invalidCount > preview.invalidSamples.length && (
                  <div className="muted small">
                    외 {preview.invalidCount - preview.invalidSamples.length}건…
                  </div>
                )}
              </div>
            </details>
          )}

          <label>
            숙소 (모든 항목에 적용)
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
            >
              <option value="">선택…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={importBookings}
              onChange={(e) => setImportBookings(e.target.checked)}
            />
            <span>예약 {preview.bookingCount}건 가져오기</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={importExpenses}
              onChange={(e) => setImportExpenses(e.target.checked)}
            />
            <span>비용 {preview.expenseCount}건 가져오기</span>
          </label>

          {error && <div className="error">{error}</div>}

          <div className="form-actions">
            <button
              type="button"
              className="btn"
              onClick={() => setPreview(null)}
              disabled={busy}
            >
              뒤로
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={handleImport}
              disabled={
                busy ||
                !propertyId ||
                (!importExpenses && !importBookings)
              }
            >
              {busy
                ? `가져오는 중… (${progress.done}/${progress.total})`
                : '가져오기'}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="form">
          <div className="card" style={{ margin: 0, padding: 14 }}>
            <div className="metric">
              <span>예약 추가</span>
              <strong style={{ color: 'var(--pos)' }}>
                {result.bookingsInserted}건
              </strong>
            </div>
            <div className="metric">
              <span>비용 추가</span>
              <strong style={{ color: 'var(--pos)' }}>
                {result.expensesInserted}건
              </strong>
            </div>
            {(result.bookingsSkipped > 0 || result.expensesSkipped > 0) && (
              <div className="metric">
                <span>중복 건너뜀</span>
                <strong className="muted">
                  {result.bookingsSkipped + result.expensesSkipped}건
                </strong>
              </div>
            )}
            {result.failed > 0 && (
              <div className="metric">
                <span>실패</span>
                <strong className="neg">{result.failed}건</strong>
              </div>
            )}
          </div>
          <button type="button" className="btn primary block" onClick={onClose}>
            완료
          </button>
        </div>
      )}
    </Modal>
  );
}
