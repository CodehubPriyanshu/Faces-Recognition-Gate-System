import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Search, ScanFace, DoorOpen, XCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { recordAudit } from "@/lib/audit";
import { PageHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/_authenticated/exit")({
  head: () => ({ meta: [{ title: "Gate Exit Verification — BSF · STC" }] }),
  component: ExitPage,
});

interface Visitor {
  id: string; pass_no: string; full_name: string; mobile: string;
  purpose: string; entry_time: string; photo_url: string | null; status: string;
}

function ExitPage() {
  const auth = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState<Visitor[]>([]);
  const [search, setSearch] = useState("");
  const [matched, setMatched] = useState<Visitor | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("visitors").select("*").eq("status", "in_campus").order("entry_time", { ascending: false });
      setActive((data ?? []) as Visitor[]);
    };
    load();
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {/* ignore */}
    })();
    const ch = supabase.channel("exit-vis").on("postgres_changes", { event: "*", schema: "public", table: "visitors" }, load).subscribe();
    return () => { stream?.getTracks().forEach((t) => t.stop()); supabase.removeChannel(ch); };
  }, []);

  const filtered = active.filter((v) => {
    const q = search.toLowerCase();
    return !q || v.full_name.toLowerCase().includes(q) || v.pass_no.toLowerCase().includes(q) || v.mobile.includes(q);
  });

  const simulateScan = () => {
    if (filtered.length === 0) return toast.error("No active visitors to match");
    setScanning(true); setMatched(null);
    setTimeout(() => {
      setMatched(filtered[0]);
      setScanning(false);
      toast.success(`Match found: ${filtered[0].full_name}`);
    }, 1800);
  };

  const confirmExit = async (v: Visitor, method: "face" | "manual") => {
    const { error } = await supabase.from("visitors").update({
      status: "exited", exit_time: new Date().toISOString(), exit_by: auth.user!.id, exit_method: method,
    }).eq("id", v.id);
    if (error) return toast.error(error.message);
    await recordAudit({ id: auth.user!.id, email: auth.profile!.email, role: auth.role! }, "visitor.exit", v.pass_no, { method });
    toast.success(`${v.full_name} exited (${method})`);
    setMatched(null);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Gate Exit / Verify"
        title="Exit Face Verification"
        subtitle="Scan visitor face or confirm manually before allowing exit"
        right={<div className="panel-inset px-3 py-2 font-mono text-[0.72rem] uppercase tracking-wider"><span className="text-primary">{active.length}</span> Active</div>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-2 panel p-5">
          <div className="mono-label mb-3">Face Recognition Scanner</div>
          <div className="aspect-square rounded-md overflow-hidden border border-border-strong bg-black relative">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            <div className="absolute inset-8 border-2 border-primary/70 rounded-full pointer-events-none" />
            {scanning && (
              <div className="absolute inset-x-0 top-0 h-1 bg-primary shadow-[0_0_18px_oklch(0.79_0.16_75)] scanline" />
            )}
            <div className="absolute bottom-2 left-2 right-2 font-mono text-[0.7rem] text-primary uppercase tracking-wider">
              {scanning ? "// Scanning biometric pattern..." : matched ? "// Match confirmed" : "// Awaiting subject"}
            </div>
          </div>
          <button onClick={simulateScan} disabled={scanning}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-mono uppercase tracking-wider text-xs py-3 rounded-md hover:bg-primary/90 disabled:opacity-50">
            <ScanFace className="w-4 h-4" /> {scanning ? "Scanning..." : "Begin Face Scan"}
          </button>

          {matched && (
            <div className="mt-5 panel-inset p-4">
              <div className="flex items-center gap-3">
                {matched.photo_url && <img src={matched.photo_url} className="w-16 h-16 rounded-md object-cover border border-primary/60" />}
                <div className="flex-1">
                  <div className="font-semibold">{matched.full_name}</div>
                  <div className="font-mono text-[0.72rem] text-muted-foreground">{matched.pass_no} · {matched.mobile}</div>
                  <div className="text-[0.72rem] text-success font-mono flex items-center gap-1 mt-1"><CheckCircle2 className="w-3 h-3" /> Identity verified</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button onClick={() => confirmExit(matched, "face")}
                  className="flex items-center justify-center gap-2 bg-success text-background font-mono uppercase tracking-wider text-xs py-2.5 rounded-md hover:opacity-90">
                  <DoorOpen className="w-4 h-4" /> Confirm Exit
                </button>
                <button onClick={() => setMatched(null)} className="flex items-center justify-center gap-2 border border-border font-mono uppercase tracking-wider text-xs py-2.5 rounded-md hover:bg-accent/10">
                  <XCircle className="w-4 h-4" /> Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="mono-label">Active Visitors</div>
            <div className="panel-inset px-3 py-1.5 flex items-center gap-2 w-72">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <input className="bg-transparent outline-none flex-1 font-mono text-xs" placeholder="Search name / pass / mobile" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
            {filtered.map((v) => (
              <div key={v.id} className="flex items-center gap-3 panel-inset p-3">
                {v.photo_url ? <img src={v.photo_url} className="w-12 h-12 rounded-md object-cover border border-border" /> :
                  <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center font-display font-bold text-primary">{v.full_name[0]}</div>}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{v.full_name}</div>
                  <div className="font-mono text-[0.7rem] text-muted-foreground">{v.pass_no} · {v.purpose}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[0.7rem] text-muted-foreground">IN {new Date(v.entry_time).toLocaleTimeString("en-GB").slice(0,5)}</div>
                  <button onClick={() => confirmExit(v, "manual")}
                    className="mt-1 text-[0.7rem] font-mono uppercase tracking-wider text-primary hover:underline">Manual Exit</button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="text-center py-10 font-mono text-sm text-muted-foreground">No active visitors</div>}
          </div>
        </div>
      </div>

      <style>{`
        .scanline { animation: scan 1.8s linear infinite; }
        @keyframes scan { 0% { transform: translateY(0); } 50% { transform: translateY(380px); } 100% { transform: translateY(0); } }
      `}</style>
    </div>
  );
}
