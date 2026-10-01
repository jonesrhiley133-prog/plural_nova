import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, registerUser, type TestClient } from './harness.js';

/**
 * School Life's grade math has two sharp edges worth locking down with a
 * test rather than trusting by reading: a grade logged on its own can link
 * back to an assignment that already has its own `gradeReceived`, and the two
 * must never both count; and every number here has to stay scoped to one
 * alter when asked, the same as every other member-scoped collection.
 */
describe('school stats: grades, GPA, and member scope', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = await createTestApp();
  });
  afterAll(() => client.close());
  beforeEach(() => client.resetLimits());

  it('weights categories, folds in a linked grade instead of double-counting, and maps the result through the grading scale', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    const cls = await client.request('POST', '/api/records/classes', {
      ...headers,
      body: {
        name: 'Chemistry',
        credits: 1,
        gradeCategories: [
          { id: 'tests', name: 'Tests', weight: 50 },
          { id: 'hw', name: 'Homework', weight: 50 },
        ],
      },
    });
    const classId = cls.body.data.id;

    const testAssignment = await client.request('POST', '/api/records/assignments', {
      ...headers,
      body: {
        name: 'Unit 1 test',
        classId,
        dueAt: new Date().toISOString(),
        type: 'test',
        gradeCategory: 'tests',
        gradeReceived: 90,
        maxPoints: 100,
        status: 'completed',
      },
    });
    await client.request('POST', '/api/records/assignments', {
      ...headers,
      body: {
        name: 'Homework 1',
        classId,
        dueAt: new Date().toISOString(),
        gradeCategory: 'hw',
        gradeReceived: 70,
        maxPoints: 100,
        status: 'completed',
      },
    });

    // A standalone grade that links back to the test assignment above — its
    // 95 should replace that assignment's own 90 in the weighted average,
    // not add a second data point for the "tests" category.
    await client.request('POST', '/api/records/grades', {
      ...headers,
      body: {
        classId,
        assignmentId: testAssignment.body.data.id,
        label: 'Unit 1 test (corrected)',
        category: 'tests',
        pointsEarned: 95,
        maxPoints: 100,
        gradedAt: new Date().toISOString(),
      },
    });

    const stats = await client.request('GET', '/api/stats/school', headers);
    expect(stats.status).toBe(200);

    const [byClass] = stats.body.data.byClass;
    // (95 * 50 + 70 * 50) / 100 = 82.5 — not 81.25, which is what averaging
    // 90 and 95 together for "tests" before weighting would have produced.
    expect(byClass.currentPercentage).toBe(82.5);
    expect(byClass.gradedCount).toBe(2);
    expect(byClass.letter).toBe('B');
    expect(byClass.gpaPoints).toBe(3);

    expect(stats.body.data.gpa).toBe(3);
    expect(stats.body.data.averagePercentage).toBe(82.5);
    expect(stats.body.data.completion.completed).toBe(2);
    expect(stats.body.data.completion.total).toBe(2);
  });

  it('matches a category by its visible name, not just its internal id', async () => {
    // The assignment form's grading-category field is free text — nothing
    // on it can offer a class's own category ids as options, since those
    // live inside a different record's JSON field. A person fills it in
    // with what they read on screen ("Tests"), not the id behind it
    // ("tests"), and that has to count the same as typing the id itself.
    const account = await registerUser(client);
    const headers = { token: account.token };

    const cls = await client.request('POST', '/api/records/classes', {
      ...headers,
      body: {
        name: 'History',
        gradeCategories: [{ id: 'tests', name: 'Tests', weight: 100 }],
      },
    });
    const classId = cls.body.data.id;

    await client.request('POST', '/api/records/assignments', {
      ...headers,
      body: {
        name: 'Midterm',
        classId,
        dueAt: new Date().toISOString(),
        gradeCategory: ' Tests ',
        gradeReceived: 88,
        maxPoints: 100,
        status: 'completed',
      },
    });

    const stats = await client.request('GET', '/api/stats/school', headers);
    const [byClass] = stats.body.data.byClass;
    expect(byClass.categories[0].count).toBe(1);
    expect(byClass.categories[0].average).toBe(88);
    expect(byClass.currentPercentage).toBe(88);
  });

  it('keeps two alters\' classes and grades completely separate', async () => {
    const account = await registerUser(client);
    const headers = { token: account.token };

    const ash = await client.request('POST', '/api/records/members', { ...headers, body: { name: 'Ash' } });
    const river = await client.request('POST', '/api/records/members', { ...headers, body: { name: 'River' } });
    const ashId = ash.body.data.id;
    const riverId = river.body.data.id;

    const ashClass = await client.request('POST', '/api/records/classes', {
      ...headers,
      body: { name: 'Ash\'s Algebra', memberId: ashId },
    });
    await client.request('POST', '/api/records/grades', {
      ...headers,
      body: {
        classId: ashClass.body.data.id,
        memberId: ashId,
        label: 'Quiz',
        pointsEarned: 88,
        maxPoints: 100,
        gradedAt: new Date().toISOString(),
      },
    });

    const riverClass = await client.request('POST', '/api/records/classes', {
      ...headers,
      body: { name: 'River\'s Biology', memberId: riverId },
    });
    await client.request('POST', '/api/records/grades', {
      ...headers,
      body: {
        classId: riverClass.body.data.id,
        memberId: riverId,
        label: 'Quiz',
        pointsEarned: 60,
        maxPoints: 100,
        gradedAt: new Date().toISOString(),
      },
    });

    const ashStats = await client.request('GET', `/api/stats/school?memberId=${ashId}`, headers);
    expect(ashStats.body.data.byClass).toHaveLength(1);
    expect(ashStats.body.data.byClass[0].name).toBe('Ash\'s Algebra');
    expect(ashStats.body.data.averagePercentage).toBe(88);

    const riverStats = await client.request('GET', `/api/stats/school?memberId=${riverId}`, headers);
    expect(riverStats.body.data.byClass).toHaveLength(1);
    expect(riverStats.body.data.byClass[0].name).toBe('River\'s Biology');
    expect(riverStats.body.data.averagePercentage).toBe(60);

    const wholeSystem = await client.request('GET', '/api/stats/school', headers);
    expect(wholeSystem.body.data.byClass).toHaveLength(2);
  });
});
