import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Audit Logs — BSF · STC" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AuditPage,
});

interface Log {
  id: string; ts: string; action: string; actor_email: string | null;
  actor_role: string | null; target: string | null; metadata: any;
}

function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  useEffect(() => {
    supabase.from("audit_logs").select("*").order("ts", { ascending: false }).limit(500)
      .then(({ data }) => setLogs((data ?? []) as Log[]));
  }, []);

  return (
    <div>
      <PageHeader eyebrow="Security / Trail" title="Audit Logs"
        subtitle="All privileged actions are recorded immutably"
        right={<div className="panel-inset px-3 py-2 font-mono text-[0.72rem] uppercase tracking-wider flex items-center gap-2"><ScrollText className="w-3.5 h-3.5 text-primary" />{logs.length} entries</div>} />

      <div className="panel">
        <div className="divide-y divide-border">
          {logs.map((l) => (
            <div key={l.id} className="grid grid-cols-12 gap-4 px-5 py-3 items-center">
              <div className="col-span-3 font-mono text-[0.72rem] text-muted-foreground">{new Date(l.ts).toLocaleString("en-GB")}</div>
              <div className="col-span-2"><span className="font-mono text-[0.7rem] uppercase tracking-wider px-2 py-0.5 rounded-sm bg-primary/10 text-primary border border-primary/40">{l.action}</span></div>
              <div className="col-span-3 text-sm">{l.actor_email ?? "system"}</div>
              <div className="col-span-2 font-mono text-[0.7rem] text-muted-foreground uppercase tracking-wider">{l.actor_role ?? "—"}</div>
              <div className="col-span-2 font-mono text-[0.72rem] text-muted-foreground truncate" title={l.target ?? ""}>{l.target ?? "—"}</div>
            </div>
          ))}
          {logs.length === 0 && <div className="px-5 py-10 text-center text-muted-foreground font-mono text-sm">No audit entries</div>}
        </div>
      </div>
    </div>
  );
}
