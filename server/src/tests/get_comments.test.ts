import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, projectsTable, commentsTable } from '../db/schema';
import { type CreateUserInput, type CreateProjectInput, type CreateCommentInput } from '../schema';
import { getCommentsByProject, getComment } from '../handlers/get_comments';
import { eq } from 'drizzle-orm';

// Test data
const testUser1: CreateUserInput = {
  email: 'user1@example.com',
  name: 'Test User 1',
  role: 'project_proposer',
  is_active: true
};

const testUser2: CreateUserInput = {
  email: 'user2@example.com',
  name: 'Test User 2',
  role: 'reviewer',
  is_active: true
};

describe('getCommentsByProject', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get all comments for a project', async () => {
    // Create test users
    const user1Result = await db.insert(usersTable)
      .values(testUser1)
      .returning()
      .execute();
    const user1 = user1Result[0];

    const user2Result = await db.insert(usersTable)
      .values(testUser2)
      .returning()
      .execute();
    const user2 = user2Result[0];

    // Create test project
    const testProject: CreateProjectInput = {
      name: 'Test Project',
      description: 'A test project',
      objective: 'Testing comments',
      estimated_cost: 10000,
      target_time: '6 months',
      proposer_id: user1.id,
      reviewer_ids: [user2.id]
    };

    const projectResult = await db.insert(projectsTable)
      .values({
        name: testProject.name,
        description: testProject.description,
        objective: testProject.objective,
        estimated_cost: testProject.estimated_cost.toString(),
        target_time: testProject.target_time,
        proposer_id: testProject.proposer_id
      })
      .returning()
      .execute();
    const project = projectResult[0];

    // Create test comments
    const comment1Input: CreateCommentInput = {
      project_id: project.id,
      user_id: user1.id,
      content: 'First comment'
    };

    const comment2Input: CreateCommentInput = {
      project_id: project.id,
      user_id: user2.id,
      content: 'Second comment'
    };

    const comment1Result = await db.insert(commentsTable)
      .values(comment1Input)
      .returning()
      .execute();
    const comment1 = comment1Result[0];

    const comment2Result = await db.insert(commentsTable)
      .values(comment2Input)
      .returning()
      .execute();
    const comment2 = comment2Result[0];

    // Get comments by project
    const comments = await getCommentsByProject(project.id);

    expect(comments).toHaveLength(2);
    
    // Find comments by content to verify order-independence
    const firstComment = comments.find(c => c.content === 'First comment');
    const secondComment = comments.find(c => c.content === 'Second comment');

    expect(firstComment).toBeDefined();
    expect(secondComment).toBeDefined();

    // Verify first comment
    expect(firstComment!.id).toEqual(comment1.id);
    expect(firstComment!.project_id).toEqual(project.id);
    expect(firstComment!.user_id).toEqual(user1.id);
    expect(firstComment!.content).toEqual('First comment');
    expect(firstComment!.parent_comment_id).toBeNull();
    expect(firstComment!.created_at).toBeInstanceOf(Date);
    expect(firstComment!.updated_at).toBeInstanceOf(Date);

    // Verify second comment
    expect(secondComment!.id).toEqual(comment2.id);
    expect(secondComment!.project_id).toEqual(project.id);
    expect(secondComment!.user_id).toEqual(user2.id);
    expect(secondComment!.content).toEqual('Second comment');
    expect(secondComment!.parent_comment_id).toBeNull();
    expect(secondComment!.created_at).toBeInstanceOf(Date);
    expect(secondComment!.updated_at).toBeInstanceOf(Date);
  });

  it('should return empty array when no comments exist for project', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser1)
      .returning()
      .execute();
    const user = userResult[0];

    // Create test project
    const projectResult = await db.insert(projectsTable)
      .values({
        name: 'Empty Project',
        description: 'A project with no comments',
        objective: 'Testing empty comments',
        estimated_cost: '5000',
        target_time: '3 months',
        proposer_id: user.id
      })
      .returning()
      .execute();
    const project = projectResult[0];

    const comments = await getCommentsByProject(project.id);

    expect(comments).toHaveLength(0);
    expect(comments).toEqual([]);
  });

  it('should handle threaded comments correctly', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser1)
      .returning()
      .execute();
    const user = userResult[0];

    // Create test project
    const projectResult = await db.insert(projectsTable)
      .values({
        name: 'Threaded Project',
        description: 'A project with threaded comments',
        objective: 'Testing threaded comments',
        estimated_cost: '15000',
        target_time: '8 months',
        proposer_id: user.id
      })
      .returning()
      .execute();
    const project = projectResult[0];

    // Create parent comment
    const parentCommentResult = await db.insert(commentsTable)
      .values({
        project_id: project.id,
        user_id: user.id,
        content: 'Parent comment',
        parent_comment_id: null
      })
      .returning()
      .execute();
    const parentComment = parentCommentResult[0];

    // Create reply comment
    const replyCommentResult = await db.insert(commentsTable)
      .values({
        project_id: project.id,
        user_id: user.id,
        content: 'Reply comment',
        parent_comment_id: parentComment.id
      })
      .returning()
      .execute();
    const replyComment = replyCommentResult[0];

    const comments = await getCommentsByProject(project.id);

    expect(comments).toHaveLength(2);

    // Find parent and reply comments
    const foundParent = comments.find(c => c.content === 'Parent comment');
    const foundReply = comments.find(c => c.content === 'Reply comment');

    expect(foundParent).toBeDefined();
    expect(foundReply).toBeDefined();

    // Verify parent comment
    expect(foundParent!.id).toEqual(parentComment.id);
    expect(foundParent!.parent_comment_id).toBeNull();

    // Verify reply comment
    expect(foundReply!.id).toEqual(replyComment.id);
    expect(foundReply!.parent_comment_id).toEqual(parentComment.id);
  });

  it('should return empty array for non-existent project', async () => {
    const comments = await getCommentsByProject(99999);
    expect(comments).toHaveLength(0);
    expect(comments).toEqual([]);
  });
});

describe('getComment', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should get a single comment by ID', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser1)
      .returning()
      .execute();
    const user = userResult[0];

    // Create test project
    const projectResult = await db.insert(projectsTable)
      .values({
        name: 'Single Comment Project',
        description: 'A project for single comment test',
        objective: 'Testing single comment retrieval',
        estimated_cost: '7500',
        target_time: '4 months',
        proposer_id: user.id
      })
      .returning()
      .execute();
    const project = projectResult[0];

    // Create test comment
    const commentInput: CreateCommentInput = {
      project_id: project.id,
      user_id: user.id,
      content: 'Single test comment'
    };

    const commentResult = await db.insert(commentsTable)
      .values(commentInput)
      .returning()
      .execute();
    const insertedComment = commentResult[0];

    const comment = await getComment(insertedComment.id);

    expect(comment).not.toBeNull();
    expect(comment!.id).toEqual(insertedComment.id);
    expect(comment!.project_id).toEqual(project.id);
    expect(comment!.user_id).toEqual(user.id);
    expect(comment!.content).toEqual('Single test comment');
    expect(comment!.parent_comment_id).toBeNull();
    expect(comment!.created_at).toBeInstanceOf(Date);
    expect(comment!.updated_at).toBeInstanceOf(Date);
  });

  it('should return null when comment does not exist', async () => {
    const comment = await getComment(99999);
    expect(comment).toBeNull();
  });

  it('should get comment with parent_comment_id when it is a reply', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser1)
      .returning()
      .execute();
    const user = userResult[0];

    // Create test project
    const projectResult = await db.insert(projectsTable)
      .values({
        name: 'Reply Test Project',
        description: 'A project for reply comment test',
        objective: 'Testing reply comment retrieval',
        estimated_cost: '9000',
        target_time: '5 months',
        proposer_id: user.id
      })
      .returning()
      .execute();
    const project = projectResult[0];

    // Create parent comment
    const parentCommentResult = await db.insert(commentsTable)
      .values({
        project_id: project.id,
        user_id: user.id,
        content: 'Parent comment for reply test',
        parent_comment_id: null
      })
      .returning()
      .execute();
    const parentComment = parentCommentResult[0];

    // Create reply comment
    const replyCommentResult = await db.insert(commentsTable)
      .values({
        project_id: project.id,
        user_id: user.id,
        content: 'This is a reply',
        parent_comment_id: parentComment.id
      })
      .returning()
      .execute();
    const replyComment = replyCommentResult[0];

    const comment = await getComment(replyComment.id);

    expect(comment).not.toBeNull();
    expect(comment!.id).toEqual(replyComment.id);
    expect(comment!.content).toEqual('This is a reply');
    expect(comment!.parent_comment_id).toEqual(parentComment.id);
  });

  it('should verify comment exists in database after retrieval', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser2)
      .returning()
      .execute();
    const user = userResult[0];

    // Create test project
    const projectResult = await db.insert(projectsTable)
      .values({
        name: 'DB Verification Project',
        description: 'A project for database verification test',
        objective: 'Testing database consistency',
        estimated_cost: '12000',
        target_time: '7 months',
        proposer_id: user.id
      })
      .returning()
      .execute();
    const project = projectResult[0];

    // Create test comment
    const commentResult = await db.insert(commentsTable)
      .values({
        project_id: project.id,
        user_id: user.id,
        content: 'Database verification comment',
        parent_comment_id: null
      })
      .returning()
      .execute();
    const insertedComment = commentResult[0];

    // Get comment using handler
    const comment = await getComment(insertedComment.id);

    // Verify comment exists in database
    const dbComments = await db.select()
      .from(commentsTable)
      .where(eq(commentsTable.id, insertedComment.id))
      .execute();

    expect(dbComments).toHaveLength(1);
    expect(comment).not.toBeNull();
    expect(comment!.id).toEqual(dbComments[0].id);
    expect(comment!.content).toEqual(dbComments[0].content);
    expect(comment!.project_id).toEqual(dbComments[0].project_id);
    expect(comment!.user_id).toEqual(dbComments[0].user_id);
  });
});