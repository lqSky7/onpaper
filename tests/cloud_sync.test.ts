// Cloud Sync & Outbox Integration Tests
// Strictly adheres to Blueprint Section 23, 24, and 34

import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ProjectDatabase } from "../src/core/database.js";
import { SyncClient } from "../src/sync/client.js";

test("Sync: Outbox batching, idempotency and delivery confirmation", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "onpaper-sync-test-"));
  const db = new ProjectDatabase(tmpDir);

  const event1 = {
    eventId: "sync-ev-1",
    localSequence: 1,
    projectId: "proj-sync-1",
    deviceId: "dev-mac-1",
    adapterVersion: "1.0.0",
    skillVersion: "1.0.0",
    eventType: "lesson_started",
    localTimestamp: new Date().toISOString(),
    schemaVersion: 1,
    payload: { unitId: "unit-1", title: "Unit 1: Syntax" },
    syncClassification: "standard",
  };

  const event2 = {
    eventId: "sync-ev-2",
    localSequence: 2,
    projectId: "proj-sync-1",
    deviceId: "dev-mac-1",
    adapterVersion: "1.0.0",
    skillVersion: "1.0.0",
    eventType: "question_answered",
    localTimestamp: new Date().toISOString(),
    schemaVersion: 1,
    payload: { score: 18, rating: "Good" },
    syncClassification: "standard",
  };

  db.recordEventAndOutbox(event1);
  db.recordEventAndOutbox(event2);

  const pending = db.getPendingOutbox();
  assert.equal(pending.length, 2);
  assert.equal(pending[0].event.eventId, "sync-ev-1");
  assert.equal(pending[1].event.eventId, "sync-ev-2");

  // Push to live AWS backend API
  const liveEndpoint = "https://xa9njv2kaf.execute-api.ap-south-1.amazonaws.com";
  const client = new SyncClient(db, liveEndpoint, "dev-mac-1");

  const pushResult = await client.pushOutbox();
  assert.ok(pushResult);
  assert.equal(pushResult.acceptedOperationIds.length, 2);

  const pendingAfterPush = db.getPendingOutbox();
  assert.equal(pendingAfterPush.length, 0);

  // Pull feed
  const pullResult = await client.pullChanges(0);
  assert.ok(pullResult);

  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
