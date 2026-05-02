import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Booking } from '../types';
import { COUNTRIES, PLATFORMS } from '../data';
import { flagEmoji, formatKRW } from '../utils';
import { BookingForm } from './BookingForm';

export function Bookings() {
  const [filterProperty, setFilterProperty] = useState<number | 'all'>('all');
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
  const handleDelete = async (id: number) => {
    if (confirm('이 예약을 삭제할까요?')) {
      await db.bookings.delete(id);
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
              onClick={() => setFilterProperty(p.id!)}
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
            return (
              <div
                key={b.id}
                className="list-item"
                onClick={() => handleEdit(b)}
              >
                <div className="item-main">
                  <div className="item-title">
                    {flagEmoji(b.country)} {b.guestName}
                    <span className="muted"> · {country?.name ?? b.country}</span>
                  </div>
                  <div className="item-meta">
                    {prop && (
                      <>
                        <span
                          className="dot"
                          style={{ background: prop.color }}
                        />
                        {prop.name} ·{' '}
                      </>
                    )}
                    {b.checkIn} · {b.nights}박 {b.guests}인 ·{' '}
                    {platform?.emoji} {platform?.label}
                  </div>
                </div>
                <div className="item-amount">
                  <span>{formatKRW(b.revenue)}</span>
                  <button
                    className="del"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(b.id!);
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
