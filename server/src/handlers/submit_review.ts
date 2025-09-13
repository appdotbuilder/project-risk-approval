import { db } from '../db';
import { 
  reviewsTable, 
  projectsTable, 
  usersTable, 
  notificationsTable,
  projectHistoryTable 
} from '../db/schema';
import { type SubmitReviewInput, type Review } from '../schema';
import { eq, and, count, isNull } from 'drizzle-orm';

export async function submitReview(input: SubmitReviewInput): Promise<Review> {
  try {
    // First, get the current review and verify it exists
    const existingReviews = await db.select()
      .from(reviewsTable)
      .where(eq(reviewsTable.id, input.id))
      .execute();

    if (existingReviews.length === 0) {
      throw new Error(`Review with id ${input.id} not found`);
    }

    const existingReview = existingReviews[0];

    // Update the review with submission data
    const updatedReviews = await db.update(reviewsTable)
      .set({
        decision: input.decision,
        justification: input.justification,
        risk_identification: input.risk_identification,
        risk_assessment: input.risk_assessment,
        risk_mitigation: input.risk_mitigation,
        comments: input.comments ?? null,
        submitted_at: new Date(),
        updated_at: new Date()
      })
      .where(eq(reviewsTable.id, input.id))
      .returning()
      .execute();

    const updatedReview = updatedReviews[0];

    // Get project information
    const projects = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, existingReview.project_id))
      .execute();

    if (projects.length === 0) {
      throw new Error(`Project with id ${existingReview.project_id} not found`);
    }

    const project = projects[0];

    // Create notification for project proposer
    const reviewerQuery = await db.select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, existingReview.reviewer_id))
      .execute();
    
    const reviewerName = reviewerQuery[0]?.name || 'Unknown Reviewer';

    await db.insert(notificationsTable)
      .values({
        user_id: project.proposer_id,
        type: 'review_completed',
        title: 'Review Completed',
        message: `${reviewerName} has completed their review of your project "${project.name}" with decision: ${input.decision}`,
        project_id: project.id,
        is_read: false
      })
      .execute();

    // Add project history entry
    await db.insert(projectHistoryTable)
      .values({
        project_id: project.id,
        user_id: existingReview.reviewer_id,
        action: `Review submitted with decision: ${input.decision}`,
        details: `Justification: ${input.justification}` as string | null
      })
      .execute();

    // Check if all reviews are complete
    const totalReviewsResult = await db.select({ count: count() })
      .from(reviewsTable)
      .where(eq(reviewsTable.project_id, project.id))
      .execute();

    const totalReviews = totalReviewsResult[0].count;

    const completedReviewsResult = await db.select({ count: count() })
      .from(reviewsTable)
      .where(
        and(
          eq(reviewsTable.project_id, project.id),
          eq(reviewsTable.decision, 'approve')
        )
      )
      .execute();

    const approvedReviews = completedReviewsResult[0].count;

    const rejectedReviewsResult = await db.select({ count: count() })
      .from(reviewsTable)
      .where(
        and(
          eq(reviewsTable.project_id, project.id),
          eq(reviewsTable.decision, 'reject')
        )
      )
      .execute();

    const rejectedReviews = rejectedReviewsResult[0].count;

    const returnedReviewsResult = await db.select({ count: count() })
      .from(reviewsTable)
      .where(
        and(
          eq(reviewsTable.project_id, project.id),
          eq(reviewsTable.decision, 'return')
        )
      )
      .execute();

    const returnedReviews = returnedReviewsResult[0].count;

    const submittedReviewsResult = await db.select({ count: count() })
      .from(reviewsTable)
      .where(
        and(
          eq(reviewsTable.project_id, project.id),
          isNull(reviewsTable.submitted_at)
        )
      )
      .execute();

    const pendingReviews = submittedReviewsResult[0].count;

    // Update project status if all reviews are complete
    if (pendingReviews === 0) {
      let newStatus: 'approved' | 'rejected' | 'returned' = 'approved';
      let notificationMessage = '';

      if (rejectedReviews > 0) {
        newStatus = 'rejected';
        notificationMessage = `Your project "${project.name}" has been rejected by reviewers`;
      } else if (returnedReviews > 0) {
        newStatus = 'returned';
        notificationMessage = `Your project "${project.name}" has been returned by reviewers for revisions`;
      } else if (approvedReviews === totalReviews) {
        newStatus = 'approved';
        notificationMessage = `Your project "${project.name}" has been approved by all reviewers`;
      }

      // Update project status
      await db.update(projectsTable)
        .set({
          status: newStatus,
          updated_at: new Date()
        })
        .where(eq(projectsTable.id, project.id))
        .execute();

      // Notify project proposer of final status
      await db.insert(notificationsTable)
        .values({
          user_id: project.proposer_id,
          type: newStatus === 'approved' ? 'project_approved' : 
                newStatus === 'rejected' ? 'project_rejected' : 'project_returned',
          title: `Project ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`,
          message: notificationMessage,
          project_id: project.id,
          is_read: false
        })
        .execute();

      // If all approved, notify director/system_administrator users
      if (newStatus === 'approved') {
        const admins = await db.select()
          .from(usersTable)
          .where(
            and(
              eq(usersTable.role, 'director'),
              eq(usersTable.is_active, true)
            )
          )
          .execute();

        const systemAdmins = await db.select()
          .from(usersTable)
          .where(
            and(
              eq(usersTable.role, 'system_administrator'),
              eq(usersTable.is_active, true)
            )
          )
          .execute();

        const allAdmins = [...admins, ...systemAdmins];

        for (const admin of allAdmins) {
          await db.insert(notificationsTable)
            .values({
              user_id: admin.id,
              type: 'project_approved',
              title: 'Project Approved',
              message: `Project "${project.name}" has been approved by all reviewers and is ready for implementation`,
              project_id: project.id,
              is_read: false
            })
            .execute();
        }
      }

      // Add project history entry for status change
      await db.insert(projectHistoryTable)
        .values({
          project_id: project.id,
          user_id: existingReview.reviewer_id, // The reviewer who completed the final review
          action: `Project status changed to ${newStatus}`,
          details: `All reviews completed. Final status: ${newStatus}` as string | null
        })
        .execute();
    }

    return updatedReview;
  } catch (error) {
    console.error('Review submission failed:', error);
    throw error;
  }
}