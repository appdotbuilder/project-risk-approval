import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, projectsTable, commentsTable, notificationsTable, projectReviewersTable } from '../db/schema';
import { type CreateCommentInput } from '../schema';
import { createComment } from '../handlers/create_comment';
import { eq } from 'drizzle-orm';

describe('createComment', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUser: any;
  let testProposer: any;
  let testReviewer: any;
  let testProject: any;

  beforeEach(async () => {
    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'commenter@example.com',
          name: 'Test Commenter',
          role: 'project_proposer',
          is_active: true
        },
        {
          email: 'proposer@example.com',
          name: 'Test Proposer',
          role: 'project_proposer',
          is_active: true
        },
        {
          email: 'reviewer@example.com',
          name: 'Test Reviewer',
          role: 'reviewer',
          is_active: true
        }
      ])
      .returning()
      .execute();

    testUser = users[0];
    testProposer = users[1];
    testReviewer = users[2];

    // Create test project
    const projects = await db.insert(projectsTable)
      .values({
        name: 'Test Project',
        description: 'A project for testing',
        objective: 'Test objective',
        estimated_cost: '10000.00',
        target_time: '6 months',
        status: 'under_review',
        proposer_id: testProposer.id
      })
      .returning()
      .execute();

    testProject = {
      ...projects[0],
      estimated_cost: parseFloat(projects[0].estimated_cost)
    };

    // Assign reviewer to project
    await db.insert(projectReviewersTable)
      .values({
        project_id: testProject.id,
        reviewer_id: testReviewer.id
      })
      .execute();
  });

  it('should create a comment successfully', async () => {
    const input: CreateCommentInput = {
      project_id: testProject.id,
      user_id: testUser.id,
      content: 'This is a test comment',
      parent_comment_id: null
    };

    const result = await createComment(input);

    expect(result.id).toBeDefined();
    expect(result.project_id).toBe(testProject.id);
    expect(result.user_id).toBe(testUser.id);
    expect(result.content).toBe('This is a test comment');
    expect(result.parent_comment_id).toBeNull();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save comment to database', async () => {
    const input: CreateCommentInput = {
      project_id: testProject.id,
      user_id: testUser.id,
      content: 'Database test comment',
      parent_comment_id: null
    };

    const result = await createComment(input);

    const savedComment = await db.select()
      .from(commentsTable)
      .where(eq(commentsTable.id, result.id))
      .execute();

    expect(savedComment).toHaveLength(1);
    expect(savedComment[0].content).toBe('Database test comment');
    expect(savedComment[0].project_id).toBe(testProject.id);
    expect(savedComment[0].user_id).toBe(testUser.id);
  });

  it('should create notifications for proposer and reviewers', async () => {
    const input: CreateCommentInput = {
      project_id: testProject.id,
      user_id: testUser.id,
      content: 'Comment with notifications',
      parent_comment_id: null
    };

    await createComment(input);

    const notifications = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.project_id, testProject.id))
      .execute();

    // Should create notifications for proposer and reviewer (not the commenter)
    expect(notifications).toHaveLength(2);
    
    const notifiedUsers = notifications.map(n => n.user_id).sort();
    const expectedUsers = [testProposer.id, testReviewer.id].sort();
    expect(notifiedUsers).toEqual(expectedUsers);

    // Check notification details
    notifications.forEach(notification => {
      expect(notification.type).toBe('comment_added');
      expect(notification.title).toBe('New Comment Added');
      expect(notification.message).toContain('Test Commenter');
      expect(notification.message).toContain('Test Project');
      expect(notification.is_read).toBe(false);
    });
  });

  it('should not notify the comment author', async () => {
    // Proposer commenting on their own project
    const input: CreateCommentInput = {
      project_id: testProject.id,
      user_id: testProposer.id,
      content: 'Self comment',
      parent_comment_id: null
    };

    await createComment(input);

    const notifications = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.project_id, testProject.id))
      .execute();

    // Should only notify the reviewer, not the proposer (who made the comment)
    expect(notifications).toHaveLength(1);
    expect(notifications[0].user_id).toBe(testReviewer.id);
  });

  it('should support threaded comments with parent_comment_id', async () => {
    // Create parent comment
    const parentInput: CreateCommentInput = {
      project_id: testProject.id,
      user_id: testUser.id,
      content: 'Parent comment',
      parent_comment_id: null
    };

    const parentComment = await createComment(parentInput);

    // Create reply comment
    const replyInput: CreateCommentInput = {
      project_id: testProject.id,
      user_id: testReviewer.id,
      content: 'Reply to parent comment',
      parent_comment_id: parentComment.id
    };

    const replyComment = await createComment(replyInput);

    expect(replyComment.parent_comment_id).toBe(parentComment.id);
    expect(replyComment.project_id).toBe(testProject.id);
  });

  it('should throw error when project does not exist', async () => {
    const input: CreateCommentInput = {
      project_id: 99999,
      user_id: testUser.id,
      content: 'Comment on non-existent project',
      parent_comment_id: null
    };

    await expect(createComment(input)).rejects.toThrow(/Project with ID 99999 not found/);
  });

  it('should throw error when user does not exist', async () => {
    const input: CreateCommentInput = {
      project_id: testProject.id,
      user_id: 99999,
      content: 'Comment from non-existent user',
      parent_comment_id: null
    };

    await expect(createComment(input)).rejects.toThrow(/User with ID 99999 not found/);
  });

  it('should throw error when user is not active', async () => {
    // Create inactive user
    const inactiveUsers = await db.insert(usersTable)
      .values({
        email: 'inactive@example.com',
        name: 'Inactive User',
        role: 'reviewer',
        is_active: false
      })
      .returning()
      .execute();

    const inactiveUser = inactiveUsers[0];

    const input: CreateCommentInput = {
      project_id: testProject.id,
      user_id: inactiveUser.id,
      content: 'Comment from inactive user',
      parent_comment_id: null
    };

    await expect(createComment(input)).rejects.toThrow(/User with ID \d+ is not active/);
  });

  it('should throw error when parent comment does not exist', async () => {
    const input: CreateCommentInput = {
      project_id: testProject.id,
      user_id: testUser.id,
      content: 'Reply to non-existent comment',
      parent_comment_id: 99999
    };

    await expect(createComment(input)).rejects.toThrow(/Parent comment with ID 99999 not found/);
  });

  it('should throw error when parent comment belongs to different project', async () => {
    // Create another project
    const anotherProjects = await db.insert(projectsTable)
      .values({
        name: 'Another Project',
        description: 'Another project for testing',
        objective: 'Another objective',
        estimated_cost: '5000.00',
        target_time: '3 months',
        status: 'draft',
        proposer_id: testProposer.id
      })
      .returning()
      .execute();

    const anotherProject = {
      ...anotherProjects[0],
      estimated_cost: parseFloat(anotherProjects[0].estimated_cost)
    };

    // Create comment on another project
    const anotherComments = await db.insert(commentsTable)
      .values({
        project_id: anotherProject.id,
        user_id: testUser.id,
        content: 'Comment on another project'
      })
      .returning()
      .execute();

    const anotherComment = anotherComments[0];

    // Try to create reply on different project
    const input: CreateCommentInput = {
      project_id: testProject.id,
      user_id: testUser.id,
      content: 'Cross-project reply',
      parent_comment_id: anotherComment.id
    };

    await expect(createComment(input)).rejects.toThrow(/Parent comment must belong to the same project/);
  });

  it('should handle optional parent_comment_id correctly', async () => {
    // Test with undefined parent_comment_id
    const input: CreateCommentInput = {
      project_id: testProject.id,
      user_id: testUser.id,
      content: 'Comment with undefined parent',
      parent_comment_id: undefined
    };

    const result = await createComment(input);

    expect(result.parent_comment_id).toBeNull();

    const savedComment = await db.select()
      .from(commentsTable)
      .where(eq(commentsTable.id, result.id))
      .execute();

    expect(savedComment[0].parent_comment_id).toBeNull();
  });
});