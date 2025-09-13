import { db } from '../db';
import { projectsTable, projectReviewersTable, projectHistoryTable, reviewsTable } from '../db/schema';
import { type CreateProjectInput, type Project } from '../schema';

export async function createProject(input: CreateProjectInput): Promise<Project> {
  try {
    // Create the project with status 'draft'
    const projectResult = await db.insert(projectsTable)
      .values({
        name: input.name,
        description: input.description,
        objective: input.objective,
        estimated_cost: input.estimated_cost.toString(), // Convert number to string for numeric column
        target_time: input.target_time,
        status: 'draft',
        proposer_id: input.proposer_id
      })
      .returning()
      .execute();

    const project = projectResult[0];
    
    // Assign selected reviewers to the project
    if (input.reviewer_ids.length > 0) {
      await db.insert(projectReviewersTable)
        .values(
          input.reviewer_ids.map(reviewer_id => ({
            project_id: project.id,
            reviewer_id
          }))
        )
        .execute();
    }

    // Create initial project history entry
    await db.insert(projectHistoryTable)
      .values({
        project_id: project.id,
        user_id: input.proposer_id,
        action: 'project_created',
        details: `Project "${input.name}" was created`
      })
      .execute();

    // Create review records for each assigned reviewer
    if (input.reviewer_ids.length > 0) {
      await db.insert(reviewsTable)
        .values(
          input.reviewer_ids.map(reviewer_id => ({
            project_id: project.id,
            reviewer_id
          }))
        )
        .execute();
    }

    // Convert numeric fields back to numbers before returning
    return {
      ...project,
      estimated_cost: parseFloat(project.estimated_cost) // Convert string back to number
    };
  } catch (error) {
    console.error('Project creation failed:', error);
    throw error;
  }
}