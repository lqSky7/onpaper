// Question Generator & Rubric Grader
// Strictly adheres to Blueprint Section 9, 10, 12, and 13

import * as crypto from "node:crypto";
import {
  Question,
  QuestionAttempt,
  QuestionRubric,
  CriterionResult,
  Grade,
  Exercise,
  MasteryLevel,
  Mistake,
} from "../contracts/index.js";

export const INTERVIEW_RUBRIC_V1: QuestionRubric = {
  version: "v1.0",
  criteria: [
    {
      id: "conceptual_accuracy",
      name: "Conceptual Accuracy",
      maxPoints: 6,
      description: "Depth and correctness of underlying engineering concepts and terminology.",
    },
    {
      id: "syntax_understanding",
      name: "Syntax Understanding",
      maxPoints: 4,
      description: "Accurate grasp of language syntax constructs, types, and keyword mechanics.",
    },
    {
      id: "execution_reasoning",
      name: "Execution and Data-Flow Reasoning",
      maxPoints: 4,
      description: "Ability to trace execution step-by-step, including edge cases and errors.",
    },
    {
      id: "design_tradeoffs",
      name: "Design and Tradeoff Awareness",
      maxPoints: 3,
      description: "Understanding architectural motivation, alternatives, and design tradeoffs.",
    },
    {
      id: "communication_quality",
      name: "Communication Quality",
      maxPoints: 3,
      description: "Structured, concise, and professional explanation suitable for technical interviews.",
    },
  ],
};

export class GraderEngine {
  public static generateQuestionsForUnit(
    unitId: string,
    filePaths: string[],
    conceptIds: string[]
  ): Question[] {
    const questions: Question[] = [];

    // Question 1: Explanation
    const q1Id = crypto.randomUUID();
    const q1Family = `explain:${conceptIds[0] || "syntax"}`;
    questions.push({
      questionId: q1Id,
      questionFamilyId: q1Family,
      unitId,
      conceptIds: [conceptIds[0] || "syntax"],
      category: "explain",
      difficulty: 1.5,
      prompt: `Explain how the code in ${filePaths[0] || "this file"} functions, specifically describing how its primary structs/types and functions encapsulate their responsibility.`,
      expectedAnswer: `The file defines domain types/functions that encapsulate state and behavior, ensuring clear boundaries and predictable control flow.`,
      rubric: INTERVIEW_RUBRIC_V1,
      askedAt: new Date().toISOString(),
    });

    // Question 2: Execution Tracing / Debugging
    const q2Id = crypto.randomUUID();
    const q2Family = `trace:${conceptIds[1] || conceptIds[0] || "flow"}`;
    questions.push({
      questionId: q2Id,
      questionFamilyId: q2Family,
      unitId,
      conceptIds: [conceptIds[1] || conceptIds[0] || "flow"],
      category: "trace",
      difficulty: 2.0,
      prompt: `Trace the execution flow when an error or unexpected condition occurs in ${filePaths[0] || "this file"}. How is it handled or propagated?`,
      expectedAnswer: `Errors are explicitly checked and returned or handled, preventing invalid state or unhandled panics/exceptions.`,
      rubric: INTERVIEW_RUBRIC_V1,
      askedAt: new Date().toISOString(),
    });

    // Question 3: Design Tradeoffs / Comparison
    const q3Id = crypto.randomUUID();
    const q3Family = `design:${conceptIds[0] || "architecture"}`;
    questions.push({
      questionId: q3Id,
      questionFamilyId: q3Family,
      unitId,
      conceptIds: [conceptIds[0] || "architecture"],
      category: "design",
      difficulty: 2.5,
      prompt: `Why was this architectural structure chosen here rather than alternative designs? What are the tradeoffs in terms of extensibility and testability?`,
      expectedAnswer: `Using modular decomposition enables isolated unit testing and independent changes, balancing simplicity with extensibility.`,
      rubric: INTERVIEW_RUBRIC_V1,
      askedAt: new Date().toISOString(),
    });

    return questions;
  }

  public static gradeInterviewAnswer(
    question: Question,
    sessionId: string,
    studentAnswer: string
  ): { attempt: QuestionAttempt; mistake?: Mistake; suggestedMastery: MasteryLevel } {
    const trimmed = studentAnswer.trim();
    const length = trimmed.length;

    // Evaluate against 20-point rubric
    const criterionResults: CriterionResult[] = [];
    let totalScore = 0;
    const misconceptions: string[] = [];

    // Basic heuristic evaluation for prototype/runtime
    const hasDetail = length > 80;
    const hasTechnicalKeywords = /type|func|struct|class|error|return|interface|async|await|handle/i.test(trimmed);
    const mentionsTradeoffs = /tradeoff|advantage|benefit|complexity|performance|test/i.test(trimmed);

    for (const crit of question.rubric.criteria) {
      let awarded = 0;
      if (crit.id === "conceptual_accuracy") {
        awarded = hasDetail && hasTechnicalKeywords ? 6 : hasTechnicalKeywords ? 4 : 2;
      } else if (crit.id === "syntax_understanding") {
        awarded = hasTechnicalKeywords && hasDetail ? 4 : hasTechnicalKeywords ? 2 : 1;
      } else if (crit.id === "execution_reasoning") {
        awarded = hasDetail ? 4 : hasTechnicalKeywords ? 2 : 1;
      } else if (crit.id === "design_tradeoffs") {
        awarded = mentionsTradeoffs ? 3 : 0;
      } else if (crit.id === "communication_quality") {
        awarded = length > 80 ? 3 : length > 30 ? 2 : 1;
      }

      totalScore += awarded;
      criterionResults.push({
        criterionId: crit.id,
        availablePoints: crit.maxPoints,
        awardedPoints: awarded,
        expectedElements: ["Clear technical reasoning", "Correct semantics"],
        mentionedElements: [hasTechnicalKeywords ? "Technical vocabulary" : "General concepts"],
        missingElements: awarded < crit.maxPoints ? ["Deeper edge case analysis"] : [],
        incorrectClaims: [],
        misconceptions: awarded <= crit.maxPoints / 2 ? [`Incomplete ${crit.name}`] : [],
      });
    }

    let feedback = "";
    let suggestedMastery: MasteryLevel = "developing";
    let mistake: Mistake | undefined;

    if (totalScore >= 16) {
      feedback = "Strong and thorough answer covering both conceptual mechanics and design considerations.";
      suggestedMastery = "strong";
    } else if (totalScore >= 12) {
      feedback = "Competent answer with sound fundamentals. Further elaboration on edge-case tradeoffs will elevate the response.";
      suggestedMastery = "competent";
    } else {
      feedback = "Answer demonstrated partial understanding but lacked specific technical execution details and tradeoff rationale.";
      suggestedMastery = "developing";

      mistake = {
        mistakeId: crypto.randomUUID(),
        canonicalKey: `misconception/${question.conceptIds[0] || "general"}`,
        title: `Difficulty explaining ${question.conceptIds[0] || "core concept"}`,
        category: "concept",
        conceptIds: question.conceptIds,
        severity: "medium",
        status: "active",
        firstSeenAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        occurrenceCount: 1,
        resolvedCount: 0,
        exampleAttemptIds: [],
        fsrsCardIds: [],
      };
    }

    const attempt: QuestionAttempt = {
      attemptId: crypto.randomUUID(),
      questionId: question.questionId,
      sessionId,
      studentAnswer,
      score: totalScore,
      criterionResults,
      feedback,
      misconceptionTags: misconceptions,
      confidence: 0.9,
      answeredAt: new Date().toISOString(),
    };

    if (mistake) {
      mistake.exampleAttemptIds.push(attempt.attemptId);
    }

    return { attempt, mistake, suggestedMastery };
  }

  public static gradeExercise(
    exercise: Exercise,
    validationPassed: boolean,
    validationSummary: string,
    oralExplanation: string = ""
  ): Grade {
    const gradeId = crypto.randomUUID();

    // 100-Point Rubric:
    // Functional correctness (35), Requirement completeness (15), Concept application (15),
    // Edge-case handling (10), Clarity & maintainability (10), Testing & validation (10), Independent completion (5)
    let answerScore = 0;
    let codeScore = 0;
    const criterionResults: Record<string, number> = {};
    const blockingFailures: string[] = [];

    if (validationPassed) {
      criterionResults["functional_correctness"] = 35;
      criterionResults["requirement_completeness"] = 15;
      criterionResults["concept_application"] = 15;
      criterionResults["edge_case_handling"] = 9;
      criterionResults["clarity_maintainability"] = 9;
      criterionResults["testing_validation"] = 10;
      criterionResults["independent_completion"] = 5;
      codeScore = 98;
    } else {
      criterionResults["functional_correctness"] = 18;
      criterionResults["requirement_completeness"] = 10;
      criterionResults["concept_application"] = 10;
      criterionResults["edge_case_handling"] = 5;
      criterionResults["clarity_maintainability"] = 7;
      criterionResults["testing_validation"] = 4;
      criterionResults["independent_completion"] = 4;
      codeScore = 58;
      blockingFailures.push("Tests or compilation checks failed during automated validation.");
    }

    answerScore = oralExplanation.length > 30 ? 18 : 12;
    const combinedScore = Number(((codeScore * 0.7) + (answerScore * 0.3 * 5)).toFixed(1));

    const masteryUpdates: Record<string, MasteryLevel> = {};
    for (const conceptId of exercise.targetConceptIds) {
      masteryUpdates[conceptId] = validationPassed ? "competent" : "developing";
    }

    return {
      gradeId,
      exerciseId: exercise.exerciseId,
      rubricVersion: "v1.0-100pt",
      answerScore,
      codeScore,
      combinedScore,
      criterionResults,
      blockingFailures,
      strengths: validationPassed
        ? ["Clean implementation", "Adhered to target concepts", "Passes automated verification"]
        : ["Attempted all required components"],
      improvements: validationPassed
        ? ["Consider adding negative test cases"]
        : ["Fix failing test conditions", "Review edge case boundary values"],
      masteryUpdates,
      graderConfidence: 0.95,
      validationSummary,
      createdAt: new Date().toISOString(),
    };
  }
}
