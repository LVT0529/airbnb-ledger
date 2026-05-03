import { FormEvent, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Booking, Platform, Property } from '../types';
import { COUNTRIES, PLATFORMS } from '../data';
import {
  addDays,
  formatAmountInput,
  loadPrefs,
  parseAmount,
  savePrefs,
  todayYmd,
} from '../utils';
import { addBooking, deleteBooking, updateBooking } from '../sync';
import { Modal } from './Modal';

interface Props {
  booking: Booking | null;
  properties: Property[];
  onClose: () => void;
}

export function BookingForm({ booking, properties, onClose }: Props) {
  const prefs = loadPrefs();
  const initialPropertyId =
    booking?.propertyId ??
    (prefs.lastPropertyId &&
    properties.find((p) => p.id === prefs.lastPropertyId)
      ? prefs.lastPropertyId
      : properties[0]?.id ?? '');

  const [propertyId, setPropertyId] = useState<string>(initialPropertyId);
  const [guestName, setGuestName] = useState(booking?.guestName ?? '');
  const [country, setCountry] = useState(
    booking?.country ?? prefs.lastCountry ?? 'KR',
  );
  const [platform, setPlatform] = useState<Platform>(
    booking?.platform ?? (prefs.lastPlatform as Platform) ?? 'airbnb',
  );
  const [guests, setGuests] = useState(booking?.guests ?? 2);
  const [nights, setNights] = useState(booking?.nights ?? 1);
  const [checkIn, setCheckIn] = useState(booking?.checkIn ?? todayYmd());
  const [revenueStr, setRevenueStr] = useState(
    booking ? formatAmountInput(String(booking.revenue)) : '',
  );
  const [notes, setNotes] = useState(booking?.notes ?? '');
  const [keepOpen, setKeepOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const allBookings = useLiveQuery(() => db.bookings.toArray()) ?? [];
  const guestSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (let i = allBookings.length - 1; i >= 0; i--) {
      const n = allBookings[i].guestName;
      if (n && !seen.has(n)) {
        seen.add(n);
        list.push(n);
      }
    }
    return list.slice(0, 30);
  }, [allBookings]);

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

    const revenue = parseAmount(revenueStr);
    const data = {
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
    };

    setSubmitting(true);
    try {
      if (booking?.id) {
        await updateBooking(booking.id, data);
      } else {
        await addBooking(data);
      }
      savePrefs({
        lastPropertyId: propertyId,
        lastPlatform: platform,
        lastCountry: country,
      });

      if (keepOpen && !booking) {
        setGuestName('');
        setRevenueStr('');
        setNotes('');
      } else {
        onClose();
      }
    } catch (err) {
      alert(
        '저장 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!booking?.id) return;
    if (!confirm('이 예약을 삭제할까요?')) return;
    setSubmitting(true);
    try {
      await deleteBooking(booking.id);
      onClose();
    } catch (err) {
      alert(
        '삭제 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={booking ? '예약 수정' : '예약 추가'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form">
        <label>
          숙소
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
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
            list="guest-suggestions"
            autoComplete="off"
          />
          <datalist id="guest-suggestions">
            {guestSuggestions.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
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
              inputMode="numeric"
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
              inputMode="numeric"
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
          <div className="amount-input">
            <input
              type="text"
              inputMode="numeric"
              value={revenueStr}
              onChange={(e) => setRevenueStr(formatAmountInput(e.target.value))}
              required
              placeholder="0"
            />
            <span className="amount-suffix">원</span>
          </div>
        </label>
        <label>
          메모
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </label>

        {!booking && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={keepOpen}
              onChange={(e) => setKeepOpen(e.target.checked)}
            />
            <span>이어서 추가하기 (저장 후 폼 유지)</span>
          </label>
        )}

        <div className="form-actions">
          {booking && (
            <button
              type="button"
              className="btn"
              style={{ color: 'var(--neg)' }}
              onClick={handleDelete}
              disabled={submitting}
            >
              삭제
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={submitting}
          >
            취소
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={submitting}
          >
            {submitting ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
