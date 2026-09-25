import { and, eq, isNull } from "drizzle-orm";
import { db, type DatabaseClient } from "./db/index.js";
import { onboardingFlowProgress, onboardingHintState, quickNotes, taskCompletionEvents, taskDailyAssignments, tasks, timerSessions } from "./db/schema.js";
import { AssignmentStatus } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";

export const CORE_FLOW_ID = "core-loop";
export const CORE_FLOW_VERSION = 1;
export const ONBOARDING_STATUS = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "SKIPPED"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUS)[number];

export const CORE_STEPS = ["publish", "create", "accept", "start"] as const;
export type CoreStepId = (typeof CORE_STEPS)[number];

export async function seedOnboardingForNewUser(client: DatabaseClient, userId: number, now = new Date()) {
  await client.insert(onboardingFlowProgress).values({
    userId,
    flowId: CORE_FLOW_ID,
    flowVersion: CORE_FLOW_VERSION,
    status: "NOT_STARTED",
    currentStepId: "publish",
    startedAt: null,
    completedAt: null,
    skippedAt: null,
    updatedAt: now
  });
}

export async function onboardingStatus(userId: number) {
  const [flow, hints, published, accepted, started, completed, note] = await Promise.all([
    db.select().from(onboardingFlowProgress).where(and(eq(onboardingFlowProgress.userId, userId), eq(onboardingFlowProgress.flowId, CORE_FLOW_ID), eq(onboardingFlowProgress.flowVersion, CORE_FLOW_VERSION))),
    db.select().from(onboardingHintState).where(eq(onboardingHintState.userId, userId)),
    db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt))).limit(1),
    db.select({ id: taskDailyAssignments.id }).from(taskDailyAssignments).where(and(eq(taskDailyAssignments.userId, userId), eq(taskDailyAssignments.assignmentStatus, AssignmentStatus.ACCEPTED))).limit(1),
    db.select({ id: timerSessions.id }).from(timerSessions).where(and(eq(timerSessions.userId, userId), isNull(timerSessions.deletedAt))).limit(1),
    db.select({ id: taskCompletionEvents.id }).from(taskCompletionEvents).where(eq(taskCompletionEvents.userId, userId)).limit(1),
    db.select({ id: quickNotes.id }).from(quickNotes).where(and(eq(quickNotes.userId, userId), isNull(quickNotes.deletedAt))).limit(1)
  ]);
  const progress = flow[0] ?? null;
  return {
    eligible: Boolean(progress),
    flow: progress ? serializeProgress(progress) : null,
    hints: hints.map((hint) => ({ hintKey: hint.hintKey, hintVersion: hint.hintVersion, seenAt: hint.seenAt, dismissedAt: hint.dismissedAt })),
    checklist: { published: Boolean(published[0]), accepted: Boolean(accepted[0]), started: Boolean(started[0]), completed: Boolean(completed[0]), note: Boolean(note[0]) }
  };
}

export async function startCoreFlow(userId: number) {
  const now = new Date();
  const result = await db.update(onboardingFlowProgress).set({ status: "IN_PROGRESS", currentStepId: "publish", startedAt: now, completedAt: null, skippedAt: null, updatedAt: now }).where(and(eq(onboardingFlowProgress.userId, userId), eq(onboardingFlowProgress.flowId, CORE_FLOW_ID), eq(onboardingFlowProgress.flowVersion, CORE_FLOW_VERSION), eq(onboardingFlowProgress.status, "NOT_STARTED")));
  if (result[0].affectedRows === 0) {
    const [current] = await db.select().from(onboardingFlowProgress).where(and(eq(onboardingFlowProgress.userId, userId), eq(onboardingFlowProgress.flowId, CORE_FLOW_ID), eq(onboardingFlowProgress.flowVersion, CORE_FLOW_VERSION)));
    if (!current) throw new BusinessError(ErrorCode.NOT_FOUND, "onboarding flow is not available", 404);
    return serializeProgress(current);
  }
  const [current] = await db.select().from(onboardingFlowProgress).where(and(eq(onboardingFlowProgress.userId, userId), eq(onboardingFlowProgress.flowId, CORE_FLOW_ID), eq(onboardingFlowProgress.flowVersion, CORE_FLOW_VERSION)));
  return serializeProgress(current);
}

export async function advanceCoreFlow(userId: number, stepId: CoreStepId) {
  const current = await getCoreProgress(userId);
  if (current.status === "COMPLETED" || current.status === "SKIPPED") return serializeProgress(current);
  const currentIndex = CORE_STEPS.indexOf(stepId);
  if (currentIndex < 0) throw new BusinessError(ErrorCode.PARAM_ERROR, "unknown onboarding step", 400);
  const expectedIndex = current.currentStepId ? CORE_STEPS.indexOf(current.currentStepId as CoreStepId) : CORE_STEPS.length;
  if (current.status === "NOT_STARTED") return serializeProgress(current);
  if (currentIndex < expectedIndex) return serializeProgress(current);
  if (currentIndex > expectedIndex) throw new BusinessError(ErrorCode.CONFLICT, "onboarding steps must advance in order", 409);
  const nextStep = CORE_STEPS[currentIndex + 1] ?? null;
  const now = new Date();
  await db.update(onboardingFlowProgress).set({ status: nextStep ? "IN_PROGRESS" : "COMPLETED", currentStepId: nextStep, completedAt: nextStep ? null : now, updatedAt: now }).where(and(eq(onboardingFlowProgress.userId, userId), eq(onboardingFlowProgress.flowId, CORE_FLOW_ID), eq(onboardingFlowProgress.flowVersion, CORE_FLOW_VERSION)));
  return serializeProgress(await getCoreProgress(userId));
}

export async function skipCoreFlow(userId: number) {
  const now = new Date();
  await db.update(onboardingFlowProgress).set({ status: "SKIPPED", currentStepId: null, skippedAt: now, updatedAt: now }).where(and(eq(onboardingFlowProgress.userId, userId), eq(onboardingFlowProgress.flowId, CORE_FLOW_ID), eq(onboardingFlowProgress.flowVersion, CORE_FLOW_VERSION)));
  return serializeProgress(await getCoreProgress(userId));
}

export async function restartCoreFlow(userId: number) {
  const now = new Date();
  await db.insert(onboardingFlowProgress).values({ userId, flowId: CORE_FLOW_ID, flowVersion: CORE_FLOW_VERSION, status: "IN_PROGRESS", currentStepId: "publish", startedAt: now, completedAt: null, skippedAt: null, updatedAt: now }).onDuplicateKeyUpdate({ set: { status: "IN_PROGRESS", currentStepId: "publish", startedAt: now, completedAt: null, skippedAt: null, updatedAt: now } });
  return serializeProgress(await getCoreProgress(userId));
}

export async function markHint(userId: number, hintKey: string, hintVersion: number, action: "seen" | "dismiss") {
  const now = new Date();
  const values = { userId, hintKey, hintVersion, seenAt: action === "seen" ? now : null, dismissedAt: action === "dismiss" ? now : null };
  await db.insert(onboardingHintState).values(values).onDuplicateKeyUpdate({ set: action === "seen" ? { seenAt: now } : { dismissedAt: now } });
  return { hintKey, hintVersion, ...(action === "seen" ? { seenAt: now } : { dismissedAt: now }) };
}

async function getCoreProgress(userId: number) {
  const [current] = await db.select().from(onboardingFlowProgress).where(and(eq(onboardingFlowProgress.userId, userId), eq(onboardingFlowProgress.flowId, CORE_FLOW_ID), eq(onboardingFlowProgress.flowVersion, CORE_FLOW_VERSION)));
  if (!current) throw new BusinessError(ErrorCode.NOT_FOUND, "onboarding flow is not available", 404);
  return current;
}

function serializeProgress(progress: typeof onboardingFlowProgress.$inferSelect) {
  return { flowId: progress.flowId, flowVersion: progress.flowVersion, status: progress.status as OnboardingStatus, currentStepId: progress.currentStepId, startedAt: progress.startedAt, completedAt: progress.completedAt, skippedAt: progress.skippedAt, updatedAt: progress.updatedAt };
}
