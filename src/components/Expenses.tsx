import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import { db } from '../db';
import { Expense } from '../types';
import { formatKRW, monthRange } from '../utils';
import { deleteExpense } from '../sync';
import { ExpenseForm } from './ExpenseForm';
import { RecurringExpenses } from './RecurringExpenses';

type Filter = 'all' | 'shared' | string;

export function Expenses() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [filterProperty, setFilterProperty] = useState<Filter>('all');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);

  const range = monthRange(year, month);

  const properties = useLiveQuery(() => db.properties.toArray()) ?? [];
  const allExpenses =
    useLiveQuery(
      () =>
        db.expenses
          .where('date')
          .between(range.start, range.end, true, true)
          .toArray(),
      [range.start, range.end],
    ) ?? [];

  const expenses = useMemo(
    () =>
      [...allExpenses].sort((a, b) => b.date.localeCompare(a.date)),
    [allExpenses],
  );

  const filtered =
    filterProperty === 'all'
      ? expenses
      : filterProperty === 'shared'
        ? expenses.filter((e) => e.propertyId === null)
        : expenses.filter((e) => e.propertyId === filterProperty);

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  const handleAdd = () => {
    setEditing(null);
    setShowForm(true);
  };
  const handleEdit = (e: Expense) => {
    setEditing(e);
    setShowForm(true);
  };
  const handleDelete = async (id: string) => {
    if (!confirm('이 비용을 삭제할까요?')) return;
    try {
      await deleteExpense(id);
    } catch (err) {
      alert(
        '삭제 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'),
      );
    }
  };

  const prev = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else setMonth((m) => m - 1);
  };
  const next = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else setMonth((m) => m + 1);
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>비용</h1>
        <button className="btn primary" onClick={handleAdd}>
          + 추가
        </button>
      </div>

      <div className="month-nav">
        <button onClick={prev} aria-label="이전 달">
          <ChevronLeft size={16} />
        </button>
        <h1>
          {year}년 {month}월
        </h1>
        <button onClick={next} aria-label="다음 달">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="filter-bar">
        <button
          className={filterProperty === 'all' ? 'active' : ''}
          onClick={() => setFilterProperty('all')}
        >
          전체
        </button>
        {properties.map((p) => (
          <button
            key={p.id}
            className={filterProperty === p.id ? 'active' : ''}
            onClick={() => setFilterProperty(p.id)}
          >
            <span className="dot" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
        <button
          className={filterProperty === 'shared' ? 'active' : ''}
          onClick={() => setFilterProperty('shared')}
        >
          공통
        </button>
      </div>

      <div className="card">
        <div className="metric large">
          <span>합계</span>
          <strong className="neg">−{formatKRW(total)}</strong>
        </div>
      </div>

      <button
        className="btn block"
        onClick={() => setShowRecurring((v) => !v)}
        style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <Repeat size={14} />
        정기 결제 관리 {showRecurring ? '닫기' : '열기'}
      </button>

      {showRecurring && (
        <div style={{ marginBottom: 16 }}>
          <RecurringExpenses properties={properties} />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty">이번 달 비용 내역이 없어요</div>
      ) : (
        <div className="list">
          {filtered.map((ex) => {
            const prop = properties.find((p) => p.id === ex.propertyId);
            const isRecurring = !!ex.sourceRecurringId;
            return (
              <div
                key={ex.id}
                className="list-item"
                onClick={() => handleEdit(ex)}
                style={
                  prop
                    ? { borderLeft: `3px solid ${prop.color}` }
                    : { borderLeft: `3px solid var(--ink-soft)` }
                }
              >
                <div className="item-main">
                  <div className="item-title">
                    {isRecurring && (
                      <Repeat
                        size={12}
                        style={{
                          marginRight: 6,
                          verticalAlign: 'middle',
                          color: 'var(--ink-muted)',
                        }}
                      />
                    )}
                    {ex.category}
                  </div>
                  <div className="item-meta">
                    {prop ? prop.name : '공통'} · {ex.date}
                    {ex.notes && ` · ${ex.notes}`}
                  </div>
                </div>
                <div className="item-amount">
                  <span>{formatKRW(ex.amount)}</span>
                  <button
                    className="del"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(ex.id);
                    }}
                    aria-label="삭제"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <ExpenseForm
          expense={editing}
          properties={properties}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
