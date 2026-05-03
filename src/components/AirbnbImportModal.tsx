import { ChangeEvent, useMemo, useState } from 'react';
import { Property } from '../types';
import { parseCSV } from '../utils';
import {
  AirbnbCsvImportResult,
  ParsedAirbnbRow,
  importAirbnbCsv,
  parseAirbnbCsvRows,
} from '../sync';
import { Modal } from './Modal';

interface Props {
  properties: Property[];
  onClose: () => void;
}

export function AirbnbImportModal({ properties, onClose }: Props) {
  const [parsed, setParsed] = useState<ParsedAirbnbRow[] | null>(null);
  const [listingMap, setListingMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AirbnbCsvImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uniqueListings = useMemo(() => {
    if (!parsed) return [];
    const set = new Set<string>();
    parsed.forEach((p) => p.listing && set.add(p.listing));
    return Array.from(set);
  }, [parsed]);

  const totalAmount = useMemo(
    () => (parsed ?? []).reduce((s, r) => s + r.amount, 0),
    [parsed],
  );

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      const parsedRows = parseAirbnbCsvRows(rows);
      if (parsedRows.length === 0) {
        setError(
          'CSV에서 예약 행을 찾지 못했어요. Airbnb 호스트 → 거래내역 → CSV 다운로드 형식이 맞는지 확인해주세요.',
        );
        return;
      }
      setParsed(parsedRows);

      // 자동 매핑 시도
      const map: Record<string, string> = {};
      const listings = new Set(parsedRows.map((p) => p.listing).filter(Boolean));
      listings.forEach((l) => {
        const match = properties.find(
          (p) =>
            l.includes(p.name) ||
            p.name.includes(l) ||
            l.toLowerCase().includes(p.name.toLowerCase()),
        );
        if (match) map[l] = match.id;
      });
      setListingMap(map);
      setError(null);
    } catch (err) {
      setError('CSV 읽기 실패: ' + (err instanceof Error ? err.message : ''));
    } finally {
      e.target.value = '';
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    setBusy(true);
    try {
      const r = await importAirbnbCsv(parsed, listingMap);
      setResult(r);
    } catch (err) {
      setError('처리 실패: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setBusy(false);
    }
  };

  const allMapped = uniqueListings.every((l) => listingMap[l]);

  return (
    <Modal title="Airbnb 수익 CSV 가져오기" onClose={onClose}>
      {!parsed && !result && (
        <div className="form">
          <p className="muted small" style={{ margin: '0 0 12px' }}>
            Airbnb 호스트 사이트 → <strong>호스팅</strong> →{' '}
            <strong>거래 내역</strong> 또는 <strong>수익</strong> →{' '}
            <strong>CSV 다운로드</strong> 후 그 파일을 업로드해주세요.
          </p>
          <label className="btn primary block file-label">
            CSV 파일 선택
            <input
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={handleFile}
            />
          </label>
          {error && <div className="error">{error}</div>}
        </div>
      )}

      {parsed && !result && (
        <div className="form">
          <div className="card" style={{ margin: 0, padding: 14 }}>
            <div className="metric">
              <span>예약 행</span>
              <strong>{parsed.length}건</strong>
            </div>
            <div className="metric">
              <span>총 매출</span>
              <strong>₩ {totalAmount.toLocaleString('ko-KR')}</strong>
            </div>
            <div className="metric">
              <span>고유 숙소</span>
              <strong>{uniqueListings.length}개</strong>
            </div>
          </div>

          <div className="muted small" style={{ margin: 0 }}>
            CSV에 있는 숙소 이름을 우리 앱의 숙소와 연결해주세요.
          </div>

          {uniqueListings.map((l) => (
            <label key={l}>
              {l}
              <select
                value={listingMap[l] ?? ''}
                onChange={(e) =>
                  setListingMap((m) => ({ ...m, [l]: e.target.value }))
                }
              >
                <option value="">(매핑 안 함 — 무시)</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ))}

          {error && <div className="error">{error}</div>}

          <div className="form-actions">
            <button
              type="button"
              className="btn"
              onClick={() => setParsed(null)}
              disabled={busy}
            >
              뒤로
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={handleImport}
              disabled={busy || !allMapped}
            >
              {busy ? '처리 중…' : `${parsed.length}건 가져오기`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="form">
          <div className="card" style={{ margin: 0, padding: 14 }}>
            <div className="metric">
              <span>전체</span>
              <strong>{result.total}건</strong>
            </div>
            <div className="metric">
              <span>기존 예약 매출 채움</span>
              <strong style={{ color: 'var(--pos)' }}>
                {result.matched}건
              </strong>
            </div>
            <div className="metric">
              <span>새로 추가</span>
              <strong style={{ color: 'var(--pos)' }}>
                {result.inserted}건
              </strong>
            </div>
            <div className="metric">
              <span>스킵</span>
              <strong>{result.skipped}건</strong>
            </div>
            {result.errors.length > 0 && (
              <>
                <hr />
                <div className="muted small" style={{ margin: 0 }}>
                  오류 {result.errors.length}건:
                </div>
                <ul
                  style={{
                    fontSize: 12,
                    color: 'var(--neg)',
                    margin: '6px 0 0',
                    paddingLeft: 16,
                  }}
                >
                  {result.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {result.errors.length > 5 && (
                    <li>… 외 {result.errors.length - 5}건</li>
                  )}
                </ul>
              </>
            )}
          </div>

          <button
            type="button"
            className="btn primary block"
            onClick={onClose}
          >
            완료
          </button>
        </div>
      )}
    </Modal>
  );
}
