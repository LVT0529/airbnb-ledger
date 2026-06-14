export type Platform =
  | 'airbnb'
  | 'booking'
  | 'agoda'
  | 'expedia'
  | 'vrbo'
  | 'wehome'
  | 'mrmention'
  | 'direct'
  | 'other';

export interface Property {
  id: string;
  name: string;
  color: string;
  icalUrl?: string;
  createdAt: number;
}

export type BookingStatus = 'confirmed' | 'pending' | 'blocked';

export interface Booking {
  id: string;
  propertyId: string;
  guestName: string;
  country: string;
  platform: Platform;
  guests: number;
  nights: number;
  checkIn: string;
  checkOut: string;
  revenue: number;
  notes?: string;
  confirmationCode?: string;
  status: BookingStatus;
  createdAt: number;
}

// 비용 2단계 분류: 대분류(major) → 소분류(items)
// 저장값은 소분류 문자열 그대로. 대분류는 표시/집계용으로만 매핑한다.
export const EXPENSE_CATEGORY_GROUPS = [
  {
    major: '운영비',
    items: ['청소비', '세탁비', '소모품', '공과금', '인터넷/통신'],
  },
  {
    major: '수수료',
    items: ['플랫폼 수수료', '결제/PG 수수료'],
  },
  {
    major: '시설·유지보수',
    items: ['수리/유지보수', '비품 구매', '인테리어/리모델링'],
  },
  {
    major: '세금·보험',
    items: ['세금', '보험료'],
  },
  {
    major: '기타',
    items: ['광고/마케팅', '기타'],
  },
] as const;

// 평면 소분류 목록 (폼 추천/하위호환)
export const EXPENSE_CATEGORIES = EXPENSE_CATEGORY_GROUPS.flatMap(
  (g) => g.items,
);

const MAJOR_BY_ITEM: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORY_GROUPS.flatMap((g) =>
    g.items.map((item) => [item, g.major]),
  ),
);

// 소분류(또는 사용자 직접 입력값) → 대분류. 미등록 항목은 '기타'.
export function categoryMajor(category: string): string {
  return MAJOR_BY_ITEM[category] ?? '기타';
}

// 기본 카테고리 + 사용자가 직접 추가한 카테고리 모두 허용
export type ExpenseCategory = string;

export interface Expense {
  id: string;
  propertyId: string | null;
  category: ExpenseCategory;
  amount: number;
  date: string;
  notes?: string;
  sourceRecurringId?: string;
  sourceYearMonth?: string;
  createdAt: number;
}

export interface RecurringExpense {
  id: string;
  propertyId: string | null;
  category: string;
  amount: number;
  dayOfMonth: number;
  notes?: string;
  active: boolean;
  startMonth?: string; // 'YYYY-MM'
  createdAt: number;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
