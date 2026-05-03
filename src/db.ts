import Dexie, { Table } from 'dexie';
import { Booking, Expense, Property } from './types';

class AppDB extends Dexie {
  properties!: Table<Property, string>;
  bookings!: Table<Booking, string>;
  expenses!: Table<Expense, string>;

  constructor() {
    super('airbnb-ledger');
    this.version(1).stores({
      properties: '++id, name, createdAt',
      bookings: '++id, propertyId, checkIn, platform, country, createdAt',
      expenses: '++id, propertyId, category, date, createdAt',
    });
    this.version(2)
      .stores({
        properties: 'id, name, createdAt',
        bookings: 'id, propertyId, checkIn, platform, country, createdAt',
        expenses: 'id, propertyId, category, date, createdAt',
      })
      .upgrade(async (tx) => {
        await tx.table('properties').clear();
        await tx.table('bookings').clear();
        await tx.table('expenses').clear();
      });
  }
}

export const db = new AppDB();
