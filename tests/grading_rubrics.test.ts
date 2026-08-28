// Grading Rubrics & Misconception Evaluation Tests
// Strictly adheres to Blueprint Section 9, 10, 12, 13, and 34

import test from "node:test";
import assert from "node:assert/strict";
import { GraderEngine, INTERVIEW_RUBRIC_V1 } from "../src/grading/grader.js";

test("Grading: 20-Point Interview Rubric Criteria Evaluation", () => {
  const questions = GraderEngine.generateQuestionsForUnit(
    "unit-test-1",
    ["internal/auth/service.go"],
    ["core/error-handling", "core/interfaces-abstractions"]
  );

  assert.equal(questions.length, 3);
  assert.equal(INTERVIEW_RUBRIC_V1.criteria.length, 5);

  // Excellent student answer with full details
  const excellentAnswer =
    "The function validates incoming credentials using the UserStore interface. If validation fails, it explicitly returns a wrapped ErrInvalidCredentials error, preventing execution from continuing. The interface was selected to decouple the service from the database layer, allowing isolated mocking during unit tests.";

  const highResult = GraderEngine.gradeInterviewAnswer(questions[0], "sess-1", excellentAnswer);
  assert.ok(highResult.attempt.score >= 16);
  assert.equal(highResult.suggestedMastery, "strong");
  assert.equal(highResult.mistake, undefined);

  // Vague or partial student answer
  const vagueAnswer = "It checks stuff and returns an error.";
  const lowResult = GraderEngine.gradeInterviewAnswer(questions[0], "sess-1", vagueAnswer);
  assert.ok(lowResult.attempt.score < 12);
  assert.equal(lowResult.suggestedMastery, "developing");
  assert.ok(lowResult.mistake);
  assert.equal(lowResult.mistake.severity, "medium");
});

test("Grading: 100-Point Coding Rubric and Validation Evidence", () => {
  const mockExercise = {
    exerciseId: "ex-grade-1",
    unitId: "unit-1",
    templateFamilyId: "tmpl:error-handling",
    relativeDirectory: ".interview-prep/exercises/ex-grade-1",
    sourceFileIds: ["f1"],
    sourceFingerprints: {},
    targetConceptIds: ["core/error-handling"],
    requirements: "Handle nil checks and propagate custom error types",
    constraints: [],
    starterFingerprint: "hash",
    status: "active" as const,
    createdAt: new Date().toISOString(),
    cleanupAttempts: 0,
    integrityFlags: [],
  };

  // Case 1: Validation passed with oral explanation
  const passGrade = GraderEngine.gradeExercise(
    mockExercise,
    true,
    "All 4 tests passed.",
    "I created a custom error type implementing the error interface and added guards."
  );

  assert.ok(passGrade.combinedScore >= 85);
  assert.equal(passGrade.blockingFailures.length, 0);
  assert.equal(passGrade.masteryUpdates["core/error-handling"], "competent");

  // Case 2: Validation failed
  const failGrade = GraderEngine.gradeExercise(
    mockExercise,
    false,
    "Test 2 failed: expected nil error, got panic.",
    ""
  );

  assert.ok(failGrade.combinedScore < 70);
  assert.ok(failGrade.blockingFailures.length > 0);
  assert.equal(failGrade.masteryUpdates["core/error-handling"], "developing");
});
