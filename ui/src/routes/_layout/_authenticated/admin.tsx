import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Shield, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_layout/_authenticated/admin")({
  beforeLoad: async ({ context }) => {
    const auth = context.auth;
    if (!auth?.user || auth.user.role !== "admin") {
      throw redirect({ to: "/home" });
    }
  },
  head: () => ({
    meta: [{ title: "Admin | app" }],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const navItems = [
    {
      label: "dashboard",
      to: "/admin",
      icon: LayoutDashboard,
      match: (p: string) => p === "/admin",
    },
    {
      label: "system",
      to: "/admin/system",
      icon: Terminal,
      match: (p: string) => p.startsWith("/admin/system"),
    },
  ];

  return (
    <div className="min-h-full w-full">
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Shield className="h-3 w-3" />
          Admin
        </div>

        <nav className="flex items-center gap-1 border-b border-border pb-0">
          {navItems.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.label}
                to={item.to}
                preload="intent"
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-t-[10px] border border-b-0 transition-colors",
                  active
                    ? "bg-card text-foreground border-border"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
