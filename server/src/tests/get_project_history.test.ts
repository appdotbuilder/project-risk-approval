import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, projectsTable, projectHistoryTable } from '../db/schema';
import { getProjectHistory, createProjectHistory } from '../handlers/get_project_history';
import { eq } from 'drizzle-orm';

describe('Project History Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUserId: number;
  let testProjectId: number;

  beforeEach(async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        name: 'Test User',
        role: 'project_proposer',
        is_active: true
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;

    // Create test project
    const projectResult = await db.insert(projectsTable)
      .values({
        name: 'Test Project',
        description: 'A test project',
        objective: 'Testing objectives',
        estimated_cost: '10000.00',
        target_time: '6 months',
        proposer_id: testUserId,
        status: 'draft'
      })
      .returning()
      .execute();
    testProjectId = projectResult[0].id;
  });

  describe('createProjectHistory', () => {
    it('should create a project history entry', async () => {
      const result = await createProjectHistory(
        testProjectId,
        testUserId,
        'project_created',
        'Initial project creation'
      );

      expect(result.id).toBeDefined();
      expect(result.project_id).toEqual(testProjectId);
      expect(result.user_id).toEqual(testUserId);
      expect(result.action).toEqual('project_created');
      expect(result.details).toEqual('Initial project creation');
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should create a project history entry without details', async () => {
      const result = await createProjectHistory(
        testProjectId,
        testUserId,
        'project_submitted'
      );

      expect(result.id).toBeDefined();
      expect(result.project_id).toEqual(testProjectId);
      expect(result.user_id).toEqual(testUserId);
      expect(result.action).toEqual('project_submitted');
      expect(result.details).toBeNull();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should save project history entry to database', async () => {
      const result = await createProjectHistory(
        testProjectId,
        testUserId,
        'project_approved',
        'Approved by director'
      );

      // Query database to verify entry was saved
      const savedEntries = await db.select()
        .from(projectHistoryTable)
        .where(eq(projectHistoryTable.id, result.id))
        .execute();

      expect(savedEntries).toHaveLength(1);
      expect(savedEntries[0].project_id).toEqual(testProjectId);
      expect(savedEntries[0].user_id).toEqual(testUserId);
      expect(savedEntries[0].action).toEqual('project_approved');
      expect(savedEntries[0].details).toEqual('Approved by director');
    });

    it('should handle foreign key constraints for non-existent project', async () => {
      await expect(
        createProjectHistory(99999, testUserId, 'invalid_action')
      ).rejects.toThrow();
    });

    it('should handle foreign key constraints for non-existent user', async () => {
      await expect(
        createProjectHistory(testProjectId, 99999, 'invalid_action')
      ).rejects.toThrow();
    });
  });

  describe('getProjectHistory', () => {
    it('should return empty array for project with no history', async () => {
      const result = await getProjectHistory(testProjectId);
      expect(result).toEqual([]);
    });

    it('should return project history entries in reverse chronological order', async () => {
      // Create multiple history entries with slight delays
      await createProjectHistory(testProjectId, testUserId, 'project_created', 'First action');
      
      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await createProjectHistory(testProjectId, testUserId, 'project_submitted', 'Second action');
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await createProjectHistory(testProjectId, testUserId, 'project_approved', 'Third action');

      const result = await getProjectHistory(testProjectId);

      expect(result).toHaveLength(3);
      // Should be ordered by most recent first
      expect(result[0].action).toEqual('project_approved');
      expect(result[1].action).toEqual('project_submitted');
      expect(result[2].action).toEqual('project_created');
      
      // Verify chronological ordering
      expect(result[0].created_at >= result[1].created_at).toBe(true);
      expect(result[1].created_at >= result[2].created_at).toBe(true);
    });

    it('should return only history for specified project', async () => {
      // Create another project
      const anotherProjectResult = await db.insert(projectsTable)
        .values({
          name: 'Another Project',
          description: 'Another test project',
          objective: 'Different objectives',
          estimated_cost: '5000.00',
          target_time: '3 months',
          proposer_id: testUserId,
          status: 'draft'
        })
        .returning()
        .execute();
      const anotherProjectId = anotherProjectResult[0].id;

      // Create history entries for both projects
      await createProjectHistory(testProjectId, testUserId, 'test_project_action');
      await createProjectHistory(anotherProjectId, testUserId, 'another_project_action');

      const result = await getProjectHistory(testProjectId);

      expect(result).toHaveLength(1);
      expect(result[0].action).toEqual('test_project_action');
      expect(result[0].project_id).toEqual(testProjectId);
    });

    it('should return history entries with all required fields', async () => {
      await createProjectHistory(
        testProjectId,
        testUserId,
        'project_reviewed',
        'Detailed review completed'
      );

      const result = await getProjectHistory(testProjectId);

      expect(result).toHaveLength(1);
      const entry = result[0];
      
      expect(entry.id).toBeDefined();
      expect(typeof entry.id).toBe('number');
      expect(entry.project_id).toEqual(testProjectId);
      expect(entry.user_id).toEqual(testUserId);
      expect(entry.action).toEqual('project_reviewed');
      expect(entry.details).toEqual('Detailed review completed');
      expect(entry.created_at).toBeInstanceOf(Date);
    });

    it('should handle entries with null details', async () => {
      await createProjectHistory(testProjectId, testUserId, 'status_change');

      const result = await getProjectHistory(testProjectId);

      expect(result).toHaveLength(1);
      expect(result[0].details).toBeNull();
    });

    it('should return empty array for non-existent project', async () => {
      const result = await getProjectHistory(99999);
      expect(result).toEqual([]);
    });

    it('should handle multiple users contributing to project history', async () => {
      // Create another user
      const anotherUserResult = await db.insert(usersTable)
        .values({
          email: 'reviewer@example.com',
          name: 'Test Reviewer',
          role: 'reviewer',
          is_active: true
        })
        .returning()
        .execute();
      const anotherUserId = anotherUserResult[0].id;

      // Create history entries from different users
      await createProjectHistory(testProjectId, testUserId, 'project_created', 'Created by proposer');
      await createProjectHistory(testProjectId, anotherUserId, 'review_assigned', 'Assigned to reviewer');
      await createProjectHistory(testProjectId, anotherUserId, 'review_completed', 'Review submitted');

      const result = await getProjectHistory(testProjectId);

      expect(result).toHaveLength(3);
      
      // Find entries by action to verify user associations
      const createdEntry = result.find(entry => entry.action === 'project_created');
      const assignedEntry = result.find(entry => entry.action === 'review_assigned');
      const completedEntry = result.find(entry => entry.action === 'review_completed');

      expect(createdEntry?.user_id).toEqual(testUserId);
      expect(assignedEntry?.user_id).toEqual(anotherUserId);
      expect(completedEntry?.user_id).toEqual(anotherUserId);
    });
  });
});