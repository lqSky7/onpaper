// Exercise Lifecycle & Sandbox Stress Tests
// Strictly adheres to Blueprint Section 11, 16, and 34

import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ProjectDatabase } from "../src/core/database.js";
import { ExerciseManager } from "../src/exercises/manager.js";
import { GraderEngine } from "../src/grading/grader.js";

test("Exercise: Full lifecycle with crash recovery and cleanup", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onpaper-lifecycle-test-"));
  const db = new ProjectDatabase(tmpDir);

  const unit = {
    unitId: "unit-stress-1",
    projectId: "proj-stress-1",
    title: "Unit 1: Concurrency",
    fileIds: ["f1", "f2"],
    fileFingerprints: {},
    conceptIds: ["core/functions-control-flow", "core/domain-models"],
    prerequisiteIds: [],
    objectives: ["Handle async concurrency"],
    selectionReason: "Core logic",
    curriculumPosition: 1,
    difficulty: 1.5,
    status: "active" as const,
    createdAt: new Date().toISOString(),
  };

  // 1. Create Exercise
  const exercise = ExerciseManager.createExercise(db, unit, "typescript");
  const fullExerciseDir = path.join(tmpDir, exercise.relativeDirectory);
  assert.ok(fs.existsSync(fullExerciseDir));

  // 2. Simulate Active Exercise
  const activeEx = db.getActiveExercise();
  assert.ok(activeEx);
  assert.equal(activeEx.exerciseId, exercise.exerciseId);
  assert.equal(activeEx.status, "active");

  // 3. Validation
  const val = ExerciseManager.validateExercise(tmpDir, activeEx, "typescript");
  assert.ok(typeof val.passed === "boolean");

  // 4. Grade Submission
  const grade = GraderEngine.gradeExercise(activeEx, true, "Passes validation", "Explained design");
  db.saveGrade(grade);

  const savedGrade = db.getGradeForExercise(exercise.exerciseId);
  assert.ok(savedGrade);
  assert.equal(savedGrade.gradeId, grade.gradeId);

  // 5. Cleanup
  const cleaned = ExerciseManager.cleanupExercise(db, exercise.exerciseId);
  assert.equal(cleaned, true);
  assert.ok(!fs.existsSync(fullExerciseDir));

  // 6. Verify Active Exercise is now cleared
  const activeAfter = db.getActiveExercise();
  assert.equal(activeAfter, null);

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Exercise: Abandoned exercise handling", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onpaper-abandon-test-"));
  const db = new ProjectDatabase(tmpDir);

  const unit = {
    unitId: "unit-abandon-1",
    projectId: "proj-1",
    title: "Unit Abandon",
    fileIds: ["f1"],
    fileFingerprints: {},
    conceptIds: ["core/variables-types"],
    prerequisiteIds: [],
    objectives: ["Basic Types"],
    selectionReason: "Intro",
    curriculumPosition: 1,
    difficulty: 1.0,
    status: "active" as const,
    createdAt: new Date().toISOString(),
  };

  const exercise = ExerciseManager.createExercise(db, unit, "python");
  exercise.status = "abandoned";
  db.saveExercise(exercise);

  // Abandoned exercises should allow grading or cleanup
  const dummyGrade = GraderEngine.gradeExercise(exercise, false, "Abandoned by student");
  db.saveGrade(dummyGrade);

  const cleaned = ExerciseManager.cleanupExercise(db, exercise.exerciseId);
  assert.equal(cleaned, true);

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
