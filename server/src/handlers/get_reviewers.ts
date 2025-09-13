import { type User } from '../schema';

export async function getAvailableReviewers(): Promise<User[]> {
  // This is a placeholder declaration! Real code should be implemented here.
  // The goal of this handler is fetching all users with 'reviewer' role.
  // Should return active reviewers that can be assigned to projects.
  return Promise.resolve([]);
}

export async function getProjectReviewers(projectId: number): Promise<User[]> {
  // This is a placeholder declaration! Real code should be implemented here.
  // The goal of this handler is fetching all reviewers assigned to a specific project.
  // Should include reviewer information and their review status.
  return Promise.resolve([]);
}