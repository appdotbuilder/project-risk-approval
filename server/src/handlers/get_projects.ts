import { db } from '../db';
import { projectsTable, projectReviewersTable } from '../db/schema';
import { type Project } from '../schema';
import { eq, or } from 'drizzle-orm';

export async function getProjects(): Promise<Project[]> {
  try {
    const results = await db.select()
      .from(projectsTable)
      .execute();

    // Convert numeric fields from strings to numbers
    return results.map(project => ({
      ...project,
      estimated_cost: parseFloat(project.estimated_cost)
    }));
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    throw error;
  }
}

export async function getProjectsByUser(userId: number): Promise<Project[]> {
  try {
    // Query for projects where user is either the proposer or assigned as a reviewer
    const proposedResults = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.proposer_id, userId))
      .execute();

    const reviewerResults = await db.select({
      id: projectsTable.id,
      name: projectsTable.name,
      description: projectsTable.description,
      objective: projectsTable.objective,
      estimated_cost: projectsTable.estimated_cost,
      target_time: projectsTable.target_time,
      status: projectsTable.status,
      proposer_id: projectsTable.proposer_id,
      created_at: projectsTable.created_at,
      updated_at: projectsTable.updated_at,
    })
      .from(projectsTable)
      .innerJoin(projectReviewersTable, eq(projectsTable.id, projectReviewersTable.project_id))
      .where(eq(projectReviewersTable.reviewer_id, userId))
      .execute();

    // Combine results and remove duplicates
    const allProjects = [...proposedResults, ...reviewerResults];
    const uniqueProjects = allProjects.reduce((acc, project) => {
      if (!acc.some(p => p.id === project.id)) {
        acc.push(project);
      }
      return acc;
    }, [] as typeof allProjects);

    // Convert numeric fields from strings to numbers
    return uniqueProjects.map(project => ({
      ...project,
      estimated_cost: parseFloat(project.estimated_cost)
    }));
  } catch (error) {
    console.error('Failed to fetch projects by user:', error);
    throw error;
  }
}

export async function getProjectById(id: number): Promise<Project | null> {
  try {
    const results = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const project = results[0];
    
    // Convert numeric fields from strings to numbers
    return {
      ...project,
      estimated_cost: parseFloat(project.estimated_cost)
    };
  } catch (error) {
    console.error('Failed to fetch project by ID:', error);
    throw error;
  }
}