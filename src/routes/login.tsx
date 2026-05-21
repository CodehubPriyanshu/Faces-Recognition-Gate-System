import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield, Mail, Lock, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { seedDemoUsers } from "@/lib/users.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Secure Login — BSF · STC Bengaluru" },
      { name: "description", content: "Operator authorization gateway for BSF STC Bengaluru personnel." },
    ],
  }),
  component: LoginPage,
});

const DEMO = [
  { label: "Admin", email: "admin@bsf.gov.in", password: "Admin@123" },
  { label: "Security Guard", email: "guard@bsf.gov.in", password: "Guard@123" },
  { label: "Gate Operator", email: "operator@bsf.gov.in", password: "Operator@123" },
];

function LoginPage() {
  const navigate = useNavigate();
  const seed = useServerFn(seedDemoUsers);
  const [email, setEmail] = useState("admin@bsf.gov.in");
  const [password, setPassword] = useState("Admin@123");
  const [loading, setLoading] = useState(false);

  // If already signed in, send to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  // Seed demo users on first mount (idempotent)
  useEffect(() => {
    seed().catch(() => { /* non-fatal */ });
  }, [seed]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Best-effort re-seed before login — guarantees demo creds always work
      try { await seed(); } catch { /* ignore */ }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Authenticated. Welcome operator.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error((err as Error).message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left brand */}
      <div className="flex-1 px-8 lg:px-16 py-10 flex flex-col">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-primary/10 border border-primary/40 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="font-display font-bold text-lg leading-tight">BSF · STC</div>
            <div className="mono-label !text-[0.6rem]">Bengaluru Sub-Training Centre</div>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center max-w-2xl">
          <motion.h1
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            className="text-5xl lg:text-7xl font-display font-bold leading-[1.05]"
          >
            Gate Entry<br />
            <span className="text-primary">Recognition</span> System
          </motion.h1>
          <p className="mt-6 max-w-md text-sm text-muted-foreground font-mono leading-relaxed">
            Authorized personnel only. Every entry is recorded, every face is verified. Real-time perimeter security for STC Bengaluru campus operations.
          </p>
        </div>

        <div className="font-mono text-[0.7rem] uppercase tracking-[0.18em] space-y-1 text-muted-foreground">
          <div>// classified access layer</div>
          <div>// encrypted transmission active</div>
          <div className="text-success">// perimeter status: secure</div>
        </div>
      </div>

      {/* Right login card */}
      <div className="lg:w-[480px] p-6 lg:py-10 lg:pr-10 flex items-center">
        <div className="panel w-full p-7">
          <div className="eyebrow mb-2">Secure Login / 0x01</div>
          <h2 className="text-2xl font-display font-bold">Operator Authorization</h2>
          <p className="mt-1 text-sm text-muted-foreground font-mono">Enter credentials issued by command.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="mono-label">Email</label>
              <div className="mt-1.5 flex items-center gap-2 panel-inset px-3 py-2.5 focus-within:border-primary/50">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <input
                  type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-transparent outline-none font-mono text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mono-label">Passcode</label>
              <div className="mt-1.5 flex items-center gap-2 panel-inset px-3 py-2.5 focus-within:border-primary/50">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <input
                  type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 bg-transparent outline-none font-mono text-sm"
                />
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-mono uppercase tracking-[0.2em] text-sm font-bold py-3 rounded-md hover:bg-primary/90 disabled:opacity-60 transition"
            >
              <ShieldCheck className="w-4 h-4" />
              {loading ? "Verifying..." : "Authenticate"}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="mt-6 panel-inset p-4">
            <div className="mono-label mb-3">Test Accounts — click to autofill</div>
            <div className="space-y-2">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => { setEmail(d.email); setPassword(d.password); }}
                  className="w-full flex items-center justify-between text-left font-mono text-[0.78rem] text-muted-foreground hover:text-foreground transition"
                >
                  <span className="text-primary">{d.label}</span>
                  <span>{d.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
