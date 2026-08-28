// AWS Lambda API Router
// Strictly adheres to Blueprint Section 20, 21, 22, and 23

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBStore } from "./dynamodb.js";
import { FSRSEngine } from "../../src/core/fsrs.js";

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;
  const rawPath = event.rawPath || "/";
  const path = rawPath.replace(/\/$/, "");

  // Extract Cognito User ID (sub claim)
  const claims = (event.requestContext as any)?.authorizer?.jwt?.claims;
  const userId = claims?.sub || "user-dev-default";

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,Idempotency-Key",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  };

  if (method === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};

    // 1. Account & Preferences
    if (path === "/v1/me" && method === "GET") {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ userId, email: claims?.email || "user@onpaper.local", tier: "pro" }),
      };
    }

    if (path === "/v1/preferences" && method === "GET") {
      const prefs = (await DynamoDBStore.getPreferences(userId)) || {
        timezone: "UTC",
        dailyGoalType: "session",
        dailyGoalTarget: 1,
        reminderTime: "18:00",
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        notificationsEnabled: true,
      };
      return { statusCode: 200, headers, body: JSON.stringify(prefs) };
    }

    if (path === "/v1/preferences" && method === "PATCH") {
      await DynamoDBStore.savePreferences(userId, body);
      return { statusCode: 200, headers, body: JSON.stringify({ status: "updated" }) };
    }

    // 2. Synchronization
    if (path === "/v1/sync/push" && method === "POST") {
      const operations: any[] = body.operations || [];
      const accepted: string[] = [];
      const duplicate: string[] = [];

      for (const op of operations) {
        const isNew = await DynamoDBStore.processSyncEvent(userId, op.operationId, op.event);
        if (isNew) {
          accepted.push(op.operationId);
        } else {
          duplicate.push(op.operationId);
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          acceptedOperationIds: accepted,
          duplicateOperationIds: duplicate,
          rejectedOperations: [],
          newServerRevision: Date.now(),
        }),
      };
    }

    if (path === "/v1/sync/pull" && method === "GET") {
      const dueCards = await DynamoDBStore.getDueCards(userId);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          changes: dueCards.map((c) => ({
            entityType: "card",
            entityId: c.cardId,
            action: "upsert",
            data: c,
            serverRevision: Date.now(),
            updatedAt: c.updatedAt,
          })),
          nextRevision: Date.now(),
          hasMore: false,
        }),
      };
    }

    // 3. Projects & Sessions
    if (path === "/v1/projects" && method === "GET") {
      const projects = await DynamoDBStore.getProjects(userId);
      return { statusCode: 200, headers, body: JSON.stringify(projects) };
    }

    if (path === "/v1/projects" && method === "POST") {
      await DynamoDBStore.saveProject(userId, body);
      return { statusCode: 201, headers, body: JSON.stringify({ status: "created" }) };
    }

    if (path === "/v1/sessions" && method === "GET") {
      const sessions = await DynamoDBStore.getSessions(userId);
      return { statusCode: 200, headers, body: JSON.stringify(sessions) };
    }

    if (path === "/v1/sessions" && method === "POST") {
      await DynamoDBStore.saveSession(userId, body);
      return { statusCode: 201, headers, body: JSON.stringify({ status: "created" }) };
    }

    // 4. Mistakes
    if (path === "/v1/mistakes" && method === "GET") {
      const status = event.queryStringParameters?.status;
      const mistakes = await DynamoDBStore.getMistakes(userId, status);
      return { statusCode: 200, headers, body: JSON.stringify(mistakes) };
    }

    if (path === "/v1/mistakes" && method === "POST") {
      await DynamoDBStore.saveMistake(userId, body);
      return { statusCode: 201, headers, body: JSON.stringify({ status: "created" }) };
    }

    // 5. FSRS Cards & Reviews
    if (path === "/v1/cards/due" && method === "GET") {
      const dueCards = await DynamoDBStore.getDueCards(userId);
      return { statusCode: 200, headers, body: JSON.stringify(dueCards) };
    }

    if (path.startsWith("/v1/cards/") && path.endsWith("/reviews") && method === "POST") {
      const cardId = path.split("/")[3];
      const card = await DynamoDBStore.getCard(userId, cardId);
      if (!card) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Card not found" }) };
      }

      const rating = body.rating;
      const fsrs = new FSRSEngine();
      const { updatedCard } = fsrs.rate(card as any, rating);
      await DynamoDBStore.saveCard(userId, updatedCard);

      return { statusCode: 200, headers, body: JSON.stringify(updatedCard) };
    }

    // 6. Progress Summary & Timeline
    if (path === "/v1/progress/summary" && method === "GET") {
      const sessions = await DynamoDBStore.getSessions(userId, 100);
      const mistakes = await DynamoDBStore.getMistakes(userId);
      const dueCards = await DynamoDBStore.getDueCards(userId);

      const todayPrefix = new Date().toISOString().split("T")[0];
      const hasSessionToday = sessions.some((s) => s.startedAt && s.startedAt.startsWith(todayPrefix));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          totalSessions: sessions.length,
          activeMistakesCount: mistakes.filter((m) => m.status === "active").length,
          resolvedMistakesCount: mistakes.filter((m) => m.status === "resolved").length,
          dueReviewsCount: dueCards.length,
          currentStreak: hasSessionToday ? 1 : 0,
          streakQualifiedToday: hasSessionToday,
        }),
      };
    }

    // 7. Devices & Notifications
    if (path === "/v1/devices" && method === "POST") {
      const deviceId = body.deviceId || crypto.randomUUID();
      await DynamoDBStore.registerDevice(userId, deviceId, body);
      return { statusCode: 200, headers, body: JSON.stringify({ status: "registered", deviceId }) };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ code: "NOT_FOUND", message: `Route ${method} ${path} not found` }),
    };
  } catch (err: any) {
    console.error("API Handler error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ code: "INTERNAL_ERROR", message: err.message || "Unknown error" }),
    };
  }
};
