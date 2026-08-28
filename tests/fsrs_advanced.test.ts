// Advanced FSRS Spaced Repetition Mathematical & State Progression Tests
// Strictly adheres to Blueprint Section 19 and 34

import test from "node:test";
import assert from "node:assert/strict";
import { FSRSEngine } from "../src/core/fsrs.js";

test("FSRS: Multi-Day Spaced Repetition Progression", () => {
  const fsrs = new FSRSEngine();
  let card = fsrs.createInitialCard("fsrs-card-adv-1", {
    conceptId: "go/goroutines-channels",
  });

  // Day 0: First Review (Good)
  const r1 = fsrs.rate(card, "Good", new Date("2026-03-01T10:00:00Z"));
  card = r1.updatedCard;
  assert.equal(card.state, "Review");
  assert.equal(card.reps, 1);
  assert.equal(card.lapses, 0);

  // Day 3: Second Review (Good)
  const r2 = fsrs.rate(card, "Good", new Date("2026-03-04T10:00:00Z"));
  card = r2.updatedCard;
  assert.equal(card.reps, 2);
  assert.ok(card.stability > r1.updatedCard.stability);
  assert.ok(card.scheduledDays >= 3);

  // Day 14: Third Review (Easy)
  const r3 = fsrs.rate(card, "Easy", new Date("2026-03-18T10:00:00Z"));
  card = r3.updatedCard;
  assert.equal(card.reps, 3);
  assert.ok(card.stability > r2.updatedCard.stability);

  // Day 60: Fourth Review (Again - Forgotten concept)
  const r4 = fsrs.rate(card, "Again", new Date("2026-05-17T10:00:00Z"));
  card = r4.updatedCard;
  assert.equal(card.state, "Relearning");
  assert.equal(card.lapses, 1);
  assert.equal(card.reps, 4);
  assert.ok(card.stability < r3.updatedCard.stability);

  // Day 61: Relearned (Good)
  const r5 = fsrs.rate(card, "Good", new Date("2026-05-18T10:00:00Z"));
  card = r5.updatedCard;
  assert.equal(card.state, "Review");
  assert.equal(card.reps, 5);
});

test("FSRS: Difficulty bounds and clamping", () => {
  const fsrs = new FSRSEngine();
  let card = fsrs.createInitialCard("fsrs-card-adv-2");

  // Continuous Hard reviews should increase difficulty but stay <= 10
  for (let i = 0; i < 15; i++) {
    const res = fsrs.rate(card, "Hard", new Date());
    card = res.updatedCard;
    assert.ok(card.difficulty <= 10);
    assert.ok(card.difficulty >= 1);
  }

  // Continuous Easy reviews should decrease difficulty but stay >= 1
  for (let i = 0; i < 15; i++) {
    const res = fsrs.rate(card, "Easy", new Date());
    card = res.updatedCard;
    assert.ok(card.difficulty <= 10);
    assert.ok(card.difficulty >= 1);
  }
});
