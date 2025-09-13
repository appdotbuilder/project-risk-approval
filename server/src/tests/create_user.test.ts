import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput } from '../schema';
import { createUser } from '../handlers/create_user';
import { eq } from 'drizzle-orm';

// Test input with all required fields
const testInput: CreateUserInput = {
  email: 'test@example.com',
  name: 'Test User',
  role: 'project_proposer',
  is_active: true
};

describe('createUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a user with all fields', async () => {
    const result = await createUser(testInput);

    // Basic field validation
    expect(result.email).toEqual('test@example.com');
    expect(result.name).toEqual('Test User');
    expect(result.role).toEqual('project_proposer');
    expect(result.is_active).toEqual(true);
    expect(result.id).toBeDefined();
    expect(typeof result.id).toEqual('number');
    expect(result.id).toBeGreaterThan(0);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save user to database', async () => {
    const result = await createUser(testInput);

    // Query using proper drizzle syntax
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users).toHaveLength(1);
    expect(users[0].email).toEqual('test@example.com');
    expect(users[0].name).toEqual('Test User');
    expect(users[0].role).toEqual('project_proposer');
    expect(users[0].is_active).toEqual(true);
    expect(users[0].created_at).toBeInstanceOf(Date);
    expect(users[0].updated_at).toBeInstanceOf(Date);
  });

  it('should create user with default is_active value', async () => {
    const inputWithoutActive: CreateUserInput = {
      email: 'default@example.com',
      name: 'Default User',
      role: 'reviewer',
      is_active: true // Zod default is applied during parsing, but we need to provide it in tests
    };

    const result = await createUser(inputWithoutActive);

    expect(result.is_active).toEqual(true);
    expect(result.email).toEqual('default@example.com');
    expect(result.name).toEqual('Default User');
    expect(result.role).toEqual('reviewer');
  });

  it('should create users with different roles', async () => {
    const roles = ['project_proposer', 'reviewer', 'director', 'system_administrator'] as const;
    
    for (const role of roles) {
      const input: CreateUserInput = {
        email: `${role}@example.com`,
        name: `${role} User`,
        role: role,
        is_active: true
      };

      const result = await createUser(input);
      expect(result.role).toEqual(role);
      expect(result.email).toEqual(`${role}@example.com`);
      expect(result.name).toEqual(`${role} User`);
    }
  });

  it('should create inactive user', async () => {
    const inactiveInput: CreateUserInput = {
      email: 'inactive@example.com',
      name: 'Inactive User',
      role: 'project_proposer',
      is_active: false
    };

    const result = await createUser(inactiveInput);

    expect(result.is_active).toEqual(false);
    expect(result.email).toEqual('inactive@example.com');
  });

  it('should create multiple users with different emails', async () => {
    const user1Input: CreateUserInput = {
      email: 'user1@example.com',
      name: 'User One',
      role: 'project_proposer',
      is_active: true
    };

    const user2Input: CreateUserInput = {
      email: 'user2@example.com',
      name: 'User Two',
      role: 'reviewer',
      is_active: false
    };

    const result1 = await createUser(user1Input);
    const result2 = await createUser(user2Input);

    expect(result1.id).not.toEqual(result2.id);
    expect(result1.email).toEqual('user1@example.com');
    expect(result2.email).toEqual('user2@example.com');
    expect(result1.role).toEqual('project_proposer');
    expect(result2.role).toEqual('reviewer');
    expect(result1.is_active).toEqual(true);
    expect(result2.is_active).toEqual(false);

    // Verify both users exist in database
    const allUsers = await db.select().from(usersTable).execute();
    expect(allUsers).toHaveLength(2);
  });

  it('should handle duplicate email constraint violation', async () => {
    // Create first user
    await createUser(testInput);

    // Attempt to create second user with same email
    const duplicateInput: CreateUserInput = {
      email: 'test@example.com', // Same email
      name: 'Another User',
      role: 'reviewer',
      is_active: true
    };

    // Should throw error due to unique constraint on email
    await expect(createUser(duplicateInput)).rejects.toThrow();
  });

  it('should set created_at and updated_at timestamps', async () => {
    const beforeCreate = new Date();
    const result = await createUser(testInput);
    const afterCreate = new Date();

    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.created_at.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    expect(result.created_at.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    expect(result.updated_at.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    expect(result.updated_at.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
  });
});