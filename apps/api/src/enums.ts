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

export const ScheduleKind = {
  PLANNED: 0,
  ACTUAL: 1
} as const;

export const ScheduleSource = {
  MANUAL: 0,
  TIMER: 1,
  PLANNED_TASK: 2
} as const;
