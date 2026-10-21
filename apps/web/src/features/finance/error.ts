import { tx } from "../../app/i18n";
export function financeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === "selected recurring templates are unavailable") return tx("所选模板已停用或不可用，请刷新后重新选择。");
  return error instanceof Error ? error.message : tx("操作失败");
}
