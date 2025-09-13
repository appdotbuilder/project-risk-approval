import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, projectsTable, projectReviewersTable, projectHistoryTable, reviewsTable } from '../db/schema';
import { type CreateProjectInput } from '../schema';
import { createProject } from '../handlers/create_project';
import { eq } from 'drizzle-orm';

describe('createProject', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let proposerId: number;
  let reviewerId1: number;
  let reviewerId2: number;

  // Create test users before each test
  beforeEach(async () => {
    // Create test proposer
    const proposerResult = await db.insert(usersTable)
      .values({
        email: 'proposer@example.com',
        name: 'Test Proposer',
        role: 'project_proposer'
      })
      .returning()
      .execute();
    proposerId = proposerResult[0].id;

    // Create test reviewers
    const reviewer1Result = await db.insert(usersTable)
      .values({
        email: 'reviewer1@example.com',
        name: 'Test Reviewer 1',
        role: 'reviewer'
      })
      .returning()
      .execute();
    reviewerId1 = reviewer1Result[0].id;

    const reviewer2Result = await db.insert(usersTable)
      .values({
        email: 'reviewer2@example.com',
        name: 'Test Reviewer 2',
        role: 'reviewer'
      })
      .returning()
      .execute();
    reviewerId2 = reviewer2Result[0].id;
  });

  const testInput: CreateProjectInput = {
    name: 'Test Project',
    description: 'A project for testing purposes',
    objective: 'To test project creation functionality',
    estimated_cost: 50000.99,
    target_time: '6 months',
    proposer_id: 0, // Will be set in tests
    reviewer_ids: [] // Will be set in tests
  };

  it('should create a project with all required fields', async () => {
    const input = { ...testInput, proposer_id: proposerId, reviewer_ids: [reviewerId1] };
    const result = await createProject(input);

    // Basic field validation
    expect(result.name).toEqual('Test Project');
    expect(result.description).toEqual(testInput.description);
    expect(result.objective).toEqual(testInput.objective);
    expect(result.estimated_cost).toEqual(50000.99);
    expect(typeof result.estimated_cost).toEqual('number');
    expect(result.target_time).toEqual('6 months');
    expect(result.status).toEqual('draft');
    expect(result.proposer_id).toEqual(proposerId);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save project to database with correct data', async () => {
    const input = { ...testInput, proposer_id: proposerId, reviewer_ids: [reviewerId1] };
    const result = await createProject(input);

    // Verify project is saved in database
    const projects = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, result.id))
      .execute();

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toEqual('Test Project');
    expect(projects[0].description).toEqual(testInput.description);
    expect(projects[0].objective).toEqual(testInput.objective);
    expect(parseFloat(projects[0].estimated_cost)).toEqual(50000.99);
    expect(projects[0].target_time).toEqual('6 months');
    expect(projects[0].status).toEqual('draft');
    expect(projects[0].proposer_id).toEqual(proposerId);
    expect(projects[0].created_at).toBeInstanceOf(Date);
    expect(projects[0].updated_at).toBeInstanceOf(Date);
  });

  it('should assign reviewers to the project', async () => {
    const input = { ...testInput, proposer_id: proposerId, reviewer_ids: [reviewerId1, reviewerId2] };
    const result = await createProject(input);

    // Verify reviewer assignments
    const assignments = await db.select()
      .from(projectReviewersTable)
      .where(eq(projectReviewersTable.project_id, result.id))
      .execute();

    expect(assignments).toHaveLength(2);
    const reviewerIds = assignments.map(a => a.reviewer_id);
    expect(reviewerIds).toContain(reviewerId1);
    expect(reviewerIds).toContain(reviewerId2);
    assignments.forEach(assignment => {
      expect(assignment.project_id).toEqual(result.id);
      expect(assignment.assigned_at).toBeInstanceOf(Date);
    });
  });

  it('should create initial project history entry', async () => {
    const input = { ...testInput, proposer_id: proposerId, reviewer_ids: [reviewerId1] };
    const result = await createProject(input);

    // Verify project history entry
    const history = await db.select()
      .from(projectHistoryTable)
      .where(eq(projectHistoryTable.project_id, result.id))
      .execute();

    expect(history).toHaveLength(1);
    expect(history[0].project_id).toEqual(result.id);
    expect(history[0].user_id).toEqual(proposerId);
    expect(history[0].action).toEqual('project_created');
    expect(history[0].details).toEqual(`Project "Test Project" was created`);
    expect(history[0].created_at).toBeInstanceOf(Date);
  });

  it('should create review records for assigned reviewers', async () => {
    const input = { ...testInput, proposer_id: proposerId, reviewer_ids: [reviewerId1, reviewerId2] };
    const result = await createProject(input);

    // Verify review records
    const reviews = await db.select()
      .from(reviewsTable)
      .where(eq(reviewsTable.project_id, result.id))
      .execute();

    expect(reviews).toHaveLength(2);
    const reviewerIds = reviews.map(r => r.reviewer_id);
    expect(reviewerIds).toContain(reviewerId1);
    expect(reviewerIds).toContain(reviewerId2);
    
    reviews.forEach(review => {
      expect(review.project_id).toEqual(result.id);
      expect(review.decision).toBeNull();
      expect(review.justification).toBeNull();
      expect(review.risk_identification).toBeNull();
      expect(review.risk_assessment).toBeNull();
      expect(review.risk_mitigation).toBeNull();
      expect(review.comments).toBeNull();
      expect(review.submitted_at).toBeNull();
      expect(review.created_at).toBeInstanceOf(Date);
      expect(review.updated_at).toBeInstanceOf(Date);
    });
  });

  it('should work with no reviewers assigned', async () => {
    const input = { ...testInput, proposer_id: proposerId, reviewer_ids: [] };
    const result = await createProject(input);

    // Verify project is created
    expect(result.id).toBeDefined();
    expect(result.name).toEqual('Test Project');

    // Verify no reviewer assignments
    const assignments = await db.select()
      .from(projectReviewersTable)
      .where(eq(projectReviewersTable.project_id, result.id))
      .execute();
    expect(assignments).toHaveLength(0);

    // Verify no review records
    const reviews = await db.select()
      .from(reviewsTable)
      .where(eq(reviewsTable.project_id, result.id))
      .execute();
    expect(reviews).toHaveLength(0);

    // Verify project history is still created
    const history = await db.select()
      .from(projectHistoryTable)
      .where(eq(projectHistoryTable.project_id, result.id))
      .execute();
    expect(history).toHaveLength(1);
  });

  it('should handle projects with decimal costs correctly', async () => {
    const input = { 
      ...testInput, 
      proposer_id: proposerId, 
      reviewer_ids: [reviewerId1],
      estimated_cost: 12345.67
    };
    const result = await createProject(input);

    expect(result.estimated_cost).toEqual(12345.67);
    expect(typeof result.estimated_cost).toEqual('number');

    // Verify in database
    const projects = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, result.id))
      .execute();

    expect(parseFloat(projects[0].estimated_cost)).toEqual(12345.67);
  });

  it('should throw error for non-existent proposer', async () => {
    const input = { ...testInput, proposer_id: 99999, reviewer_ids: [reviewerId1] };
    
    await expect(createProject(input)).rejects.toThrow(/violates foreign key constraint/i);
  });

  it('should throw error for non-existent reviewer', async () => {
    const input = { ...testInput, proposer_id: proposerId, reviewer_ids: [99999] };
    
    await expect(createProject(input)).rejects.toThrow(/violates foreign key constraint/i);
  });
});