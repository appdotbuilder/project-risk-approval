import { db } from '../db';
import { usersTable } from '../db/schema';
import { type User, type UserRole } from '../schema';
import { eq, and } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

interface GetUsersFilters {
  role?: UserRole;
  is_active?: boolean;
}

export const getUsers = async (filters?: GetUsersFilters): Promise<User[]> => {
  try {
    const conditions: SQL<unknown>[] = [];

    // Filter by role if specified
    if (filters?.role) {
      conditions.push(eq(usersTable.role, filters.role));
    }

    // Filter by active status if specified (defaults to active users only if no filter provided)
    const isActiveFilter = filters?.is_active ?? true;
    conditions.push(eq(usersTable.is_active, isActiveFilter));

    // Build query with conditions
    const query = db.select()
      .from(usersTable)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions));

    const results = await query.execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch users:', error);
    throw error;
  }
};