import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  projectsTable, 
  reviewsTable,
  projectReviewersTable,
  notificationsTable,
  projectHistoryTable
} from '../db/schema';
import { approveProject, rejectProject } from '../handlers/approve_project';
import { eq } from 'drizzle-orm';

describe('approveProject and rejectProject', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data setup helper
  const setupTestData = async () => {
    // Create test users
    const director = await db.insert(usersTable)
      .values({
        email: 'director@test.com',
        name: 'Test Director',
        role: 'director',
        is_active: true
      })
      .returning()
      .execute();

    const proposer = await db.insert(usersTable)
      .values({
        email: 'proposer@test.com',
        name: 'Test Proposer',
        role: 'project_proposer',
        is_active: true
      })
      .returning()
      .execute();

    const reviewer1 = await db.insert(usersTable)
      .values({
        email: 'reviewer1@test.com',
        name: 'Test Reviewer 1',
        role: 'reviewer',
        is_active: true
      })
      .returning()
      .execute();

    const reviewer2 = await db.insert(usersTable)
      .values({
        email: 'reviewer2@test.com',
        name: 'Test Reviewer 2',
        role: 'reviewer',
        is_active: true
      })
      .returning()
      .execute();

    // Create test project
    const project = await db.insert(projectsTable)
      .values({
        name: 'Test Project',
        description: 'A test project for approval',
        objective: 'Test objective',
        estimated_cost: '50000.00',
        target_time: '6 months',
        status: 'under_review',
        proposer_id: proposer[0].id
      })
      .returning()
      .execute();

    // Assign reviewers to project
    await db.insert(projectReviewersTable)
      .values([
        {
          project_id: project[0].id,
          reviewer_id: reviewer1[0].id
        },
        {
          project_id: project[0].id,
          reviewer_id: reviewer2[0].id
        }
      ])
      .execute();

    // Create approved reviews
    await db.insert(reviewsTable)
      .values([
        {
          project_id: project[0].id,
          reviewer_id: reviewer1[0].id,
          decision: 'approve',
          justification: 'Good project',
          risk_identification: 'Low risk identified',
          risk_assessment: 'low',
          risk_mitigation: 'Standard mitigation',
          comments: 'Looks good',
          submitted_at: new Date()
        },
        {
          project_id: project[0].id,
          reviewer_id: reviewer2[0].id,
          decision: 'approve',
          justification: 'Excellent proposal',
          risk_identification: 'Minimal risks',
          risk_assessment: 'low',
          risk_mitigation: 'No special mitigation needed',
          comments: 'Approve immediately',
          submitted_at: new Date()
        }
      ])
      .execute();

    return {
      director: director[0],
      proposer: proposer[0],
      reviewer1: reviewer1[0],
      reviewer2: reviewer2[0],
      project: project[0]
    };
  };

  describe('approveProject', () => {
    it('should approve a project successfully', async () => {
      const { director, project } = await setupTestData();

      const result = await approveProject(project.id, director.id);

      // Verify project status is updated
      expect(result.status).toBe('approved');
      expect(result.id).toBe(project.id);
      expect(result.name).toBe('Test Project');
      expect(typeof result.estimated_cost).toBe('number');
      expect(result.estimated_cost).toBe(50000);

      // Verify database record is updated
      const updatedProject = await db.select()
        .from(projectsTable)
        .where(eq(projectsTable.id, project.id))
        .execute();

      expect(updatedProject[0].status).toBe('approved');
    });

    it('should create notifications for proposer and reviewers', async () => {
      const { director, proposer, reviewer1, reviewer2, project } = await setupTestData();

      await approveProject(project.id, director.id);

      // Check notifications were created
      const notifications = await db.select()
        .from(notificationsTable)
        .where(eq(notificationsTable.project_id, project.id))
        .execute();

      expect(notifications).toHaveLength(3); // 1 proposer + 2 reviewers

      // Check proposer notification
      const proposerNotification = notifications.find(n => n.user_id === proposer.id);
      expect(proposerNotification).toBeDefined();
      expect(proposerNotification!.type).toBe('project_approved');
      expect(proposerNotification!.title).toBe('Project Approved');
      expect(proposerNotification!.message).toContain('Test Project');
      expect(proposerNotification!.is_read).toBe(false);

      // Check reviewer notifications
      const reviewerNotifications = notifications.filter(n => 
        n.user_id === reviewer1.id || n.user_id === reviewer2.id
      );
      expect(reviewerNotifications).toHaveLength(2);
      reviewerNotifications.forEach(notification => {
        expect(notification.type).toBe('project_approved');
        expect(notification.title).toBe('Project Approved');
        expect(notification.message).toContain('Test Project');
      });
    });

    it('should create project history entry', async () => {
      const { director, project } = await setupTestData();

      await approveProject(project.id, director.id);

      // Check project history was created
      const history = await db.select()
        .from(projectHistoryTable)
        .where(eq(projectHistoryTable.project_id, project.id))
        .execute();

      expect(history).toHaveLength(1);
      expect(history[0].action).toBe('Project Approved');
      expect(history[0].details).toContain('director');
      expect(history[0].details).toContain('Test Director');
      expect(history[0].user_id).toBe(director.id);
    });

    it('should reject approval if user is not director or system_administrator', async () => {
      const { proposer, project } = await setupTestData();

      await expect(approveProject(project.id, proposer.id))
        .rejects.toThrow(/Insufficient permissions/);
    });

    it('should reject approval if user does not exist', async () => {
      const { project } = await setupTestData();

      await expect(approveProject(project.id, 99999))
        .rejects.toThrow('User not found');
    });

    it('should reject approval if project does not exist', async () => {
      const { director } = await setupTestData();

      await expect(approveProject(99999, director.id))
        .rejects.toThrow('Project not found');
    });

    it('should reject approval if project status is not under_review', async () => {
      const { director, proposer } = await setupTestData();

      // Create project with draft status
      const draftProject = await db.insert(projectsTable)
        .values({
          name: 'Draft Project',
          description: 'A draft project',
          objective: 'Test objective',
          estimated_cost: '25000.00',
          target_time: '3 months',
          status: 'draft',
          proposer_id: proposer.id
        })
        .returning()
        .execute();

      await expect(approveProject(draftProject[0].id, director.id))
        .rejects.toThrow(/Project cannot be approved from status: draft/);
    });

    it('should reject approval if no reviews exist', async () => {
      const { director, proposer } = await setupTestData();

      // Create project without reviews
      const noReviewProject = await db.insert(projectsTable)
        .values({
          name: 'No Review Project',
          description: 'A project without reviews',
          objective: 'Test objective',
          estimated_cost: '25000.00',
          target_time: '3 months',
          status: 'under_review',
          proposer_id: proposer.id
        })
        .returning()
        .execute();

      await expect(approveProject(noReviewProject[0].id, director.id))
        .rejects.toThrow('No reviews found for this project');
    });

    it('should reject approval if some reviews are not submitted', async () => {
      const { director, proposer, reviewer1, reviewer2 } = await setupTestData();

      // Create project with unsubmitted review
      const project = await db.insert(projectsTable)
        .values({
          name: 'Pending Review Project',
          description: 'A project with pending reviews',
          objective: 'Test objective',
          estimated_cost: '25000.00',
          target_time: '3 months',
          status: 'under_review',
          proposer_id: proposer.id
        })
        .returning()
        .execute();

      // Create one submitted and one unsubmitted review
      await db.insert(reviewsTable)
        .values([
          {
            project_id: project[0].id,
            reviewer_id: reviewer1.id,
            decision: 'approve',
            justification: 'Good project',
            risk_identification: 'Low risk',
            risk_assessment: 'low',
            risk_mitigation: 'Standard mitigation',
            submitted_at: new Date()
          },
          {
            project_id: project[0].id,
            reviewer_id: reviewer2.id,
            // No decision or submitted_at - unsubmitted review
          }
        ])
        .execute();

      await expect(approveProject(project[0].id, director.id))
        .rejects.toThrow('Cannot approve project: some reviews are not yet submitted');
    });

    it('should reject approval if some reviews have rejected the project', async () => {
      const { director, proposer, reviewer1, reviewer2 } = await setupTestData();

      // Create project with rejected review
      const project = await db.insert(projectsTable)
        .values({
          name: 'Rejected Review Project',
          description: 'A project with rejected reviews',
          objective: 'Test objective',
          estimated_cost: '25000.00',
          target_time: '3 months',
          status: 'under_review',
          proposer_id: proposer.id
        })
        .returning()
        .execute();

      // Create one approved and one rejected review
      await db.insert(reviewsTable)
        .values([
          {
            project_id: project[0].id,
            reviewer_id: reviewer1.id,
            decision: 'approve',
            justification: 'Good project',
            risk_identification: 'Low risk',
            risk_assessment: 'low',
            risk_mitigation: 'Standard mitigation',
            submitted_at: new Date()
          },
          {
            project_id: project[0].id,
            reviewer_id: reviewer2.id,
            decision: 'reject',
            justification: 'Poor proposal',
            risk_identification: 'High risk',
            risk_assessment: 'high',
            risk_mitigation: 'Cannot be mitigated',
            submitted_at: new Date()
          }
        ])
        .execute();

      await expect(approveProject(project[0].id, director.id))
        .rejects.toThrow('Cannot approve project: some reviews have rejected the project');
    });
  });

  describe('rejectProject', () => {
    it('should reject a project successfully', async () => {
      const { director, project } = await setupTestData();
      const rejectionReason = 'Budget concerns';

      const result = await rejectProject(project.id, director.id, rejectionReason);

      // Verify project status is updated
      expect(result.status).toBe('rejected');
      expect(result.id).toBe(project.id);
      expect(result.name).toBe('Test Project');
      expect(typeof result.estimated_cost).toBe('number');

      // Verify database record is updated
      const updatedProject = await db.select()
        .from(projectsTable)
        .where(eq(projectsTable.id, project.id))
        .execute();

      expect(updatedProject[0].status).toBe('rejected');
    });

    it('should create notifications with rejection reason', async () => {
      const { director, proposer, reviewer1, reviewer2, project } = await setupTestData();
      const rejectionReason = 'Insufficient budget justification';

      await rejectProject(project.id, director.id, rejectionReason);

      // Check notifications were created
      const notifications = await db.select()
        .from(notificationsTable)
        .where(eq(notificationsTable.project_id, project.id))
        .execute();

      expect(notifications).toHaveLength(3); // 1 proposer + 2 reviewers

      // Check proposer notification includes reason
      const proposerNotification = notifications.find(n => n.user_id === proposer.id);
      expect(proposerNotification).toBeDefined();
      expect(proposerNotification!.type).toBe('project_rejected');
      expect(proposerNotification!.title).toBe('Project Rejected');
      expect(proposerNotification!.message).toContain(rejectionReason);

      // Check reviewer notifications include reason
      const reviewerNotifications = notifications.filter(n => 
        n.user_id === reviewer1.id || n.user_id === reviewer2.id
      );
      expect(reviewerNotifications).toHaveLength(2);
      reviewerNotifications.forEach(notification => {
        expect(notification.type).toBe('project_rejected');
        expect(notification.message).toContain(rejectionReason);
      });
    });

    it('should create project history entry with rejection reason', async () => {
      const { director, project } = await setupTestData();
      const rejectionReason = 'Technical feasibility concerns';

      await rejectProject(project.id, director.id, rejectionReason);

      // Check project history was created
      const history = await db.select()
        .from(projectHistoryTable)
        .where(eq(projectHistoryTable.project_id, project.id))
        .execute();

      expect(history).toHaveLength(1);
      expect(history[0].action).toBe('Project Rejected');
      expect(history[0].details).toContain('director');
      expect(history[0].details).toContain('Test Director');
      expect(history[0].details).toContain(rejectionReason);
      expect(history[0].user_id).toBe(director.id);
    });

    it('should reject rejection if user is not director or system_administrator', async () => {
      const { proposer, project } = await setupTestData();

      await expect(rejectProject(project.id, proposer.id, 'Not authorized'))
        .rejects.toThrow(/Insufficient permissions/);
    });

    it('should reject rejection if project status is not under_review', async () => {
      const { director, proposer } = await setupTestData();

      // Create approved project
      const approvedProject = await db.insert(projectsTable)
        .values({
          name: 'Approved Project',
          description: 'An already approved project',
          objective: 'Test objective',
          estimated_cost: '25000.00',
          target_time: '3 months',
          status: 'approved',
          proposer_id: proposer.id
        })
        .returning()
        .execute();

      await expect(rejectProject(approvedProject[0].id, director.id, 'Cannot reject'))
        .rejects.toThrow(/Project cannot be rejected from status: approved/);
    });

    it('should work with system_administrator role', async () => {
      const { project } = await setupTestData();

      // Create system administrator
      const sysAdmin = await db.insert(usersTable)
        .values({
          email: 'admin@test.com',
          name: 'System Admin',
          role: 'system_administrator',
          is_active: true
        })
        .returning()
        .execute();

      const result = await approveProject(project.id, sysAdmin[0].id);

      expect(result.status).toBe('approved');
    });
  });
});