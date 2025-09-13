import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, projectsTable, reviewsTable } from '../db/schema';
import { type CreateUserInput, type CreateProjectInput, type CreateReviewInput } from '../schema';
import { getReviewsByProject, getReviewsByReviewer, getReviewById } from '../handlers/get_reviews';

// Test data
const testUsers: CreateUserInput[] = [
  {
    email: 'proposer@test.com',
    name: 'Test Proposer',
    role: 'project_proposer',
    is_active: true
  },
  {
    email: 'reviewer1@test.com',
    name: 'Reviewer One',
    role: 'reviewer',
    is_active: true
  },
  {
    email: 'reviewer2@test.com',
    name: 'Reviewer Two',
    role: 'reviewer',
    is_active: true
  }
];

describe('getReviews handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getReviewsByProject', () => {
    it('should fetch all reviews for a project', async () => {
      // Create test users
      const userResults = await db.insert(usersTable)
        .values(testUsers)
        .returning()
        .execute();

      const [proposer, reviewer1, reviewer2] = userResults;

      // Create test project
      const projectResults = await db.insert(projectsTable)
        .values({
          name: 'Test Project',
          description: 'A test project',
          objective: 'Testing reviews',
          estimated_cost: '50000.00',
          target_time: '6 months',
          proposer_id: proposer.id
        })
        .returning()
        .execute();

      const project = projectResults[0];

      // Create test reviews
      const reviewData = [
        {
          project_id: project.id,
          reviewer_id: reviewer1.id,
          decision: 'approve' as const,
          justification: 'Good project',
          risk_identification: 'Low risk identified',
          risk_assessment: 'low' as const,
          risk_mitigation: 'Standard mitigation',
          comments: 'Looks good to me',
          submitted_at: new Date()
        },
        {
          project_id: project.id,
          reviewer_id: reviewer2.id,
          decision: null,
          justification: null,
          risk_identification: null,
          risk_assessment: null,
          risk_mitigation: null,
          comments: null,
          submitted_at: null
        }
      ];

      await db.insert(reviewsTable)
        .values(reviewData)
        .execute();

      // Test the handler
      const reviews = await getReviewsByProject(project.id);

      expect(reviews).toHaveLength(2);
      
      // Check submitted review
      const submittedReview = reviews.find(r => r.decision === 'approve');
      expect(submittedReview).toBeDefined();
      expect(submittedReview!.project_id).toEqual(project.id);
      expect(submittedReview!.reviewer_id).toEqual(reviewer1.id);
      expect(submittedReview!.justification).toEqual('Good project');
      expect(submittedReview!.submitted_at).toBeInstanceOf(Date);

      // Check draft review
      const draftReview = reviews.find(r => r.decision === null);
      expect(draftReview).toBeDefined();
      expect(draftReview!.project_id).toEqual(project.id);
      expect(draftReview!.reviewer_id).toEqual(reviewer2.id);
      expect(draftReview!.submitted_at).toBeNull();
    });

    it('should return empty array for project with no reviews', async () => {
      // Create test user
      const userResults = await db.insert(usersTable)
        .values([testUsers[0]])
        .returning()
        .execute();

      const proposer = userResults[0];

      // Create test project without reviews
      const projectResults = await db.insert(projectsTable)
        .values({
          name: 'Empty Project',
          description: 'Project with no reviews',
          objective: 'Testing empty case',
          estimated_cost: '25000.00',
          target_time: '3 months',
          proposer_id: proposer.id
        })
        .returning()
        .execute();

      const project = projectResults[0];

      const reviews = await getReviewsByProject(project.id);

      expect(reviews).toHaveLength(0);
      expect(Array.isArray(reviews)).toBe(true);
    });
  });

  describe('getReviewsByReviewer', () => {
    it('should fetch all reviews assigned to a reviewer', async () => {
      // Create test users
      const userResults = await db.insert(usersTable)
        .values(testUsers)
        .returning()
        .execute();

      const [proposer, reviewer1, reviewer2] = userResults;

      // Create test projects
      const projectResults = await db.insert(projectsTable)
        .values([
          {
            name: 'Project One',
            description: 'First project',
            objective: 'First objective',
            estimated_cost: '30000.00',
            target_time: '4 months',
            proposer_id: proposer.id
          },
          {
            name: 'Project Two',
            description: 'Second project',
            objective: 'Second objective',
            estimated_cost: '40000.00',
            target_time: '5 months',
            proposer_id: proposer.id
          }
        ])
        .returning()
        .execute();

      const [project1, project2] = projectResults;

      // Create reviews for reviewer1
      const reviewData = [
        {
          project_id: project1.id,
          reviewer_id: reviewer1.id,
          decision: 'approve' as const,
          justification: 'Approved project 1',
          risk_identification: 'Low risk',
          risk_assessment: 'low' as const,
          risk_mitigation: 'Standard approach',
          comments: 'Good project',
          submitted_at: new Date()
        },
        {
          project_id: project2.id,
          reviewer_id: reviewer1.id,
          decision: null,
          justification: null,
          risk_identification: null,
          risk_assessment: null,
          risk_mitigation: null,
          comments: null,
          submitted_at: null
        }
      ];

      await db.insert(reviewsTable)
        .values(reviewData)
        .execute();

      // Test the handler
      const reviews = await getReviewsByReviewer(reviewer1.id);

      expect(reviews).toHaveLength(2);

      // Check that all reviews belong to the correct reviewer
      reviews.forEach(review => {
        expect(review.reviewer_id).toEqual(reviewer1.id);
      });

      // Check review details
      const approvedReview = reviews.find(r => r.decision === 'approve');
      expect(approvedReview).toBeDefined();
      expect(approvedReview!.project_id).toEqual(project1.id);
      expect(approvedReview!.submitted_at).toBeInstanceOf(Date);

      const draftReview = reviews.find(r => r.decision === null);
      expect(draftReview).toBeDefined();
      expect(draftReview!.project_id).toEqual(project2.id);
      expect(draftReview!.submitted_at).toBeNull();
    });

    it('should return empty array for reviewer with no reviews', async () => {
      // Create test user
      const userResults = await db.insert(usersTable)
        .values([testUsers[1]])
        .returning()
        .execute();

      const reviewer = userResults[0];

      const reviews = await getReviewsByReviewer(reviewer.id);

      expect(reviews).toHaveLength(0);
      expect(Array.isArray(reviews)).toBe(true);
    });
  });

  describe('getReviewById', () => {
    it('should fetch a review by its ID', async () => {
      // Create test users
      const userResults = await db.insert(usersTable)
        .values(testUsers.slice(0, 2))
        .returning()
        .execute();

      const [proposer, reviewer] = userResults;

      // Create test project
      const projectResults = await db.insert(projectsTable)
        .values({
          name: 'Single Review Project',
          description: 'Project for single review test',
          objective: 'Testing single review fetch',
          estimated_cost: '35000.00',
          target_time: '4 months',
          proposer_id: proposer.id
        })
        .returning()
        .execute();

      const project = projectResults[0];

      // Create test review
      const reviewResults = await db.insert(reviewsTable)
        .values({
          project_id: project.id,
          reviewer_id: reviewer.id,
          decision: 'return',
          justification: 'Needs more information',
          risk_identification: 'Medium risk identified',
          risk_assessment: 'medium',
          risk_mitigation: 'Additional documentation required',
          comments: 'Please provide more details',
          submitted_at: new Date()
        })
        .returning()
        .execute();

      const createdReview = reviewResults[0];

      // Test the handler
      const review = await getReviewById(createdReview.id);

      expect(review).toBeDefined();
      expect(review!.id).toEqual(createdReview.id);
      expect(review!.project_id).toEqual(project.id);
      expect(review!.reviewer_id).toEqual(reviewer.id);
      expect(review!.decision).toEqual('return');
      expect(review!.justification).toEqual('Needs more information');
      expect(review!.risk_identification).toEqual('Medium risk identified');
      expect(review!.risk_assessment).toEqual('medium');
      expect(review!.risk_mitigation).toEqual('Additional documentation required');
      expect(review!.comments).toEqual('Please provide more details');
      expect(review!.submitted_at).toBeInstanceOf(Date);
      expect(review!.created_at).toBeInstanceOf(Date);
      expect(review!.updated_at).toBeInstanceOf(Date);
    });

    it('should return null for non-existent review ID', async () => {
      const review = await getReviewById(99999);

      expect(review).toBeNull();
    });

    it('should handle draft review (null fields) correctly', async () => {
      // Create test users
      const userResults = await db.insert(usersTable)
        .values(testUsers.slice(0, 2))
        .returning()
        .execute();

      const [proposer, reviewer] = userResults;

      // Create test project
      const projectResults = await db.insert(projectsTable)
        .values({
          name: 'Draft Review Project',
          description: 'Project for draft review test',
          objective: 'Testing draft review fetch',
          estimated_cost: '20000.00',
          target_time: '2 months',
          proposer_id: proposer.id
        })
        .returning()
        .execute();

      const project = projectResults[0];

      // Create draft review
      const reviewResults = await db.insert(reviewsTable)
        .values({
          project_id: project.id,
          reviewer_id: reviewer.id,
          decision: null,
          justification: null,
          risk_identification: null,
          risk_assessment: null,
          risk_mitigation: null,
          comments: null,
          submitted_at: null
        })
        .returning()
        .execute();

      const createdReview = reviewResults[0];

      // Test the handler
      const review = await getReviewById(createdReview.id);

      expect(review).toBeDefined();
      expect(review!.id).toEqual(createdReview.id);
      expect(review!.project_id).toEqual(project.id);
      expect(review!.reviewer_id).toEqual(reviewer.id);
      expect(review!.decision).toBeNull();
      expect(review!.justification).toBeNull();
      expect(review!.risk_identification).toBeNull();
      expect(review!.risk_assessment).toBeNull();
      expect(review!.risk_mitigation).toBeNull();
      expect(review!.comments).toBeNull();
      expect(review!.submitted_at).toBeNull();
      expect(review!.created_at).toBeInstanceOf(Date);
      expect(review!.updated_at).toBeInstanceOf(Date);
    });
  });
});