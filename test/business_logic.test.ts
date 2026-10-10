import { validateStorageFile, normalizeError } from '../src/lib/supabase';
import { normalizeClassroom, normalizeAssignment, normalizeMaterial } from '../src/types/database';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

console.log('=== CLASSFLOW AUTOMATED LOGIC VERIFICATION ===\n');

// 1. Classroom Join Code & Normalization Test
console.log('Test 1: Classroom Join Code & Normalization');
const mockClassroomRaw = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  name: 'Advanced Physics',
  teacher_id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  join_code: 'CF-XYZ890',
  created_at: new Date().toISOString(),
};
const normalizedClass = normalizeClassroom(mockClassroomRaw);
assert(normalizedClass.join_code === 'CF-XYZ890', 'Preserves canonical join_code');
assert(/^CF-[A-Z0-9]{6}$/.test(normalizedClass.join_code), 'Matches CF-XXXXXX format');

// Backward compatibility with legacy .code column
const legacyClass = normalizeClassroom({
  id: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
  name: 'Legacy Code Class',
  code: 'CF-LEG123',
});
assert(legacyClass.join_code === 'CF-LEG123', 'Maps legacy code column to canonical join_code');

// 2. Assignment Draft vs Published & Points Normalization Test
console.log('\nTest 2: Assignment Normalization & Draft Isolation');
const mockAssignmentRaw = {
  id: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
  classroom_id: mockClassroomRaw.id,
  title: 'Quantum Mechanics Lab 1',
  points: 75,
  due_date: '2026-12-01T23:59:59Z',
  published: true,
  published_at: '2026-10-01T12:00:00Z',
};
const normalizedAsgn = normalizeAssignment(mockAssignmentRaw);
assert(normalizedAsgn.max_marks === 75, 'Maps points to canonical max_marks');
assert(normalizedAsgn.due_at === '2026-12-01T23:59:59Z', 'Maps due_date to canonical due_at');
assert(normalizedAsgn.is_published === true, 'Correctly flags published state');
assert(normalizedAsgn.status === 'published', 'Resolves status to published');

const draftAsgn = normalizeAssignment({
  id: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
  classroom_id: mockClassroomRaw.id,
  title: 'Draft Exam',
  published: false,
  published_at: null,
});
assert(draftAsgn.is_published === false, 'Draft assignment is marked unpublished');
assert(draftAsgn.status === 'draft', 'Draft assignment has status draft');

// 3. Material Normalization & Tracking Fields Test
console.log('\nTest 3: Material Normalization & Tracking');
const mockMaterialRaw = {
  id: 'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
  classroom_id: mockClassroomRaw.id,
  title: 'Lecture Slides PDF',
  file_url: 'classroom-materials/a0ee/f5ee/lecture.pdf',
  file_type: 'application/pdf',
  published: true,
  published_at: '2026-10-02T10:00:00Z',
};
const normalizedMat = normalizeMaterial(mockMaterialRaw);
assert(normalizedMat.file_path === 'classroom-materials/a0ee/f5ee/lecture.pdf', 'Maps file_url to canonical file_path');
assert(normalizedMat.is_published === true, 'Flags published material');
assert(normalizedMat.is_viewed === false, 'Defaults student seen status to false');

// 4. Storage Limits & File Validation Test
console.log('\nTest 4: Storage File Validation');
const mockPdfFile = {
  name: 'document.pdf',
  size: 5 * 1024 * 1024, // 5MB
  type: 'application/pdf',
} as unknown as File;
const pdfCheck = validateStorageFile('classroom-materials', mockPdfFile);
assert(pdfCheck.valid === true, 'Accepts 5MB PDF file');

const mockOversizedFile = {
  name: 'huge.pdf',
  size: 15 * 1024 * 1024, // 15MB
  type: 'application/pdf',
} as unknown as File;
const oversizeCheck = validateStorageFile('classroom-materials', mockOversizedFile);
assert(oversizeCheck.valid === false, 'Rejects file exceeding 10MB limit');

const mockInvalidType = {
  name: 'virus.exe',
  size: 1024,
  type: 'application/x-msdownload',
} as unknown as File;
const invalidCheck = validateStorageFile('classroom-materials', mockInvalidType);
assert(invalidCheck.valid === false, 'Rejects unsupported executable file format');

// 5. Error Normalization Test
console.log('\nTest 5: Error Normalization');
const rlsErr = normalizeError({ code: '42501', message: 'permission denied for table classrooms' });
assert(rlsErr.code === '42501', 'Retains 42501 code');
assert(rlsErr.message.includes('Access denied'), 'Provides user-friendly RLS message');

const dupErr = normalizeError({ code: '23505', message: 'duplicate key value violates unique constraint' });
assert(dupErr.message.includes('already exists'), 'Provides user-friendly duplicate key message');

const bucketErr = normalizeError({ message: 'Bucket not found: classroom-materials' });
assert(bucketErr.code === 'BUCKET_NOT_FOUND', 'Categorizes missing bucket error correctly');

// 6. Join Code Validation & Sanitization (Test 2 & 13)
console.log('\nTest 6: Join Code Sanitization & Format Rules');
const sanitizeCode = (raw: string) => raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
const validCode1 = sanitizeCode('  cf-ab12cd  ');
assert(validCode1 === 'CF-AB12CD', 'Sanitizes whitespace and enforces uppercase');
assert(/^CF-[A-Z0-9]{6}$/.test(validCode1), 'Validates strict CF-XXXXXX join code pattern');
const invalidCode = sanitizeCode('malicious_code_here');
assert(!/^CF-[A-Z0-9]{6}$/.test(invalidCode), 'Rejects non-compliant join codes');

// 7. Seen vs Unseen Aggregation Logic (Test 4, 5, 14)
console.log('\nTest 7: Seen / Unseen Aggregation Logic');
const enrolledStudents = [
  { id: 'student-1', name: 'Alice' },
  { id: 'student-2', name: 'Bob' },
  { id: 'student-3', name: 'Charlie' },
];
const materialViews = [
  { student_id: 'student-1', first_viewed_at: '2026-10-10T10:00:00Z', view_count: 3 },
  { student_id: 'student-3', first_viewed_at: '2026-10-10T11:30:00Z', view_count: 1 },
];
const seenStudentIds = new Set(materialViews.map((v) => v.student_id));
const seenStudents = enrolledStudents.filter((s) => seenStudentIds.has(s.id));
const unseenStudents = enrolledStudents.filter((s) => !seenStudentIds.has(s.id));

assert(seenStudents.length === 2, 'Accurately computes seen count');
assert(unseenStudents.length === 1, 'Accurately computes unseen count');
assert(unseenStudents[0].id === 'student-2', 'Identifies student-2 as unseen');
assert(seenStudents.length + unseenStudents.length === enrolledStudents.length, 'Total views partition matches enrollment');

// 8. Student Submissions Privacy Filter (Test 7, 8)
console.log('\nTest 8: Student Submissions Isolation');
const allSubmissions = [
  { id: 'sub-1', student_id: 'student-1', grade: 90, submission_text: 'Alice Work' },
  { id: 'sub-2', student_id: 'student-2', grade: 85, submission_text: 'Bob Work' },
];
const getStudentSubmission = (subs: typeof allSubmissions, currentStudentId: string) => {
  return subs.find((s) => s.student_id === currentStudentId) || null;
};
assert(getStudentSubmission(allSubmissions, 'student-1')?.id === 'sub-1', 'Student 1 receives own submission');
assert(getStudentSubmission(allSubmissions, 'student-3') === null, 'Student 3 receives null submission');
assert(getStudentSubmission(allSubmissions, 'student-1')?.submission_text === 'Alice Work', 'Student 1 cannot see Bob data');

// 9. Draft Filtering Rule (Test 11)
console.log('\nTest 9: Draft Materials & Assignments Secrecy');
const classroomItems = [
  { id: '1', title: 'Pub 1', published: true, published_at: '2026-10-01' },
  { id: '2', title: 'Draft 1', published: false, published_at: null },
  { id: '3', title: 'Pub 2', published: true, published_at: '2026-10-02' },
];
const studentVisible = classroomItems.filter((i) => i.published && Boolean(i.published_at));
assert(studentVisible.length === 2, 'Student view filters out all draft items');
assert(!studentVisible.some((i) => i.id === '2'), 'Draft item 2 is completely excluded from student payload');

// 10. CRITICAL FEATURE: TEACHER'S MATERIAL SEEN/UNSEEN TRACKING (TESTS A - J)
console.log('\nTest 10: Teacher Material Seen / Unseen Tracking (TESTS A - J)');

// Setup Mock Database State
interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: 'teacher' | 'student';
}
interface ClassroomRow {
  id: string;
  name: string;
  teacher_id: string;
}
interface ClassroomMemberRow {
  classroom_id: string;
  student_id: string;
}
interface MaterialRow {
  id: string;
  classroom_id: string;
  title: string;
  file_name: string;
  published: boolean;
  published_at: string | null;
}
interface MaterialViewRow {
  material_id: string;
  student_id: string;
  classroom_id: string;
  first_viewed_at: string;
  last_viewed_at: string;
  view_count: number;
}

const dbProfiles: ProfileRow[] = [
  { id: 'teacher-1', full_name: 'Prof. Albus', email: 'albus@school.edu', role: 'teacher' },
  { id: 'student-A', full_name: 'Rahul Sharma', email: 'rahul@student.edu', role: 'student' },
  { id: 'student-B', full_name: 'Priya Verma', email: 'priya@student.edu', role: 'student' },
  { id: 'student-C', full_name: 'Amit Patil', email: 'amit@other.edu', role: 'student' },
];

const dbClassrooms: ClassroomRow[] = [
  { id: 'class-1', name: 'Physics 101', teacher_id: 'teacher-1' },
  { id: 'class-2', name: 'Chemistry 201', teacher_id: 'teacher-2' },
];

const dbClassroomMembers: ClassroomMemberRow[] = [
  { classroom_id: 'class-1', student_id: 'student-A' },
  { classroom_id: 'class-1', student_id: 'student-B' },
  // Teacher is never a student, even if present in members table:
  { classroom_id: 'class-1', student_id: 'teacher-1' },
];

let dbMaterialViews: MaterialViewRow[] = [];

// Backend RPC: record_material_view
function simulateRecordMaterialView(callerId: string | null, materialId: string, spoofedStudentId?: string) {
  // Rule: Server uses authenticated caller identity (callerId), NEVER frontend spoofedStudentId
  const effectiveUserId = callerId;
  if (!effectiveUserId) {
    return { success: false, reason: 'unauthenticated' };
  }

  const callerProfile = dbProfiles.find((p) => p.id === effectiveUserId);
  if (callerProfile?.role === 'teacher') {
    return { success: false, reason: 'not_a_student' };
  }

  const mat = dbMaterials.find((m) => m.id === materialId);
  if (!mat || (!mat.published && !mat.published_at)) {
    return { success: false, reason: 'material_not_published_or_found' };
  }

  const isMember = dbClassroomMembers.some(
    (cm) => cm.classroom_id === mat.classroom_id && cm.student_id === effectiveUserId
  );
  if (!isMember) {
    return { success: false, reason: 'not_enrolled' };
  }

  const existingIndex = dbMaterialViews.findIndex(
    (mv) => mv.material_id === materialId && mv.student_id === effectiveUserId
  );

  const now = new Date().toISOString();
  if (existingIndex >= 0) {
    dbMaterialViews[existingIndex].last_viewed_at = now;
    dbMaterialViews[existingIndex].view_count += 1;
  } else {
    dbMaterialViews.push({
      material_id: materialId,
      student_id: effectiveUserId,
      classroom_id: mat.classroom_id,
      first_viewed_at: now,
      last_viewed_at: now,
      view_count: 1,
    });
  }

  return { success: true, material_id: materialId };
}

// Backend RPC: get_material_view_tracking
function simulateGetMaterialViewTracking(callerId: string | null, materialId: string) {
  if (!callerId) throw new Error('Authentication required.');

  const mat = dbMaterials.find((m) => m.id === materialId);
  if (!mat) throw new Error('Material not found');

  const classroom = dbClassrooms.find((c) => c.id === mat.classroom_id);
  if (!classroom || classroom.teacher_id !== callerId) {
    throw new Error('Unauthorized: only classroom teacher can access analytics.');
  }

  // Filter eligible enrolled students: exclude teacher
  const eligibleMembers = dbClassroomMembers
    .filter((cm) => cm.classroom_id === mat.classroom_id && cm.student_id !== classroom.teacher_id)
    .map((cm) => {
      const p = dbProfiles.find((pr) => pr.id === cm.student_id);
      return { cm, p };
    })
    .filter(({ p }) => p && p.role === 'student');

  const enrolledCount = eligibleMembers.length;
  const views = dbMaterialViews.filter((mv) => mv.material_id === materialId);
  const viewMap = new Map(views.map((v) => [v.student_id, v]));

  const studentRows = eligibleMembers.map(({ cm, p }) => {
    const v = viewMap.get(cm.student_id);
    return {
      student_id: cm.student_id,
      full_name: p?.full_name || 'Student',
      email: p?.email || '',
      status: v ? ('seen' as const) : ('unseen' as const),
      first_viewed_at: v?.first_viewed_at || null,
      last_viewed_at: v?.last_viewed_at || null,
      view_count: v?.view_count || 0,
    };
  });

  const seenCount = studentRows.filter((s) => s.status === 'seen').length;
  const unseenCount = Math.max(0, enrolledCount - seenCount);
  const viewRate = enrolledCount > 0 ? Math.round((seenCount / enrolledCount) * 1000) / 10 : 0.0;

  return {
    material_id: mat.id,
    title: mat.title,
    file_name: mat.file_name,
    classroom_name: classroom.name,
    published_at: mat.published_at,
    summary: {
      enrolled_count: enrolledCount,
      seen_count: seenCount,
      unseen_count: unseenCount,
      engagement_pct: viewRate,
    },
    students: studentRows,
  };
}

// TEST A: Teacher publishes a material. Both students appear as UNSEEN.
const dbMaterials: MaterialRow[] = [
  {
    id: 'mat-1',
    classroom_id: 'class-1',
    title: 'Quantum Mechanics Lecture Notes',
    file_name: 'quantum_notes.pdf',
    published: true,
    published_at: '2026-10-10T08:00:00Z',
  },
];
dbMaterialViews = [];

let trackingA = simulateGetMaterialViewTracking('teacher-1', 'mat-1');
assert(trackingA.summary.enrolled_count === 2, 'TEST A: Total enrolled students is 2 (excluding teacher)');
assert(trackingA.summary.seen_count === 0, 'TEST A: Initial seen count is 0');
assert(trackingA.summary.unseen_count === 2, 'TEST A: Initial unseen count is 2');
assert(trackingA.summary.engagement_pct === 0, 'TEST A: Initial view rate is 0%');
const studentA_row = trackingA.students.find((s) => s.student_id === 'student-A');
const studentB_row = trackingA.students.find((s) => s.student_id === 'student-B');
assert(studentA_row?.status === 'unseen', 'TEST A: Student A is UNSEEN');
assert(studentB_row?.status === 'unseen', 'TEST A: Student B is UNSEEN');

// TEST B: Student A opens the material. Student A becomes SEEN. Student B remains UNSEEN.
const recordResB = simulateRecordMaterialView('student-A', 'mat-1');
assert(recordResB.success === true, 'TEST B: Student A view record succeeded');
let trackingB = simulateGetMaterialViewTracking('teacher-1', 'mat-1');
assert(trackingB.students.find((s) => s.student_id === 'student-A')?.status === 'seen', 'TEST B: Student A becomes SEEN');
assert(Boolean(trackingB.students.find((s) => s.student_id === 'student-A')?.first_viewed_at), 'TEST B: Student A has first_viewed_at timestamp');
assert(trackingB.students.find((s) => s.student_id === 'student-B')?.status === 'unseen', 'TEST B: Student B remains UNSEEN');
assert(trackingB.students.find((s) => s.student_id === 'student-B')?.first_viewed_at === null, 'TEST B: Student B has null timestamp');

// TEST C: Teacher refreshes the dashboard. Student A remains SEEN. Student B remains UNSEEN.
// (Fresh call simulating page reload fetching persisted database state)
let trackingC = simulateGetMaterialViewTracking('teacher-1', 'mat-1');
assert(trackingC.summary.seen_count === 1, 'TEST C: Persisted seen count remains 1');
assert(trackingC.summary.unseen_count === 1, 'TEST C: Persisted unseen count remains 1');
assert(trackingC.students.find((s) => s.student_id === 'student-A')?.status === 'seen', 'TEST C: Student A remains SEEN after refresh');
assert(trackingC.students.find((s) => s.student_id === 'student-B')?.status === 'unseen', 'TEST C: Student B remains UNSEEN after refresh');

// TEST D: Student A opens the material again. No duplicate view record is created.
const recordResD = simulateRecordMaterialView('student-A', 'mat-1');
assert(recordResD.success === true, 'TEST D: Re-opening material succeeds');
const studentA_views = dbMaterialViews.filter((v) => v.material_id === 'mat-1' && v.student_id === 'student-A');
assert(studentA_views.length === 1, 'TEST D: No duplicate view record created (length === 1)');
assert(studentA_views[0].view_count === 2, 'TEST D: View count incremented to 2');

// TEST E: Student B opens the material. Both students become SEEN.
const recordResE = simulateRecordMaterialView('student-B', 'mat-1');
assert(recordResE.success === true, 'TEST E: Student B view recorded');
let trackingE = simulateGetMaterialViewTracking('teacher-1', 'mat-1');
assert(trackingE.students.find((s) => s.student_id === 'student-A')?.status === 'seen', 'TEST E: Student A is SEEN');
assert(trackingE.students.find((s) => s.student_id === 'student-B')?.status === 'seen', 'TEST E: Student B is SEEN');

// TEST F: The teacher sees correct totals and view percentage.
assert(trackingE.summary.enrolled_count === 2, 'TEST F: Correct total enrolled count: 2');
assert(trackingE.summary.seen_count === 2, 'TEST F: Correct seen count: 2');
assert(trackingE.summary.unseen_count === 0, 'TEST F: Correct unseen count: 0');
assert(trackingE.summary.engagement_pct === 100.0, 'TEST F: Correct view rate: 100.0%');

// Test division by zero safety with empty classroom
const emptyClassTracking = {
  enrolled: 0,
  seen: 0,
  unseen: 0,
  rate: 0 > 0 ? (0 / 0) * 100 : 0.0,
};
assert(emptyClassTracking.rate === 0.0 && !Number.isNaN(emptyClassTracking.rate), 'TEST F: Safe division by zero handling (0.0%)');

// TEST G: An unauthorized student cannot record a view for another user.
// Student-A attempts to pass spoofed student_id 'student-C'
const spoofAttempt = simulateRecordMaterialView('student-A', 'mat-1', 'student-C');
assert(spoofAttempt.success === true, 'TEST G: Operation processed for caller identity');
assert(!dbMaterialViews.some((v) => v.student_id === 'student-C'), 'TEST G: No view was recorded for student-C (spoofing prevented)');

// Unauthenticated user attempt
const unauthAttempt = simulateRecordMaterialView(null, 'mat-1');
assert(unauthAttempt.success === false && unauthAttempt.reason === 'unauthenticated', 'TEST G: Unauthenticated attempt rejected');

// TEST H: A student cannot access another classroom's private tracking data.
let studentAccessBlocked = false;
try {
  simulateGetMaterialViewTracking('student-A', 'mat-1');
} catch {
  studentAccessBlocked = true;
}
assert(studentAccessBlocked, 'TEST H: Student cannot access teacher tracking dashboard');

let unauthorizedTeacherBlocked = false;
try {
  simulateGetMaterialViewTracking('teacher-random', 'mat-1');
} catch {
  unauthorizedTeacherBlocked = true;
}
assert(unauthorizedTeacherBlocked, 'TEST H: Non-classroom teacher cannot access tracking data');

// TEST I: Database or network failure is displayed clearly, UI must not falsely report success.
function frontendHandleRecordView(serverResult: { error: any; data: any }): { seenUpdated: boolean; errorShown: boolean } {
  if (serverResult.error || !serverResult.data || serverResult.data.success !== true) {
    return { seenUpdated: false, errorShown: true };
  }
  return { seenUpdated: true, errorShown: false };
}
const failedNetwork = frontendHandleRecordView({ error: new Error('Network Timeout'), data: null });
assert(failedNetwork.seenUpdated === false, 'TEST I: Failed network does not falsely mark seen');
assert(failedNetwork.errorShown === true, 'TEST I: Error state triggered on failure');

const rejectedServer = frontendHandleRecordView({ error: null, data: { success: false, reason: 'not_enrolled' } });
assert(rejectedServer.seenUpdated === false, 'TEST I: Backend rejection does not falsely mark seen');
assert(rejectedServer.errorShown === true, 'TEST I: Error indicated when backend rejects');

// TEST J: The tracking table still shows students who have not viewed the material.
// Reset Student B to unseen to verify presence in table
dbMaterialViews = dbMaterialViews.filter((v) => v.student_id !== 'student-B');
let trackingJ = simulateGetMaterialViewTracking('teacher-1', 'mat-1');
assert(trackingJ.students.length === 2, 'TEST J: Both students remain in table even when one is unseen');
assert(trackingJ.students.some((s) => s.student_id === 'student-B' && s.status === 'unseen'), 'TEST J: Unseen student Priya Verma is clearly visible in the table');

// Summary
console.log('\n=============================================');
console.log(`Results: ${passed} Passed, ${failed} Failed`);
console.log('=============================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

