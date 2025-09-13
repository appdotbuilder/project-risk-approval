import { db } from '../db';
import { projectHistoryTable, usersTable } from '../db/schema';
import { type ProjectHistory } from '../schema';
import { eq, desc } from 'drizzle-orm';

export async function getProjectHistory(projectId: number): Promise<ProjectHistory[]> {
  try {
    // Get project history with user information, ordered by most recent first
    const results = await db.select({
      id: projectHistoryTable.id,
      project_id: projectHistoryTable.project_id,
      user_id: projectHistoryTable.user_id,
      action: projectHistoryTable.action,
      details: projectHistoryTable.details,
      created_at: projectHistoryTable.created_at,
      user_name: usersTable.name,
      user_email: usersTable.email
    })
    .from(projectHistoryTable)
    .innerJoin(usersTable, eq(projectHistoryTable.user_id, usersTable.id))
    .where(eq(projectHistoryTable.project_id, projectId))
    .orderBy(desc(projectHistoryTable.created_at))
    .execute();

    // Transform results to match ProjectHistory schema
    return results.map(result => ({
      id: result.id,
      project_id: result.project_id,
      user_id: result.user_id,
      action: result.action,
      details: result.details,
      created_at: result.created_at
    }));
  } catch (error) {
    console.error('Failed to fetch project history:', error);
    throw error;
  }
}

export async function createProjectHistory(
  projectId: number,
  userId: number,
  action: string,
  details?: string
): Promise<ProjectHistory> {
  try {
    // Insert new project history entry
    const result = await db.insert(projectHistoryTable)
      .values({
        project_id: projectId,
        user_id: userId,
        action: action,
        details: details || null
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Failed to create project history entry:', error);
    throw error;
  }
}