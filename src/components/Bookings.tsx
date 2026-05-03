import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Booking } from '../types';
import { COUNTRIES, PLATFORMS } from '../data';
import { flagEmoji, formatKRW } from '../utils';
import { deleteBooking } from '../sync';
import { BookingForm } from './BookingForm';

export function Bookings() {
  const [filterProperty, setFilterProperty] = useState<string | 'all'>('all');
  const [editing, setEditing] = useState<Booking | null>(null);
  const [showForm, setShowForm] = useState(false);

  const properties = useLiveQuery(() => db.properties.toArray()) ?? [];
  const bookings =
    useLiveQuery(async () => {
      if (filterProperty === 'all') {
        return db.bookings.orderBy('checkIn').reverse().toArray();
      }
      const list = await db.bookings
        .where('propertyId')
        .equals(filterProperty)
        .toArray();
      return list.sort((a, b) => b.checkIn.localeCompare(a.checkIn));
    }, [filterProperty]) ?? [];

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

      {bookings.length === 0 ? (
        <div className="empty">예약이 없어요</div>
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
