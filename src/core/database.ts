import { DatabaseSync } from "node:sqlite";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import * as crypto from "node:crypto";
import {
  Project,
  FileItem,
  SymbolItem,
  Concept,
  ConceptMastery,
  LearningUnit,
  Session,
  Question,
  QuestionAttempt,
  Exercise,
  Grade,
  Mistake,
  MistakeOccurrence,
  Exposure,
  FSRSCard,
  FSRSReview,
  SyncEvent,
  OutboxOperation,
} from "../contracts/index.js";

export class ProjectDatabase {
  private db: DatabaseSync;
  public readonly dbPath: string;
  public readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    const prepDir = path.join(this.projectRoot, ".interview-prep", "state");
    if (!fs.existsSync(prepDir)) {
      fs.mkdirSync(prepDir, { recursive: true });
    }
    this.dbPath = path.join(prepDir, "learning.db");
    this.db = new DatabaseSync(this.dbPath);
    this.initPragmas();
    this.runMigrations();
  }

  private initPragmas() {
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
  }

  private runMigrations() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        project_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        root_fingerprint TEXT NOT NULL,
        primary_languages TEXT NOT NULL,
        frameworks TEXT NOT NULL,
        git_available INTEGER NOT NULL,
        curriculum_status TEXT NOT NULL,
        skill_version TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        last_opened_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS files (
        file_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        relative_path TEXT NOT NULL UNIQUE,
        language TEXT NOT NULL,
        role TEXT NOT NULL,
        content_fingerprint TEXT NOT NULL,
        structure_fingerprint TEXT NOT NULL,
        size_class TEXT NOT NULL,
        generated_status TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        git_first_seen_at TEXT,
        git_last_changed_at TEXT,
        deleted_at TEXT,
        rename_predecessor_id TEXT
      );

      CREATE TABLE IF NOT EXISTS symbols (
        symbol_id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        parent_symbol_id TEXT,
        signature_digest TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        visibility TEXT NOT NULL,
        dependencies TEXT NOT NULL,
        FOREIGN KEY(file_id) REFERENCES files(file_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS concepts (
        concept_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        language_scope TEXT NOT NULL,
        prerequisite_ids TEXT NOT NULL,
        difficulty REAL NOT NULL,
        taxonomy_version TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS concept_mastery (
        project_id TEXT NOT NULL,
        concept_id TEXT NOT NULL,
        mastery_level TEXT NOT NULL,
        mastery_score REAL NOT NULL,
        confidence REAL NOT NULL,
        introduced_at TEXT NOT NULL,
        last_assessed_at TEXT NOT NULL,
        success_count INTEGER NOT NULL,
        failure_count INTEGER NOT NULL,
        next_review_at TEXT,
        fsrs_card_id TEXT,
        state_version INTEGER NOT NULL,
        PRIMARY KEY(project_id, concept_id)
      );

      CREATE TABLE IF NOT EXISTS learning_units (
        unit_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        file_ids TEXT NOT NULL,
        file_fingerprints TEXT NOT NULL,
        concept_ids TEXT NOT NULL,
        prerequisite_ids TEXT NOT NULL,
        objectives TEXT NOT NULL,
        selection_reason TEXT NOT NULL,
        curriculum_position INTEGER NOT NULL,
        difficulty REAL NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        unit_id TEXT,
        chat_ids TEXT NOT NULL,
        adapter_type TEXT NOT NULL,
        state TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_seconds INTEGER NOT NULL,
        interruption_reason TEXT,
        summary TEXT,
        sync_status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS questions (
        question_id TEXT PRIMARY KEY,
        question_family_id TEXT NOT NULL,
        unit_id TEXT NOT NULL,
        concept_ids TEXT NOT NULL,
        category TEXT NOT NULL,
        difficulty REAL NOT NULL,
        prompt TEXT NOT NULL,
        expected_answer TEXT NOT NULL,
        rubric TEXT NOT NULL,
        asked_at TEXT NOT NULL,
        review_eligible_at TEXT
      );

      CREATE TABLE IF NOT EXISTS question_attempts (
        attempt_id TEXT PRIMARY KEY,
        question_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        student_answer TEXT NOT NULL,
        score REAL NOT NULL,
        criterion_results TEXT NOT NULL,
        feedback TEXT NOT NULL,
        misconception_tags TEXT NOT NULL,
        confidence REAL NOT NULL,
        answered_at TEXT NOT NULL,
        follow_up_of TEXT,
        FOREIGN KEY(question_id) REFERENCES questions(question_id)
      );

      CREATE TABLE IF NOT EXISTS exercises (
        exercise_id TEXT PRIMARY KEY,
        unit_id TEXT NOT NULL,
        template_family_id TEXT NOT NULL,
        relative_directory TEXT NOT NULL,
        source_file_ids TEXT NOT NULL,
        source_fingerprints TEXT NOT NULL,
        target_concept_ids TEXT NOT NULL,
        requirements TEXT NOT NULL,
        constraints TEXT NOT NULL,
        starter_fingerprint TEXT NOT NULL,
        submission_fingerprint TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        submitted_at TEXT,
        graded_at TEXT,
        deleted_at TEXT,
        cleanup_attempts INTEGER NOT NULL,
        integrity_flags TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS grades (
        grade_id TEXT PRIMARY KEY,
        exercise_id TEXT NOT NULL,
        rubric_version TEXT NOT NULL,
        answer_score REAL NOT NULL,
        code_score REAL NOT NULL,
        combined_score REAL NOT NULL,
        criterion_results TEXT NOT NULL,
        blocking_failures TEXT NOT NULL,
        strengths TEXT NOT NULL,
        improvements TEXT NOT NULL,
        mastery_updates TEXT NOT NULL,
        grader_confidence REAL NOT NULL,
        validation_summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(exercise_id) REFERENCES exercises(exercise_id)
      );

      CREATE TABLE IF NOT EXISTS mistakes (
        mistake_id TEXT PRIMARY KEY,
        canonical_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        concept_ids TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        occurrence_count INTEGER NOT NULL,
        resolved_count INTEGER NOT NULL,
        example_attempt_ids TEXT NOT NULL,
        fsrs_card_ids TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mistake_occurrences (
        occurrence_id TEXT PRIMARY KEY,
        mistake_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        question_attempt_id TEXT,
        exercise_id TEXT,
        observed_at TEXT NOT NULL,
        severity TEXT NOT NULL,
        evidence_summary TEXT NOT NULL,
        resolved_in_attempt_id TEXT,
        FOREIGN KEY(mistake_id) REFERENCES mistakes(mistake_id)
      );

      CREATE TABLE IF NOT EXISTS exposures (
        exposure_id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        identity_key TEXT NOT NULL,
        session_id TEXT NOT NULL,
        purpose TEXT NOT NULL,
        outcome TEXT NOT NULL,
        source_fingerprints TEXT,
        occurred_at TEXT NOT NULL,
        cooldown_until TEXT
      );

      CREATE TABLE IF NOT EXISTS fsrs_cards (
        card_id TEXT PRIMARY KEY,
        concept_id TEXT,
        mistake_id TEXT,
        question_family_id TEXT,
        state TEXT NOT NULL,
        due_at TEXT NOT NULL,
        last_review_at TEXT,
        stability REAL NOT NULL,
        difficulty REAL NOT NULL,
        reps INTEGER NOT NULL,
        lapses INTEGER NOT NULL,
        scheduled_days REAL NOT NULL,
        elapsed_days REAL NOT NULL,
        algorithm_version TEXT NOT NULL,
        parameter_version TEXT NOT NULL,
        last_applied_review_event_id TEXT,
        state_version INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fsrs_reviews (
        review_event_id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        rating TEXT NOT NULL,
        reviewed_at TEXT NOT NULL,
        received_at TEXT,
        source TEXT NOT NULL,
        response_summary TEXT NOT NULL,
        agent_proposed_rating TEXT,
        user_overridden_rating TEXT,
        previous_state TEXT,
        resulting_state TEXT,
        algorithm_version TEXT NOT NULL,
        device_sequence INTEGER NOT NULL,
        FOREIGN KEY(card_id) REFERENCES fsrs_cards(card_id)
      );

      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        local_sequence INTEGER NOT NULL,
        project_id TEXT NOT NULL,
        session_id TEXT,
        device_id TEXT NOT NULL,
        chat_id TEXT,
        adapter_version TEXT NOT NULL,
        skill_version TEXT NOT NULL,
        event_type TEXT NOT NULL,
        local_timestamp TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        payload TEXT NOT NULL,
        previous_event_digest TEXT,
        sync_classification TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS outbox (
        operation_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        batch_id TEXT,
        payload_hash TEXT NOT NULL,
        attempt_count INTEGER NOT NULL,
        next_retry_at TEXT,
        status TEXT NOT NULL,
        last_error TEXT,
        server_revision INTEGER,
        created_at TEXT NOT NULL,
        delivered_at TEXT,
        FOREIGN KEY(event_id) REFERENCES events(event_id)
      );

      CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
      CREATE INDEX IF NOT EXISTS idx_units_project_pos ON learning_units(project_id, curriculum_position);
      CREATE INDEX IF NOT EXISTS idx_mastery_project ON concept_mastery(project_id);
      CREATE INDEX IF NOT EXISTS idx_fsrs_due ON fsrs_cards(due_at, state);
      CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status, next_retry_at);
      CREATE INDEX IF NOT EXISTS idx_mistakes_status ON mistakes(status, severity);
    `);
  }

  // Projects
  public getProject(): Project | null {
    const stmt = this.db.prepare("SELECT * FROM projects LIMIT 1");
    const row = stmt.get() as any;
    if (!row) return null;
    return {
      projectId: row.project_id,
      displayName: row.display_name,
      rootFingerprint: row.root_fingerprint,
      primaryLanguages: JSON.parse(row.primary_languages),
      frameworks: JSON.parse(row.frameworks),
      gitAvailable: Boolean(row.git_available),
      curriculumStatus: row.curriculum_status,
      skillVersion: row.skill_version,
      schemaVersion: row.schema_version,
      createdAt: row.created_at,
      lastOpenedAt: row.last_opened_at,
    };
  }

  public saveProject(project: Project) {
    const stmt = this.db.prepare(`
      INSERT INTO projects (
        project_id, display_name, root_fingerprint, primary_languages,
        frameworks, git_available, curriculum_status, skill_version,
        schema_version, created_at, last_opened_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        display_name = excluded.display_name,
        curriculum_status = excluded.curriculum_status,
        last_opened_at = excluded.last_opened_at
    `);
    stmt.run(
      project.projectId,
      project.displayName,
      project.rootFingerprint,
      JSON.stringify(project.primaryLanguages),
      JSON.stringify(project.frameworks),
      project.gitAvailable ? 1 : 0,
      project.curriculumStatus,
      project.skillVersion,
      project.schemaVersion,
      project.createdAt,
      project.lastOpenedAt
    );
  }

  // Files
  public saveFile(file: FileItem) {
    const stmt = this.db.prepare(`
      INSERT INTO files (
        file_id, project_id, relative_path, language, role,
        content_fingerprint, structure_fingerprint, size_class,
        generated_status, first_seen_at, last_seen_at, git_first_seen_at,
        git_last_changed_at, deleted_at, rename_predecessor_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(relative_path) DO UPDATE SET
        content_fingerprint = excluded.content_fingerprint,
        structure_fingerprint = excluded.structure_fingerprint,
        last_seen_at = excluded.last_seen_at,
        deleted_at = excluded.deleted_at
    `);
    stmt.run(
      file.fileId,
      file.projectId,
      file.relativePath,
      file.language,
      file.role,
      file.contentFingerprint,
      file.structureFingerprint,
      file.sizeClass,
      file.generatedStatus,
      file.firstSeenAt,
      file.lastSeenAt,
      file.gitFirstSeenAt || null,
      file.gitLastChangedAt || null,
      file.deletedAt || null,
      file.renamePredecessorId || null
    );
  }

  public getFiles(projectId: string): FileItem[] {
    const stmt = this.db.prepare("SELECT * FROM files WHERE project_id = ? AND deleted_at IS NULL");
    const rows = stmt.all(projectId) as any[];
    return rows.map((r) => ({
      fileId: r.file_id,
      projectId: r.project_id,
      relativePath: r.relative_path,
      language: r.language,
      role: r.role,
      contentFingerprint: r.content_fingerprint,
      structureFingerprint: r.structure_fingerprint,
      sizeClass: r.size_class,
      generatedStatus: r.generated_status,
      firstSeenAt: r.first_seen_at,
      lastSeenAt: r.last_seen_at,
      gitFirstSeenAt: r.git_first_seen_at || undefined,
      gitLastChangedAt: r.git_last_changed_at || undefined,
      deletedAt: r.deleted_at || undefined,
      renamePredecessorId: r.rename_predecessor_id || undefined,
    }));
  }

  // Concepts
  public saveConcept(concept: Concept) {
    const stmt = this.db.prepare(`
      INSERT INTO concepts (
        concept_id, name, category, language_scope, prerequisite_ids, difficulty, taxonomy_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(concept_id) DO UPDATE SET
        name = excluded.name,
        prerequisite_ids = excluded.prerequisite_ids,
        difficulty = excluded.difficulty
    `);
    stmt.run(
      concept.conceptId,
      concept.name,
      concept.category,
      concept.languageScope,
      JSON.stringify(concept.prerequisiteIds),
      concept.difficulty,
      concept.taxonomyVersion
    );
  }

  public getConcepts(): Concept[] {
    const stmt = this.db.prepare("SELECT * FROM concepts");
    const rows = stmt.all() as any[];
    return rows.map((r) => ({
      conceptId: r.concept_id,
      name: r.name,
      category: r.category,
      languageScope: r.language_scope,
      prerequisiteIds: JSON.parse(r.prerequisite_ids),
      difficulty: r.difficulty,
      taxonomyVersion: r.taxonomy_version,
    }));
  }

  // Concept Mastery
  public saveConceptMastery(mastery: ConceptMastery) {
    const stmt = this.db.prepare(`
      INSERT INTO concept_mastery (
        project_id, concept_id, mastery_level, mastery_score, confidence,
        introduced_at, last_assessed_at, success_count, failure_count,
        next_review_at, fsrs_card_id, state_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, concept_id) DO UPDATE SET
        mastery_level = excluded.mastery_level,
        mastery_score = excluded.mastery_score,
        confidence = excluded.confidence,
        last_assessed_at = excluded.last_assessed_at,
        success_count = excluded.success_count,
        failure_count = excluded.failure_count,
        next_review_at = excluded.next_review_at,
        fsrs_card_id = excluded.fsrs_card_id,
        state_version = excluded.state_version + 1
    `);
    stmt.run(
      mastery.projectId,
      mastery.conceptId,
      mastery.masteryLevel,
      mastery.masteryScore,
      mastery.confidence,
      mastery.introducedAt,
      mastery.lastAssessedAt,
      mastery.successCount,
      mastery.failureCount,
      mastery.nextReviewAt || null,
      mastery.fsrsCardId || null,
      mastery.stateVersion
    );
  }

  public getMasteryMap(projectId: string): Map<string, ConceptMastery> {
    const stmt = this.db.prepare("SELECT * FROM concept_mastery WHERE project_id = ?");
    const rows = stmt.all(projectId) as any[];
    const map = new Map<string, ConceptMastery>();
    for (const r of rows) {
      map.set(r.concept_id, {
        projectId: r.project_id,
        conceptId: r.concept_id,
        masteryLevel: r.mastery_level,
        masteryScore: r.mastery_score,
        confidence: r.confidence,
        introducedAt: r.introduced_at,
        lastAssessedAt: r.last_assessed_at,
        successCount: r.success_count,
        failureCount: r.failure_count,
        nextReviewAt: r.next_review_at || undefined,
        fsrsCardId: r.fsrs_card_id || undefined,
        stateVersion: r.state_version,
      });
    }
    return map;
  }

  // Learning Units
  public saveLearningUnit(unit: LearningUnit) {
    const stmt = this.db.prepare(`
      INSERT INTO learning_units (
        unit_id, project_id, title, file_ids, file_fingerprints, concept_ids,
        prerequisite_ids, objectives, selection_reason, curriculum_position,
        difficulty, status, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(unit_id) DO UPDATE SET
        status = excluded.status,
        completed_at = excluded.completed_at
    `);
    stmt.run(
      unit.unitId,
      unit.projectId,
      unit.title,
      JSON.stringify(unit.fileIds),
      JSON.stringify(unit.fileFingerprints),
      JSON.stringify(unit.conceptIds),
      JSON.stringify(unit.prerequisiteIds),
      JSON.stringify(unit.objectives),
      unit.selectionReason,
      unit.curriculumPosition,
      unit.difficulty,
      unit.status,
      unit.createdAt,
      unit.completedAt || null
    );
  }

  public getLearningUnits(projectId: string): LearningUnit[] {
    const stmt = this.db.prepare(
      "SELECT * FROM learning_units WHERE project_id = ? ORDER BY curriculum_position ASC"
    );
    const rows = stmt.all(projectId) as any[];
    return rows.map((r) => ({
      unitId: r.unit_id,
      projectId: r.project_id,
      title: r.title,
      fileIds: JSON.parse(r.file_ids),
      fileFingerprints: JSON.parse(r.file_fingerprints),
      conceptIds: JSON.parse(r.concept_ids),
      prerequisiteIds: JSON.parse(r.prerequisite_ids),
      objectives: JSON.parse(r.objectives),
      selectionReason: r.selection_reason,
      curriculumPosition: r.curriculum_position,
      difficulty: r.difficulty,
      status: r.status,
      createdAt: r.created_at,
      completedAt: r.completed_at || undefined,
    }));
  }

  public getNextUnit(projectId: string): LearningUnit | null {
    const stmt = this.db.prepare(
      "SELECT * FROM learning_units WHERE project_id = ? AND status IN ('planned', 'active') ORDER BY curriculum_position ASC LIMIT 1"
    );
    const r = stmt.get(projectId) as any;
    if (!r) return null;
    return {
      unitId: r.unit_id,
      projectId: r.project_id,
      title: r.title,
      fileIds: JSON.parse(r.file_ids),
      fileFingerprints: JSON.parse(r.file_fingerprints),
      conceptIds: JSON.parse(r.concept_ids),
      prerequisiteIds: JSON.parse(r.prerequisite_ids),
      objectives: JSON.parse(r.objectives),
      selectionReason: r.selection_reason,
      curriculumPosition: r.curriculum_position,
      difficulty: r.difficulty,
      status: r.status,
      createdAt: r.created_at,
      completedAt: r.completed_at || undefined,
    };
  }

  // Sessions
  public saveSession(session: Session) {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        session_id, project_id, unit_id, chat_ids, adapter_type,
        state, started_at, ended_at, duration_seconds, interruption_reason,
        summary, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        state = excluded.state,
        ended_at = excluded.ended_at,
        duration_seconds = excluded.duration_seconds,
        interruption_reason = excluded.interruption_reason,
        summary = excluded.summary,
        sync_status = excluded.sync_status
    `);
    stmt.run(
      session.sessionId,
      session.projectId,
      session.unitId || null,
      JSON.stringify(session.chatIds),
      session.adapterType,
      session.state,
      session.startedAt,
      session.endedAt || null,
      session.durationSeconds,
      session.interruptionReason || null,
      session.summary || null,
      session.syncStatus
    );
  }

  public getActiveSession(projectId: string): Session | null {
    const stmt = this.db.prepare(
      "SELECT * FROM sessions WHERE project_id = ? AND state != 'completed' ORDER BY started_at DESC LIMIT 1"
    );
    const r = stmt.get(projectId) as any;
    if (!r) return null;
    return {
      sessionId: r.session_id,
      projectId: r.project_id,
      unitId: r.unit_id || undefined,
      chatIds: JSON.parse(r.chat_ids),
      adapterType: r.adapter_type,
      state: r.state,
      startedAt: r.started_at,
      endedAt: r.ended_at || undefined,
      durationSeconds: r.duration_seconds,
      interruptionReason: r.interruption_reason || undefined,
      summary: r.summary || undefined,
      syncStatus: r.sync_status,
    };
  }

  public getRecentSessions(projectId: string, limit: number = 20): Session[] {
    const stmt = this.db.prepare(
      "SELECT * FROM sessions WHERE project_id = ? ORDER BY started_at DESC LIMIT ?"
    );
    const rows = stmt.all(projectId, limit) as any[];
    return rows.map((r) => ({
      sessionId: r.session_id,
      projectId: r.project_id,
      unitId: r.unit_id || undefined,
      chatIds: JSON.parse(r.chat_ids),
      adapterType: r.adapter_type,
      state: r.state,
      startedAt: r.started_at,
      endedAt: r.ended_at || undefined,
      durationSeconds: r.duration_seconds,
      interruptionReason: r.interruption_reason || undefined,
      summary: r.summary || undefined,
      syncStatus: r.sync_status,
    }));
  }

  // Questions & Attempts
  public saveQuestion(question: Question) {
    const stmt = this.db.prepare(`
      INSERT INTO questions (
        question_id, question_family_id, unit_id, concept_ids, category,
        difficulty, prompt, expected_answer, rubric, asked_at, review_eligible_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(question_id) DO NOTHING
    `);
    stmt.run(
      question.questionId,
      question.questionFamilyId,
      question.unitId,
      JSON.stringify(question.conceptIds),
      question.category,
      question.difficulty,
      question.prompt,
      question.expectedAnswer,
      JSON.stringify(question.rubric),
      question.askedAt,
      question.reviewEligibleAt || null
    );
  }

  public getQuestionsForUnit(unitId: string): Question[] {
    const stmt = this.db.prepare("SELECT * FROM questions WHERE unit_id = ?");
    const rows = stmt.all(unitId) as any[];
    return rows.map((r) => ({
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
      reviewEligibleAt: r.review_eligible_at || undefined,
    }));
  }

  public saveQuestionAttempt(attempt: QuestionAttempt) {
    const stmt = this.db.prepare(`
      INSERT INTO question_attempts (
        attempt_id, question_id, session_id, student_answer, score,
        criterion_results, feedback, misconception_tags, confidence,
        answered_at, follow_up_of
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(attempt_id) DO NOTHING
    `);
    stmt.run(
      attempt.attemptId,
      attempt.questionId,
      attempt.sessionId,
      attempt.studentAnswer,
      attempt.score,
      JSON.stringify(attempt.criterionResults),
      attempt.feedback,
      JSON.stringify(attempt.misconceptionTags),
      attempt.confidence,
      attempt.answeredAt,
      attempt.followUpOf || null
    );
  }

  public getAttemptsForSession(sessionId: string): QuestionAttempt[] {
    const stmt = this.db.prepare("SELECT * FROM question_attempts WHERE session_id = ?");
    const rows = stmt.all(sessionId) as any[];
    return rows.map((r) => ({
      attemptId: r.attempt_id,
      questionId: r.question_id,
      sessionId: r.session_id,
      studentAnswer: r.student_answer,
      score: r.score,
      criterionResults: JSON.parse(r.criterion_results),
      feedback: r.feedback,
      misconceptionTags: JSON.parse(r.misconception_tags),
      confidence: r.confidence,
      answeredAt: r.answered_at,
      followUpOf: r.follow_up_of || undefined,
    }));
  }

  // Exercises & Grades
  public saveExercise(exercise: Exercise) {
    const stmt = this.db.prepare(`
      INSERT INTO exercises (
        exercise_id, unit_id, template_family_id, relative_directory,
        source_file_ids, source_fingerprints, target_concept_ids,
        requirements, constraints, starter_fingerprint, submission_fingerprint,
        status, created_at, submitted_at, graded_at, deleted_at, cleanup_attempts, integrity_flags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(exercise_id) DO UPDATE SET
        submission_fingerprint = excluded.submission_fingerprint,
        status = excluded.status,
        submitted_at = excluded.submitted_at,
        graded_at = excluded.graded_at,
        deleted_at = excluded.deleted_at,
        cleanup_attempts = excluded.cleanup_attempts,
        integrity_flags = excluded.integrity_flags
    `);
    stmt.run(
      exercise.exerciseId,
      exercise.unitId,
      exercise.templateFamilyId,
      exercise.relativeDirectory,
      JSON.stringify(exercise.sourceFileIds),
      JSON.stringify(exercise.sourceFingerprints),
      JSON.stringify(exercise.targetConceptIds),
      exercise.requirements,
      JSON.stringify(exercise.constraints),
      exercise.starterFingerprint,
      exercise.submissionFingerprint || null,
      exercise.status,
      exercise.createdAt,
      exercise.submittedAt || null,
      exercise.gradedAt || null,
      exercise.deletedAt || null,
      exercise.cleanupAttempts,
      JSON.stringify(exercise.integrityFlags)
    );
  }

  public getActiveExercise(): Exercise | null {
    const stmt = this.db.prepare(
      "SELECT * FROM exercises WHERE status IN ('prepared', 'active', 'submitted', 'grading', 'cleanup_pending') ORDER BY created_at DESC LIMIT 1"
    );
    const r = stmt.get() as any;
    if (!r) return null;
    return {
      exerciseId: r.exercise_id,
      unitId: r.unit_id,
      templateFamilyId: r.template_family_id,
      relativeDirectory: r.relative_directory,
      sourceFileIds: JSON.parse(r.source_file_ids),
      sourceFingerprints: JSON.parse(r.source_fingerprints),
      targetConceptIds: JSON.parse(r.target_concept_ids),
      requirements: r.requirements,
      constraints: JSON.parse(r.constraints),
      starterFingerprint: r.starter_fingerprint,
      submissionFingerprint: r.submission_fingerprint || undefined,
      status: r.status,
      createdAt: r.created_at,
      submittedAt: r.submitted_at || undefined,
      gradedAt: r.graded_at || undefined,
      deletedAt: r.deleted_at || undefined,
      cleanupAttempts: r.cleanup_attempts,
      integrityFlags: JSON.parse(r.integrity_flags),
    };
  }

  public saveGrade(grade: Grade) {
    const stmt = this.db.prepare(`
      INSERT INTO grades (
        grade_id, exercise_id, rubric_version, answer_score, code_score,
        combined_score, criterion_results, blocking_failures, strengths,
        improvements, mastery_updates, grader_confidence, validation_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(grade_id) DO NOTHING
    `);
    stmt.run(
      grade.gradeId,
      grade.exerciseId,
      grade.rubricVersion,
      grade.answerScore,
      grade.codeScore,
      grade.combinedScore,
      JSON.stringify(grade.criterionResults),
      JSON.stringify(grade.blockingFailures),
      JSON.stringify(grade.strengths),
      JSON.stringify(grade.improvements),
      JSON.stringify(grade.masteryUpdates),
      grade.graderConfidence,
      grade.validationSummary,
      grade.createdAt
    );
  }

  public getGradeForExercise(exerciseId: string): Grade | null {
    const stmt = this.db.prepare("SELECT * FROM grades WHERE exercise_id = ? LIMIT 1");
    const r = stmt.get(exerciseId) as any;
    if (!r) return null;
    return {
      gradeId: r.grade_id,
      exerciseId: r.exercise_id,
      rubricVersion: r.rubric_version,
      answerScore: r.answer_score,
      codeScore: r.code_score,
      combinedScore: r.combined_score,
      criterionResults: JSON.parse(r.criterion_results),
      blockingFailures: JSON.parse(r.blocking_failures),
      strengths: JSON.parse(r.strengths),
      improvements: JSON.parse(r.improvements),
      masteryUpdates: JSON.parse(r.mastery_updates),
      graderConfidence: r.grader_confidence,
      validationSummary: r.validation_summary,
      createdAt: r.created_at,
    };
  }

  // Mistakes
  public saveMistake(mistake: Mistake) {
    const stmt = this.db.prepare(`
      INSERT INTO mistakes (
        mistake_id, canonical_key, title, category, concept_ids, severity,
        status, first_seen_at, last_seen_at, occurrence_count, resolved_count,
        example_attempt_ids, fsrs_card_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(canonical_key) DO UPDATE SET
        severity = excluded.severity,
        status = excluded.status,
        last_seen_at = excluded.last_seen_at,
        occurrence_count = excluded.occurrence_count,
        resolved_count = excluded.resolved_count,
        example_attempt_ids = excluded.example_attempt_ids,
        fsrs_card_ids = excluded.fsrs_card_ids
    `);
    stmt.run(
      mistake.mistakeId,
      mistake.canonicalKey,
      mistake.title,
      mistake.category,
      JSON.stringify(mistake.conceptIds),
      mistake.severity,
      mistake.status,
      mistake.firstSeenAt,
      mistake.lastSeenAt,
      mistake.occurrenceCount,
      mistake.resolvedCount,
      JSON.stringify(mistake.exampleAttemptIds),
      JSON.stringify(mistake.fsrsCardIds)
    );
  }

  public getMistakes(status?: string): Mistake[] {
    let stmt;
    if (status) {
      stmt = this.db.prepare("SELECT * FROM mistakes WHERE status = ? ORDER BY last_seen_at DESC");
      return (stmt.all(status) as any[]).map(this.mapMistakeRow);
    } else {
      stmt = this.db.prepare("SELECT * FROM mistakes ORDER BY last_seen_at DESC");
      return (stmt.all() as any[]).map(this.mapMistakeRow);
    }
  }

  private mapMistakeRow(r: any): Mistake {
    return {
      mistakeId: r.mistake_id,
      canonicalKey: r.canonical_key,
      title: r.title,
      category: r.category,
      conceptIds: JSON.parse(r.concept_ids),
      severity: r.severity,
      status: r.status,
      firstSeenAt: r.first_seen_at,
      lastSeenAt: r.last_seen_at,
      occurrenceCount: r.occurrence_count,
      resolvedCount: r.resolved_count,
      exampleAttemptIds: JSON.parse(r.example_attempt_ids),
      fsrsCardIds: JSON.parse(r.fsrs_card_ids),
    };
  }

  public saveMistakeOccurrence(occ: MistakeOccurrence) {
    const stmt = this.db.prepare(`
      INSERT INTO mistake_occurrences (
        occurrence_id, mistake_id, session_id, question_attempt_id,
        exercise_id, observed_at, severity, evidence_summary, resolved_in_attempt_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(occurrence_id) DO NOTHING
    `);
    stmt.run(
      occ.occurrenceId,
      occ.mistakeId,
      occ.sessionId,
      occ.questionAttemptId || null,
      occ.exerciseId || null,
      occ.observedAt,
      occ.severity,
      occ.evidenceSummary,
      occ.resolvedInAttemptId || null
    );
  }

  // FSRS Cards & Reviews
  public saveFSRSCard(card: FSRSCard) {
    const stmt = this.db.prepare(`
      INSERT INTO fsrs_cards (
        card_id, concept_id, mistake_id, question_family_id, state,
        due_at, last_review_at, stability, difficulty, reps, lapses,
        scheduled_days, elapsed_days, algorithm_version, parameter_version,
        last_applied_review_event_id, state_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(card_id) DO UPDATE SET
        state = excluded.state,
        due_at = excluded.due_at,
        last_review_at = excluded.last_review_at,
        stability = excluded.stability,
        difficulty = excluded.difficulty,
        reps = excluded.reps,
        lapses = excluded.lapses,
        scheduled_days = excluded.scheduled_days,
        elapsed_days = excluded.elapsed_days,
        last_applied_review_event_id = excluded.last_applied_review_event_id,
        state_version = excluded.state_version + 1
    `);
    stmt.run(
      card.cardId,
      card.conceptId || null,
      card.mistakeId || null,
      card.questionFamilyId || null,
      card.state,
      card.dueAt,
      card.lastReviewAt || null,
      card.stability,
      card.difficulty,
      card.reps,
      card.lapses,
      card.scheduledDays,
      card.elapsedDays,
      card.algorithmVersion,
      card.parameterVersion,
      card.lastAppliedReviewEventId || null,
      card.stateVersion
    );
  }

  public getDueFSRSCards(nowIso: string = new Date().toISOString()): FSRSCard[] {
    const stmt = this.db.prepare(
      "SELECT * FROM fsrs_cards WHERE due_at <= ? AND state != 'Suspended' ORDER BY due_at ASC"
    );
    const rows = stmt.all(nowIso) as any[];
    return rows.map((r) => ({
      cardId: r.card_id,
      conceptId: r.concept_id || undefined,
      mistakeId: r.mistake_id || undefined,
      questionFamilyId: r.question_family_id || undefined,
      state: r.state,
      dueAt: r.due_at,
      lastReviewAt: r.last_review_at || undefined,
      stability: r.stability,
      difficulty: r.difficulty,
      reps: r.reps,
      lapses: r.lapses,
      scheduledDays: r.scheduled_days,
      elapsedDays: r.elapsed_days,
      algorithmVersion: r.algorithm_version,
      parameterVersion: r.parameter_version,
      lastAppliedReviewEventId: r.last_applied_review_event_id || undefined,
      stateVersion: r.state_version,
    }));
  }

  public getFSRSCard(cardId: string): FSRSCard | null {
    const stmt = this.db.prepare("SELECT * FROM fsrs_cards WHERE card_id = ?");
    const r = stmt.get(cardId) as any;
    if (!r) return null;
    return {
      cardId: r.card_id,
      conceptId: r.concept_id || undefined,
      mistakeId: r.mistake_id || undefined,
      questionFamilyId: r.question_family_id || undefined,
      state: r.state,
      dueAt: r.due_at,
      lastReviewAt: r.last_review_at || undefined,
      stability: r.stability,
      difficulty: r.difficulty,
      reps: r.reps,
      lapses: r.lapses,
      scheduledDays: r.scheduled_days,
      elapsedDays: r.elapsed_days,
      algorithmVersion: r.algorithm_version,
      parameterVersion: r.parameter_version,
      lastAppliedReviewEventId: r.last_applied_review_event_id || undefined,
      stateVersion: r.state_version,
    };
  }

  public saveFSRSReview(rev: FSRSReview) {
    const stmt = this.db.prepare(`
      INSERT INTO fsrs_reviews (
        review_event_id, card_id, rating, reviewed_at, received_at,
        source, response_summary, agent_proposed_rating, user_overridden_rating,
        previous_state, resulting_state, algorithm_version, device_sequence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(review_event_id) DO NOTHING
    `);
    stmt.run(
      rev.reviewEventId,
      rev.cardId,
      rev.rating,
      rev.reviewedAt,
      rev.receivedAt || null,
      rev.source,
      rev.responseSummary,
      rev.agentProposedRating || null,
      rev.userOverriddenRating || null,
      rev.previousState ? JSON.stringify(rev.previousState) : null,
      rev.resultingState ? JSON.stringify(rev.resultingState) : null,
      rev.algorithmVersion,
      rev.deviceSequence
    );
  }

  // Exposures (Repetition Prevention)
  public saveExposure(exp: Exposure) {
    const stmt = this.db.prepare(`
      INSERT INTO exposures (
        exposure_id, type, identity_key, session_id, purpose, outcome,
        source_fingerprints, occurred_at, cooldown_until
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      exp.exposureId,
      exp.type,
      exp.identityKey,
      exp.sessionId,
      exp.purpose,
      exp.outcome,
      exp.sourceFingerprints ? JSON.stringify(exp.sourceFingerprints) : null,
      exp.occurredAt,
      exp.cooldownUntil || null
    );
  }

  public isExposed(identityKey: string, nowIso: string = new Date().toISOString()): boolean {
    const stmt = this.db.prepare(`
      SELECT 1 FROM exposures
      WHERE identity_key = ? AND (cooldown_until IS NULL OR cooldown_until > ?)
      LIMIT 1
    `);
    return Boolean(stmt.get(identityKey, nowIso));
  }

  // Events & Outbox
  public recordEventAndOutbox(event: SyncEvent) {
    this.db.exec("BEGIN TRANSACTION;");
    try {
      const eventStmt = this.db.prepare(`
        INSERT INTO events (
          event_id, local_sequence, project_id, session_id, device_id,
          chat_id, adapter_version, skill_version, event_type, local_timestamp,
          schema_version, payload, previous_event_digest, sync_classification
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      eventStmt.run(
        event.eventId,
        event.localSequence,
        event.projectId,
        event.sessionId || null,
        event.deviceId,
        event.chatId || null,
        event.adapterVersion,
        event.skillVersion,
        event.eventType,
        event.localTimestamp,
        event.schemaVersion,
        JSON.stringify(event.payload),
        event.previousEventDigest || null,
        event.syncClassification
      );

      const payloadString = JSON.stringify(event.payload);
      const payloadHash = crypto.createHash("sha256").update(payloadString).digest("hex");
      const opId = crypto.randomUUID();

      const outboxStmt = this.db.prepare(`
        INSERT INTO outbox (
          operation_id, event_id, payload_hash, attempt_count,
          status, created_at
        ) VALUES (?, ?, ?, 0, 'pending', ?)
      `);
      outboxStmt.run(opId, event.eventId, payloadHash, new Date().toISOString());

      this.db.exec("COMMIT;");
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  public getPendingOutbox(): Array<{ operationId: string; event: SyncEvent; payloadHash: string }> {
    const stmt = this.db.prepare(`
      SELECT o.operation_id, o.payload_hash, e.*
      FROM outbox o
      JOIN events e ON o.event_id = e.event_id
      WHERE o.status = 'pending'
      ORDER BY e.local_sequence ASC
      LIMIT 50
    `);
    const rows = stmt.all() as any[];
    return rows.map((r) => ({
      operationId: r.operation_id,
      payloadHash: r.payload_hash,
      event: {
        eventId: r.event_id,
        localSequence: r.local_sequence,
        projectId: r.project_id,
        sessionId: r.session_id || undefined,
        deviceId: r.device_id,
        chatId: r.chat_id || undefined,
        adapterVersion: r.adapter_version,
        skillVersion: r.skill_version,
        eventType: r.event_type,
        localTimestamp: r.local_timestamp,
        schemaVersion: r.schema_version,
        payload: JSON.parse(r.payload),
        previousEventDigest: r.previous_event_digest || undefined,
        syncClassification: r.sync_classification,
      },
    }));
  }

  public markOutboxDelivered(operationIds: string[], serverRevision: number) {
    if (operationIds.length === 0) return;
    const now = new Date().toISOString();
    const placeholders = operationIds.map(() => "?").join(",");
    const stmt = this.db.prepare(`
      UPDATE outbox
      SET status = 'delivered', server_revision = ?, delivered_at = ?
      WHERE operation_id IN (${placeholders})
    `);
    stmt.run(serverRevision, now, ...operationIds);
  }

  public close() {
    this.db.close();
  }
}

// Global Profile Database (~/.onpaper/profile.db)
export class GlobalProfileDatabase {
  private db: DatabaseSync;
  public readonly dbPath: string;

  constructor() {
    const baseDir = path.join(os.homedir(), ".onpaper");
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.dbPath = path.join(baseDir, "profile.db");
    this.db = new DatabaseSync(this.dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS known_projects (
        project_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        last_opened_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS global_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  public registerProject(projectId: string, displayName: string, rootPath: string) {
    const stmt = this.db.prepare(`
      INSERT INTO known_projects (project_id, display_name, root_path, last_opened_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        display_name = excluded.display_name,
        root_path = excluded.root_path,
        last_opened_at = excluded.last_opened_at
    `);
    stmt.run(projectId, displayName, path.resolve(rootPath), new Date().toISOString());
  }

  public getKnownProjects(): Array<{ projectId: string; displayName: string; rootPath: string; lastOpenedAt: string }> {
    const stmt = this.db.prepare("SELECT * FROM known_projects ORDER BY last_opened_at DESC");
    const rows = stmt.all() as any[];
    return rows.map((r) => ({
      projectId: r.project_id,
      displayName: r.display_name,
      rootPath: r.root_path,
      lastOpenedAt: r.last_opened_at,
    }));
  }

  public setSetting(key: string, value: string) {
    const stmt = this.db.prepare(`
      INSERT INTO global_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, value);
  }

  public getSetting(key: string): string | null {
    const stmt = this.db.prepare("SELECT value FROM global_settings WHERE key = ?");
    const r = stmt.get(key) as any;
    return r ? r.value : null;
  }

  public getDeviceId(): string {
    let deviceId = this.getSetting("device_id");
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      this.setSetting("device_id", deviceId);
    }
    return deviceId;
  }

  public close() {
    this.db.close();
  }
}
