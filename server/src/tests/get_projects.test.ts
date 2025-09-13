import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, projectsTable, projectReviewersTable } from '../db/schema';
import { type CreateUserInput, type CreateProjectInput } from '../schema';
import { getProjects, getProjectsByUser, getProjectById } from '../handlers/get_projects';

// Test data
const testUser: CreateUserInput = {
  email: 'proposer@test.com',
  name: 'Test Proposer',
  role: 'project_proposer',
  is_active: true
};

const testReviewer: CreateUserInput = {
  email: 'reviewer@test.com',
  name: 'Test Reviewer',
  role: 'reviewer',
  is_active: true
};

const testProject = {
  name: 'Test Project',
  description: 'A test project description',
  objective: 'Test project objective',
  estimated_cost: '15000.50', // Stored as string in DB
  target_time: '6 months',
  status: 'draft' as const,
  proposer_id: 1
};

describe('getProjects', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when no projects exist', async () => {
    const result = await getProjects();
    expect(result).toEqual([]);
  });

  it('should fetch all projects with correct numeric conversion', async () => {
    // Create user first
    await db.insert(usersTable).values(testUser).execute();

    // Create project
    await db.insert(projectsTable).values(testProject).execute();

    const result = await getProjects();

    expect(result).toHaveLength(1);
    expect(result[0].name).toEqual('Test Project');
    expect(result[0].description).toEqual('A test project description');
    expect(result[0].estimated_cost).toEqual(15000.50);
    expect(typeof result[0].estimated_cost).toBe('number');
    expect(result[0].status).toEqual('draft');
    expect(result[0].proposer_id).toEqual(1);
    expect(result[0].id).toBeDefined();
    expect(result[0].created_at).toBeInstanceOf(Date);
  });

  it('should fetch multiple projects', async () => {
    // Create user
    await db.insert(usersTable).values(testUser).execute();

    // Create multiple projects
    const projects = [
      { ...testProject, name: 'Project 1' },
      { ...testProject, name: 'Project 2', estimated_cost: '25000.75' },
      { ...testProject, name: 'Project 3', status: 'submitted' as const }
    ];

    await db.insert(projectsTable).values(projects).execute();

    const result = await getProjects();

    expect(result).toHaveLength(3);
    expect(result[0].name).toEqual('Project 1');
    expect(result[1].name).toEqual('Project 2');
    expect(result[1].estimated_cost).toEqual(25000.75);
    expect(result[2].name).toEqual('Project 3');
    expect(result[2].status).toEqual('submitted');
  });
});

describe('getProjectsByUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when user has no projects', async () => {
    // Create user
    await db.insert(usersTable).values(testUser).execute();

    const result = await getProjectsByUser(1);
    expect(result).toEqual([]);
  });

  it('should fetch projects where user is proposer', async () => {
    // Create users
    await db.insert(usersTable).values([testUser, testReviewer]).execute();

    // Create projects
    const projects = [
      { ...testProject, name: 'User 1 Project 1', proposer_id: 1 },
      { ...testProject, name: 'User 1 Project 2', proposer_id: 1 },
      { ...testProject, name: 'User 2 Project', proposer_id: 2 }
    ];

    await db.insert(projectsTable).values(projects).execute();

    const result = await getProjectsByUser(1);

    expect(result).toHaveLength(2);
    expect(result[0].name).toEqual('User 1 Project 1');
    expect(result[1].name).toEqual('User 1 Project 2');
    expect(result[0].proposer_id).toEqual(1);
    expect(result[1].proposer_id).toEqual(1);
  });

  it('should fetch projects where user is reviewer', async () => {
    // Create users
    await db.insert(usersTable).values([testUser, testReviewer]).execute();

    // Create project
    await db.insert(projectsTable).values({
      ...testProject,
      name: 'Reviewed Project',
      proposer_id: 1
    }).execute();

    // Assign reviewer
    await db.insert(projectReviewersTable).values({
      project_id: 1,
      reviewer_id: 2
    }).execute();

    const result = await getProjectsByUser(2);

    expect(result).toHaveLength(1);
    expect(result[0].name).toEqual('Reviewed Project');
    expect(result[0].proposer_id).toEqual(1);
    expect(result[0].estimated_cost).toEqual(15000.50);
    expect(typeof result[0].estimated_cost).toBe('number');
  });

  it('should fetch projects where user is both proposer and reviewer (no duplicates)', async () => {
    // Create users
    await db.insert(usersTable).values([testUser, testReviewer]).execute();

    // Create projects
    const projects = [
      { ...testProject, name: 'Proposed Project', proposer_id: 1 },
      { ...testProject, name: 'Reviewed Project', proposer_id: 2 }
    ];

    await db.insert(projectsTable).values(projects).execute();

    // Assign user 1 as reviewer for project 2
    await db.insert(projectReviewersTable).values({
      project_id: 2,
      reviewer_id: 1
    }).execute();

    const result = await getProjectsByUser(1);

    expect(result).toHaveLength(2);
    
    // Check both projects are included
    const projectNames = result.map(p => p.name).sort();
    expect(projectNames).toEqual(['Proposed Project', 'Reviewed Project']);
    
    // Ensure no duplicates
    const projectIds = result.map(p => p.id);
    const uniqueIds = [...new Set(projectIds)];
    expect(projectIds).toHaveLength(uniqueIds.length);
  });

  it('should handle multiple reviewer assignments for same user', async () => {
    // Create users
    await db.insert(usersTable).values([testUser, testReviewer]).execute();

    // Create projects
    const projects = [
      { ...testProject, name: 'Project 1', proposer_id: 1 },
      { ...testProject, name: 'Project 2', proposer_id: 1 }
    ];

    await db.insert(projectsTable).values(projects).execute();

    // Assign user 2 as reviewer for both projects
    await db.insert(projectReviewersTable).values([
      { project_id: 1, reviewer_id: 2 },
      { project_id: 2, reviewer_id: 2 }
    ]).execute();

    const result = await getProjectsByUser(2);

    expect(result).toHaveLength(2);
    expect(result[0].name).toEqual('Project 1');
    expect(result[1].name).toEqual('Project 2');
  });
});

describe('getProjectById', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return null when project does not exist', async () => {
    const result = await getProjectById(999);
    expect(result).toBeNull();
  });

  it('should fetch project by ID with correct numeric conversion', async () => {
    // Create user
    await db.insert(usersTable).values(testUser).execute();

    // Create project
    await db.insert(projectsTable).values(testProject).execute();

    const result = await getProjectById(1);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(1);
    expect(result!.name).toEqual('Test Project');
    expect(result!.description).toEqual('A test project description');
    expect(result!.objective).toEqual('Test project objective');
    expect(result!.estimated_cost).toEqual(15000.50);
    expect(typeof result!.estimated_cost).toBe('number');
    expect(result!.target_time).toEqual('6 months');
    expect(result!.status).toEqual('draft');
    expect(result!.proposer_id).toEqual(1);
    expect(result!.created_at).toBeInstanceOf(Date);
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should fetch correct project when multiple exist', async () => {
    // Create user
    await db.insert(usersTable).values(testUser).execute();

    // Create multiple projects
    const projects = [
      { ...testProject, name: 'Project 1', estimated_cost: '10000.00' },
      { ...testProject, name: 'Project 2', estimated_cost: '20000.50' },
      { ...testProject, name: 'Project 3', estimated_cost: '30000.25' }
    ];

    await db.insert(projectsTable).values(projects).execute();

    const result = await getProjectById(2);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(2);
    expect(result!.name).toEqual('Project 2');
    expect(result!.estimated_cost).toEqual(20000.50);
  });

  it('should handle projects with different statuses', async () => {
    // Create user
    await db.insert(usersTable).values(testUser).execute();

    // Create project with different status
    await db.insert(projectsTable).values({
      ...testProject,
      name: 'Submitted Project',
      status: 'submitted'
    }).execute();

    const result = await getProjectById(1);

    expect(result).not.toBeNull();
    expect(result!.status).toEqual('submitted');
    expect(result!.name).toEqual('Submitted Project');
  });
});