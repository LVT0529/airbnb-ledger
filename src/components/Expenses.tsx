import { ReactNode, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Repeat, Search, X } from 'lucide-react';
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
  const [search, setSearch] = useState('');

  const range = monthRange(year, month);
  const isSearching = search.trim().length > 0;

  const properties = useLiveQuery(() => db.properties.toArray()) ?? [];
  const monthExpenses =
    useLiveQuery(
      () =>
        db.expenses
          .where('date')
          .between(range.start, range.end, true, true)
          .toArray(),
      [range.start, range.end],
    ) ?? [];
  // 검색 모드일 때는 전체 기간 로드
  const allExpenses =
    useLiveQuery<Expense[]>(
      () =>
        isSearching
          ? db.expenses.toArray()
          : Promise.resolve<Expense[]>([]),
      [isSearching],
    ) ?? [];

  const baseExpenses = isSearching ? allExpenses : monthExpenses;

  const expenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = isSearching
      ? baseExpenses.filter((e) => {
          const propName =
            properties.find((p) => p.id === e.propertyId)?.name ?? '';
          return (
            (e.category ?? '').toLowerCase().includes(q) ||
            (e.notes ?? '').toLowerCase().includes(q) ||
            propName.toLowerCase().includes(q)
          );
        })
      : baseExpenses;
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [baseExpenses, isSearching, search, properties]);

  const filtered =
    filterProperty === 'all'
      ? expenses
      : filterProperty === 'shared'
        ? expenses.filter((e) => e.propertyId === null)
        : expenses.filter((e) => e.propertyId === filterProperty);

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  // 검색 모드에서 월별로 그룹핑
  const groupedByMonth = useMemo(() => {
    if (!isSearching) return [];
    const groups = new Map<string, { items: Expense[]; total: number }>();
    for (const ex of filtered) {
      const ym = ex.date.slice(0, 7); // YYYY-MM
      const cur = groups.get(ym) ?? { items: [], total: 0 };
      cur.items.push(ex);
      cur.total += ex.amount;
      groups.set(ym, cur);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([ym, g]) => ({
        ym,
        label: `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`,
        items: g.items,
        total: g.total,
      }));
  }, [filtered, isSearching]);

  // 검색어 하이라이트 — case-insensitive
  const highlight = (text: string): ReactNode => {
    const q = search.trim();
    if (!q || !text) return text;
    const lower = text.toLowerCase();
    const lowerQ = q.toLowerCase();
    const parts: ReactNode[] = [];
    let i = 0;
    let idx = lower.indexOf(lowerQ, i);
    while (idx !== -1) {
      if (idx > i) parts.push(text.slice(i, idx));
      parts.push(
        <mark
          key={`m-${idx}`}
          style={{
            background: 'rgba(255, 176, 60, 0.22)',
            color: 'inherit',
            padding: '0 2px',
            borderRadius: 2,
          }}
        >
          {text.slice(idx, idx + q.length)}
        </mark>,
      );
      i = idx + q.length;
      idx = lower.indexOf(lowerQ, i);
    }
    if (i < text.length) parts.push(text.slice(i));
    return parts;
  };

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

  const renderItem = (ex: Expense): ReactNode => {
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
            {highlight(ex.category)}
          </div>
          <div className="item-meta">
            {prop ? prop.name : '공통'} · {ex.date}
            {ex.notes && <> · {highlight(ex.notes)}</>}
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

      <div
        className="search-bar"
        style={{
          position: 'relative',
          marginBottom: 12,
        }}
      >
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--ink-muted)',
            pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          placeholder="카테고리·메모·숙소 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 36px 10px 36px',
            fontSize: '14px',
            border: '1px solid var(--ink-soft)',
            borderRadius: 8,
            background: 'var(--surface)',
            color: 'var(--ink)',
            boxSizing: 'border-box',
          }}
        />
        {isSearching && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="검색 지우기"
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              color: 'var(--ink-muted)',
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {isSearching ? (
        <div className="month-nav">
          <h1>전체 기간</h1>
        </div>
      ) : (
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
      )}

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

      {isSearching ? (
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 14px',
          }}
        >
          <span style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
              {filtered.length}
            </span>
            건 · {groupedByMonth.length}개월
          </span>
          <strong className="neg" style={{ fontSize: 18 }}>
            −{formatKRW(total)}
          </strong>
        </div>
      ) : (
        <div className="card">
          <div className="metric large">
            <span>합계</span>
            <strong className="neg">−{formatKRW(total)}</strong>
          </div>
        </div>
      )}

      {!isSearching && (
        <>
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
        </>
      )}

      {filtered.length === 0 ? (
        <div className="empty">
          {isSearching ? '검색 결과가 없어요' : '이번 달 비용 내역이 없어요'}
        </div>
      ) : isSearching ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {groupedByMonth.map((g) => (
            <section key={g.ym}>
              <header
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  padding: '0 4px 8px',
                  marginBottom: 4,
                  borderBottom: '1px solid var(--ink-soft)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: '0.02em',
                      color: 'var(--ink)',
                    }}
                  >
                    {g.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                    {g.items.length}건
                  </span>
                </div>
                <span
                  className="neg"
                  style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}
                >
                  −{formatKRW(g.total)}
                </span>
              </header>
              <div className="list">
                {g.items.map((ex) => renderItem(ex))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="list">{filtered.map((ex) => renderItem(ex))}</div>
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
