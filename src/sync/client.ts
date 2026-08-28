// Offline Cloud Synchronization Client
// Strictly adheres to Blueprint Section 23 and 24

import { ProjectDatabase } from "../core/database.js";
import { SyncPushBatch, SyncPushResult, SyncPullResult, FSRSCard } from "../contracts/index.js";

export class SyncClient {
  private db: ProjectDatabase;
  private apiEndpoint: string;
  private authToken?: string;
  private deviceId: string;

  constructor(db: ProjectDatabase, apiEndpoint: string, deviceId: string, authToken?: string) {
    this.db = db;
    this.apiEndpoint = apiEndpoint.replace(/\/$/, "");
    this.deviceId = deviceId;
    this.authToken = authToken;
  }

  public setAuthToken(token: string) {
    this.authToken = token;
  }

  public async pushOutbox(): Promise<SyncPushResult | null> {
    const pending = this.db.getPendingOutbox();
    const project = this.db.getProject();
    const sessions = project ? this.db.getRecentSessions(project.projectId, 50) : [];
    const mistakes = this.db.getMistakes();
    const dueCards = this.db.getDueFSRSCards();

    if (pending.length === 0 && !project && sessions.length === 0 && mistakes.length === 0 && dueCards.length === 0) {
      return null;
    }

    const batchId = crypto.randomUUID();
    const pushPayload: any = {
      deviceId: this.deviceId,
      batchId,
      lastKnownServerRevision: 0,
      operations: pending.map((p) => ({
        operationId: p.operationId,
        event: p.event,
        payloadHash: p.payloadHash,
      })),
      snapshot: {
        projects: project ? [project] : [],
        sessions: sessions || [],
        mistakes: mistakes || [],
        cards: dueCards || [],
      },
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Idempotency-Key": batchId,
    };
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    try {
      const resp = await fetch(`${this.apiEndpoint}/v1/sync/push`, {
        method: "POST",
        headers,
        body: JSON.stringify(pushPayload),
      });

      if (!resp.ok) {
        throw new Error(`Sync push failed with status ${resp.status}: ${await resp.text()}`);
      }

      const result = (await resp.json()) as SyncPushResult;

      // Mark delivered operations
      const deliveredOps = [...result.acceptedOperationIds, ...result.duplicateOperationIds];
      this.db.markOutboxDelivered(deliveredOps, result.newServerRevision);

      return result;
    } catch (err: any) {
      console.warn(`Sync push deferred: ${err.message}`);
      return null;
    }
  }

  public async pullChanges(lastRevision: number = 0): Promise<SyncPullResult | null> {
    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    try {
      const resp = await fetch(`${this.apiEndpoint}/v1/sync/pull?after=${lastRevision}&limit=100`, {
        method: "GET",
        headers,
      });

      if (!resp.ok) {
        throw new Error(`Sync pull failed with status ${resp.status}: ${await resp.text()}`);
      }

      const result = (await resp.json()) as SyncPullResult;

      // Reconcile changes into local database
      for (const change of result.changes) {
        if (change.entityType === "card" && change.data) {
          const cardData = change.data as unknown as FSRSCard;
          this.db.saveFSRSCard(cardData);
        }
      }

      return result;
    } catch (err: any) {
      console.warn(`Sync pull deferred: ${err.message}`);
      return null;
    }
  }
}
