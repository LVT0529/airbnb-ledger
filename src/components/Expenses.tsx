import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Expense } from '../types';
import { formatKRW } from '../utils';
import { ExpenseForm } from './ExpenseForm';

type Filter = 'all' | 'shared' | number;

export function Expenses() {
  const [filterProperty, setFilterProperty] = useState<Filter>('all');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [showForm, setShowForm] = useState(false);

  const properties = useLiveQuery(() => db.properties.toArray()) ?? [];
  const expenses =
    useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray()) ?? [];

  const filtered =
    filterProperty === 'all'
      ? expenses
      : filterProperty === 'shared'
        ? expenses.filter((e) => e.propertyId === null)
        : expenses.filter((e) => e.propertyId === filterProperty);

  const handleAdd = () => {
    setEditing(null);
    setShowForm(true);
  };
  const handleEdit = (e: Expense) => {
    setEditing(e);
    setShowForm(true);
  };
  const handleDelete = async (id: number) => {
    if (confirm('이 비용을 삭제할까요?')) await db.expenses.delete(id);
  };

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>비용</h1>
        <button className="btn primary" onClick={handleAdd}>
          + 추가
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
            onClick={() => setFilterProperty(p.id!)}
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

      {filtered.length > 0 && (
        <div className="card">
          <div className="metric large">
            <span>합계</span>
            <strong className="neg">−{formatKRW(total)}</strong>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty">비용 내역이 없어요</div>
      ) : (
        <div className="list">
          {filtered.map((ex) => {
            const prop = properties.find((p) => p.id === ex.propertyId);
            return (
              <div
                key={ex.id}
                className="list-item"
                onClick={() => handleEdit(ex)}
              >
                <div className="item-main">
                  <div className="item-title">{ex.category}</div>
                  <div className="item-meta">
                    {prop ? (
                      <>
                        <span
                          className="dot"
                          style={{ background: prop.color }}
                        />
                        {prop.name} ·{' '}
                      </>
                    ) : (
                      '공통 · '
                    )}
                    {ex.date}
                    {ex.notes && ` · ${ex.notes}`}
                  </div>
                </div>
                <div className="item-amount">
                  <span>{formatKRW(ex.amount)}</span>
                  <button
                    className="del"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(ex.id!);
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
