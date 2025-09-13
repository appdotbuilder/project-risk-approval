import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, notificationsTable, projectsTable } from '../db/schema';
import { type CreateUserInput, type CreateNotificationInput, type CreateProjectInput } from '../schema';
import { 
  getNotificationsByUser, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  type GetNotificationsFilters 
} from '../handlers/get_notifications';
import { eq } from 'drizzle-orm';

// Test data
const testUser: CreateUserInput = {
  email: 'user@test.com',
  name: 'Test User',
  role: 'project_proposer',
  is_active: true
};

const testUser2: CreateUserInput = {
  email: 'user2@test.com',
  name: 'Test User 2',
  role: 'reviewer',
  is_active: true
};

const testProject: CreateProjectInput = {
  name: 'Test Project',
  description: 'A test project',
  objective: 'Test objective',
  estimated_cost: 10000,
  target_time: '6 months',
  proposer_id: 1,
  reviewer_ids: [2]
};

describe('getNotificationsByUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get all notifications for a user', async () => {
    // Create test users
    const user = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    // Create test notifications
    await db.insert(notificationsTable)
      .values({
        user_id: user[0].id,
        type: 'project_submitted',
        title: 'Project Submitted',
        message: 'Your project has been submitted'
      })
      .execute();

    // Add a small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    
    await db.insert(notificationsTable)
      .values({
        user_id: user[0].id,
        type: 'review_assigned',
        title: 'Review Assigned',
        message: 'You have been assigned to review a project'
      })
      .execute();

    const filters: GetNotificationsFilters = {
      userId: user[0].id
    };

    const result = await getNotificationsByUser(filters);

    expect(result).toHaveLength(2);
    expect(result[0].user_id).toEqual(user[0].id);
    expect(result[1].user_id).toEqual(user[0].id);
    // Check that both notifications are present
    const titles = result.map(n => n.title);
    expect(titles).toContain('Review Assigned');
    expect(titles).toContain('Project Submitted');
    expect(result[0].is_read).toBe(false);
    expect(result[0].created_at).toBeInstanceOf(Date);
  });

  it('should filter notifications by read status', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    // Create notifications with different read statuses
    await db.insert(notificationsTable)
      .values([
        {
          user_id: user[0].id,
          type: 'project_submitted',
          title: 'Unread Notification',
          message: 'This is unread',
          is_read: false
        },
        {
          user_id: user[0].id,
          type: 'review_completed',
          title: 'Read Notification',
          message: 'This is read',
          is_read: true
        }
      ])
      .execute();

    // Get only unread notifications
    const unreadFilters: GetNotificationsFilters = {
      userId: user[0].id,
      isRead: false
    };

    const unreadResult = await getNotificationsByUser(unreadFilters);

    expect(unreadResult).toHaveLength(1);
    expect(unreadResult[0].title).toEqual('Unread Notification');
    expect(unreadResult[0].is_read).toBe(false);

    // Get only read notifications
    const readFilters: GetNotificationsFilters = {
      userId: user[0].id,
      isRead: true
    };

    const readResult = await getNotificationsByUser(readFilters);

    expect(readResult).toHaveLength(1);
    expect(readResult[0].title).toEqual('Read Notification');
    expect(readResult[0].is_read).toBe(true);
  });

  it('should apply pagination correctly', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    // Create multiple notifications
    const notifications = [];
    for (let i = 1; i <= 5; i++) {
      notifications.push({
        user_id: user[0].id,
        type: 'project_submitted' as const,
        title: `Notification ${i}`,
        message: `Message ${i}`
      });
    }

    await db.insert(notificationsTable)
      .values(notifications)
      .execute();

    // Test limit
    const limitedFilters: GetNotificationsFilters = {
      userId: user[0].id,
      limit: 2
    };

    const limitedResult = await getNotificationsByUser(limitedFilters);

    expect(limitedResult).toHaveLength(2);

    // Test offset
    const offsetFilters: GetNotificationsFilters = {
      userId: user[0].id,
      limit: 2,
      offset: 2
    };

    const offsetResult = await getNotificationsByUser(offsetFilters);

    expect(offsetResult).toHaveLength(2);
    expect(offsetResult[0].title).not.toEqual(limitedResult[0].title);
  });

  it('should only return notifications for the specified user', async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([testUser, testUser2])
      .returning()
      .execute();

    // Create notifications for different users
    await db.insert(notificationsTable)
      .values([
        {
          user_id: users[0].id,
          type: 'project_submitted',
          title: 'User 1 Notification',
          message: 'For user 1'
        },
        {
          user_id: users[1].id,
          type: 'review_assigned',
          title: 'User 2 Notification',
          message: 'For user 2'
        }
      ])
      .execute();

    const filters: GetNotificationsFilters = {
      userId: users[0].id
    };

    const result = await getNotificationsByUser(filters);

    expect(result).toHaveLength(1);
    expect(result[0].user_id).toEqual(users[0].id);
    expect(result[0].title).toEqual('User 1 Notification');
  });

  it('should work with backward compatible userId-only signature', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    // Create test notification
    await db.insert(notificationsTable)
      .values({
        user_id: user[0].id,
        type: 'project_submitted',
        title: 'Test Notification',
        message: 'Test message'
      })
      .execute();

    // Test backward compatible signature
    const result = await getNotificationsByUser(user[0].id);

    expect(result).toHaveLength(1);
    expect(result[0].user_id).toEqual(user[0].id);
    expect(result[0].title).toEqual('Test Notification');
  });

  it('should include project_id when notification is project-related', async () => {
    // Create test user and project
    const user = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    const project = await db.insert(projectsTable)
      .values({
        ...testProject,
        proposer_id: user[0].id,
        estimated_cost: testProject.estimated_cost.toString()
      })
      .returning()
      .execute();

    // Create notification with project reference
    await db.insert(notificationsTable)
      .values({
        user_id: user[0].id,
        type: 'project_approved',
        title: 'Project Approved',
        message: 'Your project has been approved',
        project_id: project[0].id
      })
      .execute();

    const filters: GetNotificationsFilters = {
      userId: user[0].id
    };

    const result = await getNotificationsByUser(filters);

    expect(result).toHaveLength(1);
    expect(result[0].project_id).toEqual(project[0].id);
  });
});

describe('markNotificationAsRead', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should mark notification as read', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    // Create test notification
    const notification = await db.insert(notificationsTable)
      .values({
        user_id: user[0].id,
        type: 'project_submitted',
        title: 'Test Notification',
        message: 'Test message',
        is_read: false
      })
      .returning()
      .execute();

    const result = await markNotificationAsRead(notification[0].id, user[0].id);

    expect(result.id).toEqual(notification[0].id);
    expect(result.is_read).toBe(true);
    expect(result.user_id).toEqual(user[0].id);
    expect(result.title).toEqual('Test Notification');

    // Verify in database
    const updated = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.id, notification[0].id))
      .execute();

    expect(updated[0].is_read).toBe(true);
  });

  it('should throw error when notification does not exist', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    await expect(markNotificationAsRead(999, user[0].id))
      .rejects
      .toThrow(/not found/i);
  });

  it('should throw error when notification does not belong to user', async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([testUser, testUser2])
      .returning()
      .execute();

    // Create notification for user 1
    const notification = await db.insert(notificationsTable)
      .values({
        user_id: users[0].id,
        type: 'project_submitted',
        title: 'Test Notification',
        message: 'Test message'
      })
      .returning()
      .execute();

    // Try to mark as read by user 2
    await expect(markNotificationAsRead(notification[0].id, users[1].id))
      .rejects
      .toThrow(/not found.*belong/i);
  });

  it('should handle already read notification', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    // Create already read notification
    const notification = await db.insert(notificationsTable)
      .values({
        user_id: user[0].id,
        type: 'project_submitted',
        title: 'Test Notification',
        message: 'Test message',
        is_read: true
      })
      .returning()
      .execute();

    const result = await markNotificationAsRead(notification[0].id, user[0].id);

    expect(result.is_read).toBe(true);
    expect(result.id).toEqual(notification[0].id);
  });
});

describe('markAllNotificationsAsRead', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should mark all notifications as read for a user', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    // Create multiple unread notifications
    await db.insert(notificationsTable)
      .values([
        {
          user_id: user[0].id,
          type: 'project_submitted',
          title: 'Notification 1',
          message: 'Message 1',
          is_read: false
        },
        {
          user_id: user[0].id,
          type: 'review_assigned',
          title: 'Notification 2',
          message: 'Message 2',
          is_read: false
        },
        {
          user_id: user[0].id,
          type: 'project_approved',
          title: 'Notification 3',
          message: 'Message 3',
          is_read: true // Already read
        }
      ])
      .execute();

    await markAllNotificationsAsRead(user[0].id);

    // Verify all notifications are now read
    const allNotifications = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.user_id, user[0].id))
      .execute();

    expect(allNotifications).toHaveLength(3);
    allNotifications.forEach(notification => {
      expect(notification.is_read).toBe(true);
    });
  });

  it('should only affect notifications for the specified user', async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([testUser, testUser2])
      .returning()
      .execute();

    // Create notifications for different users
    await db.insert(notificationsTable)
      .values([
        {
          user_id: users[0].id,
          type: 'project_submitted',
          title: 'User 1 Notification',
          message: 'Message',
          is_read: false
        },
        {
          user_id: users[1].id,
          type: 'review_assigned',
          title: 'User 2 Notification',
          message: 'Message',
          is_read: false
        }
      ])
      .execute();

    await markAllNotificationsAsRead(users[0].id);

    // Check user 1's notifications are read
    const user1Notifications = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.user_id, users[0].id))
      .execute();

    expect(user1Notifications[0].is_read).toBe(true);

    // Check user 2's notifications are still unread
    const user2Notifications = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.user_id, users[1].id))
      .execute();

    expect(user2Notifications[0].is_read).toBe(false);
  });

  it('should handle user with no notifications', async () => {
    // Create test user
    const user = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();

    // Should not throw error even if no notifications exist
    await expect(async () => {
      await markAllNotificationsAsRead(user[0].id);
    }).not.toThrow();
  });
});