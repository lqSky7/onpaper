// Comprehensive Unit & Integration Tests for OnPaper Core
// Strictly adheres to Blueprint Section 34

import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ProjectDatabase } from "../src/core/database.js";
import { FSRSEngine } from "../src/core/fsrs.js";
import { PolicyGuard } from "../src/core/guards.js";
import { RepositoryAnalyzer } from "../src/curriculum/analyzer.js";
import { CurriculumPlanner } from "../src/curriculum/planner.js";
import { GraderEngine } from "../src/grading/grader.js";
import { ExerciseManager } from "../src/exercises/manager.js";

test("Database: CRUD, sessions, events and outbox", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onpaper-test-"));
  const db = new ProjectDatabase(tmpDir);

  const project = {
    projectId: "proj-123",
    displayName: "Test Project",
    rootFingerprint: "hash123",
    primaryLanguages: ["typescript"],
    frameworks: ["express"],
    gitAvailable: true,
    curriculumStatus: "active" as const,
    skillVersion: "1.0.0",
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
  };

  db.saveProject(project);
  const loaded = db.getProject();
  assert.equal(loaded?.projectId, "proj-123");
  assert.equal(loaded?.displayName, "Test Project");

  // Custom instructions
  db.setCustomInstructions("Prefer javascript for exercises");
  assert.equal(db.getCustomInstructions(), "Prefer javascript for exercises");

  // Record Event & Outbox
  const event = {
    eventId: "event-1",
    localSequence: 1,
    projectId: "proj-123",
    deviceId: "device-1",
    adapterVersion: "1.0.0",
    skillVersion: "1.0.0",
    eventType: "unit_started",
    localTimestamp: new Date().toISOString(),
    schemaVersion: 1,
    payload: { unit: 1 },
    syncClassification: "standard",
  };

  db.recordEventAndOutbox(event);
  const pending = db.getPendingOutbox();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].event.eventId, "event-1");

  db.markOutboxDelivered([pending[0].operationId], 10);
  const pendingAfter = db.getPendingOutbox();
  assert.equal(pendingAfter.length, 0);

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("FSRS: Spaced Repetition Calculations", () => {
  const fsrs = new FSRSEngine();
  const card = fsrs.createInitialCard("card-1");

  assert.equal(card.state, "New");
  assert.equal(card.reps, 0);

  // Rate Good on Day 0
  const review1 = fsrs.rate(card, "Good", new Date("2026-01-01T00:00:00Z"));
  assert.equal(review1.updatedCard.state, "Review");
  assert.equal(review1.updatedCard.reps, 1);
  assert.ok(review1.updatedCard.stability > 0);
  assert.ok(review1.updatedCard.scheduledDays >= 1);

  // Rate Good again 3 days later
  const review2 = fsrs.rate(
    review1.updatedCard,
    "Good",
    new Date("2026-01-04T00:00:00Z")
  );
  assert.equal(review2.updatedCard.reps, 2);
  assert.ok(review2.updatedCard.stability > review1.updatedCard.stability);
  assert.ok(review2.updatedCard.scheduledDays > review1.updatedCard.scheduledDays);

  // Rate Again (Lapse)
  const review3 = fsrs.rate(
    review2.updatedCard,
    "Again",
    new Date("2026-01-15T00:00:00Z")
  );
  assert.equal(review3.updatedCard.state, "Relearning");
  assert.equal(review3.updatedCard.lapses, 1);
});

test("Guards: Prohibit path traversal and absolute paths", () => {
  const repoRoot = "/tmp/repo";

  assert.throws(() => {
    PolicyGuard.validateRelativePath(repoRoot, "/etc/passwd");
  }, /Absolute paths are prohibited/);

  assert.throws(() => {
    PolicyGuard.validateRelativePath(repoRoot, "../secret.txt");
  }, /Path traversal is prohibited/);

  assert.throws(() => {
    PolicyGuard.validateExercisePath(repoRoot, "src/exercises/1");
  }, /Exercise must be located inside/);

  assert.throws(() => {
    PolicyGuard.assertSafeGitCommand("git push origin main");
  }, /Destructive git command rejected/);
});

test("Grader: 20-point interview rubric and 100-point exercise rubric", () => {
  const questions = GraderEngine.generateQuestionsForUnit(
    "unit-1",
    ["src/models/user.ts"],
    ["core/domain-models"]
  );
  assert.equal(questions.length, 3);
  assert.equal(questions[0].category, "explain");
  assert.equal(questions[1].category, "trace");
  assert.equal(questions[2].category, "design");

  const studentAnswer =
    "The User struct encapsulates domain attributes like ID and email. Functions handle error validation explicitly to avoid unhandled exceptions.";
  const result = GraderEngine.gradeInterviewAnswer(questions[0], "sess-1", studentAnswer);

  assert.ok(result.attempt.score >= 10);
  assert.ok(result.attempt.criterionResults.length === 5);

  const mockExercise = {
    exerciseId: "ex-1",
    unitId: "unit-1",
    templateFamilyId: "tmpl:models",
    relativeDirectory: ".interview-prep/exercises/ex-1",
    sourceFileIds: ["f-1"],
    sourceFingerprints: {},
    targetConceptIds: ["core/domain-models"],
    requirements: "Implement model",
    constraints: [],
    starterFingerprint: "hash",
    status: "active" as const,
    createdAt: new Date().toISOString(),
    cleanupAttempts: 0,
    integrityFlags: [],
  };

  const grade = GraderEngine.gradeExercise(
    mockExercise,
    true,
    "Tests passed: 2/2",
    "I structured the struct with private fields and exposed accessor methods."
  );

  assert.ok(grade.combinedScore >= 80);
  assert.equal(grade.masteryUpdates["core/domain-models"], "competent");
});

test("Exercise Sandbox: Create, Validate, Grade, and Cleanup", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onpaper-exercise-test-"));
  const db = new ProjectDatabase(tmpDir);

  const unit = {
    unitId: "unit-ex-1",
    projectId: "proj-1",
    title: "Unit 1: Test",
    fileIds: ["f1"],
    fileFingerprints: {},
    conceptIds: ["core/functions-control-flow"],
    prerequisiteIds: [],
    objectives: ["Master functions"],
    selectionReason: "Foundational",
    curriculumPosition: 1,
    difficulty: 1.0,
    status: "active" as const,
    createdAt: new Date().toISOString(),
  };

  const exercise = ExerciseManager.createExercise(db, unit, "typescript");
  const fullExerciseDir = path.join(tmpDir, exercise.relativeDirectory);

  assert.ok(fs.existsSync(fullExerciseDir));
  assert.ok(fs.existsSync(path.join(fullExerciseDir, "README.md")));
  assert.ok(fs.existsSync(path.join(fullExerciseDir, "exercise.ts")));

  // Grade
  const grade = GraderEngine.gradeExercise(exercise, true, "1 passed");
  db.saveGrade(grade);

  // Cleanup
  const cleaned = ExerciseManager.cleanupExercise(db, exercise.exerciseId);
  assert.equal(cleaned, true);
  assert.ok(!fs.existsSync(fullExerciseDir));

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
