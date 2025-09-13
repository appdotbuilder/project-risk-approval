import { serial, text, pgTable, timestamp, numeric, integer, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['project_proposer', 'reviewer', 'director', 'system_administrator']);
export const projectStatusEnum = pgEnum('project_status', ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'returned']);
export const reviewDecisionEnum = pgEnum('review_decision', ['approve', 'reject', 'return']);
export const riskImpactLevelEnum = pgEnum('risk_impact_level', ['low', 'medium', 'high']);
export const notificationTypeEnum = pgEnum('notification_type', ['project_submitted', 'review_assigned', 'review_completed', 'project_approved', 'project_rejected', 'project_returned', 'comment_added']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: userRoleEnum('role').notNull(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Projects table
export const projectsTable = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  objective: text('objective').notNull(),
  estimated_cost: numeric('estimated_cost', { precision: 12, scale: 2 }).notNull(),
  target_time: text('target_time').notNull(), // Duration as string
  status: projectStatusEnum('status').notNull().default('draft'),
  proposer_id: integer('proposer_id').notNull().references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Project reviewers assignment table
export const projectReviewersTable = pgTable('project_reviewers', {
  id: serial('id').primaryKey(),
  project_id: integer('project_id').notNull().references(() => projectsTable.id, { onDelete: 'cascade' }),
  reviewer_id: integer('reviewer_id').notNull().references(() => usersTable.id),
  assigned_at: timestamp('assigned_at').defaultNow().notNull(),
});

// Reviews table
export const reviewsTable = pgTable('reviews', {
  id: serial('id').primaryKey(),
  project_id: integer('project_id').notNull().references(() => projectsTable.id, { onDelete: 'cascade' }),
  reviewer_id: integer('reviewer_id').notNull().references(() => usersTable.id),
  decision: reviewDecisionEnum('decision'),
  justification: text('justification'),
  risk_identification: text('risk_identification'),
  risk_assessment: riskImpactLevelEnum('risk_assessment'),
  risk_mitigation: text('risk_mitigation'),
  comments: text('comments'),
  submitted_at: timestamp('submitted_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Comments table
export const commentsTable = pgTable('comments', {
  id: serial('id').primaryKey(),
  project_id: integer('project_id').notNull().references(() => projectsTable.id, { onDelete: 'cascade' }),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  content: text('content').notNull(),
  parent_comment_id: integer('parent_comment_id'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Notifications table
export const notificationsTable = pgTable('notifications', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  project_id: integer('project_id').references(() => projectsTable.id, { onDelete: 'cascade' }),
  is_read: boolean('is_read').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Project history table
export const projectHistoryTable = pgTable('project_history', {
  id: serial('id').primaryKey(),
  project_id: integer('project_id').notNull().references(() => projectsTable.id, { onDelete: 'cascade' }),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  action: text('action').notNull(),
  details: text('details'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  proposedProjects: many(projectsTable),
  projectReviewers: many(projectReviewersTable),
  reviews: many(reviewsTable),
  comments: many(commentsTable),
  notifications: many(notificationsTable),
  projectHistory: many(projectHistoryTable),
}));

export const projectsRelations = relations(projectsTable, ({ one, many }) => ({
  proposer: one(usersTable, {
    fields: [projectsTable.proposer_id],
    references: [usersTable.id],
  }),
  projectReviewers: many(projectReviewersTable),
  reviews: many(reviewsTable),
  comments: many(commentsTable),
  notifications: many(notificationsTable),
  projectHistory: many(projectHistoryTable),
}));

export const projectReviewersRelations = relations(projectReviewersTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [projectReviewersTable.project_id],
    references: [projectsTable.id],
  }),
  reviewer: one(usersTable, {
    fields: [projectReviewersTable.reviewer_id],
    references: [usersTable.id],
  }),
}));

export const reviewsRelations = relations(reviewsTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [reviewsTable.project_id],
    references: [projectsTable.id],
  }),
  reviewer: one(usersTable, {
    fields: [reviewsTable.reviewer_id],
    references: [usersTable.id],
  }),
}));

export const commentsRelations = relations(commentsTable, ({ one, many }) => ({
  project: one(projectsTable, {
    fields: [commentsTable.project_id],
    references: [projectsTable.id],
  }),
  user: one(usersTable, {
    fields: [commentsTable.user_id],
    references: [usersTable.id],
  }),
  parentComment: one(commentsTable, {
    fields: [commentsTable.parent_comment_id],
    references: [commentsTable.id],
    relationName: 'replies',
  }),
  replies: many(commentsTable, {
    relationName: 'replies',
  }),
}));

export const notificationsRelations = relations(notificationsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [notificationsTable.user_id],
    references: [usersTable.id],
  }),
  project: one(projectsTable, {
    fields: [notificationsTable.project_id],
    references: [projectsTable.id],
  }),
}));

export const projectHistoryRelations = relations(projectHistoryTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [projectHistoryTable.project_id],
    references: [projectsTable.id],
  }),
  user: one(usersTable, {
    fields: [projectHistoryTable.user_id],
    references: [usersTable.id],
  }),
}));

// Export all tables for relation queries
export const tables = {
  users: usersTable,
  projects: projectsTable,
  projectReviewers: projectReviewersTable,
  reviews: reviewsTable,
  comments: commentsTable,
  notifications: notificationsTable,
  projectHistory: projectHistoryTable,
};

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
export type Project = typeof projectsTable.$inferSelect;
export type NewProject = typeof projectsTable.$inferInsert;
export type ProjectReviewer = typeof projectReviewersTable.$inferSelect;
export type NewProjectReviewer = typeof projectReviewersTable.$inferInsert;
export type Review = typeof reviewsTable.$inferSelect;
export type NewReview = typeof reviewsTable.$inferInsert;
export type Comment = typeof commentsTable.$inferSelect;
export type NewComment = typeof commentsTable.$inferInsert;
export type Notification = typeof notificationsTable.$inferSelect;
export type NewNotification = typeof notificationsTable.$inferInsert;
export type ProjectHistory = typeof projectHistoryTable.$inferSelect;
export type NewProjectHistory = typeof projectHistoryTable.$inferInsert;