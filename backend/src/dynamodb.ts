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

    return true;
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
