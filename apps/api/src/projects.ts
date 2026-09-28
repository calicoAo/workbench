import { and, eq, isNull } from "drizzle-orm";
import { db, type DatabaseClient } from "./db/index.js";
import { projects } from "./db/schema.js";
import { ProjectStatus } from "./enums.js";
import { BusinessError, ErrorCode } from "./errors.js";

export async function requireProjectInClient(client: DatabaseClient, userId: number, projectId: number) {
  const [project] = await client.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId), isNull(projects.archivedAt)));
  if (!project) throw new BusinessError(ErrorCode.NOT_FOUND, "project not found", 404);
  return project;
}

export async function requireAssignableProjectInClient(client: DatabaseClient, userId: number, projectId: number) {
  const project = await requireProjectInClient(client, userId, projectId);
  if (project.status === ProjectStatus.DONE) throw new BusinessError(ErrorCode.CONFLICT, "completed project cannot receive tasks or new time", 409);
  return project;
}

export async function completedProjectSource(userId: number) {
  const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.userId, userId), eq(projects.status, ProjectStatus.DONE))).limit(1);
  return project ?? null;
}

export async function projectReferenceAvailable(userId: number, projectId: number) {
  const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.userId, userId), eq(projects.id, projectId), isNull(projects.archivedAt)));
  return Boolean(project);
}
