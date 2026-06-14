import { FormEvent, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Expense, ExpenseCategory, Property } from '../types';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_GROUPS } from '../data';
import {
  formatAmountInput,
  getRecentCategories,
  loadPrefs,
  parseAmount,
  savePrefs,
  todayYmd,
  trackRecentCategory,
} from '../utils';
import { addExpense, deleteExpense, updateExpense } from '../sync';
import { Modal } from './Modal';

interface Props {
  expense: Expense | null;
  properties: Property[];
  onClose: () => void;
}

export function ExpenseForm({ expense, properties, onClose }: Props) {
  const prefs = loadPrefs();
  const initialPropId =
    expense?.propertyId !== undefined
      ? expense.propertyId
      : prefs.lastExpensePropertyId !== undefined
        ? prefs.lastExpensePropertyId
        : null;

  const [propertyId, setPropertyId] = useState<string | null>(initialPropId);
  const [category, setCategory] = useState<ExpenseCategory>(
    expense?.category ?? '',
  );

  const allExpenses = useLiveQuery(() => db.expenses.toArray()) ?? [];
  const categorySuggestions = useMemo(() => {
    const set = new Set<string>(EXPENSE_CATEGORIES);
    allExpenses.forEach((e) => {
      if (e.category) set.add(e.category);
    });
    return Array.from(set);
  }, [allExpenses]);

  const recentCategories = useMemo(() => getRecentCategories(3), []);
  const knownItems = useMemo(
    () => new Set<string>(EXPENSE_CATEGORY_GROUPS.flatMap((g) => g.items)),
    [],
  );
  // 등록된 소분류가 아니면(사용자 직접 입력값) 처음부터 직접입력 모드
  const [customMode, setCustomMode] = useState(
    () => !!expense?.category && !knownItems.has(expense.category),
  );
  const [amountStr, setAmountStr] = useState(
    expense ? formatAmountInput(String(expense.amount)) : '',
  );
  const [date, setDate] = useState(expense?.date ?? todayYmd());
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [keepOpen, setKeepOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const amount = parseAmount(amountStr);
    const data = {
      propertyId,
      category,
      amount,
      date,
      notes: notes.trim() || undefined,
    };

    setSubmitting(true);
    try {
      if (expense?.id) {
        await updateExpense(expense.id, data);
      } else {
        await addExpense(data);
      }
      savePrefs({
        lastCategory: category,
        lastExpensePropertyId: propertyId,
      });
      trackRecentCategory(category);

      if (keepOpen && !expense) {
        setAmountStr('');
        setNotes('');
      } else {
        onClose();
      }
    } catch (err) {
      alert(
        '저장 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!expense?.id) return;
    if (!confirm('이 비용을 삭제할까요?')) return;
    setSubmitting(true);
    try {
      await deleteExpense(expense.id);
      onClose();
    } catch (err) {
      alert(
        '삭제 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={expense ? '비용 수정' : '비용 추가'} onClose={onClose}>
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
          {recentCategories.length > 0 && (
            <div className="quick-chips">
              {recentCategories.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`quick-chip ${category === c ? 'active' : ''}`}
                  onClick={() => {
                    setCategory(c);
                    setCustomMode(!knownItems.has(c));
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          {customMode ? (
            <>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="cat-suggestions"
                required
                placeholder="예: 청소비, 광고비, 인테리어…"
                autoComplete="off"
              />
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setCustomMode(false);
                  setCategory('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink-muted)',
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: '4px 0 0',
                  textAlign: 'left',
                }}
              >
                ← 목록에서 선택
              </button>
            </>
          ) : (
            <select
              value={category}
              required
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setCustomMode(true);
                  setCategory('');
                } else {
                  setCategory(e.target.value);
                }
              }}
            >
              <option value="" disabled>
                카테고리 선택…
              </option>
              {EXPENSE_CATEGORY_GROUPS.map((g) => (
                <optgroup key={g.major} label={g.major}>
                  {g.items.map((it) => (
                    <option key={it} value={it}>
                      {it}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="__custom__">+ 직접 입력…</option>
            </select>
          )}
          <datalist id="cat-suggestions">
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
              autoFocus
              placeholder="0"
            />
            <span className="amount-suffix">원</span>
          </div>
        </label>
        <label>
          날짜
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label>
          메모
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </label>

        {!expense && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={keepOpen}
              onChange={(e) => setKeepOpen(e.target.checked)}
            />
            <span>이어서 추가하기 (저장 후 폼 유지)</span>
          </label>
        )}

        <div className="form-actions">
          {expense && (
            <button
              type="button"
              className="btn"
              style={{ color: 'var(--neg)' }}
              onClick={handleDelete}
              disabled={submitting}
            >
              삭제
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={submitting}
          >
            취소
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={submitting}
          >
            {submitting ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
