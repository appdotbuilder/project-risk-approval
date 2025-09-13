import { db } from '../db';
import { reviewsTable, projectsTable, usersTable } from '../db/schema';
import { type Review } from '../schema';
import { eq } from 'drizzle-orm';

export async function getReviewsByProject(projectId: number): Promise<Review[]> {
  try {
    const results = await db.select()
      .from(reviewsTable)
      .where(eq(reviewsTable.project_id, projectId))
      .execute();

    // Convert numeric fields back to numbers
    return results.map(review => ({
      ...review,
      submitted_at: review.submitted_at ? new Date(review.submitted_at) : null
    }));
  } catch (error) {
    console.error('Failed to fetch reviews by project:', error);
    throw error;
  }
}

export async function getReviewsByReviewer(reviewerId: number): Promise<Review[]> {
  try {
    const results = await db.select()
      .from(reviewsTable)
      .where(eq(reviewsTable.reviewer_id, reviewerId))
      .execute();

    // Convert numeric fields back to numbers
    return results.map(review => ({
      ...review,
      submitted_at: review.submitted_at ? new Date(review.submitted_at) : null
    }));
  } catch (error) {
    console.error('Failed to fetch reviews by reviewer:', error);
    throw error;
  }
}

export async function getReviewById(id: number): Promise<Review | null> {
  try {
    const results = await db.select()
      .from(reviewsTable)
      .where(eq(reviewsTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const review = results[0];
    return {
      ...review,
      submitted_at: review.submitted_at ? new Date(review.submitted_at) : null
    };
  } catch (error) {
    console.error('Failed to fetch review by id:', error);
    throw error;
  }
}