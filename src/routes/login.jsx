import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield, Mail, Lock, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { api, post, notifyAuthChanged } from "@/lib/api";
const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Secure Login \u2014 BSF \xB7 STC Bengaluru" },
      {
        name: "description",
        content: "Operator authorization gateway for BSF STC Bengaluru personnel.",
      },
    ],
  }),
  component: LoginPage,
});
function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    api("auth/session")
      .then(({ user }) => {
        if (user) navigate({ to: "/dashboard" });
      })
      .catch((error) => toast.error(error.message));
  }, [navigate]);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await post("auth/login", { email, password });
      notifyAuthChanged();
      toast.success("Authenticated. Welcome operator.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err.message || "Authentication failed");
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
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl lg:text-7xl font-display font-bold leading-[1.05]"
          >
            Gate Entry
            <br />
            <span className="text-primary">Recognition</span> System
          </motion.h1>
          <p className="mt-6 max-w-md text-sm text-muted-foreground font-mono leading-relaxed">
            Authorized personnel only. Every entry is recorded, every face is verified. Real-time
            perimeter security for STC Bengaluru campus operations.
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
          <p className="mt-1 text-sm text-muted-foreground font-mono">
            Enter credentials issued by command.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="mono-label">Email</label>
              <div className="mt-1.5 flex items-center gap-2 panel-inset px-3 py-2.5 focus-within:border-primary/50">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 bg-transparent outline-none font-mono text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mono-label">Passcode</label>
              <div className="mt-1.5 flex items-center gap-2 panel-inset px-3 py-2.5 focus-within:border-primary/50">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 bg-transparent outline-none font-mono text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-mono uppercase tracking-[0.2em] text-sm font-bold py-3 rounded-md hover:bg-primary/90 disabled:opacity-60 transition"
            >
              <ShieldCheck className="w-4 h-4" />
              {loading ? "Verifying..." : "Authenticate"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
export { Route };
