// Used alongside Node's spec reporter by test:workflows:ci.
export default async function* requireAllTests(source) {
  let summarySeen = false;
  for await (const event of source) {
    if (event.type !== "test:summary" || event.data.file !== undefined) continue;
    summarySeen = true;
    const { tests, passed, failed, cancelled, skipped, todo } = event.data.counts;
    if (!event.data.success || tests === 0 || passed === 0 || failed || cancelled || skipped || todo) {
      throw new Error(`Workflow CI requires every test to pass: ${JSON.stringify(event.data.counts)}`);
    }
    yield `Workflow CI gate: ${passed} passed, 0 skipped, 0 TODO.\n`;
  }
  if (!summarySeen) throw new Error("Workflow CI did not receive a test summary");
}
