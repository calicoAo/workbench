export function financeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}
