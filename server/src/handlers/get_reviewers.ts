import { db } from '../db';
import { usersTable, projectReviewersTable } from '../db/schema';
import { type User } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function getAvailableReviewers(): Promise<User[]> {
  try {
    const results = await db.select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.role, 'reviewer'),
          eq(usersTable.is_active, true)
        )
      )
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch available reviewers:', error);
    throw error;
  }
}

export async function getProjectReviewers(projectId: number): Promise<User[]> {
  try {
    const results = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      is_active: usersTable.is_active,
      created_at: usersTable.created_at,
      updated_at: usersTable.updated_at
    })
      .from(projectReviewersTable)
      .innerJoin(usersTable, eq(projectReviewersTable.reviewer_id, usersTable.id))
      .where(eq(projectReviewersTable.project_id, projectId))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch project reviewers:', error);
    throw error;
  }
}