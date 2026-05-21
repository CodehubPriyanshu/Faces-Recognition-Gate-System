import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Users2, UserCheck, DoorOpen, ShieldCheck, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Gate Command Center — BSF · STC" }] }),
  component: Dashboard,
});

interface Visitor {
  id: string; pass_no: string; full_name: string; mobile: string;
  purpose: string; entry_time: string; exit_time: string | null; status: string;
}

const PURPOSE_COLORS = ["oklch(0.79 0.16 75)", "oklch(0.70 0.16 230)", "oklch(0.78 0.18 155)", "oklch(0.62 0.20 300)", "oklch(0.65 0.22 25)"];

function Dashboard() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("visitors").select("*").order("entry_time", { ascending: false }).limit(500);
      setVisitors((data ?? []) as Visitor[]);
    };
    load();
    const ch = supabase.channel("dash-visitors").on(
      "postgres_changes", { event: "*", schema: "public", table: "visitors" }, load
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const visitorsToday = visitors.filter((v) => new Date(v.entry_time) >= today).length;
  const inCampus = visitors.filter((v) => v.status === "in_campus").length;

  const weekChart = useMemo(() => {
    const days: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const c = visitors.filter((v) => { const t = new Date(v.entry_time); return t >= d && t < next; }).length;
      days.push({ day: `${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`, count: c });
    }
    return days;
  }, [visitors]);

  const purposeChart = useMemo(() => {
    const counts: Record<string, number> = {};
    visitors.forEach((v) => { counts[v.purpose] = (counts[v.purpose] ?? 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [visitors]);

  return (
    <div>
      <PageHeader
        eyebrow="Command Overview / Live"
        title="Gate Command Center"
        subtitle="Real-time monitoring · synced with cloud database"
        right={
          <div className="flex items-center gap-2 panel-inset px-3 py-2 text-success font-mono text-[0.72rem] uppercase tracking-wider">
            <Activity className="w-3.5 h-3.5" /> Online
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="Visitors Today" value={visitorsToday} icon={<Users2 className="w-4 h-4" />} color="text-primary" />
        <StatCard label="In Campus" value={inCampus} icon={<UserCheck className="w-4 h-4" />} color="text-success" />
        <StatCard label="Exit Pending" value={inCampus} icon={<DoorOpen className="w-4 h-4" />} color="text-destructive" />
        <StatCard label="Security Status" value="OK" icon={<ShieldCheck className="w-4 h-4" />} color="text-success" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="panel p-5 lg:col-span-2">
          <div className="mono-label mb-4">7-Day Entry Volume</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weekChart}>
              <XAxis dataKey="day" stroke="oklch(0.65 0.01 80)" fontSize={11} fontFamily="JetBrains Mono" />
              <YAxis stroke="oklch(0.65 0.01 80)" fontSize={11} fontFamily="JetBrains Mono" allowDecimals={false} />
              <Tooltip cursor={{ fill: "oklch(0.79 0.16 75 / 0.08)" }}
                contentStyle={{ background: "oklch(0.19 0.006 80)", border: "1px solid oklch(0.36 0.008 80)", fontFamily: "JetBrains Mono", fontSize: 12 }} />
              <Bar dataKey="count" fill="oklch(0.79 0.16 75)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel p-5">
          <div className="mono-label mb-4">Purpose Distribution</div>
          {purposeChart.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground font-mono text-xs">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={purposeChart} dataKey="value" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {purposeChart.map((_, i) => <Cell key={i} fill={PURPOSE_COLORS[i % PURPOSE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "oklch(0.19 0.006 80)", border: "1px solid oklch(0.36 0.008 80)", fontFamily: "JetBrains Mono", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="panel">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="mono-label">Live Visitor Activity Feed</div>
          <Link to="/history" className="font-mono text-[0.72rem] uppercase tracking-wider text-primary hover:underline">View All →</Link>
        </div>
        <div className="divide-y divide-border">
          {visitors.slice(0, 8).map((v) => (
            <div key={v.id} className="grid grid-cols-12 gap-4 px-5 py-4 items-center">
              <div className="col-span-3">
                <div className="font-semibold">{v.full_name}</div>
                <div className="font-mono text-[0.7rem] text-muted-foreground">{v.pass_no}</div>
              </div>
              <div className="col-span-2 font-mono text-sm text-muted-foreground">{v.mobile}</div>
              <div className="col-span-3 text-sm">{v.purpose}</div>
              <div className="col-span-3 font-mono text-[0.72rem] text-muted-foreground">
                IN {new Date(v.entry_time).toLocaleTimeString("en-GB").slice(0,8)}
                {v.exit_time && <> · OUT {new Date(v.exit_time).toLocaleTimeString("en-GB").slice(0,8)}</>}
              </div>
              <div className="col-span-1 flex justify-end">
                <span className={`px-2 py-0.5 rounded-sm text-[0.65rem] font-mono uppercase tracking-wider border ${
                  v.status === "in_campus" ? "text-success border-success/40 bg-success/10" : "text-muted-foreground border-border bg-muted/30"
                }`}>{v.status === "in_campus" ? "Active" : "Exited"}</span>
              </div>
            </div>
          ))}
          {visitors.length === 0 && (
            <div className="px-5 py-10 text-center text-muted-foreground font-mono text-sm">No activity recorded yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <div className="mono-label">{label}</div>
        <span className={color}>{icon}</span>
      </div>
      <div className={`mt-3 text-5xl font-display font-bold ${color}`}>{value}</div>
    </div>
  );
}
