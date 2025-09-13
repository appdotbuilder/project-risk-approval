import { db } from '../db';
import { projectsTable, projectReviewersTable, notificationsTable, projectHistoryTable, usersTable } from '../db/schema';
import { type Project } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function submitProject(projectId: number, userId: number): Promise<Project> {
  try {
    // 1. First, validate that the project exists and is in draft status
    const projects = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .execute();

    if (projects.length === 0) {
      throw new Error('Project not found');
    }

    const project = projects[0];

    // 2. Validate that the user is the project proposer
    if (project.proposer_id !== userId) {
      throw new Error('Only the project proposer can submit the project');
    }

    // 3. Validate that the project is in draft status
    if (project.status !== 'draft') {
      throw new Error('Only draft projects can be submitted');
    }

    // 4. Update project status to 'submitted'
    const updatedProjects = await db.update(projectsTable)
      .set({ 
        status: 'submitted',
        updated_at: new Date()
      })
      .where(eq(projectsTable.id, projectId))
      .returning()
      .execute();

    const updatedProject = updatedProjects[0];

    // 5. Get all assigned reviewers for this project
    const reviewers = await db.select()
      .from(projectReviewersTable)
      .innerJoin(usersTable, eq(projectReviewersTable.reviewer_id, usersTable.id))
      .where(eq(projectReviewersTable.project_id, projectId))
      .execute();

    // 6. Create notifications for all assigned reviewers
    const notifications = reviewers.map(reviewer => ({
      user_id: reviewer.users.id,
      type: 'project_submitted' as const,
      title: 'New Project Submitted for Review',
      message: `Project "${updatedProject.name}" has been submitted and requires your review.`,
      project_id: projectId
    }));

    if (notifications.length > 0) {
      await db.insert(notificationsTable)
        .values(notifications)
        .execute();
    }

    // 7. Add project history entry for submission
    await db.insert(projectHistoryTable)
      .values({
        project_id: projectId,
        user_id: userId,
        action: 'Project Submitted',
        details: `Project "${updatedProject.name}" was submitted for review`
      })
      .execute();

    // 8. Return the updated project with numeric conversion
    return {
      ...updatedProject,
      estimated_cost: parseFloat(updatedProject.estimated_cost)
    };
  } catch (error) {
    console.error('Project submission failed:', error);
    throw error;
  }
}