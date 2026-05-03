import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Booking } from '../types';
import { COUNTRIES, PLATFORMS } from '../data';
import { flagEmoji, formatKRW } from '../utils';
import { BookingForm } from './BookingForm';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

interface DayCell {
  date: Date;
  ymd: string;
  inMonth: boolean;
}

function buildMonthGrid(year: number, month: number): DayCell[] {
  // month is 1-indexed
  const first = new Date(year, month - 1, 1);
  const startWeekday = first.getDay(); // 0 = Sun
  const last = new Date(year, month, 0);
  const totalDays = last.getDate();

  const cells: DayCell[] = [];
  // leading days from prev month
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, -i);
    cells.push({ date: d, ymd: ymd(d), inMonth: false });
  }
  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(year, month - 1, d);
    cells.push({ date, ymd: ymd(date), inMonth: true });
  }
  // trailing days to fill grid (multiple of 7)
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push({ date: next, ymd: ymd(next), inMonth: false });
  }
  return cells;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface BookingBar {
  booking: Booking;
  startCol: number;
  span: number;
  rowIndex: number;
  weekIndex: number;
}

function layoutBookings(
  cells: DayCell[],
  bookings: Booking[],
): { bars: BookingBar[]; maxRow: number } {
  // For each week (rows of 7), place booking bars row by row to avoid overlap.
  const numWeeks = cells.length / 7;
  const bars: BookingBar[] = [];

  for (let w = 0; w < numWeeks; w++) {
    const weekStart = cells[w * 7].ymd;
    const weekEnd = cells[w * 7 + 6].ymd;

    const inWeek = bookings
      .filter(
        (b) =>
          b.checkIn <= weekEnd && b.checkOut > weekStart,
      )
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

    const occupied: string[][] = []; // occupied[row][colIndex]

    for (const b of inWeek) {
      const startIdx = Math.max(
        cells.findIndex((c) => c.ymd === b.checkIn),
        w * 7,
      );
      // checkOut is exclusive (체크아웃 당일은 점유 안 함). 마지막 점유일 = checkOut - 1.
      const lastOccupied = new Date(b.checkOut);
      lastOccupied.setDate(lastOccupied.getDate() - 1);
      const lastYmd = ymd(lastOccupied);
      let endIdx = cells.findIndex((c) => c.ymd === lastYmd);
      if (endIdx === -1) endIdx = w * 7 + 6;
      endIdx = Math.min(endIdx, w * 7 + 6);
      const startIdxClamped = Math.max(startIdx, w * 7);
      if (endIdx < startIdxClamped) continue;

      const startCol = startIdxClamped - w * 7;
      const span = endIdx - startIdxClamped + 1;

      // Find first row with no overlap
      let row = 0;
      while (true) {
        if (!occupied[row]) occupied[row] = [];
        let conflict = false;
        for (let col = startCol; col < startCol + span; col++) {
          if (occupied[row][col]) {
            conflict = true;
            break;
          }
        }
        if (!conflict) {
          for (let col = startCol; col < startCol + span; col++) {
            occupied[row][col] = b.id;
          }
          bars.push({
            booking: b,
            startCol,
            span,
            rowIndex: row,
            weekIndex: w,
          });
          break;
        }
        row++;
        if (row > 10) break; // safety
      }
    }
  }

  const maxRow =
    bars.reduce((m, b) => Math.max(m, b.rowIndex), -1) + 1;
  return { bars, maxRow };
}

export function Calendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Booking | null>(null);

  const properties = useLiveQuery(() => db.properties.toArray()) ?? [];
  const bookings = useLiveQuery(() => db.bookings.toArray()) ?? [];

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const monthBookings = useMemo(() => {
    const start = cells[0].ymd;
    const end = cells[cells.length - 1].ymd;
    return bookings.filter(
      (b) => b.checkIn <= end && b.checkOut > start,
    );
  }, [cells, bookings]);

  const { bars, maxRow } = useMemo(
    () => layoutBookings(cells, monthBookings),
    [cells, monthBookings],
  );

  const propMap = useMemo(
    () => new Map(properties.map((p) => [p.id, p])),
    [properties],
  );

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

  const todayYmd = ymd(today);

  const selectedDayBookings = selected
    ? bookings.filter((b) => b.checkIn <= selected && b.checkOut > selected)
    : [];

  const numWeeks = cells.length / 7;
  const ROW_HEIGHT = Math.max(maxRow, 1) * 18 + 26; // 1 row min

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

      <div className="calendar">
        <div className="calendar-header">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`cal-weekday ${
                i === 0 ? 'sun' : i === 6 ? 'sat' : ''
              }`}
            >
              {w}
            </div>
          ))}
        </div>

        {Array.from({ length: numWeeks }).map((_, wi) => (
          <div
            key={wi}
            className="cal-week"
            style={{ height: ROW_HEIGHT }}
          >
            {cells.slice(wi * 7, wi * 7 + 7).map((c, ci) => {
              const isToday = c.ymd === todayYmd;
              const isSelected = c.ymd === selected;
              const dow = ci;
              return (
                <button
                  key={c.ymd}
                  className={`cal-day ${c.inMonth ? '' : 'out'} ${
                    isToday ? 'today' : ''
                  } ${isSelected ? 'selected' : ''} ${
                    dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''
                  }`}
                  onClick={() => setSelected(c.ymd)}
                >
                  <span className="cal-num">{c.date.getDate()}</span>
                </button>
              );
            })}

            {bars
              .filter((b) => b.weekIndex === wi)
              .map((bar) => {
                const prop = propMap.get(bar.booking.propertyId);
                const isPending = bar.booking.status === 'pending';
                return (
                  <div
                    key={bar.booking.id}
                    className={`cal-bar ${isPending ? 'pending' : ''}`}
                    style={{
                      gridColumnStart: bar.startCol + 1,
                      gridColumnEnd: `span ${bar.span}`,
                      top: bar.rowIndex * 18 + 22,
                      background: prop?.color ?? '#888',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(bar.booking);
                    }}
                    title={`${bar.booking.guestName} (${bar.booking.checkIn} ~ ${bar.booking.checkOut})`}
                  >
                    {bar.span >= 2 ? (
                      <>
                        {isPending ? '·' : flagEmoji(bar.booking.country)}{' '}
                        {bar.booking.guestName}
                      </>
                    ) : (
                      <>·</>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>

      {selected && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>
            {selected.replace(/-/g, '. ')}{' '}
            <span className="muted">
              ({WEEKDAYS[new Date(selected).getDay()]})
            </span>
          </h3>
          {selectedDayBookings.length === 0 ? (
            <div className="muted">예약 없음</div>
          ) : (
            <div className="list">
              {selectedDayBookings.map((b) => {
                const prop = propMap.get(b.propertyId);
                const country = COUNTRIES.find((c) => c.code === b.country);
                const platform = PLATFORMS.find(
                  (p) => p.value === b.platform,
                );
                const isPending = b.status === 'pending';
                return (
                  <div
                    key={b.id}
                    className={`list-item ${isPending ? 'pending' : ''}`}
                    onClick={() => setEditing(b)}
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
                            <span className="muted">
                              {' '}
                              · {country?.name ?? b.country}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="item-meta">
                        {prop && <>{prop.name} · </>}
                        {b.checkIn} → {b.checkOut} · {b.nights}박
                        {!isPending && (
                          <>
                            {' '}
                            {b.guests}인 · {platform?.emoji} {platform?.label}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="item-amount">
                      <span className={isPending ? 'muted' : ''}>
                        {isPending ? '입력 필요' : formatKRW(b.revenue)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {editing && (
        <BookingForm
          booking={editing}
          properties={properties}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
