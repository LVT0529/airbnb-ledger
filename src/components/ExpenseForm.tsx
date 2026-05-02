import { FormEvent, useState } from 'react';
import { db } from '../db';
import { Expense, ExpenseCategory, Property } from '../types';
import { EXPENSE_CATEGORIES } from '../data';
import { todayYmd } from '../utils';
import { Modal } from './Modal';

interface Props {
  expense: Expense | null;
  properties: Property[];
  onClose: () => void;
}

export function ExpenseForm({ expense, properties, onClose }: Props) {
  const [propertyId, setPropertyId] = useState<number | null>(
    expense?.propertyId ?? null,
  );
  const [category, setCategory] = useState<ExpenseCategory>(
    expense?.category ?? '청소비',
  );
  const [amount, setAmount] = useState(expense?.amount ?? 0);
  const [date, setDate] = useState(expense?.date ?? todayYmd());
  const [notes, setNotes] = useState(expense?.notes ?? '');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const data: Omit<Expense, 'id'> = {
      propertyId,
      category,
      amount,
      date,
      notes: notes.trim() || undefined,
      createdAt: expense?.createdAt ?? Date.now(),
    };
    if (expense?.id) {
      await db.expenses.update(expense.id, data);
    } else {
      await db.expenses.add(data as Expense);
    }
    onClose();
  };

  const handleDelete = async () => {
    if (!expense?.id) return;
    if (confirm('이 비용을 삭제할까요?')) {
      await db.expenses.delete(expense.id);
      onClose();
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
              setPropertyId(e.target.value === '' ? null : Number(e.target.value))
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
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          금액 (KRW)
          <input
            type="number"
            min={0}
            step={1000}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            required
            autoFocus
          />
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
            rows={3}
          />
        </label>
        <div className="form-actions">
          {expense && (
            <button
              type="button"
              className="btn"
              style={{ color: 'var(--neg)' }}
              onClick={handleDelete}
            >
              삭제
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn primary">
            저장
          </button>
        </div>
      </form>
    </Modal>
  );
}
