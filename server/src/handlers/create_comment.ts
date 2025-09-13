import { db } from '../db';
import { commentsTable, projectsTable, usersTable, notificationsTable, projectReviewersTable } from '../db/schema';
import { type CreateCommentInput, type Comment } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function createComment(input: CreateCommentInput): Promise<Comment> {
  try {
    // 1. Validate that the project exists
    const projectExists = await db.select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, input.project_id))
      .execute();

    if (projectExists.length === 0) {
      throw new Error(`Project with ID ${input.project_id} not found`);
    }

    // 2. Validate that the user exists and is active
    const userExists = await db.select({ id: usersTable.id, is_active: usersTable.is_active })
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (userExists.length === 0) {
      throw new Error(`User with ID ${input.user_id} not found`);
    }

    if (!userExists[0].is_active) {
      throw new Error(`User with ID ${input.user_id} is not active`);
    }

    // 3. If parent_comment_id is provided, validate it exists and belongs to the same project
    if (input.parent_comment_id) {
      const parentComment = await db.select({ project_id: commentsTable.project_id })
        .from(commentsTable)
        .where(eq(commentsTable.id, input.parent_comment_id))
        .execute();

      if (parentComment.length === 0) {
        throw new Error(`Parent comment with ID ${input.parent_comment_id} not found`);
      }

      if (parentComment[0].project_id !== input.project_id) {
        throw new Error('Parent comment must belong to the same project');
      }
    }

    // 4. Create the comment
    const result = await db.insert(commentsTable)
      .values({
        project_id: input.project_id,
        user_id: input.user_id,
        content: input.content,
        parent_comment_id: input.parent_comment_id || null
      })
      .returning()
      .execute();

    const comment = result[0];

    // 5. Create notifications for relevant parties
    // Get project proposer and reviewers
    const projectDetails = await db.select({
      proposer_id: projectsTable.proposer_id,
      project_name: projectsTable.name
    })
      .from(projectsTable)
      .where(eq(projectsTable.id, input.project_id))
      .execute();

    const reviewers = await db.select({ reviewer_id: projectReviewersTable.reviewer_id })
      .from(projectReviewersTable)
      .where(eq(projectReviewersTable.project_id, input.project_id))
      .execute();

    // Get commenter's name for notification
    const commenterName = await db.select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    const projectName = projectDetails[0].project_name;
    const commenter = commenterName[0].name;

    // Collect unique user IDs to notify (excluding the comment author)
    const usersToNotify = new Set<number>();
    
    // Add project proposer if not the comment author
    if (projectDetails[0].proposer_id !== input.user_id) {
      usersToNotify.add(projectDetails[0].proposer_id);
    }

    // Add reviewers if not the comment author
    reviewers.forEach(reviewer => {
      if (reviewer.reviewer_id !== input.user_id) {
        usersToNotify.add(reviewer.reviewer_id);
      }
    });

    // Create notifications
    if (usersToNotify.size > 0) {
      const notificationValues = Array.from(usersToNotify).map(userId => ({
        user_id: userId,
        type: 'comment_added' as const,
        title: 'New Comment Added',
        message: `${commenter} added a comment to project "${projectName}"`,
        project_id: input.project_id
      }));

      await db.insert(notificationsTable)
        .values(notificationValues)
        .execute();
    }

    return comment;
  } catch (error) {
    console.error('Comment creation failed:', error);
    throw error;
  }
}