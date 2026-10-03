import { useState } from "react";
import { X, Download } from "lucide-react";
import { generateGatePassPdf } from "@/lib/pdf";
export function PassDetailsModal({ data, onClose }) {
  const [busy, setBusy] = useState(false);
  const downloadPdf = async () => {
    setBusy(true);
    try {
      await generateGatePassPdf(data);
    } catch (err) {
      // silent
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div className="panel w-full max-w-2xl p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className="w-36 h-44 bg-muted/20 border border-border rounded-md flex items-center justify-center overflow-hidden">
            {data.photo_url ? (
              <img
                src={data.photo_url}
                alt={data.full_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-muted-foreground font-mono text-sm">No photo</div>
            )}
          </div>

          <div className="flex-1">
            <div className="eyebrow">Visitor Details</div>
            <h3 className="font-display font-bold text-lg leading-tight">{data.full_name}</h3>
            <div className="mt-1 text-[0.72rem] font-mono text-muted-foreground">
              Pass {data.pass_no} · {new Date(data.entry_time).toLocaleString("en-GB")}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="mono-label">Mobile</div>
                <div className="font-mono">{data.mobile}</div>
              </div>
              <div>
                <div className="mono-label">Purpose</div>
                <div>{data.purpose}</div>
              </div>
              <div>
                <div className="mono-label">Whom to meet</div>
                <div className="font-mono">{data.whom_to_meet ?? "—"}</div>
              </div>
              <div>
                <div className="mono-label">Vehicle</div>
                <div className="font-mono">{data.vehicle_number ?? "—"}</div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={onClose}
                className="flex-1 border border-border font-mono uppercase tracking-wider text-xs py-2.5 rounded-md hover:bg-accent/10"
              >
                Close
              </button>
              <button
                onClick={downloadPdf}
                disabled={busy}
                className="flex items-center gap-2 bg-primary text-primary-foreground font-mono uppercase tracking-wider text-xs py-2.5 px-4 rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" /> {busy ? "Preparing..." : "Download PDF"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default PassDetailsModal;
