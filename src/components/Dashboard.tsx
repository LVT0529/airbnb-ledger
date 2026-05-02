import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { COUNTRIES, PLATFORMS } from '../data';
import { flagEmoji, formatKRW, monthRange } from '../utils';

export function Dashboard() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const range = monthRange(year, month);

  const properties = useLiveQuery(() => db.properties.toArray()) ?? [];
  const bookings =
    useLiveQuery(
      () =>
        db.bookings
          .where('checkIn')
          .between(range.start, range.end, true, true)
          .toArray(),
      [range.start, range.end],
    ) ?? [];
  const expenses =
    useLiveQuery(
      () =>
        db.expenses
          .where('date')
          .between(range.start, range.end, true, true)
          .toArray(),
      [range.start, range.end],
    ) ?? [];

  const totalRevenue = bookings.reduce((s, b) => s + b.revenue, 0);
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const profit = totalRevenue - totalExpense;
  const totalNights = bookings.reduce((s, b) => s + b.nights, 0);
  const occupancy =
    properties.length > 0
      ? (totalNights / (properties.length * range.days)) * 100
      : 0;

  const byProperty = properties.map((p) => {
    const b = bookings.filter((x) => x.propertyId === p.id);
    const e = expenses.filter((x) => x.propertyId === p.id);
    const rev = b.reduce((s, x) => s + x.revenue, 0);
    const exp = e.reduce((s, x) => s + x.amount, 0);
    const nights = b.reduce((s, x) => s + x.nights, 0);
    return {
      property: p,
      revenue: rev,
      expense: exp,
      profit: rev - exp,
      nights,
      count: b.length,
    };
  });

  const byPlatform = useMemo(() => {
    const map: Record<string, number> = {};
    bookings.forEach((b) => {
      map[b.platform] = (map[b.platform] || 0) + b.revenue;
    });
    return PLATFORMS.map((p) => ({ ...p, revenue: map[p.value] || 0 }))
      .filter((x) => x.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [bookings]);

  const byCountry = useMemo(() => {
    const map: Record<string, number> = {};
    bookings.forEach((b) => {
      map[b.country] = (map[b.country] || 0) + 1;
    });
    return Object.entries(map)
      .map(([code, count]) => {
        const c = COUNTRIES.find((x) => x.code === code);
        return { code, name: c?.name ?? code, count };
      })
      .sort((a, b) => b.count - a.count);
  }, [bookings]);

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
      <div className="month-nav">
        <button onClick={prev} aria-label="이전 달">
          ‹
        </button>
        <h1>
          {year}년 {month}월
        </h1>
        <button onClick={next} aria-label="다음 달">
          ›
        </button>
      </div>

      <div className="card">
        <div className="metric">
          <span>매출</span>
          <strong>{formatKRW(totalRevenue)}</strong>
        </div>
        <div className="metric">
          <span>비용</span>
          <strong className="neg">−{formatKRW(totalExpense)}</strong>
        </div>
        <hr />
        <div className="metric large">
          <span>순이익</span>
          <strong className={profit >= 0 ? 'pos' : 'neg'}>
            {formatKRW(profit)}
          </strong>
        </div>
        <div className="metric">
          <span>예약</span>
          <strong>
            {bookings.length}건 · {totalNights}박
          </strong>
        </div>
        <div className="metric">
          <span>점유율</span>
          <strong>{occupancy.toFixed(1)}%</strong>
        </div>
      </div>

      {properties.length === 0 ? (
        <div className="empty">설정에서 숙소를 먼저 추가해주세요</div>
      ) : (
        <div className="property-grid">
          {byProperty.map((p) => (
            <div key={p.property.id} className="card">
              <div className="prop-header">
                <span className="dot" style={{ background: p.property.color }} />
                <h3>{p.property.name}</h3>
              </div>
              <div className="metric">
                <span>매출</span>
                <strong>{formatKRW(p.revenue)}</strong>
              </div>
              <div className="metric">
                <span>비용</span>
                <strong className="neg">−{formatKRW(p.expense)}</strong>
              </div>
              <div className="metric">
                <span>순이익</span>
                <strong className={p.profit >= 0 ? 'pos' : 'neg'}>
                  {formatKRW(p.profit)}
                </strong>
              </div>
              <div className="metric">
                <span>예약 / 박</span>
                <strong>
                  {p.count}건 · {p.nights}박
                </strong>
              </div>
            </div>
          ))}
        </div>
      )}

      {byPlatform.length > 0 && (
        <div className="card">
          <h3>플랫폼별 매출</h3>
          {byPlatform.map((p) => {
            const pct =
              totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0;
            return (
              <div key={p.value} className="bar-row">
                <span>
                  {p.emoji} {p.label}
                </span>
                <div className="bar">
                  <div className="bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="bar-value">{formatKRW(p.revenue)}</span>
              </div>
            );
          })}
        </div>
      )}

      {byCountry.length > 0 && (
        <div className="card">
          <h3>국가별 예약</h3>
          <div className="country-grid">
            {byCountry.map((c) => (
              <div key={c.code} className="country-pill">
                {flagEmoji(c.code)} {c.name} <strong>{c.count}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
