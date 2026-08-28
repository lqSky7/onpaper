// Canonical Domain Contracts & Interfaces
// Strictly adheres to PROJECT_IMPLEMENTATION_BLUEPRINT.md

export type MasteryLevel = "unknown" | "introduced" | "developing" | "competent" | "strong";

export type CurriculumStatus = "new" | "active" | "completed" | "archived";

export type UnitStatus = "planned" | "active" | "completed" | "stale" | "superseded";

export type SessionState =
  | "restore_state"
  | "recovery"
  | "review"
  | "repository_check"
  | "curriculum_planning"
  | "teaching"
  | "questioning"
  | "answer_assessment"
  | "remediation"
  | "exercise_preparation"
  | "exercise_active"
  | "exercise_submitted"
  | "exercise_abandoned"
  | "grading"
  | "feedback"
  | "cleanup"
  | "cleanup_pending"
  | "completed"
  | "interrupted";

export type ExerciseStatus =
  | "prepared"
  | "active"
  | "submitted"
  | "grading"
  | "graded"
  | "deleting"
  | "cleanup_pending"
  | "deleted"
  | "abandoned";

export type FSRSRating = "Again" | "Hard" | "Good" | "Easy";

export type FSRSState = "New" | "Learning" | "Review" | "Relearning" | "Suspended";

export type MistakeSeverity = "low" | "medium" | "high";

export type MistakeStatus = "active" | "improving" | "resolved";

export type QuestionCategory = "explain" | "trace" | "design" | "compare" | "apply" | "edge_cases";

export interface Project {
  projectId: string;
  displayName: string;
  rootFingerprint: string;
  primaryLanguages: string[];
  frameworks: string[];
  gitAvailable: boolean;
  curriculumStatus: CurriculumStatus;
  skillVersion: string;
  schemaVersion: number;
  createdAt: string;
  lastOpenedAt: string;
}

export interface FileItem {
  fileId: string;
  projectId: string;
  relativePath: string;
  language: string;
  role: string;
  contentFingerprint: string;
  structureFingerprint: string;
  sizeClass: "small" | "medium" | "large";
  generatedStatus: "source" | "generated" | "vendored" | "binary";
  firstSeenAt: string;
  lastSeenAt: string;
  gitFirstSeenAt?: string;
  gitLastChangedAt?: string;
  deletedAt?: string;
  renamePredecessorId?: string;
}

export interface SymbolItem {
  symbolId: string;
  fileId: string;
  name: string;
  kind: "function" | "class" | "type" | "variable" | "route" | "test" | "interface" | "struct";
  parentSymbolId?: string;
  signatureDigest: string;
  startLine: number;
  endLine: number;
  visibility: "public" | "private" | "internal";
  dependencies: string[];
}

export interface Concept {
  conceptId: string;
  name: string;
  category: "syntax" | "semantics" | "architecture" | "testing";
  languageScope: string;
  prerequisiteIds: string[];
  difficulty: number;
  taxonomyVersion: string;
}

export interface ConceptMastery {
  projectId: string;
  conceptId: string;
  masteryLevel: MasteryLevel;
  masteryScore: number;
  confidence: number;
  introducedAt: string;
  lastAssessedAt: string;
  successCount: number;
  failureCount: number;
  nextReviewAt?: string;
  fsrsCardId?: string;
  stateVersion: number;
}

export interface LearningUnit {
  unitId: string;
  projectId: string;
  title: string;
  fileIds: string[];
  fileFingerprints: Record<string, string>;
  conceptIds: string[];
  prerequisiteIds: string[];
  objectives: string[];
  selectionReason: string;
  curriculumPosition: number;
  difficulty: number;
  status: UnitStatus;
  createdAt: string;
  completedAt?: string;
}

export interface Session {
  sessionId: string;
  projectId: string;
  unitId?: string;
  chatIds: string[];
  adapterType: string;
  state: SessionState;
  startedAt: string;
  endedAt?: string;
  durationSeconds: number;
  interruptionReason?: string;
  summary?: string;
  syncStatus: "pending" | "synced" | "error";
}

export interface RubricCriterion {
  id: string;
  name: string;
  maxPoints: number;
  description: string;
}

export interface QuestionRubric {
  version: string;
  criteria: RubricCriterion[];
}

export interface Question {
  questionId: string;
  questionFamilyId: string;
  unitId: string;
  conceptIds: string[];
  category: QuestionCategory;
  difficulty: number;
  prompt: string;
  expectedAnswer: string;
  rubric: QuestionRubric;
  askedAt: string;
  reviewEligibleAt?: string;
}

export interface CriterionResult {
  criterionId: string;
  availablePoints: number;
  awardedPoints: number;
  expectedElements: string[];
  mentionedElements: string[];
  missingElements: string[];
  incorrectClaims: string[];
  misconceptions: string[];
}

export interface QuestionAttempt {
  attemptId: string;
  questionId: string;
  sessionId: string;
  studentAnswer: string;
  score: number;
  criterionResults: CriterionResult[];
  feedback: string;
  misconceptionTags: string[];
  confidence: number;
  answeredAt: string;
  followUpOf?: string;
}

export interface Exercise {
  exerciseId: string;
  unitId: string;
  templateFamilyId: string;
  relativeDirectory: string;
  sourceFileIds: string[];
  sourceFingerprints: Record<string, string>;
  targetConceptIds: string[];
  requirements: string;
  constraints: string[];
  starterFingerprint: string;
  submissionFingerprint?: string;
  status: ExerciseStatus;
  createdAt: string;
  submittedAt?: string;
  gradedAt?: string;
  deletedAt?: string;
  cleanupAttempts: number;
  integrityFlags: string[];
}

export interface ExerciseRubricCriterion {
  id: string;
  name: string;
  weight: number;
}

export interface Grade {
  gradeId: string;
  exerciseId: string;
  rubricVersion: string;
  answerScore: number;
  codeScore: number;
  combinedScore: number;
  criterionResults: Record<string, number>;
  blockingFailures: string[];
  strengths: string[];
  improvements: string[];
  masteryUpdates: Record<string, MasteryLevel>;
  graderConfidence: number;
  validationSummary: string;
  createdAt: string;
}

export interface Mistake {
  mistakeId: string;
  canonicalKey: string;
  title: string;
  category: "syntax" | "concept" | "reasoning" | "coding";
  conceptIds: string[];
  severity: MistakeSeverity;
  status: MistakeStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  resolvedCount: number;
  exampleAttemptIds: string[];
  fsrsCardIds: string[];
}

export interface MistakeOccurrence {
  occurrenceId: string;
  mistakeId: string;
  sessionId: string;
  questionAttemptId?: string;
  exerciseId?: string;
  observedAt: string;
  severity: MistakeSeverity;
  evidenceSummary: string;
  resolvedInAttemptId?: string;
}

export interface Exposure {
  exposureId: string;
  type: "file" | "pair" | "concept" | "question_family" | "exercise_family";
  identityKey: string;
  sessionId: string;
  purpose: "introduction" | "assessment" | "remediation" | "review";
  outcome: string;
  sourceFingerprints?: Record<string, string>;
  occurredAt: string;
  cooldownUntil?: string;
}

export interface FSRSCard {
  cardId: string;
  conceptId?: string;
  mistakeId?: string;
  questionFamilyId?: string;
  state: FSRSState;
  dueAt: string;
  lastReviewAt?: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  scheduledDays: number;
  elapsedDays: number;
  algorithmVersion: string;
  parameterVersion: string;
  lastAppliedReviewEventId?: string;
  stateVersion: number;
}

export interface FSRSReview {
  reviewEventId: string;
  cardId: string;
  rating: FSRSRating;
  reviewedAt: string;
  receivedAt?: string;
  source: "IDE" | "iOS";
  responseSummary: string;
  agentProposedRating?: FSRSRating;
  userOverriddenRating?: FSRSRating;
  previousState?: Partial<FSRSCard>;
  resultingState?: Partial<FSRSCard>;
  algorithmVersion: string;
  deviceSequence: number;
}

export interface SyncEvent {
  eventId: string;
  localSequence: number;
  projectId: string;
  sessionId?: string;
  deviceId: string;
  chatId?: string;
  adapterVersion: string;
  skillVersion: string;
  eventType: string;
  localTimestamp: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
  previousEventDigest?: string;
  syncClassification: string;
}

export interface OutboxOperation {
  operationId: string;
  eventId: string;
  batchId?: string;
  payloadHash: string;
  attemptCount: number;
  nextRetryAt?: string;
  status: "pending" | "sending" | "delivered" | "dead_letter";
  lastError?: string;
  serverRevision?: number;
  createdAt: string;
  deliveredAt?: string;
}

export interface DailyProgress {
  userId?: string;
  localDate: string;
  activeMinutes: number;
  questionsAnswered: number;
  exercisesCompleted: number;
  reviewsCompleted: number;
  unitsCompleted: number;
  goalTarget: number;
  goalAchieved: boolean;
  streakQualified: boolean;
}

export interface UserPreferences {
  userId?: string;
  timezone: string;
  dailyGoalType: "session" | "reviews" | "minutes" | "activities";
  dailyGoalTarget: number;
  reminderTime: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  notificationsEnabled: boolean;
  streakFreezesAvailable: number;
}

export interface SyncPushBatch {
  deviceId: string;
  batchId: string;
  lastKnownServerRevision: number;
  operations: Array<{
    operationId: string;
    event: SyncEvent;
    payloadHash: string;
  }>;
}

export interface SyncPushResult {
  acceptedOperationIds: string[];
  duplicateOperationIds: string[];
  rejectedOperations: Array<{ operationId: string; reason: string }>;
  newServerRevision: number;
}

export interface SyncPullResult {
  changes: Array<{
    entityType: string;
    entityId: string;
    action: "upsert" | "delete";
    data?: Record<string, unknown>;
    serverRevision: number;
    updatedAt: string;
  }>;
  nextRevision: number;
  hasMore: boolean;
}
