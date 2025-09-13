import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, projectsTable, projectReviewersTable, notificationsTable, projectHistoryTable } from '../db/schema';
import { type CreateUserInput, type CreateProjectInput } from '../schema';
import { submitProject } from '../handlers/submit_project';
import { eq } from 'drizzle-orm';

// Test data
const testProposer: CreateUserInput = {
  email: 'proposer@test.com',
  name: 'Test Proposer',
  role: 'project_proposer',
  is_active: true
};

const testReviewer1: CreateUserInput = {
  email: 'reviewer1@test.com',
  name: 'Test Reviewer 1',
  role: 'reviewer',
  is_active: true
};

const testReviewer2: CreateUserInput = {
  email: 'reviewer2@test.com',
  name: 'Test Reviewer 2',
  role: 'reviewer',
  is_active: true
};

const testOtherUser: CreateUserInput = {
  email: 'other@test.com',
  name: 'Other User',
  role: 'project_proposer',
  is_active: true
};

describe('submitProject', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should submit a draft project successfully', async () => {
    // Create test users
    const proposerResult = await db.insert(usersTable)
      .values(testProposer)
      .returning()
      .execute();
    const proposer = proposerResult[0];

    const reviewer1Result = await db.insert(usersTable)
      .values(testReviewer1)
      .returning()
      .execute();
    const reviewer1 = reviewer1Result[0];

    const reviewer2Result = await db.insert(usersTable)
      .values(testReviewer2)
      .returning()
      .execute();
    const reviewer2 = reviewer2Result[0];

    // Create test project
    const projectResult = await db.insert(projectsTable)
      .values({
        name: 'Test Project',
        description: 'Test description',
        objective: 'Test objective',
        estimated_cost: '25000.50',
        target_time: '6 months',
        status: 'draft',
        proposer_id: proposer.id
      })
      .returning()
      .execute();
    const project = projectResult[0];

    // Assign reviewers to project
    await db.insert(projectReviewersTable)
      .values([
        { project_id: project.id, reviewer_id: reviewer1.id },
        { project_id: project.id, reviewer_id: reviewer2.id }
      ])
      .execute();

    // Submit the project
    const result = await submitProject(project.id, proposer.id);

    // Verify the result
    expect(result.id).toEqual(project.id);
    expect(result.name).toEqual('Test Project');
    expect(result.description).toEqual('Test description');
    expect(result.status).toEqual('submitted');
    expect(result.proposer_id).toEqual(proposer.id);
    expect(result.estimated_cost).toEqual(25000.50);
    expect(typeof result.estimated_cost).toBe('number');
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should update project status in database', async () => {
    // Create test user and project
    const proposerResult = await db.insert(usersTable)
      .values(testProposer)
      .returning()
      .execute();
    const proposer = proposerResult[0];

    const projectResult = await db.insert(projectsTable)
      .values({
        name: 'Test Project',
        description: 'Test description',
        objective: 'Test objective',
        estimated_cost: '15000.00',
        target_time: '3 months',
        status: 'draft',
        proposer_id: proposer.id
      })
      .returning()
      .execute();
    const project = projectResult[0];

    // Submit the project
    await submitProject(project.id, proposer.id);

    // Verify project status was updated in database
    const updatedProjects = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, project.id))
      .execute();

    expect(updatedProjects).toHaveLength(1);
    expect(updatedProjects[0].status).toEqual('submitted');
    expect(updatedProjects[0].updated_at).toBeInstanceOf(Date);
  });

  it('should create notifications for all assigned reviewers', async () => {
    // Create test users
    const proposerResult = await db.insert(usersTable)
      .values(testProposer)
      .returning()
      .execute();
    const proposer = proposerResult[0];

    const reviewer1Result = await db.insert(usersTable)
      .values(testReviewer1)
      .returning()
      .execute();
    const reviewer1 = reviewer1Result[0];

    const reviewer2Result = await db.insert(usersTable)
      .values(testReviewer2)
      .returning()
      .execute();
    const reviewer2 = reviewer2Result[0];

    // Create test project
    const projectResult = await db.insert(projectsTable)
      .values({
        name: 'Notification Test Project',
        description: 'Test description',
        objective: 'Test objective',
        estimated_cost: '10000.00',
        target_time: '4 months',
        status: 'draft',
        proposer_id: proposer.id
      })
      .returning()
      .execute();
    const project = projectResult[0];

    // Assign reviewers to project
    await db.insert(projectReviewersTable)
      .values([
        { project_id: project.id, reviewer_id: reviewer1.id },
        { project_id: project.id, reviewer_id: reviewer2.id }
      ])
      .execute();

    // Submit the project
    await submitProject(project.id, proposer.id);

    // Verify notifications were created
    const notifications = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.project_id, project.id))
      .execute();

    expect(notifications).toHaveLength(2);
    
    // Check notification details
    const reviewerIds = [reviewer1.id, reviewer2.id];
    notifications.forEach(notification => {
      expect(reviewerIds).toContain(notification.user_id);
      expect(notification.type).toEqual('project_submitted');
      expect(notification.title).toEqual('New Project Submitted for Review');
      expect(notification.message).toContain('Notification Test Project');
      expect(notification.project_id).toEqual(project.id);
      expect(notification.is_read).toBe(false);
    });
  });

  it('should create project history entry', async () => {
    // Create test user and project
    const proposerResult = await db.insert(usersTable)
      .values(testProposer)
      .returning()
      .execute();
    const proposer = proposerResult[0];

    const projectResult = await db.insert(projectsTable)
      .values({
        name: 'History Test Project',
        description: 'Test description',
        objective: 'Test objective',
        estimated_cost: '8000.00',
        target_time: '2 months',
        status: 'draft',
        proposer_id: proposer.id
      })
      .returning()
      .execute();
    const project = projectResult[0];

    // Submit the project
    await submitProject(project.id, proposer.id);

    // Verify history entry was created
    const historyEntries = await db.select()
      .from(projectHistoryTable)
      .where(eq(projectHistoryTable.project_id, project.id))
      .execute();

    expect(historyEntries).toHaveLength(1);
    expect(historyEntries[0].user_id).toEqual(proposer.id);
    expect(historyEntries[0].action).toEqual('Project Submitted');
    expect(historyEntries[0].details).toContain('History Test Project');
    expect(historyEntries[0].created_at).toBeInstanceOf(Date);
  });

  it('should throw error if project does not exist', async () => {
    const nonExistentProjectId = 99999;
    const userId = 1;

    await expect(submitProject(nonExistentProjectId, userId))
      .rejects.toThrow(/project not found/i);
  });

  it('should throw error if user is not the project proposer', async () => {
    // Create test users
    const proposerResult = await db.insert(usersTable)
      .values(testProposer)
      .returning()
      .execute();
    const proposer = proposerResult[0];

    const otherUserResult = await db.insert(usersTable)
      .values(testOtherUser)
      .returning()
      .execute();
    const otherUser = otherUserResult[0];

    // Create test project
    const projectResult = await db.insert(projectsTable)
      .values({
        name: 'Unauthorized Test Project',
        description: 'Test description',
        objective: 'Test objective',
        estimated_cost: '5000.00',
        target_time: '1 month',
        status: 'draft',
        proposer_id: proposer.id
      })
      .returning()
      .execute();
    const project = projectResult[0];

    // Try to submit with different user
    await expect(submitProject(project.id, otherUser.id))
      .rejects.toThrow(/only the project proposer can submit/i);
  });

  it('should throw error if project is not in draft status', async () => {
    // Create test user
    const proposerResult = await db.insert(usersTable)
      .values(testProposer)
      .returning()
      .execute();
    const proposer = proposerResult[0];

    // Create submitted project
    const projectResult = await db.insert(projectsTable)
      .values({
        name: 'Already Submitted Project',
        description: 'Test description',
        objective: 'Test objective',
        estimated_cost: '12000.00',
        target_time: '5 months',
        status: 'submitted',
        proposer_id: proposer.id
      })
      .returning()
      .execute();
    const project = projectResult[0];

    // Try to submit already submitted project
    await expect(submitProject(project.id, proposer.id))
      .rejects.toThrow(/only draft projects can be submitted/i);
  });

  it('should handle project with no assigned reviewers', async () => {
    // Create test user
    const proposerResult = await db.insert(usersTable)
      .values(testProposer)
      .returning()
      .execute();
    const proposer = proposerResult[0];

    // Create project without reviewers
    const projectResult = await db.insert(projectsTable)
      .values({
        name: 'No Reviewers Project',
        description: 'Test description',
        objective: 'Test objective',
        estimated_cost: '7500.00',
        target_time: '3 months',
        status: 'draft',
        proposer_id: proposer.id
      })
      .returning()
      .execute();
    const project = projectResult[0];

    // Submit the project
    const result = await submitProject(project.id, proposer.id);

    // Should still work
    expect(result.status).toEqual('submitted');

    // Verify no notifications were created
    const notifications = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.project_id, project.id))
      .execute();

    expect(notifications).toHaveLength(0);

    // Verify history entry was still created
    const historyEntries = await db.select()
      .from(projectHistoryTable)
      .where(eq(projectHistoryTable.project_id, project.id))
      .execute();

    expect(historyEntries).toHaveLength(1);
  });
});