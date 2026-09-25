export type GuideAnchor = string | { desktop: string; mobile: string };
export type TutorialStepKind = "modal" | "spotlight" | "coach-mark" | "celebration";
export type TutorialAdvance = "manual" | "target-action" | "condition" | "route-enter";
export type MissingTargetPolicy = "wait" | "skip";
export type TutorialInteraction = "target-only" | "interactive" | "observe";

export type TutorialStep = {
  id: "publish" | "create" | "accept" | "start";
  kind: TutorialStepKind;
  route?: string;
  target?: GuideAnchor;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right";
  advance: TutorialAdvance;
  interaction: TutorialInteraction;
  skippable: boolean;
  missingTargetPolicy: MissingTargetPolicy;
};

export type TutorialFlow = {
  id: "core-loop";
  version: 1;
  trigger: "new-user";
  steps: readonly TutorialStep[];
};

export const coreLoopFlow: TutorialFlow = {
  id: "core-loop",
  version: 1,
  trigger: "new-user",
  steps: [
    { id: "publish", kind: "spotlight", route: "/today", target: { desktop: "task.publish", mobile: "quick-action.task.publish" }, title: "发布一个小悬赏", body: "先发布一个今天真的想完成的小任务。", placement: "bottom", advance: "target-action", interaction: "target-only", skippable: true, missingTargetPolicy: "wait" },
    { id: "create", kind: "coach-mark", route: "/today", target: "task.title", title: "写下真实要做的事", body: "写下一件你真的准备做的事。不用为了教学创建测试数据。", placement: "bottom", advance: "condition", interaction: "interactive", skippable: true, missingTargetPolicy: "wait" },
    { id: "accept", kind: "spotlight", route: "/today", target: "task.accept", title: "接取这个悬赏", body: "发布不等于开始。接取表示：这是你现在准备执行的事情。", placement: "bottom", advance: "condition", interaction: "interactive", skippable: true, missingTargetPolicy: "wait" },
    { id: "start", kind: "spotlight", route: "/today", target: "task.start", title: "开始一次行动", body: "准备好了再开始。开始以后，养成系统才会记录这次真正投入的时间。", placement: "top", advance: "condition", interaction: "target-only", skippable: true, missingTargetPolicy: "wait" }
  ]
};

export function resolveGuideAnchor(anchor: GuideAnchor, taskId?: number | null) {
  const key = typeof anchor === "string" ? anchor : window.matchMedia?.("(max-width: 720px)").matches ? anchor.mobile : anchor.desktop;
  const escape = globalThis.CSS?.escape ?? ((value: string) => value.replace(/["\\]/g, "\\$&"));
  const exact = [...document.querySelectorAll<HTMLElement>(`[data-guide-anchor="${escape(key)}"]`)];
  const matches = exact.length ? exact : [...document.querySelectorAll<HTMLElement>(`[data-guide-anchor="${escape(key)}.entry"]`)];
  return (taskId ? matches.find((element) => element.dataset.guideTaskId === String(taskId)) : null) ?? matches[0] ?? null;
}
