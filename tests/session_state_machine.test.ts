// Session State Machine & Transition Guard Tests
// Strictly adheres to Blueprint Section 16 and 34

import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ProjectDatabase } from "../src/core/database.js";
import { Session, SessionState } from "../src/contracts/index.js";

test("Session: State Machine Transitions", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onpaper-session-test-"));
  const db = new ProjectDatabase(tmpDir);

  const sessionId = "sess-flow-1";
  const session: Session = {
    sessionId,
    projectId: "proj-1",
    unitId: "unit-1",
    chatIds: ["chat-1"],
    adapterType: "antigravity",
    state: "restore_state",
    startedAt: new Date().toISOString(),
    durationSeconds: 0,
    syncStatus: "pending",
  };

  db.saveSession(session);
  assert.equal(db.getActiveSession("proj-1")?.state, "restore_state");

  // Transition through valid states
  const states: SessionState[] = [
    "repository_check",
    "curriculum_planning",
    "teaching",
    "questioning",
    "answer_assessment",
    "exercise_preparation",
    "exercise_active",
    "exercise_submitted",
    "grading",
    "feedback",
    "cleanup",
    "completed",
  ];

  for (const s of states) {
    session.state = s;
    if (s === "completed") {
      session.endedAt = new Date().toISOString();
    }
    db.saveSession(session);
  }

  // Once completed, active session should be null
  assert.equal(db.getActiveSession("proj-1"), null);

  const recent = db.getRecentSessions("proj-1");
  assert.equal(recent.length, 1);
  assert.equal(recent[0].state, "completed");

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
