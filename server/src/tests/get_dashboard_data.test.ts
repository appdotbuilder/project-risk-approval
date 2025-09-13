import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  projectsTable, 
  reviewsTable, 
  notificationsTable,
  projectReviewersTable 
} from '../db/schema';
import { getDashboardData } from '../handlers/get_dashboard_data';

describe('getDashboardData', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Create test users for different roles
  const createTestUsers = async () => {
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'proposer@test.com',
          name: 'Test Proposer',
          role: 'project_proposer',
          is_active: true
        },
        {
          email: 'reviewer@test.com',
          name: 'Test Reviewer',
          role: 'reviewer',
          is_active: true
        },
        {
          email: 'director@test.com',
          name: 'Test Director',
          role: 'director',
          is_active: true
        },
        {
          email: 'admin@test.com',
          name: 'Test Admin',
          role: 'system_administrator',
          is_active: true
        }
      ])
      .returning()
      .execute();

    return {
      proposer: users[0],
      reviewer: users[1],
      director: users[2],
      admin: users[3]
    };
  };

  it('should return dashboard data for project proposer', async () => {
    const users = await createTestUsers();
    
    // Create projects for the proposer (first project)
    const [project1] = await db.insert(projectsTable)
      .values({
        name: 'Project 1',
        description: 'Description 1',
        objective: 'Objective 1',
        estimated_cost: '10000.00',
        target_time: '6 months',
        status: 'draft',
        proposer_id: users.proposer.id
      })
      .returning()
      .execute();
    
    // Sleep to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Create second project
    const [project2] = await db.insert(projectsTable)
      .values({
        name: 'Project 2',
        description: 'Description 2',
        objective: 'Objective 2',
        estimated_cost: '15000.50',
        target_time: '12 months',
        status: 'under_review',
        proposer_id: users.proposer.id
      })
      .returning()
      .execute();
    
    const projects = [project1, project2];

    // Create first notification
    await db.insert(notificationsTable)
      .values({
        user_id: users.proposer.id,
        type: 'project_submitted',
        title: 'Project Submitted',
        message: 'Your project has been submitted',
        project_id: projects[0].id,
        is_read: false
      })
      .execute();
    
    // Sleep to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Create second notification (this will be most recent)
    await db.insert(notificationsTable)
      .values({
        user_id: users.proposer.id,
        type: 'project_approved',
        title: 'Project Approved',
        message: 'Your project has been approved',
        project_id: projects[1].id,
        is_read: true
      })
      .execute();

    const dashboardData = await getDashboardData(users.proposer.id, 'project_proposer');

    // Verify projects
    expect(dashboardData.projects).toHaveLength(2);
    expect(dashboardData.projects[0].estimated_cost).toEqual(15000.5); // Most recent first
    expect(typeof dashboardData.projects[0].estimated_cost).toBe('number');
    
    // Verify no pending reviews for proposer
    expect(dashboardData.pendingReviews).toHaveLength(0);
    
    // Verify notifications
    expect(dashboardData.recentNotifications).toHaveLength(2);
    expect(dashboardData.recentNotifications[0].title).toEqual('Project Approved');
    
    // Verify stats
    expect(dashboardData.stats.totalProjects).toEqual(2);
    expect(dashboardData.stats.pendingApprovals).toEqual(1); // One project under review
    expect(dashboardData.stats.completedReviews).toEqual(0); // Not applicable for proposers
    expect(dashboardData.stats.unreadNotifications).toEqual(1);
  });

  it('should return dashboard data for reviewer', async () => {
    const users = await createTestUsers();
    
    // Create project
    const [project] = await db.insert(projectsTable)
      .values({
        name: 'Review Project',
        description: 'Project to review',
        objective: 'Review objective',
        estimated_cost: '20000.00',
        target_time: '8 months',
        status: 'under_review',
        proposer_id: users.proposer.id
      })
      .returning()
      .execute();

    // Assign reviewer to project
    await db.insert(projectReviewersTable)
      .values({
        project_id: project.id,
        reviewer_id: users.reviewer.id
      })
      .execute();

    // Create pending review
    await db.insert(reviewsTable)
      .values({
        project_id: project.id,
        reviewer_id: users.reviewer.id,
        decision: null,
        justification: null,
        submitted_at: null
      })
      .execute();

    // Create notification
    await db.insert(notificationsTable)
      .values({
        user_id: users.reviewer.id,
        type: 'review_assigned',
        title: 'Review Assigned',
        message: 'You have been assigned a review',
        project_id: project.id,
        is_read: false
      })
      .execute();

    const dashboardData = await getDashboardData(users.reviewer.id, 'reviewer');

    // Verify assigned projects
    expect(dashboardData.projects).toHaveLength(1);
    expect(dashboardData.projects[0].name).toEqual('Review Project');
    expect(dashboardData.projects[0].estimated_cost).toEqual(20000);
    expect(typeof dashboardData.projects[0].estimated_cost).toBe('number');
    
    // Verify pending reviews
    expect(dashboardData.pendingReviews).toHaveLength(1);
    expect(dashboardData.pendingReviews[0].project_id).toEqual(project.id);
    expect(dashboardData.pendingReviews[0].submitted_at).toBeNull();
    
    // Verify notifications
    expect(dashboardData.recentNotifications).toHaveLength(1);
    expect(dashboardData.recentNotifications[0].type).toEqual('review_assigned');
    
    // Verify stats
    expect(dashboardData.stats.totalProjects).toEqual(1); // Assigned projects
    expect(dashboardData.stats.pendingApprovals).toEqual(1); // Pending reviews
    expect(dashboardData.stats.unreadNotifications).toEqual(1);
  });

  it('should return dashboard data for director', async () => {
    const users = await createTestUsers();
    
    // Create first project
    await db.insert(projectsTable)
      .values({
        name: 'Director Project 1',
        description: 'Project awaiting approval',
        objective: 'Director objective',
        estimated_cost: '50000.75',
        target_time: '12 months',
        status: 'under_review',
        proposer_id: users.proposer.id
      })
      .execute();
    
    // Sleep to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Create second project
    await db.insert(projectsTable)
      .values({
        name: 'Director Project 2',
        description: 'Another project',
        objective: 'Another objective',
        estimated_cost: '30000.25',
        target_time: '6 months',
        status: 'approved',
        proposer_id: users.proposer.id
      })
      .execute();

    const dashboardData = await getDashboardData(users.director.id, 'director');

    // Verify projects under review
    expect(dashboardData.projects).toHaveLength(1); // Only under_review projects
    expect(dashboardData.projects[0].name).toEqual('Director Project 1');
    expect(dashboardData.projects[0].estimated_cost).toEqual(50000.75);
    expect(typeof dashboardData.projects[0].estimated_cost).toBe('number');
    
    // Verify stats
    expect(dashboardData.stats.totalProjects).toEqual(2); // All projects
    expect(dashboardData.stats.pendingApprovals).toEqual(1); // Projects under review
    expect(dashboardData.stats.unreadNotifications).toEqual(0); // Directors don't track personal notifications
  });

  it('should return dashboard data for system administrator', async () => {
    const users = await createTestUsers();
    
    // Create first project
    await db.insert(projectsTable)
      .values({
        name: 'Admin Project 1',
        description: 'System overview project',
        objective: 'Admin objective',
        estimated_cost: '100000.00',
        target_time: '18 months',
        status: 'submitted',
        proposer_id: users.proposer.id
      })
      .execute();
    
    // Sleep to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Create second project
    await db.insert(projectsTable)
      .values({
        name: 'Admin Project 2',
        description: 'Another system project',
        objective: 'Another admin objective',
        estimated_cost: '75000.50',
        target_time: '24 months',
        status: 'approved',
        proposer_id: users.proposer.id
      })
      .execute();

    const dashboardData = await getDashboardData(users.admin.id, 'system_administrator');

    // Verify all projects are returned
    expect(dashboardData.projects).toHaveLength(2);
    expect(dashboardData.projects[0].estimated_cost).toEqual(75000.5); // Most recent first
    expect(typeof dashboardData.projects[0].estimated_cost).toBe('number');
    
    // Verify stats show system-wide data
    expect(dashboardData.stats.totalProjects).toEqual(2);
    expect(dashboardData.stats.pendingApprovals).toEqual(1); // Submitted projects
    expect(dashboardData.stats.unreadNotifications).toEqual(4); // Total users count
  });

  it('should handle empty data gracefully', async () => {
    const users = await createTestUsers();

    const dashboardData = await getDashboardData(users.proposer.id, 'project_proposer');

    expect(dashboardData.projects).toHaveLength(0);
    expect(dashboardData.pendingReviews).toHaveLength(0);
    expect(dashboardData.recentNotifications).toHaveLength(0);
    expect(dashboardData.stats.totalProjects).toEqual(0);
    expect(dashboardData.stats.pendingApprovals).toEqual(0);
    expect(dashboardData.stats.completedReviews).toEqual(0);
    expect(dashboardData.stats.unreadNotifications).toEqual(0);
  });

  it('should limit results appropriately', async () => {
    const users = await createTestUsers();
    
    // Create many projects (more than the limit) one by one to ensure different timestamps
    for (let i = 0; i < 15; i++) {
      await db.insert(projectsTable)
        .values({
          name: `Project ${i + 1}`,
          description: `Description ${i + 1}`,
          objective: `Objective ${i + 1}`,
          estimated_cost: `${(i + 1) * 1000}.00`,
          target_time: '6 months',
          status: 'draft' as const,
          proposer_id: users.proposer.id
        })
        .execute();
      
      // Small delay to ensure different timestamps
      if (i < 14) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    const dashboardData = await getDashboardData(users.proposer.id, 'project_proposer');

    // Verify limit is respected
    expect(dashboardData.projects).toHaveLength(10); // Limited to 10 for proposers
    
    // Verify most recent projects are returned (by updated_at desc)
    expect(dashboardData.projects[0].name).toEqual('Project 15');
    expect(dashboardData.projects[9].name).toEqual('Project 6');
  });

  it('should handle unknown user role gracefully', async () => {
    const users = await createTestUsers();

    const dashboardData = await getDashboardData(users.proposer.id, 'unknown_role');

    expect(dashboardData.projects).toHaveLength(0);
    expect(dashboardData.pendingReviews).toHaveLength(0);
    expect(dashboardData.recentNotifications).toHaveLength(0);
    expect(dashboardData.stats.totalProjects).toEqual(0);
    expect(dashboardData.stats.pendingApprovals).toEqual(0);
    expect(dashboardData.stats.completedReviews).toEqual(0);
    expect(dashboardData.stats.unreadNotifications).toEqual(0);
  });

  it('should return correct notification order and limit', async () => {
    const users = await createTestUsers();
    
    // Create multiple notifications with different timestamps
    for (let i = 0; i < 8; i++) {
      await db.insert(notificationsTable)
        .values({
          user_id: users.proposer.id,
          type: 'project_submitted' as const,
          title: `Notification ${i + 1}`,
          message: `Message ${i + 1}`,
          project_id: null,
          is_read: i % 2 === 0
        })
        .execute();
      
      // Small delay to ensure different timestamps
      if (i < 7) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    const dashboardData = await getDashboardData(users.proposer.id, 'project_proposer');

    // Verify limit and order
    expect(dashboardData.recentNotifications).toHaveLength(5); // Limited to 5
    expect(dashboardData.recentNotifications[0].title).toEqual('Notification 8'); // Most recent first
    expect(dashboardData.recentNotifications[4].title).toEqual('Notification 4');
  });
});