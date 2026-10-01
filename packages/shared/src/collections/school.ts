import { f, OPTIONS, type CollectionDef } from './schema.js';

/**
 * School Life — classes, assignments, and grades.
 *
 * A grade can be logged two ways, and neither is the "real" one: directly on
 * an assignment once it's done (`assignments.gradeReceived`), or as its own
 * standalone `grades` row — for a report-card-style grade, or anything that
 * was never tracked as a to-do in the first place. `grades.assignmentId` is
 * how the two link up when someone wants both; the stats endpoint is what
 * reconciles them so nothing is counted twice (see `routes/stats.ts`).
 */

export const SUBJECT_CATEGORIES = [
  { value: 'math', label: 'Math' },
  { value: 'science', label: 'Science' },
  { value: 'english', label: 'English / Language Arts' },
  { value: 'socialStudies', label: 'Social Studies / History' },
  { value: 'worldLanguage', label: 'World Language' },
  { value: 'arts', label: 'Arts' },
  { value: 'music', label: 'Music' },
  { value: 'pe', label: 'Physical Education' },
  { value: 'tech', label: 'Technology / Computer Science' },
  { value: 'elective', label: 'Elective' },
  { value: 'other', label: 'Something else' },
] as const;

export interface GradeCategory {
  id: string;
  name: string;
  weight: number;
}

export const DEFAULT_GRADE_CATEGORIES: GradeCategory[] = [
  { id: 'tests', name: 'Tests', weight: 40 },
  { id: 'homework', name: 'Homework', weight: 30 },
  { id: 'quizzes', name: 'Quizzes', weight: 20 },
  { id: 'participation', name: 'Participation', weight: 10 },
];

export const classes: CollectionDef = {
  name: 'classes',
  label: 'Classes',
  singular: 'Class',
  icon: 'school',
  area: 'school',
  scope: 'system',
  memberScoped: true,
  audited: true,
  titleField: 'name',
  sortField: 'name',
  sortDir: 'asc',
  description: 'Every class, with as much grading detail as you want to track.',
  fields: [
    f.text('name', 'Class name', { required: true, inList: true, searchable: true }),
    f.text('teacher', 'Teacher', { inList: true, searchable: true }),
    f.ref('teacherContactId', 'Teacher contact', 'contacts', {
      hint: 'Optional — link a full contact for their email, phone or office hours.',
    }),
    f.text('room', 'Room', { inList: true }),
    f.text('period', 'Period', { inList: true, hint: 'Whatever your school calls it — "3rd period", "Block A".' }),
    f.text('schoolYear', 'School year', { inList: true, hint: 'e.g. 2026–2027.' }),
    f.text('term', 'Term', { hint: 'Semester, trimester, quarter — whatever your school uses.' }),
    f.text('subject', 'Subject', { inList: true, searchable: true, hint: 'e.g. AP Chemistry.' }),
    f.enumOf('subjectCategory', 'Subject area', SUBJECT_CATEGORIES, { inList: true }),
    f.color('color', 'Colour'),
    f.text('icon', 'Symbol', { maxLength: 8, hint: 'A short glyph or emoji.' }),
    f.real('credits', 'Credits', { min: 0, hint: 'Used to weight this class in your GPA.' }),
    f.int('difficulty', 'Difficulty', { min: 1, max: 5, stars: true }),
    f.json('meetingDays', 'Meets on', { defaultValue: [], hint: 'Which days of the week.' }),
    f.time('startTime', 'Starts'),
    f.time('endTime', 'Ends'),
    f.json('gradeCategories', 'Grading categories', {
      defaultValue: DEFAULT_GRADE_CATEGORIES,
      hint: 'Your own weighted categories — edit, rename or remove to match how this class is actually graded.',
    }),
    f.long('notes', 'Notes', { searchable: true }),
    f.tags('tags', 'Tags'),
    f.bool('archived', 'Archived'),
  ],
};

export const ASSIGNMENT_TYPES = [
  { value: 'homework', label: 'Homework' },
  { value: 'worksheet', label: 'Worksheet' },
  { value: 'essay', label: 'Essay' },
  { value: 'project', label: 'Project' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'test', label: 'Test' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'lab', label: 'Lab' },
  { value: 'reading', label: 'Reading' },
  { value: 'research', label: 'Research' },
  { value: 'practice', label: 'Practice' },
  { value: 'discussion', label: 'Discussion' },
  { value: 'classwork', label: 'Classwork' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Something else' },
] as const;

export const ASSIGNMENT_STATUSES = [
  { value: 'notStarted', label: 'Not started', color: '#6b7fa8' },
  { value: 'inProgress', label: 'In progress', color: '#7aa2f7' },
  { value: 'completed', label: 'Completed', color: '#5ec6a8' },
  { value: 'submitted', label: 'Submitted', color: '#5ec6a8' },
  { value: 'late', label: 'Late', color: '#f0a05a' },
  { value: 'missing', label: 'Missing', color: '#e06c93' },
] as const;

export const assignments: CollectionDef = {
  name: 'assignments',
  label: 'Assignments',
  singular: 'Assignment',
  icon: 'task',
  area: 'school',
  scope: 'system',
  memberScoped: true,
  titleField: 'name',
  sortField: 'dueAt',
  sortDir: 'asc',
  indexes: [
    ['systemId', 'status', 'dueAt'],
    ['systemId', 'classId'],
  ],
  fields: [
    f.text('name', 'Assignment', { required: true, inList: true, searchable: true }),
    f.ref('classId', 'Class', 'classes', { required: true, inList: true }),
    f.long('description', 'Description', { searchable: true }),
    f.datetime('dueAt', 'Due', { required: true, inList: true }),
    f.enumOf('type', 'Type', ASSIGNMENT_TYPES, { defaultValue: 'homework', inList: true }),
    f.int('estimatedMinutes', 'Estimated time', { min: 0, hint: 'Minutes.' }),
    f.int('difficulty', 'Difficulty', { min: 1, max: 5, stars: true }),
    f.enumOf('status', 'Status', ASSIGNMENT_STATUSES, { defaultValue: 'notStarted', inList: true }),
    f.real('gradeReceived', 'Grade received', { min: 0, hint: 'Points, or a percentage if you leave max points blank.' }),
    f.real('maxPoints', 'Max points', { min: 0 }),
    f.text('gradeCategory', 'Grading category', { inList: true, hint: "Match one of this class's grading categories." }),
    f.refs('attachmentIds', 'Attachments', 'mediaItems'),
    f.long('notes', 'Notes', { searchable: true }),
    f.tags('tags', 'Tags'),
    f.enumOf('priority', 'Priority', OPTIONS.priority, { defaultValue: 'normal', inList: true }),
    f.ref('completedByMemberId', 'Completed by', 'members', {
      hint: 'When different from whoever this is assigned to.',
    }),
    f.datetime('remindAt', 'Reminder'),
    f.bool('remindSent', 'Reminder sent'),
  ],
};

export const grades: CollectionDef = {
  name: 'grades',
  label: 'Grades',
  singular: 'Grade',
  icon: 'star',
  area: 'school',
  scope: 'system',
  memberScoped: true,
  titleField: 'label',
  sortField: 'gradedAt',
  sortDir: 'desc',
  description: 'A grade logged on its own — not every grade started as a tracked assignment.',
  fields: [
    f.ref('classId', 'Class', 'classes', { required: true, inList: true }),
    f.ref('assignmentId', 'Assignment', 'assignments', {
      hint: 'Optional — link this back to a tracked assignment if it corresponds to one.',
    }),
    f.text('label', 'What was this for', { required: true, inList: true, searchable: true, hint: 'e.g. "Unit 3 test", "Participation — week 4".' }),
    f.text('category', 'Grading category', { inList: true, hint: "Match one of this class's grading categories." }),
    f.real('pointsEarned', 'Points earned', { required: true, min: 0 }),
    f.real('maxPoints', 'Max points', { min: 0, hint: 'Leave blank if "points earned" is already a percentage.' }),
    f.date('gradedAt', 'Date', { required: true, inList: true }),
    f.long('notes', 'Notes', { searchable: true }),
  ],
};

export const SCHOOL_COLLECTIONS = [classes, assignments, grades] as const;
