import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireSession } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: requireSession,
  component: AuthenticatedLayout,
});

// The shell is rendered once by the root route.
function AuthenticatedLayout() {
  return <Outlet />;
}
