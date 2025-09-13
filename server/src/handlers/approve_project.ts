import { db } from '../db';
import { 
  projectsTable, 
  usersTable, 
  reviewsTable,
  projectReviewersTable,
  notificationsTable,
  projectHistoryTable
} from '../db/schema';
import { type Project } from '../schema';
import { eq, and, SQL } from 'drizzle-orm';

export async function approveProject(projectId: number, userId: number): Promise<Project> {
  try {
    // 1. Validate user has director or system_administrator role
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    if (!['director', 'system_administrator'].includes(user[0].role)) {
      throw new Error('Insufficient permissions: only directors and system administrators can approve projects');
    }

    // 2. Validate project exists and get its data
    const project = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .execute();

    if (project.length === 0) {
      throw new Error('Project not found');
    }

    const currentProject = project[0];

    // Check if project is in a valid state for approval
    if (currentProject.status !== 'under_review') {
      throw new Error(`Project cannot be approved from status: ${currentProject.status}`);
    }

    // 3. Validate all reviews are approved
    const reviews = await db.select()
      .from(reviewsTable)
      .where(eq(reviewsTable.project_id, projectId))
      .execute();

    if (reviews.length === 0) {
      throw new Error('No reviews found for this project');
    }

    const unsubmittedReviews = reviews.filter(review => !review.submitted_at);
    if (unsubmittedReviews.length > 0) {
      throw new Error('Cannot approve project: some reviews are not yet submitted');
    }

    const rejectedReviews = reviews.filter(review => review.decision === 'reject');
    if (rejectedReviews.length > 0) {
      throw new Error('Cannot approve project: some reviews have rejected the project');
    }

    const returnedReviews = reviews.filter(review => review.decision === 'return');
    if (returnedReviews.length > 0) {
      throw new Error('Cannot approve project: some reviews have returned the project');
    }

    // 4. Update project status to 'approved'
    const updatedProject = await db.update(projectsTable)
      .set({
        status: 'approved',
        updated_at: new Date()
      })
      .where(eq(projectsTable.id, projectId))
      .returning()
      .execute();

    // 5. Create notifications for proposer and all reviewers
    const reviewerIds = await db.select({ reviewer_id: projectReviewersTable.reviewer_id })
      .from(projectReviewersTable)
      .where(eq(projectReviewersTable.project_id, projectId))
      .execute();

    // Notification for proposer
    await db.insert(notificationsTable)
      .values({
        user_id: currentProject.proposer_id,
        type: 'project_approved',
        title: 'Project Approved',
        message: `Your project "${currentProject.name}" has been approved.`,
        project_id: projectId,
        is_read: false
      })
      .execute();

    // Notifications for reviewers
    for (const reviewer of reviewerIds) {
      await db.insert(notificationsTable)
        .values({
          user_id: reviewer.reviewer_id,
          type: 'project_approved',
          title: 'Project Approved',
          message: `The project "${currentProject.name}" you reviewed has been approved.`,
          project_id: projectId,
          is_read: false
        })
        .execute();
    }

    // 6. Add project history entry
    await db.insert(projectHistoryTable)
      .values({
        project_id: projectId,
        user_id: userId,
        action: 'Project Approved',
        details: `Project approved by ${user[0].role}: ${user[0].name}`
      })
      .execute();

    // Convert numeric fields and return the updated project
    const result = updatedProject[0];
    return {
      ...result,
      estimated_cost: parseFloat(result.estimated_cost)
    };
  } catch (error) {
    console.error('Project approval failed:', error);
    throw error;
  }
}

export async function rejectProject(projectId: number, userId: number, reason: string): Promise<Project> {
  try {
    // 1. Validate user has director or system_administrator role
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    if (!['director', 'system_administrator'].includes(user[0].role)) {
      throw new Error('Insufficient permissions: only directors and system administrators can reject projects');
    }

    // 2. Validate project exists and get its data
    const project = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .execute();

    if (project.length === 0) {
      throw new Error('Project not found');
    }

    const currentProject = project[0];

    // Check if project is in a valid state for rejection
    if (currentProject.status !== 'under_review') {
      throw new Error(`Project cannot be rejected from status: ${currentProject.status}`);
    }

    // 3. Update project status to 'rejected'
    const updatedProject = await db.update(projectsTable)
      .set({
        status: 'rejected',
        updated_at: new Date()
      })
      .where(eq(projectsTable.id, projectId))
      .returning()
      .execute();

    // 4. Create notifications for proposer and all reviewers
    const reviewerIds = await db.select({ reviewer_id: projectReviewersTable.reviewer_id })
      .from(projectReviewersTable)
      .where(eq(projectReviewersTable.project_id, projectId))
      .execute();

    // Notification for proposer
    await db.insert(notificationsTable)
      .values({
        user_id: currentProject.proposer_id,
        type: 'project_rejected',
        title: 'Project Rejected',
        message: `Your project "${currentProject.name}" has been rejected. Reason: ${reason}`,
        project_id: projectId,
        is_read: false
      })
      .execute();

    // Notifications for reviewers
    for (const reviewer of reviewerIds) {
      await db.insert(notificationsTable)
        .values({
          user_id: reviewer.reviewer_id,
          type: 'project_rejected',
          title: 'Project Rejected',
          message: `The project "${currentProject.name}" you reviewed has been rejected. Reason: ${reason}`,
          project_id: projectId,
          is_read: false
        })
        .execute();
    }

    // 5. Add project history entry with rejection reason
    await db.insert(projectHistoryTable)
      .values({
        project_id: projectId,
        user_id: userId,
        action: 'Project Rejected',
        details: `Project rejected by ${user[0].role}: ${user[0].name}. Reason: ${reason}`
      })
      .execute();

    // Convert numeric fields and return the updated project
    const result = updatedProject[0];
    return {
      ...result,
      estimated_cost: parseFloat(result.estimated_cost)
    };
  } catch (error) {
    console.error('Project rejection failed:', error);
    throw error;
  }
}