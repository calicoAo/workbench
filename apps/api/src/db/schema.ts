import { bigint, char, date, datetime, decimal, int, json, mysqlTable, text, time, tinyint, varchar } from "drizzle-orm/mysql-core";

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

export const onboardingFlowProgress = mysqlTable("onboarding_flow_progress", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  flowId: varchar("flow_id", { length: 64 }).notNull(),
  flowVersion: int("flow_version", { unsigned: true }).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  currentStepId: varchar("current_step_id", { length: 64 }),
  startedAt: datetime("started_at"),
  completedAt: datetime("completed_at"),
  skippedAt: datetime("skipped_at"),
  updatedAt: datetime("updated_at").notNull()
});

export const onboardingHintState = mysqlTable("onboarding_hint_state", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  hintKey: varchar("hint_key", { length: 96 }).notNull(),
  hintVersion: int("hint_version", { unsigned: true }).notNull(),
  seenAt: datetime("seen_at"),
  dismissedAt: datetime("dismissed_at")
});

export const taskCategories = mysqlTable("task_categories", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 32 }).notNull(),
  icon: varchar("icon", { length: 64 }),
  dimensionKey: varchar("dimension_key", { length: 32 }),
  targetMinutes: int("target_minutes").notNull(),
  sortOrder: int("sort_order").notNull(),
  enabled: tinyint("enabled").notNull(),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const projects = mysqlTable("projects", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  status: tinyint("status").notNull().default(0),
  priority: tinyint("priority").notNull().default(2),
  startDate: date("start_date", { mode: "string" }),
  targetDate: date("target_date", { mode: "string" }),
  notes: text("notes"),
  version: int("version", { unsigned: true }).notNull().default(1),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  archivedAt: datetime("archived_at")
});

export const tasks = mysqlTable("tasks", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  categoryId: bigint("category_id", { mode: "number", unsigned: true }),
  projectId: bigint("project_id", { mode: "number", unsigned: true }),
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
  focusRank: tinyint("focus_rank", { unsigned: true }),
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
  lifecycleState: tinyint("lifecycle_state").notNull().default(0),
  kind: tinyint("kind").notNull(),
  source: tinyint("source").notNull(),
  sourceId: varchar("source_id", { length: 128 }),
  rescheduledFromScheduleId: bigint("rescheduled_from_schedule_id", { mode: "number", unsigned: true }),
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
  recordTimezone: varchar("record_timezone", { length: 64 }).notNull().default("Asia/Shanghai"),
  sleepStart: datetime("sleep_start").notNull(),
  wakeTime: datetime("wake_time").notNull(),
  durationMinutes: int("duration_minutes").notNull(),
  qualityScore: tinyint("quality_score"),
  note: varchar("note", { length: 500 }),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const writingSlots = mysqlTable("writing_slots", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  slotKey: varchar("slot_key", { length: 32 }).notNull(),
  enabled: tinyint("enabled").notNull().default(1),
  sortOrder: int("sort_order").notNull(),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull()
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
  projectId: bigint("project_id", { mode: "number", unsigned: true }),
  archivedAt: datetime("archived_at"),
  version: int("version", { unsigned: true }).notNull().default(1),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  deletedAt: datetime("deleted_at")
});

export const quickNoteTaskLinks = mysqlTable("quick_note_task_links", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  quickNoteId: bigint("quick_note_id", { mode: "number", unsigned: true }).notNull(),
  taskId: bigint("task_id", { mode: "number", unsigned: true }).notNull(),
  createdAt: datetime("created_at").notNull()
});

export const writingInspirations = mysqlTable("writing_inspirations", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  quickNoteId: bigint("quick_note_id", { mode: "number", unsigned: true }).notNull(),
  favorite: tinyint("favorite").notNull().default(0),
  pinned: tinyint("pinned").notNull().default(0),
  archivedAt: datetime("archived_at"),
  version: int("version", { unsigned: true }).notNull().default(1),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull()
});

export const inspirationTags = mysqlTable("inspiration_tags", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  normalizedName: varchar("normalized_name", { length: 120 }).notNull(),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull()
});

export const inspirationTagLinks = mysqlTable("inspiration_tag_links", {
  inspirationId: bigint("inspiration_id", { mode: "number", unsigned: true }).notNull(),
  tagId: bigint("tag_id", { mode: "number", unsigned: true }).notNull(),
  createdAt: datetime("created_at").notNull()
});

export const userSettings = mysqlTable("user_settings", {
  userId: bigint("user_id", { mode: "number", unsigned: true }).primaryKey(),
  reducedMotion: tinyint("reduced_motion").notNull().default(0),
  showRewards: tinyint("show_rewards").notNull().default(1),
  fontScale: tinyint("font_scale").notNull().default(100),
  updatedAt: datetime("updated_at").notNull()
});

export const userGrowth = mysqlTable("user_growth", {
  userId: bigint("user_id", { mode: "number", unsigned: true }).primaryKey(),
  level: int("level").notNull(),
  xpTotal: int("xp_total").notNull(),
  coins: int("coins").notNull(),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull()
});

export const growthDimensions = mysqlTable("growth_dimensions", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  dimensionKey: varchar("dimension_key", { length: 32 }).notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  iconKey: varchar("icon_key", { length: 64 }),
  color: varchar("color", { length: 32 }).notNull(),
  sortOrder: int("sort_order").notNull(),
  enabled: tinyint("enabled").notNull().default(1),
  version: int("version", { unsigned: true }).notNull().default(1),
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
  categoryIdAtOccurrence: bigint("category_id_at_occurrence", { mode: "number", unsigned: true }),
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

export const habitDefinitions = mysqlTable("habit_definitions", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  categoryId: bigint("category_id", { mode: "number", unsigned: true }),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  recordMode: tinyint("record_mode").notNull(),
  unit: varchar("unit", { length: 32 }),
  taskCompletionEnabled: tinyint("task_completion_enabled").notNull().default(0),
  version: int("version", { unsigned: true }).notNull().default(1),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
  archivedAt: datetime("archived_at")
});

export const habitRuleVersions = mysqlTable("habit_rule_versions", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  habitId: bigint("habit_id", { mode: "number", unsigned: true }).notNull(),
  effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
  frequencyType: tinyint("frequency_type").notNull(),
  weekdayMask: tinyint("weekday_mask", { unsigned: true }),
  weeklyTarget: tinyint("weekly_target", { unsigned: true }),
  enabled: tinyint("enabled").notNull().default(1),
  createdAt: datetime("created_at").notNull()
});

export const habitGoalVersions = mysqlTable("habit_goal_versions", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  habitId: bigint("habit_id", { mode: "number", unsigned: true }).notNull(),
  effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
  targetValue: decimal("target_value", { precision: 12, scale: 2 }).notNull(),
  createdAt: datetime("created_at").notNull()
});

export const habitOccurrences = mysqlTable("habit_occurrences", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  habitId: bigint("habit_id", { mode: "number", unsigned: true }).notNull(),
  occurrenceDate: date("occurrence_date", { mode: "string" }).notNull(),
  recordTimezone: varchar("record_timezone", { length: 64 }).notNull(),
  status: tinyint("status").notNull(),
  actualValue: decimal("actual_value", { precision: 12, scale: 2 }),
  skipReason: varchar("skip_reason", { length: 500 }),
  source: tinyint("source").notNull().default(0),
  version: int("version", { unsigned: true }).notNull().default(1),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull()
});

export const habitTaskLinks = mysqlTable("habit_task_links", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  habitId: bigint("habit_id", { mode: "number", unsigned: true }).notNull(),
  occurrenceDate: date("occurrence_date", { mode: "string" }).notNull(),
  taskId: bigint("task_id", { mode: "number", unsigned: true }).notNull(),
  completeHabitOnTask: tinyint("complete_habit_on_task").notNull().default(0),
  createdAt: datetime("created_at").notNull()
});

export const financeAccounts = mysqlTable("finance_accounts", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  type: tinyint("type").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("CNY"),
  includeInOverview: tinyint("include_in_overview").notNull().default(1),
  openingDate: date("opening_date", { mode: "string" }).notNull(),
  archivedAt: datetime("archived_at"),
  version: int("version", { unsigned: true }).notNull().default(1),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull()
});

export const financeCategories = mysqlTable("finance_categories", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  kind: tinyint("kind").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  sortOrder: int("sort_order").notNull(),
  enabled: tinyint("enabled").notNull().default(1),
  version: int("version", { unsigned: true }).notNull().default(1),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull()
});

export const financeTransactions = mysqlTable("finance_transactions", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  type: tinyint("type").notNull(),
  occurredAt: datetime("occurred_at").notNull(),
  recordTimezone: varchar("record_timezone", { length: 64 }).notNull(),
  businessDate: date("business_date", { mode: "string" }).notNull(),
  categoryId: bigint("category_id", { mode: "number", unsigned: true }),
  sourceAccountId: bigint("source_account_id", { mode: "number", unsigned: true }),
  targetAccountId: bigint("target_account_id", { mode: "number", unsigned: true }),
  relatedTransactionId: bigint("related_transaction_id", { mode: "number", unsigned: true }),
  note: varchar("note", { length: 500 }),
  status: tinyint("status").notNull().default(0),
  source: tinyint("source").notNull().default(0),
  importBatchId: bigint("import_batch_id", { mode: "number", unsigned: true }),
  sourceRowKey: varchar("source_row_key", { length: 160 }),
  sourceNamespace: varchar("source_namespace", { length: 255 }),
  sourceRowFingerprint: char("source_row_fingerprint", { length: 64 }),
  version: int("version", { unsigned: true }).notNull().default(1),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull()
});

export const financeImportBatches = mysqlTable("finance_import_batches", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  kind: tinyint("kind").notNull(),
  sourceName: varchar("source_name", { length: 255 }).notNull(),
  sourceFormat: varchar("source_format", { length: 16 }).notNull(),
  fileDigest: char("file_digest", { length: 64 }).notNull(),
  status: tinyint("status").notNull().default(0),
  summaryJson: json("summary_json").notNull(),
  createdAt: datetime("created_at").notNull(),
  confirmedAt: datetime("confirmed_at"),
  completedAt: datetime("completed_at"),
  version: int("version", { unsigned: true }).notNull().default(1)
});

export const financeImportRows = mysqlTable("finance_import_rows", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  batchId: bigint("batch_id", { mode: "number", unsigned: true }).notNull(),
  sourceRowKey: varchar("source_row_key", { length: 160 }).notNull(),
  sourceNamespace: varchar("source_namespace", { length: 255 }).notNull(),
  sourceRowFingerprint: char("source_row_fingerprint", { length: 64 }).notNull(),
  rowNumber: int("source_line_number", { unsigned: true }).notNull(),
  rawJson: json("raw_json").notNull(),
  parsedDate: date("parsed_date", { mode: "string" }),
  parsedTime: time("parsed_time"),
  parsedAmountCents: bigint("parsed_amount_cents", { mode: "bigint" }),
  parsedKind: tinyint("parsed_kind"),
  parsedNote: varchar("parsed_note", { length: 500 }),
  accountId: bigint("account_id", { mode: "number", unsigned: true }),
  categoryId: bigint("category_id", { mode: "number", unsigned: true }),
  status: tinyint("status").notNull().default(0),
  duplicateStatus: tinyint("duplicate_status").notNull().default(0),
  warningsJson: json("warnings_json").notNull(),
  errorMessage: varchar("error_message", { length: 500 }),
  transactionId: bigint("transaction_id", { mode: "number", unsigned: true }),
  version: int("version", { unsigned: true }).notNull().default(1),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull()
});

export const financeDataAudits = mysqlTable("finance_data_audits", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  batchId: bigint("batch_id", { mode: "number", unsigned: true }),
  sourceName: varchar("source_name", { length: 255 }),
  fileDigest: char("file_digest", { length: 64 }),
  summaryJson: json("summary_json").notNull(),
  createdAt: datetime("created_at").notNull()
});

export const financeEntries = mysqlTable("finance_entries", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  transactionId: bigint("transaction_id", { mode: "number", unsigned: true }).notNull(),
  accountId: bigint("account_id", { mode: "number", unsigned: true }).notNull(),
  amountCents: bigint("amount_cents", { mode: "bigint" }).notNull(),
  createdAt: datetime("created_at").notNull()
});

export const financeBudgets = mysqlTable("finance_budgets", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  budgetMonth: varchar("budget_month", { length: 7 }).notNull(),
  periodTimezone: varchar("period_timezone", { length: 64 }).notNull(),
  categoryId: bigint("category_id", { mode: "number", unsigned: true }),
  categoryScopeKey: varchar("category_scope_key", { length: 32 }).notNull(),
  limitCents: bigint("limit_cents", { mode: "bigint" }).notNull(),
  version: int("version", { unsigned: true }).notNull().default(1),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull()
});

export const financeRecurringTemplates = mysqlTable("finance_recurring_templates", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  type: tinyint("type").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  amountCents: bigint("amount_cents", { mode: "bigint", unsigned: true }).notNull(),
  accountId: bigint("account_id", { mode: "number", unsigned: true }).notNull(),
  categoryId: bigint("category_id", { mode: "number", unsigned: true }).notNull(),
  frequency: tinyint("frequency").notNull(),
  scheduleValue: tinyint("schedule_value", { unsigned: true }).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  enabled: tinyint("enabled").notNull().default(1),
  version: int("version", { unsigned: true }).notNull().default(1),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull()
});

export const financeRecurringOccurrences = mysqlTable("finance_recurring_occurrences", {
  id: bigint("id", { mode: "number", unsigned: true }).primaryKey().autoincrement(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  templateId: bigint("template_id", { mode: "number", unsigned: true }).notNull(),
  scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
  recordTimezone: varchar("record_timezone", { length: 64 }).notNull(),
  status: tinyint("status").notNull().default(0),
  amountCentsSnapshot: bigint("amount_cents_snapshot", { mode: "bigint", unsigned: true }).notNull(),
  accountIdSnapshot: bigint("account_id_snapshot", { mode: "number", unsigned: true }).notNull(),
  categoryIdSnapshot: bigint("category_id_snapshot", { mode: "number", unsigned: true }).notNull(),
  postedTransactionId: bigint("posted_transaction_id", { mode: "number", unsigned: true }),
  version: int("version", { unsigned: true }).notNull().default(1),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull()
});
