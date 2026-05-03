export type Platform = 'airbnb' | 'booking' | 'agoda' | 'expedia' | 'direct' | 'other';

export interface Property {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

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
  createdAt: number;
}

export const EXPENSE_CATEGORIES = [
  '청소비',
  '플랫폼 수수료',
  '소모품',
  '공과금',
  '수리/유지보수',
  '비품 구매',
  '세금',
  '기타',
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export interface Expense {
  id: string;
  propertyId: string | null;
  category: ExpenseCategory;
  amount: number;
  date: string;
  notes?: string;
  createdAt: number;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
