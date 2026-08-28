// DynamoDB Single-Table Layer
// Strictly adheres to Blueprint Section 20, 21, and 22

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";

const rawClient = new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" });
export const ddb = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLE_NAME = process.env.TABLE_NAME || "onpaper-data";

export class DynamoDBStore {
  // Key Helpers
  public static userPK(userId: string): string {
    return `USER#${userId}`;
  }

  // Profile & Preferences
  public static async getPreferences(userId: string) {
    const res = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: this.userPK(userId), SK: "PREFERENCES" },
      })
    );
    return res.Item;
  }

  public static async savePreferences(userId: string, prefs: Record<string, any>) {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: this.userPK(userId),
          SK: "PREFERENCES",
          ...prefs,
          updatedAt: new Date().toISOString(),
        },
      })
    );
  }

  // Projects
  public static async saveProject(userId: string, project: Record<string, any>) {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: this.userPK(userId),
          SK: `PROJECT#${project.projectId}`,
          ...project,
          updatedAt: new Date().toISOString(),
        },
      })
    );
  }

  public static async getProjects(userId: string) {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": this.userPK(userId),
          ":skPrefix": "PROJECT#",
        },
      })
    );
    return res.Items || [];
  }

  // Sessions
  public static async saveSession(userId: string, session: Record<string, any>) {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: this.userPK(userId),
          SK: `SESSION#${session.startedAt}#${session.sessionId}`,
          ...session,
          updatedAt: new Date().toISOString(),
        },
      })
    );
  }

  public static async getSessions(userId: string, limit: number = 50) {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": this.userPK(userId),
          ":skPrefix": "SESSION#",
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    );
    return res.Items || [];
  }

  // Mistakes
  public static async saveMistake(userId: string, mistake: Record<string, any>) {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: this.userPK(userId),
          SK: `MISTAKE#${mistake.mistakeId}`,
          GSI2PK: `USER#${userId}#MISTAKE#${mistake.status || "active"}`,
          GSI2SK: `${mistake.lastSeenAt || new Date().toISOString()}#${mistake.mistakeId}`,
          ...mistake,
          updatedAt: new Date().toISOString(),
        },
      })
    );
  }

  public static async getMistakes(userId: string, status?: string) {
    if (status) {
      const res = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: "GSI2",
          KeyConditionExpression: "GSI2PK = :gsi2pk",
          ExpressionAttributeValues: {
            ":gsi2pk": `USER#${userId}#MISTAKE#${status}`,
          },
          ScanIndexForward: false,
        })
      );
      return res.Items || [];
    }

    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": this.userPK(userId),
          ":skPrefix": "MISTAKE#",
        },
      })
    );
    return res.Items || [];
  }

  // FSRS Cards
  public static async saveCard(userId: string, card: Record<string, any>) {
    const isDueIndexEligible = card.state !== "Suspended" && card.dueAt;
    const item: Record<string, any> = {
      PK: this.userPK(userId),
      SK: `CARD#${card.cardId}`,
      ...card,
      updatedAt: new Date().toISOString(),
    };

    if (isDueIndexEligible) {
      item.GSI1PK = `USER#${userId}#DUE`;
      item.GSI1SK = `${card.dueAt}#${card.cardId}`;
    }

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );
  }

  public static async getDueCards(userId: string, maxDueIso: string = new Date().toISOString()) {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :gsi1pk AND GSI1SK <= :maxDue",
        ExpressionAttributeValues: {
          ":gsi1pk": `USER#${userId}#DUE`,
          ":maxDue": `${maxDueIso}#\uffff`,
        },
      })
    );
    return res.Items || [];
  }

  public static async getCard(userId: string, cardId: string) {
    const res = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: this.userPK(userId), SK: `CARD#${cardId}` },
      })
    );
    return res.Item;
  }

  // Sync Events & Idempotency
  public static async processSyncEvent(userId: string, opId: string, event: Record<string, any>): Promise<boolean> {
    const idempKey = { PK: this.userPK(userId), SK: `IDEMP#${opId}` };
    const existing = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: idempKey,
      })
    );

    if (existing.Item) {
      return false; // Already processed
    }

    // Save event & record idempotency
    const serverRev = Date.now();
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: this.userPK(userId),
          SK: `EVENT#${serverRev}`,
          eventId: event.eventId,
          eventType: event.eventType,
          payload: event.payload,
          serverRevision: serverRev,
          createdAt: new Date().toISOString(),
        },
      })
    );

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...idempKey,
          operationId: opId,
          serverRevision: serverRev,
          createdAt: new Date().toISOString(),
        },
      })
    );

    // Materialize domain entities into DynamoDB
    try {
      const payload = event.payload || {};
      const timestamp = event.localTimestamp || new Date().toISOString();

      if (event.eventType === "project_initialized" || event.eventType === "project_updated") {
        await this.saveProject(userId, {
          projectId: event.projectId,
          displayName: payload.displayName || "Project",
          rootFingerprint: payload.rootFingerprint || "root",
          primaryLanguages: payload.primaryLanguages || ["typescript"],
          frameworks: payload.frameworks || [],
          gitAvailable: true,
          curriculumStatus: "active",
          skillVersion: "1.0.0",
          schemaVersion: 1,
          createdAt: timestamp,
          lastOpenedAt: timestamp,
        });
      } else if (event.eventType === "lesson_started" || event.eventType === "session_started") {
        await this.saveSession(userId, {
          sessionId: event.sessionId || crypto.randomUUID(),
          projectId: event.projectId,
          unitId: payload.unitId,
          adapterType: "cli",
          state: "teaching",
          startedAt: timestamp,
          durationSeconds: 0,
          summary: payload.summary || "Interactive Lesson",
          syncStatus: "synced",
        });
      } else if (event.eventType === "session_completed") {
        await this.saveSession(userId, {
          sessionId: event.sessionId || crypto.randomUUID(),
          projectId: event.projectId,
          unitId: payload.unitId,
          adapterType: "cli",
          state: "completed",
          startedAt: payload.startedAt || timestamp,
          endedAt: timestamp,
          durationSeconds: payload.durationSeconds || 600,
          summary: payload.summary || "Completed curriculum unit",
          syncStatus: "synced",
        });
      } else if (event.eventType === "mistake_recorded" || event.eventType === "mistake_updated") {
        await this.saveMistake(userId, {
          mistakeId: payload.mistakeId || crypto.randomUUID(),
          canonicalKey: payload.canonicalKey || "misconception",
          title: payload.title || "Misconception",
          category: payload.category || "concept",
          conceptIds: payload.conceptIds || [],
          severity: payload.severity || "medium",
          status: payload.status || "active",
          firstSeenAt: payload.firstSeenAt || timestamp,
          lastSeenAt: timestamp,
          occurrenceCount: payload.occurrenceCount || 1,
          resolvedCount: payload.resolvedCount || 0,
          exampleAttemptIds: payload.exampleAttemptIds || [],
          fsrsCardIds: payload.fsrsCardIds || [],
        });
      } else if (event.eventType === "card_created" || event.eventType === "card_reviewed") {
        await this.saveCard(userId, {
          cardId: payload.cardId || crypto.randomUUID(),
          conceptId: payload.conceptId || null,
          mistakeId: payload.mistakeId || null,
          questionFamilyId: payload.questionFamilyId || null,
          state: payload.state || "New",
          dueAt: payload.dueAt || timestamp,
          lastReviewAt: payload.lastReviewAt || null,
          stability: payload.stability || 0,
          difficulty: payload.difficulty || 0,
          reps: payload.reps || 0,
          lapses: payload.lapses || 0,
          scheduledDays: payload.scheduledDays || 0,
          elapsedDays: payload.elapsedDays || 0,
          algorithmVersion: "FSRS-4.5",
          parameterVersion: "default-v1",
          stateVersion: 1,
        });
      }
    } catch (materializeErr) {
      console.warn("Failed to materialize entity from sync event:", materializeErr);
    }

    return true;
  }

  // Snapshot Sync Helper
  public static async saveSnapshot(userId: string, snapshot: {
    projects?: any[];
    sessions?: any[];
    mistakes?: any[];
    cards?: any[];
  }) {
    if (snapshot.projects) {
      for (const p of snapshot.projects) {
        await this.saveProject(userId, p);
      }
    }
    if (snapshot.sessions) {
      for (const s of snapshot.sessions) {
        await this.saveSession(userId, s);
      }
    }
    if (snapshot.mistakes) {
      for (const m of snapshot.mistakes) {
        await this.saveMistake(userId, m);
      }
    }
    if (snapshot.cards) {
      for (const c of snapshot.cards) {
        await this.saveCard(userId, c);
      }
    }
  }

  // Devices & Push Tokens
  public static async registerDevice(userId: string, deviceId: string, info: Record<string, any>) {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: this.userPK(userId),
          SK: `DEVICE#${deviceId}`,
          deviceId,
          ...info,
          updatedAt: new Date().toISOString(),
        },
      })
    );
  }

  public static async getDevices(userId: string) {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": this.userPK(userId),
          ":skPrefix": "DEVICE#",
        },
      })
    );
    return res.Items || [];
  }
}
