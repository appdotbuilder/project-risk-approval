import { db } from '../db';
import { commentsTable, usersTable } from '../db/schema';
import { type Comment } from '../schema';
import { eq } from 'drizzle-orm';

export async function getCommentsByProject(projectId: number): Promise<Comment[]> {
  try {
    // Get all comments for the project with user information
    const results = await db.select({
      id: commentsTable.id,
      project_id: commentsTable.project_id,
      user_id: commentsTable.user_id,
      content: commentsTable.content,
      parent_comment_id: commentsTable.parent_comment_id,
      created_at: commentsTable.created_at,
      updated_at: commentsTable.updated_at
    })
      .from(commentsTable)
      .innerJoin(usersTable, eq(commentsTable.user_id, usersTable.id))
      .where(eq(commentsTable.project_id, projectId))
      .execute();

    // Return comments with proper type conversion
    return results.map(result => ({
      id: result.id,
      project_id: result.project_id,
      user_id: result.user_id,
      content: result.content,
      parent_comment_id: result.parent_comment_id,
      created_at: result.created_at,
      updated_at: result.updated_at
    }));
  } catch (error) {
    console.error('Failed to get comments by project:', error);
    throw error;
  }
}

export async function getComment(id: number): Promise<Comment | null> {
  try {
    // Get single comment with user information
    const results = await db.select({
      id: commentsTable.id,
      project_id: commentsTable.project_id,
      user_id: commentsTable.user_id,
      content: commentsTable.content,
      parent_comment_id: commentsTable.parent_comment_id,
      created_at: commentsTable.created_at,
      updated_at: commentsTable.updated_at
    })
      .from(commentsTable)
      .innerJoin(usersTable, eq(commentsTable.user_id, usersTable.id))
      .where(eq(commentsTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const result = results[0];
    return {
      id: result.id,
      project_id: result.project_id,
      user_id: result.user_id,
      content: result.content,
      parent_comment_id: result.parent_comment_id,
      created_at: result.created_at,
      updated_at: result.updated_at
    };
  } catch (error) {
    console.error('Failed to get comment:', error);
    throw error;
  }
}