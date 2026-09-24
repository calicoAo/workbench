import { and, eq, isNull, max } from "drizzle-orm";
import { type DatabaseClient } from "./db/index.js";
import { taskCategories, tasks } from "./db/schema.js";
import { TaskStatus } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";
import { runMutation } from "./mutation-receipt.js";
import { acceptLockedTaskForDateInClient } from "./task-assignments.js";
import { requireAssignableProjectInClient } from "./projects.js";

export type PublishTaskCommand = {
  userId: number;
  operationId: string;
  title: string;
  description?: string;
  categoryId?: number;
  projectId?: number;
  priority: 1 | 2 | 3;
  difficulty: 1 | 2 | 3 | 4;
  dueAt?: Date;
  estimatedMinutes?: number;
  progressPercent: number;
  acceptDate?: string;
  recordTimezone: string;
};

async function validateCategory(client: DatabaseClient, command: PublishTaskCommand) {
  if (!command.categoryId) return;
  const [category] = await client
    .select({ id: taskCategories.id })
    .from(taskCategories)
    .where(and(eq(taskCategories.id, command.categoryId), eq(taskCategories.userId, command.userId), eq(taskCategories.enabled, 1), isNull(taskCategories.deletedAt)));
  if (!category) throw new BusinessError(ErrorCode.NOT_FOUND, "category not found", 404);
}

export async function publishTaskInClient(client: DatabaseClient, command: PublishTaskCommand) {
    await validateCategory(client, command);
    if (command.projectId) await requireAssignableProjectInClient(client, command.userId, command.projectId);
    const [position] = await client.select({ value: max(tasks.sortOrder) }).from(tasks).where(and(eq(tasks.userId, command.userId), isNull(tasks.deletedAt)));
    const now = new Date();
    const [result] = await client.insert(tasks).values({
      userId: command.userId,
      categoryId: command.categoryId,
      projectId: command.projectId,
      title: command.title.trim(),
      description: command.description?.trim() || null,
      priority: command.priority,
      difficulty: command.difficulty,
      status: TaskStatus.TODO,
      estimatedMinutes: command.estimatedMinutes,
      dueDate: command.dueAt ? command.dueAt.toISOString().slice(0, 10) : null,
      dueAt: command.dueAt,
      pinned: 0,
      progressPercent: command.progressPercent,
      sortOrder: (position?.value ?? 0) + 1,
      version: 1,
      createdAt: now,
      updatedAt: now
    });
    const assignment = command.acceptDate
      ? await acceptLockedTaskForDateInClient(client, { userId: command.userId, taskId: result.insertId, taskDate: command.acceptDate, recordTimezone: command.recordTimezone })
      : null;
    return { id: result.insertId, version: 1, assignmentId: assignment?.id ?? null, assignmentVersion: assignment?.version ?? null };
}

export function publishTask(command: PublishTaskCommand) {
  return runMutation({
    userId: command.userId,
    operationId: command.operationId,
    commandType: command.acceptDate ? "PUBLISH_AND_ACCEPT_TASK" : "PUBLISH_TASK",
    request: {
      title: command.title.trim(),
      description: command.description?.trim() || null,
      categoryId: command.categoryId ?? null,
      projectId: command.projectId ?? null,
      priority: command.priority,
      difficulty: command.difficulty,
      dueAt: command.dueAt?.toISOString() ?? null,
      estimatedMinutes: command.estimatedMinutes ?? null,
      progressPercent: command.progressPercent,
      acceptDate: command.acceptDate ?? null,
      recordTimezone: command.recordTimezone
    }
  }, (tx) => publishTaskInClient(tx, command));
}
