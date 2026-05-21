import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, FileSignature, Save, FileDown, ShieldCheck } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { compressImage, dataUrlToBlob } from "@/lib/image";
import { generateGatePassPdf } from "@/lib/pdf";
import { recordAudit } from "@/lib/audit";
import { PageHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/_authenticated/entry")({
  head: () => ({ meta: [{ title: "Gate Entry — BSF · STC" }] }),
  component: EntryPage,
});

const PURPOSES = ["Official Visit", "Personal", "Delivery", "Maintenance", "Vendor", "Family", "Recruitment", "Other"];
const ID_TYPES = ["Aadhaar", "PAN", "Driving License", "Voter ID", "Passport", "Service ID"];

function EntryPage() {
  const auth = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    full_name: "", mobile: "", id_type: "Aadhaar", id_number: "",
    purpose: PURPOSES[0], whom_to_meet: "", vehicle_number: "",
    visitor_count: 1, in_charge_name: "", remarks: "",
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
        if (videoRef.current) { videoRef.current.srcObject = stream; setStreaming(true); }
      } catch { /* user denied */ }
    };
    start();
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const capture = () => {
    const v = videoRef.current; if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setPhoto(c.toDataURL("image/jpeg", 0.9));
  };

  const reset = () => {
    setPhoto(null); sigRef.current?.clear();
    setForm({
      full_name: "", mobile: "", id_type: "Aadhaar", id_number: "",
      purpose: PURPOSES[0], whom_to_meet: "", vehicle_number: "",
      visitor_count: 1, in_charge_name: "", remarks: "",
    });
  };

  const submit = async () => {
    if (!photo) return toast.error("Capture visitor photo first");
    if (!form.full_name || !form.mobile || !form.purpose) return toast.error("Fill required fields");
    if (sigRef.current?.isEmpty()) return toast.error("Signature required");

    setBusy(true);
    try {
      const pass_no = `BSF-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      const photoBlob = await compressImage(dataUrlToBlob(photo));
      const sigBlob = dataUrlToBlob(sigRef.current!.getCanvas().toDataURL("image/png"));

      const userId = auth.user!.id;
      const photoPath = `${userId}/${pass_no}-photo.jpg`;
      const sigPath = `${userId}/${pass_no}-sig.png`;

      const [up1, up2] = await Promise.all([
        supabase.storage.from("visitor-photos").upload(photoPath, photoBlob, { upsert: true, contentType: "image/jpeg" }),
        supabase.storage.from("visitor-signatures").upload(sigPath, sigBlob, { upsert: true, contentType: "image/png" }),
      ]);
      if (up1.error) throw up1.error; if (up2.error) throw up2.error;

      const photo_url = supabase.storage.from("visitor-photos").getPublicUrl(photoPath).data.publicUrl;
      const signature_url = supabase.storage.from("visitor-signatures").getPublicUrl(sigPath).data.publicUrl;

      const entry_time = new Date().toISOString();
      const { data: inserted, error } = await supabase.from("visitors").insert({
        pass_no, full_name: form.full_name, mobile: form.mobile,
        id_type: form.id_type, id_number: form.id_number || null,
        purpose: form.purpose, whom_to_meet: form.whom_to_meet || null,
        vehicle_number: form.vehicle_number || null, visitor_count: form.visitor_count,
        in_charge_name: form.in_charge_name || null, remarks: form.remarks || null,
        photo_url, signature_url, status: "in_campus", entry_time, entry_by: userId,
      }).select().single();
      if (error) throw error;

      await recordAudit(
        { id: userId, email: auth.profile!.email, role: auth.role! },
        "visitor.entry",
        pass_no,
        { full_name: form.full_name, visitor_id: inserted.id },
      );
      await generateGatePassPdf({ ...form, pass_no, entry_time, photo_url });

      toast.success(`Pass ${pass_no} issued`);
      reset();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Gate Entry / Capture"
        title="Visitor Entry Authorization"
        subtitle="Photograph · verify identity · issue gate pass"
        right={<div className="panel-inset px-3 py-2 font-mono text-[0.72rem] text-success uppercase tracking-wider flex items-center gap-2"><span className="status-dot" />Camera Live</div>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Camera */}
        <div className="lg:col-span-2 panel p-5">
          <div className="mono-label mb-3">Live Camera Feed</div>
          <div className="aspect-[4/3] rounded-md overflow-hidden border border-border-strong bg-black relative">
            {photo ? (
              <img src={photo} alt="capture" className="w-full h-full object-cover" />
            ) : (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                {streaming && <div className="absolute inset-x-0 top-0 h-0.5 bg-primary scanline" />}
                <div className="absolute inset-6 border border-primary/60 rounded-md pointer-events-none" />
              </>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={capture} disabled={!streaming || !!photo}
              className="flex items-center justify-center gap-2 bg-primary text-primary-foreground font-mono uppercase tracking-wider text-xs py-2.5 rounded-md hover:bg-primary/90 disabled:opacity-50">
              <Camera className="w-4 h-4" /> Capture
            </button>
            <button onClick={() => setPhoto(null)} disabled={!photo}
              className="flex items-center justify-center gap-2 border border-border font-mono uppercase tracking-wider text-xs py-2.5 rounded-md hover:bg-accent/10 disabled:opacity-50">
              <RotateCcw className="w-4 h-4" /> Retake
            </button>
          </div>

          <div className="mt-5">
            <div className="mono-label mb-2 flex items-center gap-2"><FileSignature className="w-3 h-3" /> Visitor Signature</div>
            <div className="bg-white rounded-md border border-border-strong">
              <SignatureCanvas ref={sigRef as any} canvasProps={{ className: "w-full h-32 rounded-md" }} penColor="#111" />
            </div>
            <button onClick={() => sigRef.current?.clear()} className="mt-2 text-[0.7rem] font-mono text-muted-foreground hover:text-foreground uppercase tracking-wider">Clear</button>
          </div>
        </div>

        {/* Form */}
        <div className="lg:col-span-3 panel p-5">
          <div className="mono-label mb-4">Visitor Details</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full Name *"><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label="Mobile *"><input className="input" value={form.mobile} maxLength={15} onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="ID Type"><select className="input" value={form.id_type} onChange={(e) => setForm({ ...form, id_type: e.target.value })}>{ID_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="ID Number"><input className="input" value={form.id_number} onChange={(e) => setForm({ ...form, id_number: e.target.value })} /></Field>
            <Field label="Purpose *"><select className="input" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}>{PURPOSES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Whom to Meet"><input className="input" value={form.whom_to_meet} onChange={(e) => setForm({ ...form, whom_to_meet: e.target.value })} /></Field>
            <Field label="Vehicle Number"><input className="input uppercase" value={form.vehicle_number} onChange={(e) => setForm({ ...form, vehicle_number: e.target.value.toUpperCase() })} /></Field>
            <Field label="Visitor Count"><input type="number" min={1} className="input" value={form.visitor_count} onChange={(e) => setForm({ ...form, visitor_count: Math.max(1, +e.target.value) })} /></Field>
            <Field label="In-Charge / Officer"><input className="input" value={form.in_charge_name} onChange={(e) => setForm({ ...form, in_charge_name: e.target.value })} /></Field>
            <Field label="Remarks"><input className="input" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={submit} disabled={busy}
              className="flex items-center gap-2 bg-primary text-primary-foreground font-mono uppercase tracking-wider text-xs px-5 py-3 rounded-md hover:bg-primary/90 disabled:opacity-60">
              <Save className="w-4 h-4" /> {busy ? "Processing..." : "Save & Generate Pass"}
            </button>
            <button onClick={reset} className="flex items-center gap-2 border border-border font-mono uppercase tracking-wider text-xs px-5 py-3 rounded-md hover:bg-accent/10">
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
            <div className="ml-auto self-center text-[0.7rem] font-mono text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-success" /> Encrypted upload · audit logged
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .input { width:100%; background:transparent; border:1px solid hsl(var(--border)); border-radius:6px; padding:8px 10px; font-family: 'JetBrains Mono', monospace; font-size:0.85rem; color: inherit; }
        .input:focus { outline:none; border-color: oklch(0.79 0.16 75 / 0.6); }
        .scanline { animation: scan 2.2s linear infinite; box-shadow: 0 0 12px oklch(0.79 0.16 75 / 0.8); }
        @keyframes scan { 0% { transform: translateY(0); } 50% { transform: translateY(360px); } 100% { transform: translateY(0); } }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mono-label">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
