// Scheduled EventBridge Reminder Lambda Handler
// Strictly adheres to Blueprint Section 28

import { DynamoDBStore } from "./dynamodb.js";

export const handler = async (event: any): Promise<any> => {
  console.log("[reminder-handler] Evaluating scheduled reminders...");

  // For single-user architecture, query preferences & due cards
  const defaultUserId = "user-dev-default";
  const prefs = (await DynamoDBStore.getPreferences(defaultUserId)) || {
    timezone: "UTC",
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    notificationsEnabled: true,
  };

  if (!prefs.notificationsEnabled) {
    console.log("[reminder-handler] Notifications disabled by user preference.");
    return { status: "suppressed_preference" };
  }

  const now = new Date();
  const currentHour = now.getUTCHours();
  const quietStart = parseInt(prefs.quietHoursStart.split(":")[0], 10);
  const quietEnd = parseInt(prefs.quietHoursEnd.split(":")[0], 10);

  if (currentHour >= quietStart || currentHour < quietEnd) {
    console.log(`[reminder-handler] Current hour (${currentHour}) within quiet hours. Suppressing notification.`);
    return { status: "suppressed_quiet_hours" };
  }

  const dueCards = await DynamoDBStore.getDueCards(defaultUserId);
  if (dueCards.length === 0) {
    console.log("[reminder-handler] No due cards found.");
    return { status: "no_due_cards" };
  }

  const deduplicationKey = `${defaultUserId}:reviews_due:${now.toISOString().split("T")[0]}:${Math.floor(currentHour / 4)}`;
  console.log(`[reminder-handler] Evaluated ${dueCards.length} due cards. Deduplication key: ${deduplicationKey}`);

  // In production with APNs certificates configured in Secrets Manager:
  // APNs push would be sent here directly via HTTP/2 POST to api.push.apple.com / api.sandbox.push.apple.com

  return {
    status: "evaluated",
    dueCardsCount: dueCards.length,
    deduplicationKey,
  };
};
