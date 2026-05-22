import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, KeyRound, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { updateUserPassword } from "@/lib/users.functions";

interface Props {
  userId: string;
  userEmail: string;
  isSelf?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const RULES = [
  { test: (s: string) => s.length >= 8, label: "At least 8 characters" },
  { test: (s: string) => /[A-Z]/.test(s), label: "One uppercase letter" },
  { test: (s: string) => /[0-9]/.test(s), label: "One number" },
];

export function UpdatePasswordModal({ userId, userEmail, isSelf, onClose, onSuccess }: Props) {
  const update = useServerFn(updateUserPassword);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const ruleStates = RULES.map((r) => ({ ...r, ok: r.test(pw) }));
  const allRulesPass = ruleStates.every((r) => r.ok);
  const matches = pw.length > 0 && pw === confirm;
  const valid = allRulesPass && matches;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return toast.error("Password does not meet requirements");
    setBusy(true);
    try {
      await update({ data: { id: userId, password: pw } });
      toast.success("Password updated");
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "Failed to update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="panel w-full max-w-md p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-md bg-primary/10 border border-primary/40 flex items-center justify-center">
            <KeyRound className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="eyebrow">{isSelf ? "Self Service / Security" : "Admin Action / Reset"}</div>
            <h3 className="font-display font-bold text-lg leading-tight">Update Password</h3>
          </div>
        </div>
        <div className="mt-2 mb-4 text-[0.72rem] font-mono text-muted-foreground truncate">{userEmail}</div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mono-label">New Password</label>
            <div className="mt-1.5 flex items-center gap-2 panel-inset px-3 py-2.5 focus-within:border-primary/50">
              <input
                type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)}
                className="flex-1 bg-transparent outline-none font-mono text-sm" autoFocus required
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mono-label">Confirm Password</label>
            <div className="mt-1.5 flex items-center gap-2 panel-inset px-3 py-2.5 focus-within:border-primary/50">
              <input
                type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="flex-1 bg-transparent outline-none font-mono text-sm" required
              />
            </div>
            {confirm.length > 0 && !matches && (
              <div className="mt-1 text-[0.7rem] font-mono text-destructive">// Passwords do not match</div>
            )}
          </div>

          <ul className="panel-inset p-3 space-y-1">
            {ruleStates.map((r) => (
              <li key={r.label} className={`flex items-center gap-2 text-[0.72rem] font-mono ${r.ok ? "text-success" : "text-muted-foreground"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${r.ok ? "bg-success" : "bg-border-strong"}`} />
                {r.label}
              </li>
            ))}
          </ul>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-border font-mono uppercase tracking-wider text-xs py-2.5 rounded-md hover:bg-accent/10">
              Cancel
            </button>
            <button type="submit" disabled={!valid || busy}
              className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-mono uppercase tracking-wider text-xs py-2.5 rounded-md hover:bg-primary/90 disabled:opacity-50">
              <ShieldCheck className="w-3.5 h-3.5" /> {busy ? "Updating..." : "Update"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
