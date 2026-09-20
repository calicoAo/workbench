export const TaskStatus = {
  TODO: 0,
  IN_PROGRESS: 1,
  DONE: 2,
  ARCHIVED: 3
} as const;

export type TaskStatusValue = (typeof TaskStatus)[keyof typeof TaskStatus];

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
