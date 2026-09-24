export const TaskStatus = {
  TODO: 0,
  IN_PROGRESS: 1,
  DONE: 2,
  ARCHIVED: 3
} as const;

export type TaskStatusValue = (typeof TaskStatus)[keyof typeof TaskStatus];

export const ProjectStatus = {
  PLANNING: 0,
  ACTIVE: 1,
  PAUSED: 2,
  DONE: 3
} as const;

export type ProjectStatusValue = (typeof ProjectStatus)[keyof typeof ProjectStatus];

const taskTransitions: Record<TaskStatusValue, TaskStatusValue[]> = {
  [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS, TaskStatus.DONE, TaskStatus.ARCHIVED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.TODO, TaskStatus.DONE],
  [TaskStatus.DONE]: [TaskStatus.TODO, TaskStatus.ARCHIVED],
  [TaskStatus.ARCHIVED]: []
};

export function canTransitTaskStatus(current: TaskStatusValue, target: TaskStatusValue) {
  return taskTransitions[current].includes(target);
}

export const TimerStatus = {
  RUNNING: 0,
  PAUSED: 1,
  FINISHED: 2,
  CANCELLED: 3
} as const;

export const AssignmentStatus = {
  ACCEPTED: 0,
  RELEASED: 1
} as const;

export const ContinuationState = {
  LEGACY_UNRESOLVED: 0,
  PENDING: 1,
  CARRIED_FORWARD: 2,
  DEFERRED: 3,
  DISMISSED: 4,
  RESCHEDULED: 5
} as const;

export const TimerSessionModel = {
  LEGACY: 0,
  VNEXT: 1
} as const;

export const TimerSegmentStatus = {
  OPEN: 0,
  CLOSED: 1,
  VOIDED: 2
} as const;

export const AttributionStatus = {
  UNKNOWN: 0,
  NONE: 1,
  ATTRIBUTED: 2
} as const;

export const ActualTimeClass = {
  NOT_ACTUAL: 0,
  MANUAL_ACTUAL: 1,
  LEGACY_ACTUAL: 2,
  TIMER_PROJECTION: 3
} as const;

export const CompletionEventSource = {
  LEGACY_COMPLETION: 0,
  VNEXT_COMMAND: 1
} as const;

export const ScheduleKind = {
  PLANNED: 0,
  ACTUAL: 1
} as const;

export const ScheduleSource = {
  MANUAL: 0,
  TIMER: 1,
  PLANNED_TASK: 2
} as const;

export const ScheduleLifecycle = {
  PENDING: 0,
  EXECUTED: 1,
  CANCELLED: 2,
  RESCHEDULED: 3
} as const;

export const HabitRecordMode = { COMPLETION: 0, COUNT: 1, QUANTITY: 2, MINUTES: 3 } as const;
export const HabitFrequency = { DAILY: 0, WEEKDAYS: 1, WEEKLY_N: 2 } as const;
export const HabitOccurrenceStatus = { PARTIAL: 0, COMPLETED: 1, SKIPPED: 2 } as const;
export const HabitOccurrenceSource = { MANUAL: 0, LINKED_TASK: 1 } as const;

export const FinanceAccountType = { CASH: 0, BANK: 1, PAYMENT: 2, CREDIT: 3 } as const;
export const FinanceCategoryKind = { INCOME: 0, EXPENSE: 1 } as const;
export const FinanceTransactionType = { OPENING: 0, INCOME: 1, EXPENSE: 2, TRANSFER: 3, REFUND: 4, REVERSAL: 5, CORRECTION: 6 } as const;
export const FinanceTransactionStatus = { POSTED: 0, REVERSED: 1, VOIDED: 2 } as const;
export const FinanceTransactionSource = { MANUAL: 0, IMPORT: 1 } as const;
