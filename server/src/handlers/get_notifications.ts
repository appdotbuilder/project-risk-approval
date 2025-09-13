import { db } from '../db';
import { notificationsTable } from '../db/schema';
import { type Notification } from '../schema';
import { eq, and, desc, SQL } from 'drizzle-orm';

export interface GetNotificationsFilters {
  userId: number;
  isRead?: boolean;
  limit?: number;
  offset?: number;
}

// Function overloads for backward compatibility
export async function getNotificationsByUser(userId: number): Promise<Notification[]>;
export async function getNotificationsByUser(filters: GetNotificationsFilters): Promise<Notification[]>;
export async function getNotificationsByUser(userIdOrFilters: number | GetNotificationsFilters): Promise<Notification[]> {
  try {
    // Handle both signatures for backward compatibility
    const filters: GetNotificationsFilters = typeof userIdOrFilters === 'number' 
      ? { userId: userIdOrFilters }
      : userIdOrFilters;

    // Build conditions array
    const conditions: SQL<unknown>[] = [
      eq(notificationsTable.user_id, filters.userId)
    ];

    if (filters.isRead !== undefined) {
      conditions.push(eq(notificationsTable.is_read, filters.isRead));
    }

    // Create the base query parts
    const whereCondition = conditions.length === 1 ? conditions[0] : and(...conditions);
    
    // Execute query with conditional pagination
    let query = db.select()
      .from(notificationsTable)
      .where(whereCondition)
      .orderBy(desc(notificationsTable.created_at));

    // Handle pagination cases
    if (filters.limit !== undefined && filters.offset !== undefined) {
      const results = await query.limit(filters.limit).offset(filters.offset).execute();
      return results;
    } else if (filters.limit !== undefined) {
      const results = await query.limit(filters.limit).execute();
      return results;
    } else if (filters.offset !== undefined) {
      const results = await query.limit(100).offset(filters.offset).execute();
      return results;
    } else {
      const results = await query.execute();
      return results;
    }
  } catch (error) {
    console.error('Get notifications failed:', error);
    throw error;
  }
}

export async function markNotificationAsRead(notificationId: number, userId: number): Promise<Notification> {
  try {
    // Verify the notification exists and belongs to the user
    const existingNotifications = await db.select()
      .from(notificationsTable)
      .where(and(
        eq(notificationsTable.id, notificationId),
        eq(notificationsTable.user_id, userId)
      ))
      .execute();

    if (existingNotifications.length === 0) {
      throw new Error('Notification not found or does not belong to user');
    }

    // Update the notification to mark as read
    const result = await db.update(notificationsTable)
      .set({
        is_read: true
      })
      .where(and(
        eq(notificationsTable.id, notificationId),
        eq(notificationsTable.user_id, userId)
      ))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Mark notification as read failed:', error);
    throw error;
  }
}

export async function markAllNotificationsAsRead(userId: number): Promise<void> {
  try {
    await db.update(notificationsTable)
      .set({
        is_read: true
      })
      .where(eq(notificationsTable.user_id, userId))
      .execute();
  } catch (error) {
    console.error('Mark all notifications as read failed:', error);
    throw error;
  }
}