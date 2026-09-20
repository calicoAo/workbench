import { bigint, date, datetime, int, json, mysqlTable, text, time, tinyint, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  username: varchar("username", { length: 64 }).notNull(),
  displayName: varchar("display_name", { length: 64 }).notNull(),
  timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Shanghai"),
  passwordHash: varchar("password_hash", { length: 255 }),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const taskCategories = mysqlTable("task_categories", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 32 }).notNull(),
  icon: varchar("icon", { length: 64 }),
  dimensionKey: varchar("dimension_key", { length: 32 }).notNull(),
  targetMinutes: int("target_minutes").notNull(),
  sortOrder: int("sort_order").notNull(),
  enabled: tinyint("enabled").notNull(),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const tasks = mysqlTable("tasks", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  categoryId: bigint("category_id", { mode: "number", unsigned: true }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  priority: tinyint("priority").notNull(),
  difficulty: tinyint("difficulty").notNull(),
  status: tinyint("status").notNull(),
  estimatedMinutes: int("estimated_minutes"),
  dueDate: date("due_date", { mode: "string" }),
  dueAt: datetime("due_at"),
  pinned: tinyint("pinned").notNull(),
  progressPercent: tinyint("progress_percent").notNull(),
  version: int("version", { unsigned: true }).notNull().default(1),
  sortOrder: int("sort_order").notNull(),
  completedAt: datetime("completed_at"),
  completionSequence: int("completion_sequence", { unsigned: true }).notNull().default(0),
  completionNote: text("completion_note"),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const taskDailyAssignments = mysqlTable("task_daily_assignments", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  taskId: bigint("task_id", { mode: "number", unsigned: true }).notNull(),
  taskDate: date("task_date", { mode: "string" }).notNull(),
  assignmentStatus: tinyint("assignment_status").notNull().default(0),
  recordTimezone: varchar("record_timezone", { length: 64 }).notNull().default("Asia/Shanghai"),
  sortOrder: int("sort_order").notNull(),
  continuationState: tinyint("continuation_state").notNull().default(0),
  continuationHandledAt: datetime("continuation_handled_at"),
  continuationTargetDate: date("continuation_target_date", { mode: "string" }),
  continuationTargetTimezone: varchar("continuation_target_timezone", { length: 64 }),
  continuationTargetAssignmentId: bigint("continuation_target_assignment_id", { mode: "number", unsigned: true }),
  continuationTargetScheduleId: bigint("continuation_target_schedule_id", { mode: "number", unsigned: true }),
  continuationReason: varchar("continuation_reason", { length: 255 }),
  version: int("version", { unsigned: true }).notNull().default(1),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull()
});

export const timerSessions = mysqlTable("timer_sessions", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  taskId: bigint("task_id", { mode: "number", unsigned: true }).notNull(),
  sessionModel: tinyint("session_model").notNull().default(0),
  recordTimezone: varchar("record_timezone", { length: 64 }).notNull().default("Asia/Shanghai"),
  categoryId: bigint("category_id", { mode: "number", unsigned: true }),
  startTime: datetime("start_time").notNull(),
  endTime: datetime("end_time"),
  durationMinutes: int("duration_minutes").notNull(),
  status: tinyint("status").notNull(),
  completionRequested: tinyint("completion_requested").notNull().default(0),
  taskCompleted: tinyint("task_completed").notNull().default(0),
  version: int("version", { unsigned: true }).notNull().default(1),
  note: varchar("note", { length: 500 }),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const timerSegments = mysqlTable("timer_segments", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  timerSessionId: bigint("timer_session_id", { mode: "number", unsigned: true }).notNull(),
  taskId: bigint("task_id", { mode: "number", unsigned: true }).notNull(),
  status: tinyint("status").notNull(),
  startedAt: datetime("started_at", { mode: "string" }).notNull(),
  endedAt: datetime("ended_at", { mode: "string" }),
  businessDate: date("business_date", { mode: "string" }).notNull(),
  recordTimezone: varchar("record_timezone", { length: 64 }).notNull(),
  projectIdAtOccurrence: bigint("project_id_at_occurrence", { mode: "number", unsigned: true }),
  projectAttributionStatus: tinyint("project_attribution_status").notNull(),
  categoryIdAtOccurrence: bigint("category_id_at_occurrence", { mode: "number", unsigned: true }),
  categoryAttributionStatus: tinyint("category_attribution_status").notNull(),
  taskTitleSnapshot: varchar("task_title_snapshot", { length: 200 }).notNull(),
  categoryNameSnapshot: varchar("category_name_snapshot", { length: 64 }),
  version: int("version", { unsigned: true }).notNull().default(1),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const schedules = mysqlTable("schedules", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  taskId: bigint("task_id", { mode: "number", unsigned: true }),
  categoryId: bigint("category_id", { mode: "number", unsigned: true }),
  scheduleDate: date("schedule_date", { mode: "string" }).notNull(),
  recordTimezone: varchar("record_timezone", { length: 64 }).notNull().default("Asia/Shanghai"),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  actualStartedAt: datetime("actual_started_at", { mode: "string" }),
  actualEndedAt: datetime("actual_ended_at", { mode: "string" }),
  title: varchar("title", { length: 200 }).notNull(),
  note: varchar("note", { length: 500 }),
  completed: tinyint("completed").notNull(),
  kind: tinyint("kind").notNull(),
  source: tinyint("source").notNull(),
  sourceId: varchar("source_id", { length: 128 }),
  actualTimeClass: tinyint("actual_time_class").notNull().default(0),
  includeInActualTime: tinyint("include_in_actual_time").notNull().default(1),
  timerSessionId: bigint("timer_session_id", { mode: "number", unsigned: true }),
  timerSegmentId: bigint("timer_segment_id", { mode: "number", unsigned: true }),
  sliceDate: date("slice_date", { mode: "string" }),
  projectIdAtOccurrence: bigint("project_id_at_occurrence", { mode: "number", unsigned: true }),
  projectAttributionStatus: tinyint("project_attribution_status").notNull().default(0),
  categoryIdAtOccurrence: bigint("category_id_at_occurrence", { mode: "number", unsigned: true }),
  categoryAttributionStatus: tinyint("category_attribution_status").notNull().default(0),
  version: int("version", { unsigned: true }).notNull().default(1),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const scheduleCarryovers = mysqlTable("schedule_carryovers", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  fromScheduleId: bigint("from_schedule_id", { mode: "number", unsigned: true }).notNull(),
  carryDate: date("carry_date", { mode: "string" }).notNull(),
  createdAt: datetime("created_at").notNull()
});

export const sleepRecords = mysqlTable("sleep_records", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  sleepDate: date("sleep_date", { mode: "string" }).notNull(),
  sleepStart: datetime("sleep_start").notNull(),
  wakeTime: datetime("wake_time").notNull(),
  durationMinutes: int("duration_minutes").notNull(),
  qualityScore: tinyint("quality_score"),
  note: varchar("note", { length: 500 }),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const journals = mysqlTable("journals", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  journalDate: date("journal_date", { mode: "string" }).notNull(),
  recordTimezone: varchar("record_timezone", { length: 64 }).notNull().default("Asia/Shanghai"),
  happyMoment: text("happy_moment"),
  achievement: text("achievement"),
  learning: text("learning"),
  tomorrowPriority: varchar("tomorrow_priority", { length: 255 }),
  content: text("content"),
  moodScore: tinyint("mood_score"),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const morningWritings = mysqlTable("morning_writings", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  writingDate: date("writing_date", { mode: "string" }).notNull(),
  content: text("content"),
  moodScore: tinyint("mood_score"),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const stockReviews = mysqlTable("stock_reviews", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  reviewDate: date("review_date", { mode: "string" }).notNull(),
  marketSummary: text("market_summary"),
  operations: text("operations"),
  holdingsReview: text("holdings_review"),
  goodPoints: text("good_points"),
  mistakes: text("mistakes"),
  tomorrowPlan: text("tomorrow_plan"),
  emotionScore: tinyint("emotion_score"),
  disciplineScore: tinyint("discipline_score"),
  tags: varchar("tags", { length: 255 }),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const waterRecords = mysqlTable("water_records", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  waterDate: date("water_date", { mode: "string" }).notNull(),
  cups: tinyint("cups").notNull(),
  targetCups: tinyint("target_cups").notNull(),
  lastDrinkAt: datetime("last_drink_at"),
  drinkTimes: text("drink_times"),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const mediaWatchRecords = mysqlTable("media_watch_records", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  watchDate: date("watch_date", { mode: "string" }).notNull(),
  title: varchar("title", { length: 200 }),
  episode: varchar("episode", { length: 100 }),
  note: varchar("note", { length: 500 }),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const quickNotes = mysqlTable("quick_notes", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  noteDate: date("note_date", { mode: "string" }).notNull(),
  recordTimezone: varchar("record_timezone", { length: 64 }).notNull().default("Asia/Shanghai"),
  title: varchar("title", { length: 120 }),
  content: text("content").notNull(),
  tag: varchar("tag", { length: 64 }),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const userGrowth = mysqlTable("user_growth", {
  userId: bigint("user_id", { mode: "number", unsigned: true }).primaryKey(),
  level: int("level").notNull(),
  xpTotal: int("xp_total").notNull(),
  coins: int("coins").notNull(),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull()
});

export const rewardEvents = mysqlTable("reward_events", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  eventKey: varchar("event_key", { length: 128 }).notNull(),
  sourceType: varchar("source_type", { length: 32 }).notNull(),
  sourceId: varchar("source_id", { length: 64 }).notNull(),
  eventDate: date("event_date", { mode: "string" }),
  xpDelta: int("xp_delta").notNull(),
  coinDelta: int("coin_delta").notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  createdAt: datetime("created_at").notNull()
});

export const rewardItems = mysqlTable("reward_items", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  cost: int("cost").notNull(),
  description: varchar("description", { length: 500 }),
  enabled: tinyint("enabled").notNull(),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const rewardRedemptions = mysqlTable("reward_redemptions", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  rewardItemId: bigint("reward_item_id", { mode: "number", unsigned: true }),
  name: varchar("name", { length: 100 }).notNull(),
  cost: int("cost").notNull(),
  note: varchar("note", { length: 500 }),
  createdAt: datetime("created_at").notNull()
});

export const aiInsights = mysqlTable("ai_insights", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  sourceType: varchar("source_type", { length: 20 }).notNull(),
  sourceDate: date("source_date", { mode: "string" }).notNull(),
  sourceContent: text("source_content"),
  summary: text("summary"),
  emotionTags: varchar("emotion_tags", { length: 255 }),
  energyScore: tinyint("energy_score"),
  stressKeywords: varchar("stress_keywords", { length: 255 }),
  suggestion: text("suggestion"),
  fullText: text("full_text"),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const decisionRecords = mysqlTable("decision_records", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  decisionDate: date("decision_date", { mode: "string" }).notNull(),
  theme: varchar("theme", { length: 200 }).notNull(),
  benefits: text("benefits").notNull(),
  drawbacks: text("drawbacks").notNull(),
  benefitScore: tinyint("benefit_score").notNull(),
  drawbackScore: tinyint("drawback_score").notNull(),
  conclusion: varchar("conclusion", { length: 500 }),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const psychologicalBridges = mysqlTable("psychological_bridges", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  bridgeDate: date("bridge_date", { mode: "string" }).notNull(),
  desiredEffect: text("desired_effect").notNull(),
  resistance: text("resistance").notNull(),
  bridgeText: text("bridge_text").notNull(),
  nextStep: varchar("next_step", { length: 500 }),
  reassurance: varchar("reassurance", { length: 500 }),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const taskCompletionEvents = mysqlTable("task_completion_events", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  taskId: bigint("task_id", { mode: "number", unsigned: true }).notNull(),
  occurredAt: datetime("occurred_at", { mode: "string" }).notNull(),
  recordTimezone: varchar("record_timezone", { length: 64 }).notNull(),
  businessDate: date("business_date", { mode: "string" }).notNull(),
  lifecycleVersion: int("lifecycle_version", { unsigned: true }).notNull(),
  operationId: varchar("operation_id", { length: 64 }),
  source: tinyint("source").notNull(),
  createdAt: datetime("created_at").notNull()
});

export const mutationReceipts = mysqlTable("mutation_receipts", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  operationId: varchar("operation_id", { length: 64 }).notNull(),
  commandType: varchar("command_type", { length: 64 }).notNull(),
  contractVersion: int("contract_version", { unsigned: true }).notNull(),
  requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
  requestSnapshot: json("request_snapshot").notNull(),
  resultReference: varchar("result_reference", { length: 255 }),
  resultMetadata: json("result_metadata"),
  createdAt: datetime("created_at").notNull(),
  committedAt: datetime("committed_at")
});

export const userExecutionSlots = mysqlTable("user_execution_slots", {
  userId: bigint("user_id", { mode: "number", unsigned: true }).primaryKey(),
  activeSessionId: bigint("active_session_id", { mode: "number", unsigned: true }),
  version: int("version", { unsigned: true }).notNull().default(1),
  updatedAt: datetime("updated_at").notNull()
});
