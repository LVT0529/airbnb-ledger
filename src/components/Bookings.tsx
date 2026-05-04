import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../db';
import { Booking } from '../types';
import { COUNTRIES, PLATFORMS } from '../data';
import { flagEmoji, formatKRW, monthRange, prorateBookingForMonth } from '../utils';
import { deleteBooking } from '../sync';
import { BookingForm } from './BookingForm';

export function Bookings() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [filterProperty, setFilterProperty] = useState<string | 'all'>('all');
  const [editing, setEditing] = useState<Booking | null>(null);
  const [showForm, setShowForm] = useState(false);

  const range = monthRange(year, month);

  const properties = useLiveQuery(() => db.properties.toArray()) ?? [];
  // 월 경계 비례: 그 달에 1박이라도 걸친 예약 모두 포함
  const monthBookings =
    useLiveQuery(async () => {
      const all = await db.bookings.toArray();
      return all.filter(
        (b) => b.checkIn <= range.end && b.checkOut > range.start,
      );
    }, [range.start, range.end]) ?? [];

  const bookings = useMemo(() => {
    let list = monthBookings.filter((b) => b.status !== 'blocked');
    if (filterProperty !== 'all') {
      list = list.filter((b) => b.propertyId === filterProperty);
    }
    return [...list].sort((a, b) => b.checkIn.localeCompare(a.checkIn));
  }, [monthBookings, filterProperty]);

  const proratedBookings = useMemo(
    () => bookings.map((b) => prorateBookingForMonth(b, year, month)),
    [bookings, year, month],
  );

  const totalRevenue = proratedBookings
    .filter((b) => b.status !== 'pending')
    .reduce((s, b) => s + b.proratedRevenue, 0);
  const totalNights = proratedBookings.reduce(
    (s, b) => s + b.proratedNights,
    0,
  );
  const capacityNights =
    range.days *
    (filterProperty === 'all' ? Math.max(1, properties.length) : 1);
  const occupancyPct =
    capacityNights > 0 ? Math.round((totalNights / capacityNights) * 100) : 0;

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

  const handleAdd = () => {
    if (properties.length === 0) {
      alert('먼저 설정에서 숙소를 추가해주세요');
      return;
    }
    setEditing(null);
    setShowForm(true);
  };
  const handleEdit = (b: Booking) => {
    setEditing(b);
    setShowForm(true);
  };
  const handleDelete = async (id: string) => {
    if (!confirm('이 예약을 삭제할까요?')) return;
    try {
      await deleteBooking(id);
    } catch (err) {
      alert(
        '삭제 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'),
      );
    }
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <h1>예약</h1>
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

      {properties.length > 1 && (
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
        </div>
      )}

      <div className="card">
        <div className="metric large">
          <span>매출</span>
          <strong style={{ color: 'var(--pos)' }}>
            {formatKRW(totalRevenue)}
          </strong>
        </div>
        <hr />
        <div className="metric">
          <span>예약 {bookings.length}건</span>
          <strong>
            {totalNights} / {capacityNights}박
            <span
              className="muted"
              style={{ marginLeft: 6, fontSize: 13, fontWeight: 600 }}
            >
              ({occupancyPct}%)
            </span>
          </strong>
        </div>
      </div>

      {bookings.length === 0 ? (
        <div className="empty">이번 달 예약이 없어요</div>
      ) : (
        <div className="list">
          {bookings.map((b) => {
            const prop = properties.find((p) => p.id === b.propertyId);
            const country = COUNTRIES.find((c) => c.code === b.country);
            const platform = PLATFORMS.find((p) => p.value === b.platform);
            const isPending = b.status === 'pending';
            return (
              <div
                key={b.id}
                className={`list-item ${isPending ? 'pending' : ''}`}
                onClick={() => handleEdit(b)}
                style={
                  prop
                    ? { borderLeft: `3px solid ${prop.color}` }
                    : undefined
                }
              >
                <div className="item-main">
                  <div className="item-title">
                    {isPending ? (
                      <>
                        <span className="pending-badge">매출 미입력</span>{' '}
                        {b.confirmationCode ?? b.guestName}
                      </>
                    ) : (
                      <>
                        {flagEmoji(b.country)} {b.guestName}
                        <span className="muted"> · {country?.name ?? b.country}</span>
                      </>
                    )}
                  </div>
                  <div className="item-meta">
                    {prop && <>{prop.name} · </>}
                    {b.checkIn} · {b.nights}박
                    {!isPending && (
                      <>
                        {' '}{b.guests}인 · {platform?.emoji} {platform?.label}
                      </>
                    )}
                  </div>
                </div>
                <div className="item-amount">
                  <span className={isPending ? 'muted' : ''}>
                    {isPending ? '입력 필요' : formatKRW(b.revenue)}
                  </span>
                  <button
                    className="del"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(b.id);
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
        <BookingForm
          booking={editing}
          properties={properties}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
