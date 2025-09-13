import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  createUserInputSchema,
  updateUserInputSchema,
  createProjectInputSchema,
  updateProjectInputSchema,
  submitReviewInputSchema,
  createCommentInputSchema,
  userRoleSchema
} from './schema';

// Import handlers
import { createUser } from './handlers/create_user';
import { getUsers } from './handlers/get_users';
import { updateUser } from './handlers/update_user';
import { createProject } from './handlers/create_project';
import { getProjects, getProjectsByUser, getProjectById } from './handlers/get_projects';
import { submitProject } from './handlers/submit_project';
import { getReviewsByProject, getReviewsByReviewer, getReviewById } from './handlers/get_reviews';
import { submitReview } from './handlers/submit_review';
import { approveProject, rejectProject } from './handlers/approve_project';
import { createComment } from './handlers/create_comment';
import { getCommentsByProject, getComment } from './handlers/get_comments';
import { getNotificationsByUser, markNotificationAsRead, markAllNotificationsAsRead } from './handlers/get_notifications';
import { getDashboardData } from './handlers/get_dashboard_data';
import { getProjectHistory } from './handlers/get_project_history';
import { getAvailableReviewers, getProjectReviewers } from './handlers/get_reviewers';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // User management
  createUser: publicProcedure
    .input(createUserInputSchema)
    .mutation(({ input }) => createUser(input)),
  
  getUsers: publicProcedure
    .query(() => getUsers()),
  
  updateUser: publicProcedure
    .input(updateUserInputSchema)
    .mutation(({ input }) => updateUser(input)),
  
  getAvailableReviewers: publicProcedure
    .query(() => getAvailableReviewers()),

  // Project management
  createProject: publicProcedure
    .input(createProjectInputSchema)
    .mutation(({ input }) => createProject(input)),
  
  getProjects: publicProcedure
    .query(() => getProjects()),
  
  getProjectsByUser: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => getProjectsByUser(input.userId)),
  
  getProjectById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getProjectById(input.id)),
  
  updateProject: publicProcedure
    .input(updateProjectInputSchema)
    .mutation(({ input }) => {
      // Placeholder for update project handler
      return Promise.resolve({
        id: input.id,
        name: input.name || 'Placeholder',
        description: input.description || 'Placeholder',
        objective: input.objective || 'Placeholder',
        estimated_cost: input.estimated_cost || 0,
        target_time: input.target_time || 'Placeholder',
        status: input.status || 'draft',
        proposer_id: 0,
        created_at: new Date(),
        updated_at: new Date()
      });
    }),
  
  submitProject: publicProcedure
    .input(z.object({ 
      projectId: z.number(), 
      userId: z.number() 
    }))
    .mutation(({ input }) => submitProject(input.projectId, input.userId)),

  getProjectReviewers: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(({ input }) => getProjectReviewers(input.projectId)),

  // Review management
  getReviewsByProject: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(({ input }) => getReviewsByProject(input.projectId)),
  
  getReviewsByReviewer: publicProcedure
    .input(z.object({ reviewerId: z.number() }))
    .query(({ input }) => getReviewsByReviewer(input.reviewerId)),
  
  getReviewById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getReviewById(input.id)),
  
  submitReview: publicProcedure
    .input(submitReviewInputSchema)
    .mutation(({ input }) => submitReview(input)),

  // Project approval (Director/Superadmin)
  approveProject: publicProcedure
    .input(z.object({ 
      projectId: z.number(), 
      userId: z.number() 
    }))
    .mutation(({ input }) => approveProject(input.projectId, input.userId)),
  
  rejectProject: publicProcedure
    .input(z.object({ 
      projectId: z.number(), 
      userId: z.number(),
      reason: z.string().min(1)
    }))
    .mutation(({ input }) => rejectProject(input.projectId, input.userId, input.reason)),

  // Comments and discussion
  createComment: publicProcedure
    .input(createCommentInputSchema)
    .mutation(({ input }) => createComment(input)),
  
  getCommentsByProject: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(({ input }) => getCommentsByProject(input.projectId)),
  
  getComment: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getComment(input.id)),

  // Notifications
  getNotificationsByUser: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => getNotificationsByUser(input.userId)),
  
  markNotificationAsRead: publicProcedure
    .input(z.object({ 
      notificationId: z.number(), 
      userId: z.number() 
    }))
    .mutation(({ input }) => markNotificationAsRead(input.notificationId, input.userId)),
  
  markAllNotificationsAsRead: publicProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(({ input }) => markAllNotificationsAsRead(input.userId)),

  // Dashboard
  getDashboardData: publicProcedure
    .input(z.object({ 
      userId: z.number(), 
      userRole: userRoleSchema 
    }))
    .query(({ input }) => getDashboardData(input.userId, input.userRole)),

  // Project history and audit
  getProjectHistory: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(({ input }) => getProjectHistory(input.projectId)),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`PARJIS TRPC server listening at port: ${port}`);
}

start();