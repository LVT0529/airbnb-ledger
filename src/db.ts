import Dexie, { Table } from 'dexie';
import { Booking, Expense, Property, RecurringExpense } from './types';

class AppDB extends Dexie {
  properties!: Table<Property, string>;
  bookings!: Table<Booking, string>;
  expenses!: Table<Expense, string>;
  recurring_expenses!: Table<RecurringExpense, string>;

  constructor() {
    super('airbnb-ledger-v2');
    this.version(1).stores({
      properties: 'id, name, createdAt',
      bookings: 'id, propertyId, checkIn, platform, country, createdAt',
      expenses: 'id, propertyId, category, date, createdAt',
    });
    this.version(2).stores({
      properties: 'id, name, createdAt',
      bookings: 'id, propertyId, checkIn, platform, country, createdAt',
      expenses: 'id, propertyId, category, date, createdAt',
      recurring_expenses: 'id, propertyId, active, createdAt',
    });
  }
}

export const db = new AppDB();

// 기존 v1 DB(auto-increment id 기반)가 남아있으면 정리
Dexie.delete('airbnb-ledger').catch(() => {});
