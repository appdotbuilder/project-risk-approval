import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  projectsTable, 
  reviewsTable, 
  notificationsTable,
  projectHistoryTable 
} from '../db/schema';
import { type SubmitReviewInput } from '../schema';
import { submitReview } from '../handlers/submit_review';
import { eq, and } from 'drizzle-orm';

describe('submitReview', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let proposerUser: any;
  let reviewerUser1: any;
  let reviewerUser2: any;
  let directorUser: any;
  let testProject: any;
  let testReview: any;

  beforeEach(async () => {
    // Create test users
    const proposerResults = await db.insert(usersTable)
      .values({
        email: 'proposer@test.com',
        name: 'Test Proposer',
        role: 'project_proposer',
        is_active: true
      })
      .returning()
      .execute();
    proposerUser = proposerResults[0];

    const reviewer1Results = await db.insert(usersTable)
      .values({
        email: 'reviewer1@test.com',
        name: 'Test Reviewer 1',
        role: 'reviewer',
        is_active: true
      })
      .returning()
      .execute();
    reviewerUser1 = reviewer1Results[0];

    const reviewer2Results = await db.insert(usersTable)
      .values({
        email: 'reviewer2@test.com',
        name: 'Test Reviewer 2',
        role: 'reviewer',
        is_active: true
      })
      .returning()
      .execute();
    reviewerUser2 = reviewer2Results[0];

    const directorResults = await db.insert(usersTable)
      .values({
        email: 'director@test.com',
        name: 'Test Director',
        role: 'director',
        is_active: true
      })
      .returning()
      .execute();
    directorUser = directorResults[0];

    // Create test project
    const projectResults = await db.insert(projectsTable)
      .values({
        name: 'Test Project',
        description: 'A test project',
        objective: 'Testing submit review',
        estimated_cost: '10000.00',
        target_time: '6 months',
        status: 'under_review',
        proposer_id: proposerUser.id
      })
      .returning()
      .execute();
    testProject = projectResults[0];

    // Create test review
    const reviewResults = await db.insert(reviewsTable)
      .values({
        project_id: testProject.id,
        reviewer_id: reviewerUser1.id,
        decision: null,
        justification: null,
        risk_identification: null,
        risk_assessment: null,
        risk_mitigation: null,
        comments: null,
        submitted_at: null
      })
      .returning()
      .execute();
    testReview = reviewResults[0];
  });

  const testInput: SubmitReviewInput = {
    id: 1, // Will be updated in tests
    decision: 'approve',
    justification: 'This project has strong merit and clear objectives',
    risk_identification: 'Minimal technical risks identified',
    risk_assessment: 'low',
    risk_mitigation: 'Regular milestone reviews will address any emerging issues',
    comments: 'Excellent proposal with detailed planning'
  };

  it('should submit a review successfully', async () => {
    const input = { ...testInput, id: testReview.id };
    const result = await submitReview(input);

    // Verify review fields are updated
    expect(result.id).toEqual(testReview.id);
    expect(result.decision).toEqual('approve');
    expect(result.justification).toEqual('This project has strong merit and clear objectives');
    expect(result.risk_identification).toEqual('Minimal technical risks identified');
    expect(result.risk_assessment).toEqual('low');
    expect(result.risk_mitigation).toEqual('Regular milestone reviews will address any emerging issues');
    expect(result.comments).toEqual('Excellent proposal with detailed planning');
    expect(result.submitted_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save updated review to database', async () => {
    const input = { ...testInput, id: testReview.id };
    await submitReview(input);

    const reviews = await db.select()
      .from(reviewsTable)
      .where(eq(reviewsTable.id, testReview.id))
      .execute();

    expect(reviews).toHaveLength(1);
    const savedReview = reviews[0];
    expect(savedReview.decision).toEqual('approve');
    expect(savedReview.justification).toEqual('This project has strong merit and clear objectives');
    expect(savedReview.submitted_at).toBeInstanceOf(Date);
  });

  it('should create notification for project proposer', async () => {
    const input = { ...testInput, id: testReview.id };
    await submitReview(input);

    const notifications = await db.select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.user_id, proposerUser.id),
          eq(notificationsTable.type, 'review_completed')
        )
      )
      .execute();

    expect(notifications).toHaveLength(1);
    const notification = notifications[0];
    expect(notification.title).toEqual('Review Completed');
    expect(notification.message).toContain('Test Reviewer 1');
    expect(notification.message).toContain('approve');
    expect(notification.project_id).toEqual(testProject.id);
    expect(notification.is_read).toEqual(false);
  });

  it('should create project history entry', async () => {
    const input = { ...testInput, id: testReview.id };
    await submitReview(input);

    const historyEntries = await db.select()
      .from(projectHistoryTable)
      .where(eq(projectHistoryTable.project_id, testProject.id))
      .execute();

    expect(historyEntries.length).toBeGreaterThan(0);
    const reviewEntry = historyEntries.find(entry => 
      entry.action.includes('Review submitted')
    );
    expect(reviewEntry).toBeDefined();
    expect(reviewEntry!.action).toContain('approve');
    expect(reviewEntry!.details).toContain('This project has strong merit and clear objectives');
  });

  it('should handle review with rejection decision', async () => {
    const input = { 
      ...testInput, 
      id: testReview.id,
      decision: 'reject' as const,
      justification: 'Project lacks sufficient detail'
    };
    
    const result = await submitReview(input);

    expect(result.decision).toEqual('reject');
    expect(result.justification).toEqual('Project lacks sufficient detail');

    // Check notification message reflects rejection
    const notifications = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.user_id, proposerUser.id))
      .execute();

    const reviewNotification = notifications.find(n => n.type === 'review_completed');
    expect(reviewNotification!.message).toContain('reject');
  });

  it('should handle review with return decision', async () => {
    const input = { 
      ...testInput, 
      id: testReview.id,
      decision: 'return' as const,
      justification: 'Please provide more budget details'
    };
    
    const result = await submitReview(input);

    expect(result.decision).toEqual('return');
    expect(result.justification).toEqual('Please provide more budget details');
  });

  it('should update project status when all reviews are approved', async () => {
    // Create second review for the same project
    const review2Results = await db.insert(reviewsTable)
      .values({
        project_id: testProject.id,
        reviewer_id: reviewerUser2.id,
        decision: 'approve',
        justification: 'Already approved',
        risk_identification: 'Low risk',
        risk_assessment: 'low',
        risk_mitigation: 'Standard controls',
        comments: null,
        submitted_at: new Date()
      })
      .returning()
      .execute();

    // Submit the first review (this should trigger project approval)
    const input = { ...testInput, id: testReview.id };
    await submitReview(input);

    // Check project status is updated to approved
    const projects = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, testProject.id))
      .execute();

    expect(projects[0].status).toEqual('approved');

    // Check final status notification
    const finalNotifications = await db.select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.user_id, proposerUser.id),
          eq(notificationsTable.type, 'project_approved')
        )
      )
      .execute();

    expect(finalNotifications).toHaveLength(1);
    expect(finalNotifications[0].message).toContain('approved by all reviewers');

    // Check director notification
    const directorNotifications = await db.select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.user_id, directorUser.id),
          eq(notificationsTable.type, 'project_approved')
        )
      )
      .execute();

    expect(directorNotifications).toHaveLength(1);
    expect(directorNotifications[0].message).toContain('ready for implementation');
  });

  it('should update project status to rejected when any review is rejected', async () => {
    // Create second review with approval
    await db.insert(reviewsTable)
      .values({
        project_id: testProject.id,
        reviewer_id: reviewerUser2.id,
        decision: 'approve',
        justification: 'Good project',
        risk_identification: 'Low risk',
        risk_assessment: 'low',
        risk_mitigation: 'Standard controls',
        comments: null,
        submitted_at: new Date()
      })
      .execute();

    // Submit first review with rejection
    const input = { 
      ...testInput, 
      id: testReview.id,
      decision: 'reject' as const,
      justification: 'Insufficient budget planning'
    };
    await submitReview(input);

    // Check project status is updated to rejected
    const projects = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, testProject.id))
      .execute();

    expect(projects[0].status).toEqual('rejected');

    // Check rejection notification
    const rejectionNotifications = await db.select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.user_id, proposerUser.id),
          eq(notificationsTable.type, 'project_rejected')
        )
      )
      .execute();

    expect(rejectionNotifications).toHaveLength(1);
  });

  it('should update project status to returned when any review requests return', async () => {
    // Create second review with approval
    await db.insert(reviewsTable)
      .values({
        project_id: testProject.id,
        reviewer_id: reviewerUser2.id,
        decision: 'approve',
        justification: 'Good project',
        risk_identification: 'Low risk',
        risk_assessment: 'low',
        risk_mitigation: 'Standard controls',
        comments: null,
        submitted_at: new Date()
      })
      .execute();

    // Submit first review requesting return
    const input = { 
      ...testInput, 
      id: testReview.id,
      decision: 'return' as const,
      justification: 'Need more technical details'
    };
    await submitReview(input);

    // Check project status is updated to returned
    const projects = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, testProject.id))
      .execute();

    expect(projects[0].status).toEqual('returned');

    // Check return notification
    const returnNotifications = await db.select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.user_id, proposerUser.id),
          eq(notificationsTable.type, 'project_returned')
        )
      )
      .execute();

    expect(returnNotifications).toHaveLength(1);
  });

  it('should handle review without comments', async () => {
    const input: SubmitReviewInput = { 
      id: testReview.id,
      decision: 'approve',
      justification: 'This project has strong merit and clear objectives',
      risk_identification: 'Minimal technical risks identified',
      risk_assessment: 'low',
      risk_mitigation: 'Regular milestone reviews will address any emerging issues'
      // No comments field
    };
    
    const result = await submitReview(input);

    expect(result.comments).toBeNull();

    // Verify it's saved correctly in database
    const reviews = await db.select()
      .from(reviewsTable)
      .where(eq(reviewsTable.id, testReview.id))
      .execute();

    expect(reviews[0].comments).toBeNull();
  });

  it('should throw error when review does not exist', async () => {
    const input = { ...testInput, id: 99999 };

    expect(submitReview(input)).rejects.toThrow(/Review with id 99999 not found/);
  });

  it('should handle system administrator notifications on approval', async () => {
    // Create system administrator
    const sysAdminResults = await db.insert(usersTable)
      .values({
        email: 'admin@test.com',
        name: 'System Admin',
        role: 'system_administrator',
        is_active: true
      })
      .returning()
      .execute();
    const sysAdminUser = sysAdminResults[0];

    // Create second review with approval
    await db.insert(reviewsTable)
      .values({
        project_id: testProject.id,
        reviewer_id: reviewerUser2.id,
        decision: 'approve',
        justification: 'Good project',
        risk_identification: 'Low risk',
        risk_assessment: 'low',
        risk_mitigation: 'Standard controls',
        comments: null,
        submitted_at: new Date()
      })
      .execute();

    // Submit first review with approval
    const input = { ...testInput, id: testReview.id };
    await submitReview(input);

    // Check both director and system admin got notifications
    const adminNotifications = await db.select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.type, 'project_approved'),
          eq(notificationsTable.project_id, testProject.id)
        )
      )
      .execute();

    // Should have notifications for proposer, director, and system admin
    expect(adminNotifications.length).toBeGreaterThanOrEqual(2);
    
    const directorNotification = adminNotifications.find(n => n.user_id === directorUser.id);
    const sysAdminNotification = adminNotifications.find(n => n.user_id === sysAdminUser.id);
    
    expect(directorNotification).toBeDefined();
    expect(sysAdminNotification).toBeDefined();
  });
});