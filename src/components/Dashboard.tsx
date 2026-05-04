import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../db';
import { COUNTRIES, PLATFORMS } from '../data';
import { flagEmoji, formatKRW, monthRange, prorateBookingForMonth } from '../utils';
import { DonutChart } from './DonutChart';

const CATEGORY_PALETTE = [
  '#C45A3A', // terracotta
  '#5C7A6E', // sage
  '#B8964F', // gold
  '#8B9F6B', // olive
  '#A87B5C', // bronze
  '#6B8AA8', // dusty blue
  '#9F6B8B', // dusty pink
  '#4A6B5C', // deep sage
];

function formatKRWBare(amount: number): string {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(
    Math.abs(amount),
  );
}


export function Dashboard() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const range = monthRange(year, month);
  const prevRange = monthRange(
    month === 1 ? year - 1 : year,
    month === 1 ? 12 : month - 1,
  );

  const properties = useLiveQuery(() => db.properties.toArray()) ?? [];

  // 월 경계 비례 분배: 그 달에 단 1박이라도 걸친 예약 모두 가져온다 (체크인이 전달이어도 포함)
  const bookingsRaw =
    useLiveQuery(async () => {
      const all = await db.bookings.toArray();
      return all.filter(
        (b) => b.checkIn <= range.end && b.checkOut > range.start,
      );
    }, [range.start, range.end]) ?? [];

  const bookings = bookingsRaw
    .filter((b) => b.status !== 'blocked')
    .map((b) => prorateBookingForMonth(b, year, month))
    .filter((b) => b.proratedNights > 0);
  const expenses =
    useLiveQuery(
      () =>
        db.expenses
          .where('date')
          .between(range.start, range.end, true, true)
          .toArray(),
      [range.start, range.end],
    ) ?? [];

  const prevBookingsRaw =
    useLiveQuery(async () => {
      const all = await db.bookings.toArray();
      return all.filter(
        (b) => b.checkIn <= prevRange.end && b.checkOut > prevRange.start,
      );
    }, [prevRange.start, prevRange.end]) ?? [];
  const prevBookings = prevBookingsRaw
    .filter((b) => b.status !== 'blocked')
    .map((b) =>
      prorateBookingForMonth(
        b,
        month === 1 ? year - 1 : year,
        month === 1 ? 12 : month - 1,
      ),
    )
    .filter((b) => b.proratedNights > 0);
  const prevExpenses =
    useLiveQuery(
      () =>
        db.expenses
          .where('date')
          .between(prevRange.start, prevRange.end, true, true)
          .toArray(),
      [prevRange.start, prevRange.end],
    ) ?? [];

  const totalRevenue = bookings.reduce((s, b) => s + b.proratedRevenue, 0);
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const profit = totalRevenue - totalExpense;
  const totalNights = bookings.reduce((s, b) => s + b.proratedNights, 0);
  const capacityNights = range.days * Math.max(1, properties.length);
  const occupancyPct =
    capacityNights > 0
      ? Math.round((totalNights / capacityNights) * 100)
      : 0;

  const prevProfit =
    prevBookings.reduce((s, b) => s + b.proratedRevenue, 0) -
    prevExpenses.reduce((s, e) => s + e.amount, 0);

  const deltaPct =
    prevProfit !== 0
      ? Math.round(((profit - prevProfit) / Math.abs(prevProfit)) * 100)
      : null;

  const byProperty = properties.map((p) => {
    const b = bookings.filter((x) => x.propertyId === p.id);
    const e = expenses.filter((x) => x.propertyId === p.id);
    const rev = b.reduce((s, x) => s + x.proratedRevenue, 0);
    const exp = e.reduce((s, x) => s + x.amount, 0);
    const nights = b.reduce((s, x) => s + x.proratedNights, 0);
    return {
      property: p,
      revenue: rev,
      expense: exp,
      profit: rev - exp,
      nights,
      count: b.length,
    };
  });

  const revenueSegments = useMemo(
    () =>
      byProperty
        .filter((p) => p.revenue > 0)
        .map((p) => ({
          label: p.property.name,
          value: p.revenue,
          color: p.property.color,
        })),
    [byProperty],
  );

  const expenseSegments = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((e) => {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    });
    return Array.from(map.entries())
      .map(([label, value], i) => ({
        label,
        value,
        color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  const byPlatform = useMemo(() => {
    const map: Record<string, number> = {};
    bookings.forEach((b) => {
      map[b.platform] = (map[b.platform] || 0) + b.proratedRevenue;
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
      <div className="dash-hero">
        <div className="dash-monthnav">
          <span className="eyebrow">
            {year} · {String(month).padStart(2, '0')}월
          </span>
          <div className="dash-monthnav-arrows">
            <button onClick={prev} aria-label="이전 달">
              <ChevronLeft size={16} />
            </button>
            <button onClick={next} aria-label="다음 달">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <span className="dash-net-label">순이익 · Net</span>
        <h1 className={`dash-net ${profit < 0 ? 'neg' : ''}`}>
          <span className="currency-mark">₩</span>
          {profit < 0 && '−'}
          {formatKRWBare(profit)}
        </h1>
        {deltaPct !== null && (
          <div className="dash-delta">
            <span
              className={`dash-delta-value ${deltaPct < 0 ? 'neg' : ''}`}
            >
              {deltaPct >= 0 ? '↑' : '↓'} {Math.abs(deltaPct)}%
            </span>
            <span>지난달 대비</span>
          </div>
        )}
      </div>

      <div className="dash-split">
        <div className="dash-split-cell">
          <span className="eyebrow">매출</span>
          <span className="dash-split-amount">
            ₩ {formatKRWBare(totalRevenue)}
          </span>
        </div>
        <div className="dash-split-divider" />
        <div className="dash-split-cell right">
          <span className="eyebrow">비용</span>
          <span className="dash-split-amount" style={{ color: 'var(--neg)' }}>
            − ₩ {formatKRWBare(totalExpense)}
          </span>
        </div>
      </div>

      {(revenueSegments.length > 0 || expenseSegments.length > 0) && (
        <div className="donut-grid">
          {revenueSegments.length > 0 && (
            <DonutSection
              title="매출 구성"
              total={totalRevenue}
              segments={revenueSegments}
              defaultLabel="숙소 수"
              defaultValue={String(revenueSegments.length)}
            />
          )}

          {expenseSegments.length > 0 && (
            <DonutSection
              title="비용 구성"
              total={totalExpense}
              segments={expenseSegments}
              defaultLabel="항목"
              defaultValue={String(expenseSegments.length)}
              negative
            />
          )}
        </div>
      )}

      <div className="dash-stats">
        <div className="dash-stat">
          <span className="eyebrow">예약</span>
          <div className="dash-stat-value">
            {bookings.length}
            <span style={{ fontSize: 14, color: 'var(--ink-muted)' }}>
              {' '}건
            </span>
          </div>
        </div>
        <div className="dash-stat">
          <span className="eyebrow">투숙 · 점유율</span>
          <div className="dash-stat-value">
            {totalNights}
            <span style={{ fontSize: 14, color: 'var(--ink-muted)' }}>
              {' '}/ {capacityNights}박
            </span>
          </div>
          <div
            className="bar"
            style={{ marginTop: 6, height: 5 }}
            aria-label={`점유율 ${occupancyPct}%`}
          >
            <div
              className="bar-fill"
              style={{
                width: `${Math.min(100, occupancyPct)}%`,
                background:
                  occupancyPct >= 70
                    ? 'var(--pos)'
                    : occupancyPct >= 40
                      ? 'var(--accent)'
                      : 'var(--ink-soft)',
              }}
            />
          </div>
          <div
            style={{
              fontSize: 13,
              color: occupancyPct >= 50 ? 'var(--pos)' : 'var(--ink-muted)',
              marginTop: 4,
              fontWeight: 600,
            }}
          >
            {occupancyPct}%
          </div>
        </div>
      </div>

      {properties.length > 0 && (
        <>
          <div className="dash-section-title">
            <h2>숙소별 손익</h2>
            <span className="eyebrow">By property</span>
          </div>
          {byProperty.map((p) => (
            <div
              key={p.property.id}
              className="dash-property-card"
              style={{ ['--prop-color' as string]: p.property.color }}
            >
              <h3>{p.property.name}</h3>
              <div className="dash-property-row">
                <span className="label">매출</span>
                <span className="value">₩ {formatKRWBare(p.revenue)}</span>
              </div>
              <div className="dash-property-row">
                <span className="label">비용</span>
                <span className="value" style={{ color: 'var(--neg)' }}>
                  − ₩ {formatKRWBare(p.expense)}
                </span>
              </div>
              <div className="dash-property-row">
                <span className="label">예약 · 투숙</span>
                <span className="value">
                  {p.count}건 · {p.nights}박
                  <span className="muted" style={{ marginLeft: 6 }}>
                    ({Math.round((p.nights / range.days) * 100)}%)
                  </span>
                </span>
              </div>
              <div className="dash-property-row profit">
                <span className="label">순이익</span>
                <span
                  className="value"
                  style={{
                    color: p.profit >= 0 ? 'var(--pos)' : 'var(--neg)',
                  }}
                >
                  {p.profit < 0 && '−'}₩ {formatKRWBare(p.profit)}
                </span>
              </div>
            </div>
          ))}
        </>
      )}

      {properties.length === 0 && (
        <div className="empty">
          숙소를 추가하고
          <br />
          이번 달 이야기를 시작해 보세요.
        </div>
      )}

      {byPlatform.length > 0 && (
        <>
          <div className="dash-section-title">
            <h2>플랫폼별 매출</h2>
            <span className="eyebrow">By channel</span>
          </div>
          <div className="card">
            {byPlatform.map((p) => {
              const pct =
                totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0;
              return (
                <div key={p.value} className="bar-row">
                  <span>
                    {p.emoji} {p.label}
                  </span>
                  <div className="bar">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${pct}%`,
                        background:
                          p.value === 'airbnb' ? 'var(--accent)' : 'var(--olive)',
                      }}
                    />
                  </div>
                  <span className="bar-value">
                    ₩ {formatKRWBare(p.revenue)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {byCountry.length > 0 && (
        <>
          <div className="dash-section-title">
            <h2>국가별 게스트</h2>
            <span className="eyebrow">By origin</span>
          </div>
          <div className="card">
            <div className="country-grid">
              {byCountry.map((c) => (
                <div key={c.code} className="country-pill">
                  {flagEmoji(c.code)} {c.name} <strong>{c.count}</strong>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// formatKRW used elsewhere
export { formatKRW };

interface DonutSectionProps {
  title: string;
  total: number;
  segments: { label: string; value: number; color: string }[];
  defaultLabel: string;
  defaultValue: string;
  negative?: boolean;
}

function DonutSection({
  title,
  total,
  segments,
  defaultLabel,
  defaultValue,
  negative,
}: DonutSectionProps) {
  const [hover, setHover] = useState<number | null>(null);
  const active = hover !== null ? segments[hover] : null;

  const centerLabel = active ? active.label : defaultLabel;
  const centerValue = active
    ? formatKRWBare(active.value)
    : defaultValue;

  return (
    <div className="donut-card">
      <div className="donut-card-header">
        <span className="eyebrow">{title}</span>
        <span
          className="donut-card-total tabular"
          style={negative ? { color: 'var(--neg)' } : undefined}
        >
          {negative ? '− ' : ''}₩ {formatKRWBare(total)}
        </span>
      </div>
      <div className="donut-wrap">
        <DonutChart
          segments={segments}
          centerLabel={centerLabel}
          centerValue={centerValue}
          hoveredIndex={hover}
          onHoverChange={setHover}
        />
      </div>
      <ul className="donut-legend">
        {segments.map((s, i) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          const isActive = hover === i;
          const isDimmed = hover !== null && !isActive;
          return (
            <li
              key={s.label}
              className={`${isActive ? 'active' : ''} ${
                isDimmed ? 'dimmed' : ''
              }`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(hover === i ? null : i)}
            >
              <span
                className="legend-dot"
                style={{ background: s.color }}
              />
              <span className="legend-name">{s.label}</span>
              <span className="legend-pct tabular">{pct.toFixed(0)}%</span>
              <span className="legend-amount tabular">
                ₩ {formatKRWBare(s.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
