import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});
function AuthenticatedLayout() {
  const auth = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!auth.loading && !auth.user) {
      navigate({ to: "/login" });
    }
  }, [auth.loading, auth.user, navigate]);
  if (auth.loading || !auth.user || !auth.role || !auth.profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="eyebrow animate-pulse">// establishing secure link...</div>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex">
      <AppSidebar role={auth.role} profile={auth.profile} userId={auth.user.id} />
      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader />
        <main className="flex-1 px-6 lg:px-10 py-8 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
export { Route };
