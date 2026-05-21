import { supabase } from "@/integrations/supabase/client";

type ActorMeta = { id: string; email: string; role: string };

export async function recordAudit(
  actor: ActorMeta,
  action: string,
  target?: string,
  metadata?: Record<string, unknown>,
) {
  await supabase.from("audit_logs").insert({
    action,
    actor_id: actor.id,
    actor_email: actor.email,
    actor_role: actor.role,
    target: target ?? actor.email,
    metadata: (metadata ?? null) as never,
  });
}
