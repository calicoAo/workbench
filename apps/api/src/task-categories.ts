import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db/index.js";
import { taskCategories } from "./db/schema.js";
/** Categories-owned metadata read, including disabled names for duplicate advice. */
export async function taskSplitCategoryContext(userId: number) {
    return db.select({ id: taskCategories.id, name: taskCategories.name, enabled: taskCategories.enabled }).from(taskCategories).where(and(eq(taskCategories.userId, userId), isNull(taskCategories.deletedAt)));
}
