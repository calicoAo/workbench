import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { api, sessionToken } from "./app/api";
import { ApplicationFeedback } from "./app/feedback";
import { I18nProvider } from "./app/i18n";
import { createAppQueryClient } from "./app/query";
import { WorkspaceRouter } from "./app/shell";
import { clearTaskSplitDrafts } from "./features/tasks";
import { clearLibraryImportDrafts } from "./features/library";
import { AuthGate } from "./features/auth";

const queryClient = createAppQueryClient();
const clearQueryCache = () => queryClient.clear();

const explicitSessionChange=(nextUserId:number|null)=>{
  const previous=localStorage.getItem("wb.draft-owner");
  if(nextUserId===null || previous && previous!==String(nextUserId)){clearTaskSplitDrafts();clearLibraryImportDrafts();}
  if(nextUserId!==null)localStorage.setItem("wb.draft-owner",String(nextUserId));
};
export function App() {
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ApplicationFeedback>
            {(feedback) => (
              <AuthGate request={api} tokenStorage={sessionToken} onError={feedback.notice} onSessionClear={clearQueryCache} onExplicitSessionChange={explicitSessionChange}>
                {(session) => <WorkspaceRouter request={api} session={session} feedback={feedback} />}
              </AuthGate>
            )}
          </ApplicationFeedback>
        </BrowserRouter>
      </QueryClientProvider>
    </I18nProvider>
  );
}
