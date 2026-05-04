export interface IcalEvent {
  start: string; // YYYY-MM-DD
  end: string;
  summary: string;
  uid: string;
  description: string;
  confirmationCode?: string;
  isReservation: boolean;
}

function unescape(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseICSDate(s: string): string {
  const m = s.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return '';
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function extractConfirmationCode(description: string): string | undefined {
  const m = description.match(/\/details\/([A-Z0-9]+)/);
  if (m) return m[1];
  const m2 = description.match(/\bHM[A-Z0-9]{6,}\b/);
  return m2 ? m2[0] : undefined;
}

export function parseICS(text: string): IcalEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const events: IcalEvent[] = [];
  let cur: Partial<IcalEvent> | null = null;
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      cur = {};
    } else if (line.startsWith('END:VEVENT')) {
      if (cur && cur.start && cur.end) {
        const description = cur.description ?? '';
        const summary = cur.summary ?? '';
        // 예약: 'reserved'(Airbnb/VRBO) | 'booked'(Agoda) | description의 reservations URL
        // 차단: 'blocked'/'not available'/'closed'/'unavailable'
        const isBlocked =
          /\bblocked\b|not\s*available|^closed|unavailable/i.test(summary);
        const isReservation =
          !isBlocked &&
          (/\breserved\b|\bbooked\b|\bbooking\b/i.test(summary) ||
            /reservations\/details/i.test(description));
        events.push({
          start: cur.start,
          end: cur.end,
          summary,
          uid: cur.uid ?? '',
          description,
          confirmationCode: extractConfirmationCode(description),
          isReservation,
        });
      }
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const keyPart = line.slice(0, idx);
      const value = line.slice(idx + 1);
      const key = keyPart.split(';')[0];

      switch (key) {
        case 'DTSTART':
          cur.start = parseICSDate(value);
          break;
        case 'DTEND':
          cur.end = parseICSDate(value);
          break;
        case 'SUMMARY':
          cur.summary = unescape(value);
          break;
        case 'UID':
          cur.uid = value;
          break;
        case 'DESCRIPTION':
          cur.description = unescape(value);
          break;
      }
    }
  }
  return events;
}

export function diffDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}
