import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, projectsTable, projectReviewersTable } from '../db/schema';
import { type CreateUserInput, type CreateProjectInput } from '../schema';
import { getAvailableReviewers, getProjectReviewers } from '../handlers/get_reviewers';
import { eq } from 'drizzle-orm';

// Test data
const reviewerInput: CreateUserInput = {
  email: 'reviewer@example.com',
  name: 'Test Reviewer',
  role: 'reviewer',
  is_active: true
};

const inactiveReviewerInput: CreateUserInput = {
  email: 'inactive@example.com',
  name: 'Inactive Reviewer',
  role: 'reviewer',
  is_active: false
};

const proposerInput: CreateUserInput = {
  email: 'proposer@example.com',
  name: 'Test Proposer',
  role: 'project_proposer',
  is_active: true
};

const secondReviewerInput: CreateUserInput = {
  email: 'reviewer2@example.com',
  name: 'Second Reviewer',
  role: 'reviewer',
  is_active: true
};

describe('get_reviewers handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getAvailableReviewers', () => {
    it('should return active reviewers only', async () => {
      // Create users with different roles and statuses
      await db.insert(usersTable).values([
        reviewerInput,
        inactiveReviewerInput,
        proposerInput,
        secondReviewerInput
      ]).execute();

      const result = await getAvailableReviewers();

      expect(result).toHaveLength(2);
      expect(result.every(user => user.role === 'reviewer')).toBe(true);
      expect(result.every(user => user.is_active === true)).toBe(true);
      
      const names = result.map(user => user.name).sort();
      expect(names).toEqual(['Second Reviewer', 'Test Reviewer']);
    });

    it('should return empty array when no active reviewers exist', async () => {
      // Create only inactive reviewers and non-reviewers
      await db.insert(usersTable).values([
        inactiveReviewerInput,
        proposerInput
      ]).execute();

      const result = await getAvailableReviewers();

      expect(result).toHaveLength(0);
    });

    it('should return correct user properties', async () => {
      await db.insert(usersTable).values(reviewerInput).execute();

      const result = await getAvailableReviewers();

      expect(result).toHaveLength(1);
      const reviewer = result[0];
      expect(reviewer.email).toEqual('reviewer@example.com');
      expect(reviewer.name).toEqual('Test Reviewer');
      expect(reviewer.role).toEqual('reviewer');
      expect(reviewer.is_active).toBe(true);
      expect(reviewer.id).toBeDefined();
      expect(reviewer.created_at).toBeInstanceOf(Date);
      expect(reviewer.updated_at).toBeInstanceOf(Date);
    });
  });

  describe('getProjectReviewers', () => {
    it('should return reviewers assigned to a project', async () => {
      // Create users
      const userResults = await db.insert(usersTable).values([
        proposerInput,
        reviewerInput,
        secondReviewerInput
      ]).returning().execute();

      const proposer = userResults.find(u => u.role === 'project_proposer')!;
      const reviewer1 = userResults.find(u => u.name === 'Test Reviewer')!;
      const reviewer2 = userResults.find(u => u.name === 'Second Reviewer')!;

      // Create project
      const projectInput = {
        name: 'Test Project',
        description: 'A test project',
        objective: 'Testing objectives',
        estimated_cost: '1000.50',
        target_time: '6 months',
        proposer_id: proposer.id
      };

      const projectResults = await db.insert(projectsTable).values(projectInput).returning().execute();
      const project = projectResults[0];

      // Assign reviewers to project
      await db.insert(projectReviewersTable).values([
        { project_id: project.id, reviewer_id: reviewer1.id },
        { project_id: project.id, reviewer_id: reviewer2.id }
      ]).execute();

      const result = await getProjectReviewers(project.id);

      expect(result).toHaveLength(2);
      expect(result.every(user => user.role === 'reviewer')).toBe(true);
      
      const names = result.map(user => user.name).sort();
      expect(names).toEqual(['Second Reviewer', 'Test Reviewer']);
    });

    it('should return empty array for project with no assigned reviewers', async () => {
      // Create proposer and project
      const userResults = await db.insert(usersTable).values(proposerInput).returning().execute();
      const proposer = userResults[0];

      const projectInput = {
        name: 'Test Project',
        description: 'A test project',
        objective: 'Testing objectives',
        estimated_cost: '1000.50',
        target_time: '6 months',
        proposer_id: proposer.id
      };

      const projectResults = await db.insert(projectsTable).values(projectInput).returning().execute();
      const project = projectResults[0];

      const result = await getProjectReviewers(project.id);

      expect(result).toHaveLength(0);
    });

    it('should return correct reviewer properties', async () => {
      // Create users and project
      const userResults = await db.insert(usersTable).values([
        proposerInput,
        reviewerInput
      ]).returning().execute();

      const proposer = userResults.find(u => u.role === 'project_proposer')!;
      const reviewer = userResults.find(u => u.role === 'reviewer')!;

      const projectInput = {
        name: 'Test Project',
        description: 'A test project',
        objective: 'Testing objectives',
        estimated_cost: '1000.50',
        target_time: '6 months',
        proposer_id: proposer.id
      };

      const projectResults = await db.insert(projectsTable).values(projectInput).returning().execute();
      const project = projectResults[0];

      // Assign reviewer to project
      await db.insert(projectReviewersTable).values({
        project_id: project.id,
        reviewer_id: reviewer.id
      }).execute();

      const result = await getProjectReviewers(project.id);

      expect(result).toHaveLength(1);
      const assignedReviewer = result[0];
      expect(assignedReviewer.id).toEqual(reviewer.id);
      expect(assignedReviewer.email).toEqual('reviewer@example.com');
      expect(assignedReviewer.name).toEqual('Test Reviewer');
      expect(assignedReviewer.role).toEqual('reviewer');
      expect(assignedReviewer.is_active).toBe(true);
      expect(assignedReviewer.created_at).toBeInstanceOf(Date);
      expect(assignedReviewer.updated_at).toBeInstanceOf(Date);
    });

    it('should include inactive reviewers if they are assigned to project', async () => {
      // Create users and project
      const userResults = await db.insert(usersTable).values([
        proposerInput,
        inactiveReviewerInput
      ]).returning().execute();

      const proposer = userResults.find(u => u.role === 'project_proposer')!;
      const inactiveReviewer = userResults.find(u => u.role === 'reviewer')!;

      const projectInput = {
        name: 'Test Project',
        description: 'A test project',
        objective: 'Testing objectives',
        estimated_cost: '1000.50',
        target_time: '6 months',
        proposer_id: proposer.id
      };

      const projectResults = await db.insert(projectsTable).values(projectInput).returning().execute();
      const project = projectResults[0];

      // Assign inactive reviewer to project
      await db.insert(projectReviewersTable).values({
        project_id: project.id,
        reviewer_id: inactiveReviewer.id
      }).execute();

      const result = await getProjectReviewers(project.id);

      expect(result).toHaveLength(1);
      expect(result[0].is_active).toBe(false);
      expect(result[0].name).toEqual('Inactive Reviewer');
    });

    it('should return empty array for non-existent project', async () => {
      const result = await getProjectReviewers(999);
      expect(result).toHaveLength(0);
    });
  });
});