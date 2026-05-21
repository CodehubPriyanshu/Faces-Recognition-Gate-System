import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DEMO_USERS = [
  { email: "admin@bsf.gov.in", password: "Admin@123", full_name: "BSF Administrator", role: "admin" as const },
  { email: "guard@bsf.gov.in", password: "Guard@123", full_name: "Security Guard", role: "security_guard" as const },
  { email: "operator@bsf.gov.in", password: "Operator@123", full_name: "Gate Operator", role: "gate_operator" as const },
];

/**
 * Idempotently provision the 3 demo accounts shown on the login screen.
 * Public — runs on first visit so the demo credentials always work.
 */
export const seedDemoUsers = createServerFn({ method: "POST" }).handler(async () => {
  const results: { email: string; status: string }[] = [];
  for (const u of DEMO_USERS) {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    const existing = list?.users.find((x) => x.email === u.email);
    let userId = existing?.id;
    if (!existing) {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { full_name: u.full_name },
      });
      if (error) {
        results.push({ email: u.email, status: `error:${error.message}` });
        continue;
      }
      userId = created.user?.id;
      results.push({ email: u.email, status: "created" });
    } else {
      // Ensure password matches (re-set in case it drifted)
      await supabaseAdmin.auth.admin.updateUserById(existing.id, { password: u.password });
      results.push({ email: u.email, status: "exists" });
    }
    if (userId) {
      await supabaseAdmin.from("profiles").upsert({ id: userId, email: u.email, full_name: u.full_name });
      await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: u.role }, { onConflict: "user_id,role" });
    }
  }
  return { results };
});

/** Admin-only: list all users with their roles. */
export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id,email,full_name,created_at")
      .order("created_at", { ascending: true });
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id,role");

    return (profiles ?? []).map((p) => ({
      ...p,
      role: roles?.find((r) => r.user_id === p.id)?.role ?? null,
    }));
  });

const createUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
  full_name: z.string().min(1).max(120),
  role: z.enum(["admin", "security_guard", "gate_operator"]),
});

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createUserSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    const userId = created.user!.id;
    await supabaseAdmin.from("profiles").upsert({ id: userId, email: data.email, full_name: data.full_name });
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: data.role });

    await supabaseAdmin.from("audit_logs").insert({
      action: "USER.CREATE",
      actor_id: context.userId,
      actor_email: (context.claims as { email?: string }).email ?? null,
      actor_role: "admin",
      target: data.email,
      metadata: { role: data.role },
    });
    return { ok: true, id: userId };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    if (data.id === context.userId) throw new Error("Cannot delete your own account");

    const { data: target } = await supabaseAdmin.from("profiles").select("email").eq("id", data.id).maybeSingle();
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      action: "USER.DELETE",
      actor_id: context.userId,
      actor_email: (context.claims as { email?: string }).email ?? null,
      actor_role: "admin",
      target: target?.email ?? data.id,
    });
    return { ok: true };
  });
