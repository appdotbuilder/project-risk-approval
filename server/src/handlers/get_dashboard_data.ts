import { db } from '../db';
import { 
  usersTable, 
  projectsTable, 
  reviewsTable, 
  notificationsTable,
  projectReviewersTable 
} from '../db/schema';
import { type Project, type Review, type Notification } from '../schema';
import { eq, and, desc, count, isNull, not } from 'drizzle-orm';

export interface DashboardData {
  projects: Project[];
  pendingReviews: Review[];
  recentNotifications: Notification[];
  stats: {
    totalProjects: number;
    pendingApprovals: number;
    completedReviews: number;
    unreadNotifications: number;
  };
}

export async function getDashboardData(userId: number, userRole: string): Promise<DashboardData> {
  try {
    let projects: Project[] = [];
    let pendingReviews: Review[] = [];
    const recentNotifications = await getRecentNotifications(userId);
    const stats = await getStatsForRole(userId, userRole);

    // Get data based on user role
    switch (userRole) {
      case 'project_proposer':
        projects = await getProposerProjects(userId);
        // Project proposers don't have pending reviews
        break;
      
      case 'reviewer':
        projects = await getReviewerProjects(userId);
        pendingReviews = await getPendingReviews(userId);
        break;
      
      case 'director':
        projects = await getDirectorProjects();
        pendingReviews = await getCompletedReviews();
        break;
      
      case 'system_administrator':
        projects = await getAllProjects();
        pendingReviews = await getAllReviews();
        break;
    }

    return {
      projects,
      pendingReviews,
      recentNotifications,
      stats
    };
  } catch (error) {
    console.error('Dashboard data fetch failed:', error);
    throw error;
  }
}

// Get projects for project proposers (their own projects)
async function getProposerProjects(userId: number): Promise<Project[]> {
  const results = await db.select()
    .from(projectsTable)
    .where(eq(projectsTable.proposer_id, userId))
    .orderBy(desc(projectsTable.updated_at))
    .limit(10)
    .execute();

  return results.map(project => ({
    ...project,
    estimated_cost: parseFloat(project.estimated_cost)
  }));
}

// Get projects assigned to reviewers
async function getReviewerProjects(userId: number): Promise<Project[]> {
  const results = await db.select()
    .from(projectsTable)
    .innerJoin(projectReviewersTable, eq(projectsTable.id, projectReviewersTable.project_id))
    .where(eq(projectReviewersTable.reviewer_id, userId))
    .orderBy(desc(projectsTable.updated_at))
    .limit(10)
    .execute();

  return results.map(result => ({
    ...result.projects,
    estimated_cost: parseFloat(result.projects.estimated_cost)
  }));
}

// Get projects for directors (projects awaiting final approval)
async function getDirectorProjects(): Promise<Project[]> {
  const results = await db.select()
    .from(projectsTable)
    .where(eq(projectsTable.status, 'under_review'))
    .orderBy(desc(projectsTable.updated_at))
    .limit(10)
    .execute();

  return results.map(project => ({
    ...project,
    estimated_cost: parseFloat(project.estimated_cost)
  }));
}

// Get all projects for system administrators
async function getAllProjects(): Promise<Project[]> {
  const results = await db.select()
    .from(projectsTable)
    .orderBy(desc(projectsTable.updated_at))
    .limit(20)
    .execute();

  return results.map(project => ({
    ...project,
    estimated_cost: parseFloat(project.estimated_cost)
  }));
}

// Get pending reviews for a specific reviewer
async function getPendingReviews(userId: number): Promise<Review[]> {
  const results = await db.select()
    .from(reviewsTable)
    .where(and(
      eq(reviewsTable.reviewer_id, userId),
      isNull(reviewsTable.submitted_at)
    ))
    .orderBy(desc(reviewsTable.created_at))
    .limit(10)
    .execute();

  return results;
}

// Get completed reviews for directors
async function getCompletedReviews(): Promise<Review[]> {
  const results = await db.select()
    .from(reviewsTable)
    .orderBy(desc(reviewsTable.created_at))
    .limit(10)
    .execute();

  return results;
}

// Get all reviews for system administrators
async function getAllReviews(): Promise<Review[]> {
  const results = await db.select()
    .from(reviewsTable)
    .orderBy(desc(reviewsTable.created_at))
    .limit(15)
    .execute();

  return results;
}

// Get recent notifications for a user
async function getRecentNotifications(userId: number): Promise<Notification[]> {
  const results = await db.select()
    .from(notificationsTable)
    .where(eq(notificationsTable.user_id, userId))
    .orderBy(desc(notificationsTable.created_at))
    .limit(5)
    .execute();

  return results;
}

// Get statistics based on user role
async function getStatsForRole(userId: number, userRole: string) {
  switch (userRole) {
    case 'project_proposer':
      return await getProposerStats(userId);
    
    case 'reviewer':
      return await getReviewerStats(userId);
    
    case 'director':
      return await getDirectorStats();
    
    case 'system_administrator':
      return await getAdminStats();
    
    default:
      return {
        totalProjects: 0,
        pendingApprovals: 0,
        completedReviews: 0,
        unreadNotifications: 0
      };
  }
}

// Get stats for project proposers
async function getProposerStats(userId: number) {
  const [totalProjectsResult] = await db.select({ count: count() })
    .from(projectsTable)
    .where(eq(projectsTable.proposer_id, userId))
    .execute();

  const [pendingApprovalsResult] = await db.select({ count: count() })
    .from(projectsTable)
    .where(and(
      eq(projectsTable.proposer_id, userId),
      eq(projectsTable.status, 'under_review')
    ))
    .execute();

  const [unreadNotificationsResult] = await db.select({ count: count() })
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.user_id, userId),
      eq(notificationsTable.is_read, false)
    ))
    .execute();

  return {
    totalProjects: totalProjectsResult.count,
    pendingApprovals: pendingApprovalsResult.count,
    completedReviews: 0, // Not applicable for proposers
    unreadNotifications: unreadNotificationsResult.count
  };
}

// Get stats for reviewers
async function getReviewerStats(userId: number) {
  const [assignedProjectsResult] = await db.select({ count: count() })
    .from(projectReviewersTable)
    .where(eq(projectReviewersTable.reviewer_id, userId))
    .execute();

  const [pendingReviewsResult] = await db.select({ count: count() })
    .from(reviewsTable)
    .where(and(
      eq(reviewsTable.reviewer_id, userId),
      isNull(reviewsTable.submitted_at)
    ))
    .execute();

  const [completedReviewsResult] = await db.select({ count: count() })
    .from(reviewsTable)
    .where(and(
      eq(reviewsTable.reviewer_id, userId),
      not(isNull(reviewsTable.submitted_at))
    ))
    .execute();

  const [unreadNotificationsResult] = await db.select({ count: count() })
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.user_id, userId),
      eq(notificationsTable.is_read, false)
    ))
    .execute();

  return {
    totalProjects: assignedProjectsResult.count,
    pendingApprovals: pendingReviewsResult.count,
    completedReviews: completedReviewsResult.count,
    unreadNotifications: unreadNotificationsResult.count
  };
}

// Get stats for directors
async function getDirectorStats() {
  const [totalProjectsResult] = await db.select({ count: count() })
    .from(projectsTable)
    .execute();

  const [pendingApprovalsResult] = await db.select({ count: count() })
    .from(projectsTable)
    .where(eq(projectsTable.status, 'under_review'))
    .execute();

  const [completedReviewsResult] = await db.select({ count: count() })
    .from(reviewsTable)
    .where(not(isNull(reviewsTable.submitted_at)))
    .execute();

  return {
    totalProjects: totalProjectsResult.count,
    pendingApprovals: pendingApprovalsResult.count,
    completedReviews: completedReviewsResult.count,
    unreadNotifications: 0 // Directors see system-wide stats, not personal notifications
  };
}

// Get stats for system administrators
async function getAdminStats() {
  const [totalProjectsResult] = await db.select({ count: count() })
    .from(projectsTable)
    .execute();

  const [pendingApprovalsResult] = await db.select({ count: count() })
    .from(projectsTable)
    .where(eq(projectsTable.status, 'submitted'))
    .execute();

  const [completedReviewsResult] = await db.select({ count: count() })
    .from(reviewsTable)
    .where(not(isNull(reviewsTable.submitted_at)))
    .execute();

  const [totalUsersResult] = await db.select({ count: count() })
    .from(usersTable)
    .execute();

  return {
    totalProjects: totalProjectsResult.count,
    pendingApprovals: pendingApprovalsResult.count,
    completedReviews: completedReviewsResult.count,
    unreadNotifications: totalUsersResult.count // Total users as a system metric
  };
}