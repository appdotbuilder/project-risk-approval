import { type Comment } from '../schema';

export async function getCommentsByProject(projectId: number): Promise<Comment[]> {
  // This is a placeholder declaration! Real code should be implemented here.
  // The goal of this handler is fetching all comments for a specific project.
  // Should include user information and support threaded comments hierarchy.
  return Promise.resolve([]);
}

export async function getComment(id: number): Promise<Comment | null> {
  // This is a placeholder declaration! Real code should be implemented here.
  // The goal of this handler is fetching a single comment by ID with user info.
  // Should include replies if it's a parent comment.
  return Promise.resolve(null);
}