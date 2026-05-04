import { FormEvent, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Property, RecurringExpense } from '../types';
import { EXPENSE_CATEGORIES } from '../data';
import {
  formatAmountInput,
  formatKRW,
  parseAmount,
} from '../utils';
import {
  addRecurringExpense,
  applyRecurringExpenses,
  deleteRecurringExpense,
  updateRecurringExpense,
} from '../sync';
import { Modal } from './Modal';

interface Props {
  properties: Property[];
}

type EditTarget = RecurringExpense | 'new' | null;

function nextDueLabel(rec: RecurringExpense): string {
  const now = new Date();
  const today = now.getDate();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  let y = thisYear;
  let m = thisMonth;
  if (rec.dayOfMonth <= today) {
    if (m === 12) {
      y++;
      m = 1;
    } else m++;
  }
  const lastDay = new Date(y, m, 0).getDate();
  const day = Math.min(rec.dayOfMonth, lastDay);
  return `${y}.${String(m).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
}

export function RecurringExpenses({ properties }: Props) {
  const recurring =
    useLiveQuery(() => db.recurring_expenses.toArray()) ?? [];
  const allExpenses = useLiveQuery(() => db.expenses.toArray()) ?? [];

  const [editing, setEditing] = useState<EditTarget>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const categorySuggestions = useMemo(() => {
    const set = new Set<string>(EXPENSE_CATEGORIES);
    allExpenses.forEach((e) => e.category && set.add(e.category));
    recurring.forEach((r) => r.category && set.add(r.category));
    return Array.from(set);
  }, [allExpenses, recurring]);

  const handleApplyNow = async () => {
    setApplying(true);
    setMessage(null);
    try {
      // force=true: 결제일이 미래여도 이번 달까지 강제 추가
      const r = await applyRecurringExpenses(true);
      const parts: string[] = [];
      if (r.added > 0) parts.push(`${r.added}건 추가`);
      if (r.skipped > 0) parts.push(`${r.skipped}건 이미 처리됨`);
      if (parts.length === 0) parts.push('적용할 내역 없음');
      if (r.errors.length > 0) parts.push(`오류 ${r.errors.length}건`);
      setMessage(parts.join(' · '));
    } catch (e) {
      setMessage('실패: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setApplying(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 정기 결제를 삭제할까요? (이미 추가된 비용은 유지됨)'))
      return;
    setBusy(true);
    try {
      await deleteRecurringExpense(id);
    } catch (e) {
      alert('삭제 실패: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (rec: RecurringExpense) => {
    setBusy(true);
    try {
      await updateRecurringExpense(rec.id, { active: !rec.active });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      {recurring.length === 0 ? (
        <div className="empty" style={{ padding: 20 }}>
          정기 결제 항목이 없어요
        </div>
      ) : (
        recurring.map((r) => {
          const prop = properties.find((p) => p.id === r.propertyId);
          return (
            <div
              key={r.id}
              className="recurring-row"
              style={{ opacity: r.active ? 1 : 0.5 }}
            >
              <div className="recurring-main">
                <div className="recurring-title">
                  {r.category}
                  {!r.active && (
                    <span className="muted small" style={{ marginLeft: 8 }}>
                      (비활성)
                    </span>
                  )}
                </div>
                <div className="recurring-meta">
                  {prop ? (
                    <>
                      <span
                        className="dot"
                        style={{ background: prop.color }}
                      />
                      {prop.name}
                    </>
                  ) : (
                    '공통'
                  )}{' '}
                  · 매월 {r.dayOfMonth}일 · 다음 {nextDueLabel(r)}
                </div>
              </div>
              <div className="recurring-actions">
                <span className="recurring-amount">
                  {formatKRW(r.amount)}
                </span>
                <button
                  className="btn"
                  onClick={() => handleToggleActive(r)}
                  disabled={busy}
                  style={{ padding: '4px 10px', fontSize: 11 }}
                >
                  {r.active ? '끄기' : '켜기'}
                </button>
                <button
                  className="btn"
                  onClick={() => setEditing(r)}
                  disabled={busy}
                  style={{ padding: '4px 10px', fontSize: 11 }}
                >
                  수정
                </button>
                <button
                  className="btn"
                  onClick={() => handleDelete(r.id)}
                  disabled={busy}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    color: 'var(--neg)',
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          );
        })
      )}

      <button
        className="btn primary block"
        onClick={() => setEditing('new')}
        style={{ marginTop: 12 }}
      >
        + 정기 결제 추가
      </button>

      {recurring.length > 0 && (
        <button
          className="btn block"
          onClick={handleApplyNow}
          disabled={applying}
          style={{ marginTop: 8 }}
        >
          {applying ? '적용 중…' : '이번 달까지 즉시 적용'}
        </button>
      )}

      {message && (
        <p className="muted small" style={{ marginTop: 10 }}>
          {message}
        </p>
      )}

      {editing && (
        <RecurringForm
          target={editing}
          properties={properties}
          categorySuggestions={categorySuggestions}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

interface FormProps {
  target: RecurringExpense | 'new';
  properties: Property[];
  categorySuggestions: string[];
  onClose: () => void;
}

function RecurringForm({
  target,
  properties,
  categorySuggestions,
  onClose,
}: FormProps) {
  const isNew = target === 'new';
  const init = isNew ? null : target;

  const [propertyId, setPropertyId] = useState<string | null>(
    init?.propertyId ?? null,
  );
  const [category, setCategory] = useState(init?.category ?? '청소비');
  const [amountStr, setAmountStr] = useState(
    init ? formatAmountInput(String(init.amount)) : '',
  );
  const [dayOfMonth, setDayOfMonth] = useState(init?.dayOfMonth ?? 1);
  const [notes, setNotes] = useState(init?.notes ?? '');
  const [active, setActive] = useState(init?.active ?? true);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!category.trim()) {
      alert('카테고리를 입력해주세요');
      return;
    }
    setBusy(true);
    const data = {
      propertyId,
      category: category.trim(),
      amount: parseAmount(amountStr),
      dayOfMonth: Math.max(1, Math.min(31, dayOfMonth)),
      notes: notes.trim() || undefined,
      active,
    };
    try {
      if (isNew) {
        const now = new Date();
        await addRecurringExpense({
          ...data,
          startMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        });
      } else if (init) {
        await updateRecurringExpense(init.id, data);
      }
      onClose();
    } catch (e) {
      alert('저장 실패: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isNew ? '정기 결제 추가' : '정기 결제 수정'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="form">
        <label>
          숙소
          <select
            value={propertyId === null ? '' : propertyId}
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
        <label>
          카테고리
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            list="rec-cat-suggestions"
            required
            placeholder="예: 통신비, 보험료, 광고비…"
            autoComplete="off"
          />
          <datalist id="rec-cat-suggestions">
            {categorySuggestions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label>
          금액 (KRW)
          <div className="amount-input">
            <input
              type="text"
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => setAmountStr(formatAmountInput(e.target.value))}
              required
              placeholder="0"
            />
            <span className="amount-suffix">원</span>
          </div>
        </label>
        <label>
          매월 결제일
          <input
            type="number"
            min={1}
            max={31}
            inputMode="numeric"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Number(e.target.value))}
            required
          />
          <span className="muted small" style={{ marginTop: 4 }}>
            결제일이 그 달에 없으면 (예: 31일이 없는 달) 마지막 날에
            적용됩니다.
          </span>
        </label>
        <label>
          메모
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span>활성화 (꺼두면 자동 추가 안 됨)</span>
        </label>

        <div className="form-actions">
          <button
            type="button"
            className="btn"
            onClick={onClose}
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
  );
}
