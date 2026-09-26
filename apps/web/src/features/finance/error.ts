import { tx } from "../../app/i18n";
export function financeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : tx("操作失败");
}
