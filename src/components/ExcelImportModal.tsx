import { ChangeEvent, useMemo, useState } from 'react';
import { Property } from '../types';
import { formatKRW } from '../utils';
import { parseExcelFile, ExcelImportPreview } from '../lib/excelImport';
import { addExpense } from '../sync';
import { Modal } from './Modal';

interface Props {
  properties: Property[];
  onClose: () => void;
}

export function ExcelImportModal({ properties, onClose }: Props) {
  const [preview, setPreview] = useState<ExcelImportPreview | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    inserted: number;
    failed: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categoryStats = useMemo(() => {
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
    setBusy(true);
    setError(null);
    let inserted = 0;
    let failed = 0;
    for (const ex of preview.expenses) {
      try {
        await addExpense({
          propertyId,
          category: ex.category,
          amount: ex.amount,
          date: ex.date,
          notes: [ex.description, ex.notes].filter(Boolean).join(' · '),
        });
        inserted++;
      } catch {
        failed++;
      }
    }
    setResult({ inserted, failed });
    setBusy(false);
  };

  return (
    <Modal title="엑셀 가계부 가져오기" onClose={onClose}>
      {!preview && !result && (
        <div className="form">
          <p className="muted small" style={{ margin: '0 0 12px' }}>
            "편한가계부" 등 엑셀 파일을 업로드하면 비용 항목을 자동으로
            카테고리 매핑하여 미리보기를 보여드려요. 수입은 무시됩니다 (iCal/CSV로 처리).
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
          <div className="card" style={{ margin: 0, padding: 14 }}>
            <div className="metric">
              <span>전체 행</span>
              <strong>{preview.totalRows}건</strong>
            </div>
            <div className="metric">
              <span>수입 (스킵)</span>
              <strong>{preview.incomeCount}건</strong>
            </div>
            <div className="metric">
              <span>지출 (가져올)</span>
              <strong style={{ color: 'var(--pos)' }}>
                {preview.expenseCount}건
              </strong>
            </div>
            <div className="metric large">
              <span>지출 합계</span>
              <strong>{formatKRW(preview.expenseTotal)}</strong>
            </div>
          </div>

          <div className="muted small" style={{ margin: 0 }}>
            카테고리 자동 매핑 결과:
          </div>
          <div className="card" style={{ margin: 0, padding: 12 }}>
            {categoryStats.map(({ cat, count, sum }) => (
              <div key={cat} className="metric">
                <span>{cat}</span>
                <strong>
                  {count}건 · {formatKRW(sum)}
                </strong>
              </div>
            ))}
          </div>

          {preview.unmappedCategories.length > 0 && (
            <p className="muted small" style={{ margin: 0 }}>
              "기타"로 분류된 원본 카테고리:{' '}
              {preview.unmappedCategories.slice(0, 6).join(', ')}
              {preview.unmappedCategories.length > 6 &&
                ` 외 ${preview.unmappedCategories.length - 6}개`}
            </p>
          )}

          <label>
            숙소 (모든 비용에 적용)
            <select
              value={propertyId ?? ''}
              onChange={(e) =>
                setPropertyId(e.target.value === '' ? null : e.target.value)
              }
            >
              <option value="">공통 (모든 숙소)</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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
              disabled={busy}
            >
              {busy
                ? `가져오는 중… (${preview.expenseCount}건)`
                : `${preview.expenseCount}건 가져오기`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="form">
          <div className="card" style={{ margin: 0, padding: 14 }}>
            <div className="metric">
              <span>저장된 비용</span>
              <strong style={{ color: 'var(--pos)' }}>
                {result.inserted}건
              </strong>
            </div>
            {result.failed > 0 && (
              <div className="metric">
                <span>실패</span>
                <strong style={{ color: 'var(--neg)' }}>
                  {result.failed}건
                </strong>
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
