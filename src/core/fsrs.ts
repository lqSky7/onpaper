// FSRS (Free Spaced Repetition Scheduler) Engine
// Implementation adhering to FSRS-v4.5 / v5 specification

import { FSRSCard, FSRSRating, FSRSReview, FSRSState } from "../contracts/index.js";

export interface FSRSParameters {
  requestRetention: number;
  maximumInterval: number;
  w: number[];
}

export const DEFAULT_FSRS_PARAMS: FSRSParameters = {
  requestRetention: 0.9,
  maximumInterval: 36500,
  w: [
    0.40255, 1.18385, 3.173, 15.69105,
    7.1949, 0.5345, 1.4604, 0.0046,
    1.54575, 0.1192, 1.01925,
    1.9395, 0.11, 0.29605, 0.22695,
    0.2315, 2.9898,
  ],
};

export class FSRSEngine {
  private params: FSRSParameters;

  constructor(params: FSRSParameters = DEFAULT_FSRS_PARAMS) {
    this.params = params;
  }

  public createInitialCard(cardId: string, options?: { conceptId?: string; mistakeId?: string; questionFamilyId?: string }): FSRSCard {
    const now = new Date().toISOString();
    return {
      cardId,
      conceptId: options?.conceptId,
      mistakeId: options?.mistakeId,
      questionFamilyId: options?.questionFamilyId,
      state: "New",
      dueAt: now,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      scheduledDays: 0,
      elapsedDays: 0,
      algorithmVersion: "FSRS-4.5",
      parameterVersion: "default-v1",
      stateVersion: 1,
    };
  }

  public rate(card: FSRSCard, rating: FSRSRating, reviewTime: Date = new Date()): { updatedCard: FSRSCard; review: Partial<FSRSReview> } {
    const grade = this.ratingToGrade(rating);
    const nowIso = reviewTime.toISOString();
    const elapsedDays = card.lastReviewAt
      ? Math.max(0, (reviewTime.getTime() - new Date(card.lastReviewAt).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    let nextStability = card.stability;
    let nextDifficulty = card.difficulty;
    let nextState: FSRSState = card.state;
    let reps = card.reps + 1;
    let lapses = card.lapses;

    if (card.state === "New") {
      nextDifficulty = this.initialDifficulty(grade);
      nextStability = this.initialStability(grade);
      nextState = rating === "Again" ? "Learning" : "Review";
      if (rating === "Again") {
        lapses += 1;
      }
    } else {
      const retrievability = this.retrievability(elapsedDays, card.stability);
      nextDifficulty = this.nextDifficulty(card.difficulty, grade);

      if (rating === "Again") {
        lapses += 1;
        nextState = "Relearning";
        nextStability = this.nextForgetStability(card.difficulty, card.stability, retrievability);
      } else {
        nextState = "Review";
        nextStability = this.nextRecallStability(card.difficulty, card.stability, retrievability, grade);
      }
    }

    const scheduledDays = Math.min(
      this.params.maximumInterval,
      Math.max(1, Math.round(this.nextInterval(nextStability)))
    );

    const dueAt = new Date(reviewTime.getTime() + scheduledDays * 24 * 60 * 60 * 1000).toISOString();

    const updatedCard: FSRSCard = {
      ...card,
      state: nextState,
      dueAt,
      lastReviewAt: nowIso,
      stability: Number(nextStability.toFixed(4)),
      difficulty: Number(nextDifficulty.toFixed(4)),
      reps,
      lapses,
      scheduledDays,
      elapsedDays: Number(elapsedDays.toFixed(2)),
      stateVersion: card.stateVersion + 1,
    };

    const review: Partial<FSRSReview> = {
      cardId: card.cardId,
      rating,
      reviewedAt: nowIso,
      previousState: { ...card },
      resultingState: { ...updatedCard },
      algorithmVersion: "FSRS-4.5",
    };

    return { updatedCard, review };
  }

  private ratingToGrade(rating: FSRSRating): number {
    switch (rating) {
      case "Again":
        return 1;
      case "Hard":
        return 2;
      case "Good":
        return 3;
      case "Easy":
        return 4;
    }
  }

  private initialStability(grade: number): number {
    const idx = grade - 1;
    return Math.max(0.1, this.params.w[idx]);
  }

  private initialDifficulty(grade: number): number {
    const d = this.params.w[4] - (grade - 3) * this.params.w[5];
    return Math.min(10, Math.max(1, d));
  }

  private nextDifficulty(d: number, grade: number): number {
    const nextD = d - this.params.w[6] * (grade - 3);
    const meanReversion = this.params.w[7] * this.initialDifficulty(3) + (1 - this.params.w[7]) * nextD;
    return Math.min(10, Math.max(1, meanReversion));
  }

  private retrievability(elapsedDays: number, stability: number): number {
    if (stability <= 0) return 0;
    return Math.pow(1 + (19 / 81) * (elapsedDays / stability), -1);
  }

  private nextRecallStability(d: number, s: number, r: number, grade: number): number {
    const hardPenalty = grade === 2 ? this.params.w[15] : 1;
    const easyBonus = grade === 4 ? this.params.w[16] : 1;
    const modifier =
      1 +
      Math.exp(this.params.w[8]) *
        (11 - d) *
        Math.pow(s, -this.params.w[9]) *
        (Math.exp((1 - r) * this.params.w[10]) - 1) *
        hardPenalty *
        easyBonus;
    return Math.max(0.1, s * modifier);
  }

  private nextForgetStability(d: number, s: number, r: number): number {
    const sForget =
      this.params.w[11] *
      Math.pow(d, -this.params.w[12]) *
      (Math.pow(s + 1, this.params.w[13]) - 1) *
      Math.exp((1 - r) * this.params.w[14]);
    return Math.max(0.1, Math.min(s, sForget));
  }

  private nextInterval(stability: number): number {
    const factor = 19 / 81;
    const r = this.params.requestRetention;
    const interval = (stability / factor) * (Math.pow(r, -1) - 1);
    return Math.max(1, interval);
  }
}
