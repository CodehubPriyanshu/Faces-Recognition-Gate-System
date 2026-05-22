import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LayoutDashboard, ScanFace, DoorOpen, History, ScrollText, Users, Shield, LogOut, KeyRound } from "lucide-react";
import { motion } from "framer-motion";
import { signOut, type AppRole, type AuthProfile } from "@/hooks/use-auth";
import { UpdatePasswordModal } from "@/components/UpdatePasswordModal";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "security_guard", "gate_operator"] as AppRole[] },
  { to: "/entry", label: "Gate Entry", icon: ScanFace, roles: ["admin", "security_guard", "gate_operator"] as AppRole[] },
  { to: "/exit", label: "Gate Exit", icon: DoorOpen, roles: ["admin", "security_guard", "gate_operator"] as AppRole[] },
  { to: "/history", label: "Visitor History", icon: History, roles: ["admin", "security_guard", "gate_operator"] as AppRole[] },
  { to: "/audit", label: "Audit Logs", icon: ScrollText, roles: ["admin"] as AppRole[] },
  { to: "/users", label: "User Management", icon: Users, roles: ["admin"] as AppRole[] },
];

const ROLE_BADGE: Record<AppRole, string> = {
  admin: "bg-primary/15 text-primary border-primary/40",
  security_guard: "bg-success/15 text-success border-success/40",
  gate_operator: "bg-info/15 text-info border-info/40",
};

export function AppSidebar({ role, profile, userId }: { role: AppRole; profile: AuthProfile; userId: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [pwOpen, setPwOpen] = useState(false);

  const items = NAV.filter((n) => n.roles.includes(role));
  const initial = (profile.full_name || profile.email).charAt(0).toUpperCase();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <div className="w-10 h-10 rounded-md bg-primary/10 border border-primary/40 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="font-display font-bold text-base leading-tight">BSF · STC</div>
          <div className="mono-label !text-[0.6rem]">Bengaluru Campus</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-md font-mono text-[0.78rem] uppercase tracking-wider transition-colors ${
                active
                  ? "bg-primary/10 text-primary border border-primary/40"
                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent border border-transparent"
              }`}
            >
              {active && (
                <motion.div
                  layoutId="nav-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r"
                />
              )}
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Profile */}
      <div className="border-t border-sidebar-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary text-primary-foreground font-display font-bold flex items-center justify-center">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{profile.full_name || profile.email}</div>
            <div className="text-[0.7rem] text-muted-foreground font-mono truncate">{profile.email}</div>
          </div>
        </div>
        <div className={`inline-block px-2 py-0.5 rounded-sm border text-[0.65rem] font-mono uppercase tracking-wider ${ROLE_BADGE[role]}`}>
          {role}
        </div>
        <button
          onClick={async () => {
            await signOut();
            navigate({ to: "/login" });
          }}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-md border border-border text-[0.75rem] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign Out
        </button>
      </div>
    </aside>
  );
}
