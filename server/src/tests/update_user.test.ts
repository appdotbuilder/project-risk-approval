import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type UpdateUserInput, type CreateUserInput } from '../schema';
import { updateUser } from '../handlers/update_user';
import { eq } from 'drizzle-orm';

// Helper function to create a test user
const createTestUser = async (userData: CreateUserInput) => {
  const result = await db.insert(usersTable)
    .values(userData)
    .returning()
    .execute();
  return result[0];
};

describe('updateUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should update a user with all fields', async () => {
    // Create initial user
    const initialUser = await createTestUser({
      email: 'initial@test.com',
      name: 'Initial Name',
      role: 'project_proposer',
      is_active: true
    });

    // Update user
    const updateInput: UpdateUserInput = {
      id: initialUser.id,
      email: 'updated@test.com',
      name: 'Updated Name',
      role: 'reviewer',
      is_active: false
    };

    const result = await updateUser(updateInput);

    // Verify updated fields
    expect(result.id).toEqual(initialUser.id);
    expect(result.email).toEqual('updated@test.com');
    expect(result.name).toEqual('Updated Name');
    expect(result.role).toEqual('reviewer');
    expect(result.is_active).toEqual(false);
    expect(result.created_at).toEqual(initialUser.created_at);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at > initialUser.updated_at).toBe(true);
  });

  it('should update only provided fields', async () => {
    // Create initial user
    const initialUser = await createTestUser({
      email: 'partial@test.com',
      name: 'Original Name',
      role: 'project_proposer',
      is_active: true
    });

    // Update only email and name
    const updateInput: UpdateUserInput = {
      id: initialUser.id,
      email: 'newemail@test.com',
      name: 'New Name'
    };

    const result = await updateUser(updateInput);

    // Verify only specified fields were updated
    expect(result.email).toEqual('newemail@test.com');
    expect(result.name).toEqual('New Name');
    expect(result.role).toEqual('project_proposer'); // Unchanged
    expect(result.is_active).toEqual(true); // Unchanged
    expect(result.updated_at > initialUser.updated_at).toBe(true);
  });

  it('should update only role field', async () => {
    // Create initial user
    const initialUser = await createTestUser({
      email: 'role@test.com',
      name: 'Role User',
      role: 'project_proposer',
      is_active: true
    });

    // Update only role
    const updateInput: UpdateUserInput = {
      id: initialUser.id,
      role: 'director'
    };

    const result = await updateUser(updateInput);

    // Verify only role was updated
    expect(result.email).toEqual('role@test.com'); // Unchanged
    expect(result.name).toEqual('Role User'); // Unchanged
    expect(result.role).toEqual('director'); // Updated
    expect(result.is_active).toEqual(true); // Unchanged
  });

  it('should update is_active field correctly', async () => {
    // Create initial user
    const initialUser = await createTestUser({
      email: 'active@test.com',
      name: 'Active User',
      role: 'reviewer',
      is_active: true
    });

    // Update is_active to false
    const updateInput: UpdateUserInput = {
      id: initialUser.id,
      is_active: false
    };

    const result = await updateUser(updateInput);

    // Verify is_active was updated
    expect(result.is_active).toEqual(false);
    expect(result.email).toEqual('active@test.com'); // Unchanged
    expect(result.name).toEqual('Active User'); // Unchanged
    expect(result.role).toEqual('reviewer'); // Unchanged
  });

  it('should update user in database', async () => {
    // Create initial user
    const initialUser = await createTestUser({
      email: 'database@test.com',
      name: 'Database User',
      role: 'system_administrator',
      is_active: true
    });

    // Update user
    const updateInput: UpdateUserInput = {
      id: initialUser.id,
      email: 'updated-db@test.com',
      name: 'Updated Database User'
    };

    await updateUser(updateInput);

    // Verify changes were persisted in database
    const savedUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, initialUser.id))
      .execute();

    expect(savedUser).toHaveLength(1);
    expect(savedUser[0].email).toEqual('updated-db@test.com');
    expect(savedUser[0].name).toEqual('Updated Database User');
    expect(savedUser[0].role).toEqual('system_administrator'); // Unchanged
    expect(savedUser[0].is_active).toEqual(true); // Unchanged
  });

  it('should throw error for non-existent user', async () => {
    const updateInput: UpdateUserInput = {
      id: 99999, // Non-existent ID
      email: 'nonexistent@test.com'
    };

    await expect(updateUser(updateInput)).rejects.toThrow(/User with id 99999 not found/i);
  });

  it('should handle updating to different user roles', async () => {
    // Create initial user
    const initialUser = await createTestUser({
      email: 'roles@test.com',
      name: 'Role Test User',
      role: 'project_proposer',
      is_active: true
    });

    // Test updating to each role
    const roles = ['reviewer', 'director', 'system_administrator'] as const;
    
    for (const role of roles) {
      const updateInput: UpdateUserInput = {
        id: initialUser.id,
        role: role
      };

      const result = await updateUser(updateInput);
      expect(result.role).toEqual(role);
    }
  });

  it('should always update updated_at timestamp', async () => {
    // Create initial user
    const initialUser = await createTestUser({
      email: 'timestamp@test.com',
      name: 'Timestamp User',
      role: 'project_proposer',
      is_active: true
    });

    // Wait a small amount to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    // Update with minimal change
    const updateInput: UpdateUserInput = {
      id: initialUser.id,
      name: 'Timestamp User Updated'
    };

    const result = await updateUser(updateInput);

    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at > initialUser.updated_at).toBe(true);
  });
});