import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { UserPlus, Trash2, Shield, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { listUsers, createUser, deleteUser } from "@/lib/users.functions";
import { PageHeader } from "@/components/AppHeader";
import { UpdatePasswordModal } from "@/components/UpdatePasswordModal";
const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "User Management \u2014 BSF \xB7 STC" }] }),
  component: UsersPage,
});
const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "security_guard", label: "Security Guard" },
  { value: "gate_operator", label: "Gate Operator" },
];
function UsersPage() {
  const list = listUsers;
  const create = createUser;
  const remove = deleteUser;
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "gate_operator",
  });
  const [busy, setBusy] = useState(false);
  const [pwTarget, setPwTarget] = useState(null);
  const refresh = useCallback(
    () =>
      list()
        .then((u) => setUsers(u))
        .catch((e) => toast.error(e.message)),
    [list],
  );
  useEffect(() => {
    refresh();
  }, [refresh]);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await create({ data: form });
      toast.success("User created");
      setForm({ email: "", password: "", full_name: "", role: "gate_operator" });
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  const del = async (u) => {
    if (!confirm(`Delete ${u.email}?`)) return;
    try {
      await remove({ data: { id: u.id } });
      toast.success("Removed");
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <div>
      <PageHeader
        eyebrow="Personnel / Access Control"
        title="User Management"
        subtitle="Authorize operators, guards, and administrators"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <form onSubmit={submit} className="panel p-5 space-y-3 lg:col-span-1">
          <div className="mono-label flex items-center gap-2">
            <UserPlus className="w-3.5 h-3.5 text-primary" /> Create Operator
          </div>
          <input
            className="input"
            placeholder="Full Name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
          />
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password (min 8)"
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <select
            className="input"
            value={form.role}
            onChange={(e) =>
              setForm({
                ...form,
                role: e.target.value,
              })
            }
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-primary text-primary-foreground font-mono uppercase tracking-wider text-xs py-2.5 rounded-md hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "Creating..." : "Create User"}
          </button>
        </form>

        <div className="panel lg:col-span-2 overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="mono-label flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-primary" /> {users.length} Personnel
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20 text-left">
                {["Name", "Email", "Role", "Joined", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{u.full_name ?? "\u2014"}</td>
                  <td className="px-4 py-3 font-mono text-[0.78rem]">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-sm text-[0.65rem] font-mono uppercase tracking-wider bg-primary/10 text-primary border border-primary/40">
                      {u.role ?? "none"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[0.72rem] text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString("en-GB")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setPwTarget(u)}
                        title="Update password"
                        className="text-primary hover:bg-primary/10 rounded p-1.5"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => del(u)}
                        title="Delete user"
                        className="text-destructive hover:bg-destructive/10 rounded p-1.5"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`.input { width:100%; background:transparent; border:1px solid hsl(var(--border)); border-radius:6px; padding:8px 10px; font-family: 'JetBrains Mono', monospace; font-size:0.85rem; color: inherit; }
        .input:focus { outline:none; border-color: oklch(0.79 0.16 75 / 0.6); }`}</style>

      {pwTarget && (
        <UpdatePasswordModal
          userId={pwTarget.id}
          userEmail={pwTarget.email}
          onClose={() => setPwTarget(null)}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}
export { Route };
