import { FormEvent, useState } from 'react';
import { db } from '../db';
import { Booking, Platform, Property } from '../types';
import { COUNTRIES, PLATFORMS } from '../data';
import { addDays, todayYmd } from '../utils';
import { Modal } from './Modal';

interface Props {
  booking: Booking | null;
  properties: Property[];
  onClose: () => void;
}

export function BookingForm({ booking, properties, onClose }: Props) {
  const [propertyId, setPropertyId] = useState<number>(
    booking?.propertyId ?? properties[0]?.id ?? 0,
  );
  const [guestName, setGuestName] = useState(booking?.guestName ?? '');
  const [country, setCountry] = useState(booking?.country ?? 'KR');
  const [platform, setPlatform] = useState<Platform>(
    booking?.platform ?? 'airbnb',
  );
  const [guests, setGuests] = useState(booking?.guests ?? 2);
  const [nights, setNights] = useState(booking?.nights ?? 1);
  const [checkIn, setCheckIn] = useState(booking?.checkIn ?? todayYmd());
  const [revenue, setRevenue] = useState(booking?.revenue ?? 0);
  const [notes, setNotes] = useState(booking?.notes ?? '');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!propertyId) {
      alert('숙소를 선택해주세요');
      return;
    }
    if (!guestName.trim()) {
      alert('게스트 이름을 입력해주세요');
      return;
    }

    const data: Omit<Booking, 'id'> = {
      propertyId,
      guestName: guestName.trim(),
      country,
      platform,
      guests,
      nights,
      checkIn,
      checkOut: addDays(checkIn, nights),
      revenue,
      notes: notes.trim() || undefined,
      createdAt: booking?.createdAt ?? Date.now(),
    };

    if (booking?.id) {
      await db.bookings.update(booking.id, data);
    } else {
      await db.bookings.add(data as Booking);
    }
    onClose();
  };

  const handleDelete = async () => {
    if (!booking?.id) return;
    if (confirm('이 예약을 삭제할까요?')) {
      await db.bookings.delete(booking.id);
      onClose();
    }
  };

  return (
    <Modal
      title={booking ? '예약 수정' : '예약 추가'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="form">
        <label>
          숙소
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(Number(e.target.value))}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          게스트 이름
          <input
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label>
          국가
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          플랫폼
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
          >
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.emoji} {p.label}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <label>
            인원
            <input
              type="number"
              min={1}
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
              required
            />
          </label>
          <label>
            박수
            <input
              type="number"
              min={1}
              value={nights}
              onChange={(e) => setNights(Number(e.target.value))}
              required
            />
          </label>
        </div>
        <label>
          체크인
          <input
            type="date"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            required
          />
        </label>
        <label>
          매출 (KRW)
          <input
            type="number"
            min={0}
            step={1000}
            inputMode="numeric"
            value={revenue}
            onChange={(e) => setRevenue(Number(e.target.value))}
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
          {booking && (
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
