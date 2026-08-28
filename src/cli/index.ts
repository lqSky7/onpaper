#!/usr/bin/env node

// OnPaper Local Core CLI Interface
// Strictly adheres to PROJECT_IMPLEMENTATION_BLUEPRINT.md

import { Command } from "commander";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { ProjectDatabase, GlobalProfileDatabase } from "../core/database.js";
import { PolicyGuard } from "../core/guards.js";
import { RepositoryAnalyzer } from "../curriculum/analyzer.js";
import { CurriculumPlanner } from "../curriculum/planner.js";
import { GraderEngine } from "../grading/grader.js";
import { ExerciseManager } from "../exercises/manager.js";
import { FSRSEngine } from "../core/fsrs.js";
import { SyncClient } from "../sync/client.js";
import { Project, Session, SyncEvent } from "../contracts/index.js";

const program = new Command();

program
  .name("onpaper")
  .description("Project-Based Interview Readiness Platform CLI")
  .version("1.0.0");

function getProjectContext(cwd: string = process.cwd()): { db: ProjectDatabase; globalDb: GlobalProfileDatabase; projectRoot: string } {
  const projectRoot = path.resolve(cwd);
  const db = new ProjectDatabase(projectRoot);
  const globalDb = new GlobalProfileDatabase();
  return { db, globalDb, projectRoot };
}

// 1. init command
program
  .command("init")
  .description("Initialize interview preparation curriculum for the project")
  .option("-n, --name <name>", "Display name of the project")
  .action((options) => {
    const { db, globalDb, projectRoot } = getProjectContext();

    console.log(`[onpaper] Initializing project at ${projectRoot}...`);
    PolicyGuard.ensureGitIgnored(projectRoot);

    const existing = db.getProject();
    const projectId = existing ? existing.projectId : crypto.randomUUID();
    const displayName = options.name || existing?.displayName || path.basename(projectRoot);

    // Analyze repository
    console.log("[onpaper] Scanning repository structure and symbols...");
    const { files, symbols, primaryLanguages, frameworks } = RepositoryAnalyzer.analyzeRepository(projectRoot, projectId);

    files.forEach((f) => db.saveFile(f));

    // Generate Standard Concepts
    console.log(`[onpaper] Generating concepts for primary language: ${primaryLanguages[0]}...`);
    const concepts = RepositoryAnalyzer.generateStandardConcepts(primaryLanguages[0]);
    concepts.forEach((c) => db.saveConcept(c));

    // Generate Curriculum
    console.log("[onpaper] Building natural chronological curriculum...");
    const units = CurriculumPlanner.planCurriculum(projectId, files, symbols, concepts);
    units.forEach((u) => db.saveLearningUnit(u));

    const rootFingerprint = crypto
      .createHash("sha256")
      .update(files.map((f) => f.contentFingerprint).join(";"))
      .digest("hex");

    const project: Project = {
      projectId,
      displayName,
      rootFingerprint,
      primaryLanguages,
      frameworks,
      gitAvailable: fs.existsSync(path.join(projectRoot, ".git")),
      curriculumStatus: "active",
      skillVersion: "1.0.0",
      schemaVersion: 1,
      createdAt: existing?.createdAt || new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    };

    db.saveProject(project);
    globalDb.registerProject(projectId, displayName, projectRoot);

    // Record Event
    const deviceId = globalDb.getDeviceId();
    const event: SyncEvent = {
      eventId: crypto.randomUUID(),
      localSequence: 1,
      projectId,
      deviceId,
      adapterVersion: "1.0.0",
      skillVersion: "1.0.0",
      eventType: "project_initialized",
      localTimestamp: new Date().toISOString(),
      schemaVersion: 1,
      payload: { displayName, unitsCount: units.length, primaryLanguages },
      syncClassification: "standard",
    };
    db.recordEventAndOutbox(event);

    console.log(`[onpaper] Project "${displayName}" initialized successfully.`);
    console.log(`[onpaper] Discovered ${files.length} source files.`);
    console.log(`[onpaper] Created ${units.length} learning units.`);
  });

// 2. status command
program
  .command("status")
  .description("Display project learning progress, active session, and due reviews")
  .action(() => {
    const { db } = getProjectContext();
    const project = db.getProject();
    if (!project) {
      console.log("[onpaper] No active project found. Run 'onpaper init' first.");
      return;
    }

    const units = db.getLearningUnits(project.projectId);
    const completedUnits = units.filter((u) => u.status === "completed").length;
    const dueCards = db.getDueFSRSCards();
    const activeSession = db.getActiveSession(project.projectId);
    const activeExercise = db.getActiveExercise();

    console.log("=== OnPaper Project Status ===");
    console.log(`Project: ${project.displayName} (ID: ${project.projectId})`);
    console.log(`Languages: ${project.primaryLanguages.join(", ")}`);
    console.log(`Progress: ${completedUnits} / ${units.length} units completed`);
    console.log(`FSRS Reviews Due: ${dueCards.length} cards`);
    console.log(`Active Session: ${activeSession ? `${activeSession.sessionId} (${activeSession.state})` : "None"}`);
    console.log(`Active Exercise: ${activeExercise ? `${activeExercise.exerciseId} (${activeExercise.status})` : "None"}`);
  });

// 3. restore command
program
  .command("restore")
  .description("Restore learning state for IDE session startup")
  .action(() => {
    const { db } = getProjectContext();
    const project = db.getProject();
    if (!project) {
      console.log(JSON.stringify({ status: "uninitialized", message: "Run onpaper init to begin." }));
      return;
    }

    const dueCards = db.getDueFSRSCards();
    const activeSession = db.getActiveSession(project.projectId);
    const activeExercise = db.getActiveExercise();
    const nextUnit = db.getNextUnit(project.projectId);

    let nextAction = "select_unit";
    if (dueCards.length > 0) {
      nextAction = "review_due_cards";
    } else if (activeExercise) {
      nextAction = "resume_exercise";
    } else if (activeSession) {
      nextAction = `resume_session_${activeSession.state}`;
    }

    console.log(
      JSON.stringify(
        {
          project,
          nextAction,
          dueCardsCount: dueCards.length,
          activeSession,
          activeExercise,
          nextUnit,
        },
        null,
        2
      )
    );
  });

// 4. start-unit command
program
  .command("start-unit")
  .description("Start a learning unit")
  .argument("[unitId]", "Unit ID to start")
  .action((unitIdArg) => {
    const { db, globalDb } = getProjectContext();
    const project = db.getProject();
    if (!project) {
      console.error("[onpaper] Project not initialized.");
      return;
    }

    let unit = unitIdArg ? db.getLearningUnits(project.projectId).find((u) => u.unitId === unitIdArg) : db.getNextUnit(project.projectId);
    if (!unit) {
      console.error("[onpaper] No available learning unit.");
      return;
    }

    const sessionId = crypto.randomUUID();
    const session: Session = {
      sessionId,
      projectId: project.projectId,
      unitId: unit.unitId,
      chatIds: [],
      adapterType: "cli",
      state: "teaching",
      startedAt: new Date().toISOString(),
      durationSeconds: 0,
      syncStatus: "pending",
    };

    db.saveSession(session);

    const deviceId = globalDb.getDeviceId();
    const event: SyncEvent = {
      eventId: crypto.randomUUID(),
      localSequence: Date.now(),
      projectId: project.projectId,
      sessionId,
      deviceId,
      adapterVersion: "1.0.0",
      skillVersion: "1.0.0",
      eventType: "lesson_started",
      localTimestamp: new Date().toISOString(),
      schemaVersion: 1,
      payload: { unitId: unit.unitId, title: unit.title },
      syncClassification: "standard",
    };
    db.recordEventAndOutbox(event);

    console.log(`[onpaper] Started Unit: ${unit.title}`);
    console.log(`[onpaper] Objectives:`);
    unit.objectives.forEach((o) => console.log(`  - ${o}`));
    console.log(`[onpaper] Session ID: ${sessionId}`);
  });

// 5. ask-questions command
program
  .command("ask-questions")
  .description("Generate and record interview questions for the current unit")
  .argument("<unitId>", "Unit ID")
  .action((unitId) => {
    const { db } = getProjectContext();
    const project = db.getProject();
    if (!project) return;

    const unit = db.getLearningUnits(project.projectId).find((u) => u.unitId === unitId);
    if (!unit) {
      console.error("[onpaper] Unit not found.");
      return;
    }

    const filePaths = Object.keys(unit.fileFingerprints);
    const questions = GraderEngine.generateQuestionsForUnit(unit.unitId, filePaths, unit.conceptIds);

    questions.forEach((q) => db.saveQuestion(q));

    console.log(`[onpaper] Generated ${questions.length} interview questions:`);
    questions.forEach((q, i) => {
      console.log(`\n[Question ${i + 1}] (${q.category.toUpperCase()})`);
      console.log(q.prompt);
    });
  });

// 6. submit-answers command
program
  .command("submit-answers")
  .description("Grade interview answer against rubric")
  .requiredOption("-q, --question-id <id>", "Question ID")
  .requiredOption("-s, --session-id <id>", "Session ID")
  .requiredOption("-a, --answer <text>", "Student answer")
  .action((options) => {
    const { db, globalDb } = getProjectContext();
    const questions = db.getQuestionsForUnit("");
    const stmt = (db as any).db.prepare("SELECT * FROM questions WHERE question_id = ?");
    const r = stmt.get(options.questionId) as any;
    if (!r) {
      console.error("[onpaper] Question not found.");
      return;
    }

    const question = {
      questionId: r.question_id,
      questionFamilyId: r.question_family_id,
      unitId: r.unit_id,
      conceptIds: JSON.parse(r.concept_ids),
      category: r.category,
      difficulty: r.difficulty,
      prompt: r.prompt,
      expectedAnswer: r.expected_answer,
      rubric: JSON.parse(r.rubric),
      askedAt: r.asked_at,
    };

    const { attempt, mistake, suggestedMastery } = GraderEngine.gradeInterviewAnswer(
      question as any,
      options.sessionId,
      options.answer
    );

    db.saveQuestionAttempt(attempt);

    if (mistake) {
      db.saveMistake(mistake);
      const fsrs = new FSRSEngine();
      const card = fsrs.createInitialCard(crypto.randomUUID(), {
        mistakeId: mistake.mistakeId,
        conceptId: question.conceptIds[0],
      });
      db.saveFSRSCard(card);
    }

    // Record Event
    const project = db.getProject();
    if (project) {
      const event: SyncEvent = {
        eventId: crypto.randomUUID(),
        localSequence: Date.now(),
        projectId: project.projectId,
        sessionId: options.sessionId,
        deviceId: globalDb.getDeviceId(),
        adapterVersion: "1.0.0",
        skillVersion: "1.0.0",
        eventType: "question_answered",
        localTimestamp: new Date().toISOString(),
        schemaVersion: 1,
        payload: { attemptId: attempt.attemptId, score: attempt.score, suggestedMastery },
        syncClassification: "standard",
      };
      db.recordEventAndOutbox(event);
    }

    console.log(`[onpaper] Grade: ${attempt.score} / 20 points`);
    console.log(`[onpaper] Feedback: ${attempt.feedback}`);
    console.log(`[onpaper] Mastery Update: ${suggestedMastery}`);
  });

// 7. create-exercise command
program
  .command("create-exercise")
  .description("Create a temporary sandbox coding exercise")
  .argument("<unitId>", "Unit ID")
  .action((unitId) => {
    const { db } = getProjectContext();
    const project = db.getProject();
    if (!project) return;

    const unit = db.getLearningUnits(project.projectId).find((u) => u.unitId === unitId);
    if (!unit) {
      console.error("[onpaper] Unit not found.");
      return;
    }

    const exercise = ExerciseManager.createExercise(db, unit, project.primaryLanguages[0] || "typescript");
    console.log(`[onpaper] Created exercise at: ${exercise.relativeDirectory}`);
    console.log(`[onpaper] Exercise ID: ${exercise.exerciseId}`);
  });

// 8. submit-exercise command
program
  .command("submit-exercise")
  .description("Submit and grade an active exercise")
  .argument("<exerciseId>", "Exercise ID")
  .option("-e, --explanation <text>", "Oral explanation from student")
  .action((exerciseId, options) => {
    const { db, projectRoot } = getProjectContext();
    const project = db.getProject();
    const active = db.getActiveExercise();
    if (!active || active.exerciseId !== exerciseId) {
      console.error("[onpaper] Active exercise not found.");
      return;
    }

    const lang = project?.primaryLanguages[0] || "typescript";
    const validation = ExerciseManager.validateExercise(projectRoot, active, lang);

    const grade = GraderEngine.gradeExercise(active, validation.passed, validation.output, options.explanation || "");
    db.saveGrade(grade);

    console.log(`[onpaper] Exercise graded: ${grade.combinedScore} / 100 points`);
    console.log(`[onpaper] Validation: ${validation.passed ? "PASSED" : "FAILED"}`);
    console.log(`[onpaper] Strengths: ${grade.strengths.join(", ")}`);

    // Clean up exercise
    console.log("[onpaper] Deleting temporary exercise directory...");
    const cleaned = ExerciseManager.cleanupExercise(db, exerciseId);
    console.log(`[onpaper] Cleanup: ${cleaned ? "VERIFIED DELETED" : "PENDING RETRY"}`);
  });

// 9. reviews command
const reviewsCmd = program.command("reviews").description("FSRS Spaced Repetition Reviews");

reviewsCmd
  .command("due")
  .description("List all due FSRS revision cards")
  .action(() => {
    const { db } = getProjectContext();
    const due = db.getDueFSRSCards();
    console.log(`[onpaper] ${due.length} reviews due:`);
    due.forEach((c) => {
      console.log(`- Card ID: ${c.cardId} | State: ${c.state} | Due: ${c.dueAt} | Reps: ${c.reps}`);
    });
  });

reviewsCmd
  .command("submit")
  .description("Submit a rating for an FSRS card")
  .argument("<cardId>", "Card ID")
  .argument("<rating>", "Rating: Again | Hard | Good | Easy")
  .action((cardId, rating) => {
    const { db, globalDb } = getProjectContext();
    const card = db.getFSRSCard(cardId);
    if (!card) {
      console.error("[onpaper] Card not found.");
      return;
    }

    const fsrs = new FSRSEngine();
    const { updatedCard, review } = fsrs.rate(card, rating as any);
    db.saveFSRSCard(updatedCard);
    db.saveFSRSReview({
      reviewEventId: crypto.randomUUID(),
      cardId,
      rating: rating as any,
      reviewedAt: new Date().toISOString(),
      source: "IDE",
      responseSummary: `Rated ${rating}`,
      algorithmVersion: "FSRS-4.5",
      deviceSequence: Date.now(),
    });

    console.log(`[onpaper] Card updated. Next review in ${updatedCard.scheduledDays} days (Due: ${updatedCard.dueAt}).`);
  });

// 10. sync command
program
  .command("sync")
  .description("Synchronize local outbox with AWS backend")
  .option("-e, --endpoint <url>", "AWS API Gateway Endpoint URL")
  .action(async (options) => {
    const { db, globalDb } = getProjectContext();
    const endpoint = options.endpoint || process.env.ONPAPER_API_ENDPOINT || "https://api.onpaper.dev";
    const client = new SyncClient(db, endpoint, globalDb.getDeviceId());

    console.log(`[onpaper] Pushing outbox events to ${endpoint}...`);
    const pushRes = await client.pushOutbox();
    if (pushRes) {
      console.log(`[onpaper] Push accepted: ${pushRes.acceptedOperationIds.length} events.`);
    } else {
      console.log("[onpaper] No pending events to push.");
    }
  });

program.parse(process.argv);
