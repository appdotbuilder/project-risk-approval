import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type UserRole } from '../schema';
import { getUsers } from '../handlers/get_users';

describe('getUsers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test users
  const createTestUser = async (userData: CreateUserInput) => {
    const result = await db.insert(usersTable)
      .values({
        email: userData.email,
        name: userData.name,
        role: userData.role,
        is_active: userData.is_active
      })
      .returning()
      .execute();

    return result[0];
  };

  it('should fetch all active users by default', async () => {
    // Create test users
    await createTestUser({
      email: 'active@example.com',
      name: 'Active User',
      role: 'project_proposer',
      is_active: true
    });

    await createTestUser({
      email: 'inactive@example.com',
      name: 'Inactive User',
      role: 'reviewer',
      is_active: false
    });

    const result = await getUsers();

    // Should only return active users by default
    expect(result).toHaveLength(1);
    expect(result[0].email).toEqual('active@example.com');
    expect(result[0].name).toEqual('Active User');
    expect(result[0].role).toEqual('project_proposer');
    expect(result[0].is_active).toEqual(true);
    expect(result[0].id).toBeDefined();
    expect(result[0].created_at).toBeInstanceOf(Date);
    expect(result[0].updated_at).toBeInstanceOf(Date);
  });

  it('should filter users by role', async () => {
    // Create users with different roles
    await createTestUser({
      email: 'proposer@example.com',
      name: 'Project Proposer',
      role: 'project_proposer',
      is_active: true
    });

    await createTestUser({
      email: 'reviewer@example.com',
      name: 'Reviewer',
      role: 'reviewer',
      is_active: true
    });

    await createTestUser({
      email: 'director@example.com',
      name: 'Director',
      role: 'director',
      is_active: true
    });

    // Filter by reviewer role
    const reviewers = await getUsers({ role: 'reviewer' });
    expect(reviewers).toHaveLength(1);
    expect(reviewers[0].email).toEqual('reviewer@example.com');
    expect(reviewers[0].role).toEqual('reviewer');

    // Filter by director role
    const directors = await getUsers({ role: 'director' });
    expect(directors).toHaveLength(1);
    expect(directors[0].email).toEqual('director@example.com');
    expect(directors[0].role).toEqual('director');
  });

  it('should filter users by active status', async () => {
    // Create active and inactive users
    await createTestUser({
      email: 'active1@example.com',
      name: 'Active User 1',
      role: 'project_proposer',
      is_active: true
    });

    await createTestUser({
      email: 'active2@example.com',
      name: 'Active User 2',
      role: 'reviewer',
      is_active: true
    });

    await createTestUser({
      email: 'inactive1@example.com',
      name: 'Inactive User 1',
      role: 'director',
      is_active: false
    });

    await createTestUser({
      email: 'inactive2@example.com',
      name: 'Inactive User 2',
      role: 'system_administrator',
      is_active: false
    });

    // Get active users explicitly
    const activeUsers = await getUsers({ is_active: true });
    expect(activeUsers).toHaveLength(2);
    activeUsers.forEach(user => {
      expect(user.is_active).toEqual(true);
    });

    // Get inactive users
    const inactiveUsers = await getUsers({ is_active: false });
    expect(inactiveUsers).toHaveLength(2);
    inactiveUsers.forEach(user => {
      expect(user.is_active).toEqual(false);
    });
  });

  it('should filter by both role and active status', async () => {
    // Create users with different combinations
    await createTestUser({
      email: 'active-reviewer@example.com',
      name: 'Active Reviewer',
      role: 'reviewer',
      is_active: true
    });

    await createTestUser({
      email: 'inactive-reviewer@example.com',
      name: 'Inactive Reviewer',
      role: 'reviewer',
      is_active: false
    });

    await createTestUser({
      email: 'active-proposer@example.com',
      name: 'Active Proposer',
      role: 'project_proposer',
      is_active: true
    });

    // Filter for active reviewers only
    const activeReviewers = await getUsers({ 
      role: 'reviewer', 
      is_active: true 
    });

    expect(activeReviewers).toHaveLength(1);
    expect(activeReviewers[0].email).toEqual('active-reviewer@example.com');
    expect(activeReviewers[0].role).toEqual('reviewer');
    expect(activeReviewers[0].is_active).toEqual(true);

    // Filter for inactive reviewers
    const inactiveReviewers = await getUsers({ 
      role: 'reviewer', 
      is_active: false 
    });

    expect(inactiveReviewers).toHaveLength(1);
    expect(inactiveReviewers[0].email).toEqual('inactive-reviewer@example.com');
    expect(inactiveReviewers[0].role).toEqual('reviewer');
    expect(inactiveReviewers[0].is_active).toEqual(false);
  });

  it('should return empty array when no users match filters', async () => {
    // Create a user with different role
    await createTestUser({
      email: 'proposer@example.com',
      name: 'Project Proposer',
      role: 'project_proposer',
      is_active: true
    });

    // Filter for system administrators (none exist)
    const admins = await getUsers({ role: 'system_administrator' });
    expect(admins).toHaveLength(0);
  });

  it('should handle all user roles correctly', async () => {
    const roles: UserRole[] = ['project_proposer', 'reviewer', 'director', 'system_administrator'];
    
    // Create one user for each role
    for (const role of roles) {
      await createTestUser({
        email: `${role}@example.com`,
        name: `Test ${role}`,
        role: role,
        is_active: true
      });
    }

    // Test filtering by each role
    for (const role of roles) {
      const users = await getUsers({ role });
      expect(users).toHaveLength(1);
      expect(users[0].role).toEqual(role);
      expect(users[0].email).toEqual(`${role}@example.com`);
    }
  });

  it('should return users in database insertion order', async () => {
    const testUsers = [
      { email: 'user1@example.com', name: 'User 1', role: 'reviewer' as UserRole },
      { email: 'user2@example.com', name: 'User 2', role: 'reviewer' as UserRole },
      { email: 'user3@example.com', name: 'User 3', role: 'reviewer' as UserRole }
    ];

    // Create users in order
    for (const userData of testUsers) {
      await createTestUser({
        ...userData,
        is_active: true
      });
    }

    const result = await getUsers({ role: 'reviewer' });
    
    expect(result).toHaveLength(3);
    expect(result[0].email).toEqual('user1@example.com');
    expect(result[1].email).toEqual('user2@example.com');
    expect(result[2].email).toEqual('user3@example.com');
  });

  it('should handle empty database', async () => {
    const result = await getUsers();
    expect(result).toHaveLength(0);
  });
});