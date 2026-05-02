import Dexie, { Table } from 'dexie';
import { Booking, Expense, Property } from './types';

class AppDB extends Dexie {
  properties!: Table<Property, number>;
  bookings!: Table<Booking, number>;
  expenses!: Table<Expense, number>;

  constructor() {
    super('airbnb-ledger');
    this.version(1).stores({
      properties: '++id, name, createdAt',
      bookings: '++id, propertyId, checkIn, platform, country, createdAt',
      expenses: '++id, propertyId, category, date, createdAt',
    });
  }
}

export const db = new AppDB();
