import { api, sessionToken } from "./app/api";
import { ApplicationFeedback } from "./app/feedback";
import { WorkspaceShell } from "./app/workspace";
import { AuthGate } from "./features/auth";

export function App() {
  return (
    <ApplicationFeedback>
      {(feedback) => (
        <AuthGate request={api} tokenStorage={sessionToken} onError={feedback.notice}>
          {(session) => <WorkspaceShell request={api} session={session} feedback={feedback} />}
        </AuthGate>
      )}
    </ApplicationFeedback>
  );
}
