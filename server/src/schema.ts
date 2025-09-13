import { z } from 'zod';

// User roles enum
export const userRoleSchema = z.enum(['project_proposer', 'reviewer', 'director', 'system_administrator']);
export type UserRole = z.infer<typeof userRoleSchema>;

// Project status enum
export const projectStatusSchema = z.enum(['draft', 'submitted', 'under_review', 'approved', 'rejected', 'returned']);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

// Review decision enum
export const reviewDecisionSchema = z.enum(['approve', 'reject', 'return']);
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

// Risk impact level enum
export const riskImpactLevelSchema = z.enum(['low', 'medium', 'high']);
export type RiskImpactLevel = z.infer<typeof riskImpactLevelSchema>;

// Notification type enum
export const notificationTypeSchema = z.enum(['project_submitted', 'review_assigned', 'review_completed', 'project_approved', 'project_rejected', 'project_returned', 'comment_added']);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

// User schema
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  name: z.string(),
  role: userRoleSchema,
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Input schema for creating users
export const createUserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: userRoleSchema,
  is_active: z.boolean().default(true)
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

// Input schema for updating users
export const updateUserInputSchema = z.object({
  id: z.number(),
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  role: userRoleSchema.optional(),
  is_active: z.boolean().optional()
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

// Project schema
export const projectSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  objective: z.string(),
  estimated_cost: z.number(),
  target_time: z.string(), // Duration as string (e.g., "6 months")
  status: projectStatusSchema,
  proposer_id: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Project = z.infer<typeof projectSchema>;

// Input schema for creating projects
export const createProjectInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  objective: z.string().min(1),
  estimated_cost: z.number().positive(),
  target_time: z.string().min(1),
  proposer_id: z.number(),
  reviewer_ids: z.array(z.number()).min(1) // IDs of selected reviewers
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

// Input schema for updating projects
export const updateProjectInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  objective: z.string().min(1).optional(),
  estimated_cost: z.number().positive().optional(),
  target_time: z.string().min(1).optional(),
  status: projectStatusSchema.optional()
});

export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

// Project reviewer assignment schema
export const projectReviewerSchema = z.object({
  id: z.number(),
  project_id: z.number(),
  reviewer_id: z.number(),
  assigned_at: z.coerce.date()
});

export type ProjectReviewer = z.infer<typeof projectReviewerSchema>;

// Review schema
export const reviewSchema = z.object({
  id: z.number(),
  project_id: z.number(),
  reviewer_id: z.number(),
  decision: reviewDecisionSchema.nullable(),
  justification: z.string().nullable(),
  risk_identification: z.string().nullable(),
  risk_assessment: riskImpactLevelSchema.nullable(),
  risk_mitigation: z.string().nullable(),
  comments: z.string().nullable(),
  submitted_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Review = z.infer<typeof reviewSchema>;

// Input schema for creating reviews
export const createReviewInputSchema = z.object({
  project_id: z.number(),
  reviewer_id: z.number()
});

export type CreateReviewInput = z.infer<typeof createReviewInputSchema>;

// Input schema for submitting reviews
export const submitReviewInputSchema = z.object({
  id: z.number(),
  decision: reviewDecisionSchema,
  justification: z.string().min(1),
  risk_identification: z.string().min(1),
  risk_assessment: riskImpactLevelSchema,
  risk_mitigation: z.string().min(1),
  comments: z.string().optional()
});

export type SubmitReviewInput = z.infer<typeof submitReviewInputSchema>;

// Comment schema
export const commentSchema = z.object({
  id: z.number(),
  project_id: z.number(),
  user_id: z.number(),
  content: z.string(),
  parent_comment_id: z.number().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Comment = z.infer<typeof commentSchema>;

// Input schema for creating comments
export const createCommentInputSchema = z.object({
  project_id: z.number(),
  user_id: z.number(),
  content: z.string().min(1),
  parent_comment_id: z.number().nullable().optional()
});

export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;

// Notification schema
export const notificationSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  type: notificationTypeSchema,
  title: z.string(),
  message: z.string(),
  project_id: z.number().nullable(),
  is_read: z.boolean(),
  created_at: z.coerce.date()
});

export type Notification = z.infer<typeof notificationSchema>;

// Input schema for creating notifications
export const createNotificationInputSchema = z.object({
  user_id: z.number(),
  type: notificationTypeSchema,
  title: z.string().min(1),
  message: z.string().min(1),
  project_id: z.number().nullable().optional()
});

export type CreateNotificationInput = z.infer<typeof createNotificationInputSchema>;

// Project history schema
export const projectHistorySchema = z.object({
  id: z.number(),
  project_id: z.number(),
  user_id: z.number(),
  action: z.string(),
  details: z.string().nullable(),
  created_at: z.coerce.date()
});

export type ProjectHistory = z.infer<typeof projectHistorySchema>;

// Input schema for creating project history entries
export const createProjectHistoryInputSchema = z.object({
  project_id: z.number(),
  user_id: z.number(),
  action: z.string().min(1),
  details: z.string().nullable().optional()
});

export type CreateProjectHistoryInput = z.infer<typeof createProjectHistoryInputSchema>;