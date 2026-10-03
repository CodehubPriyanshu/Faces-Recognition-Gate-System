import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Download } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppHeader";
import PassDetailsModal from "@/components/PassDetailsModal";
const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Visitor History \u2014 BSF \xB7 STC" }] }),
  component: HistoryPage,
});
function HistoryPage() {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  useEffect(() => {
    api("visitors?limit=1000")
      .then(setRows)
      .catch((error) => toast.error(error.message));
  }, []);
  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (status !== "all" && r.status !== status) return false;
        if (!q) return true;
        const s = q.toLowerCase();
        return (
          r.full_name.toLowerCase().includes(s) ||
          r.pass_no.toLowerCase().includes(s) ||
          r.mobile.includes(s)
        );
      }),
    [rows, q, status],
  );
  const exportCsv = () => {
    const headers = [
      "Pass No",
      "Name",
      "Mobile",
      "Purpose",
      "Vehicle",
      "Count",
      "Entry",
      "Exit",
      "Status",
    ];
    const lines = [headers.join(",")].concat(
      filtered.map((r) =>
        [
          r.pass_no,
          r.full_name,
          r.mobile,
          r.purpose,
          r.vehicle_number ?? "",
          r.visitor_count,
          r.entry_time,
          r.exit_time ?? "",
          r.status,
        ]
          .map((x) => `"${String(x).replace(/"/g, '""')}"`)
          .join(","),
      ),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `visitor-history-${Date.now()}.csv`;
    a.click();
  };
  const openDetails = async (id) => {
    try {
      const data = await api(`visitors/${encodeURIComponent(id)}`);
      if (data) setSelected(data);
    } catch (err) {
      // Keep the current selection if refreshing the visitor fails.
    }
  };
  return (
    <div>
      <PageHeader
        eyebrow="Visitor Records / Archive"
        title="Visitor History"
        subtitle={`${filtered.length} of ${rows.length} records`}
        right={
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 border border-border px-4 py-2 rounded-md font-mono text-xs uppercase tracking-wider hover:bg-accent/10"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        }
      />

      <div className="panel mb-4 p-4 flex flex-wrap gap-3 items-center">
        <div className="panel-inset px-3 py-2 flex items-center gap-2 flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            className="bg-transparent outline-none flex-1 font-mono text-sm"
            placeholder="Search by name / pass / mobile"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {["all", "in_campus", "exited"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 rounded-md font-mono text-xs uppercase tracking-wider border ${status === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent/10"}`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left bg-muted/30">
                {[
                  "Pass No",
                  "Visitor",
                  "Mobile",
                  "Purpose",
                  "Vehicle",
                  "Entry",
                  "Exit",
                  "Status",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-[0.78rem] text-primary">
                    <button
                      onClick={() => openDetails(r.id)}
                      className="underline hover:text-primary/80"
                    >
                      {r.pass_no}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-medium">{r.full_name}</td>
                  <td className="px-4 py-3 font-mono text-[0.78rem]">{r.mobile}</td>
                  <td className="px-4 py-3">{r.purpose}</td>
                  <td className="px-4 py-3 font-mono text-[0.78rem] text-muted-foreground">
                    {r.vehicle_number ?? "\u2014"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[0.72rem] text-muted-foreground">
                    {new Date(r.entry_time).toLocaleString("en-GB")}
                  </td>
                  <td className="px-4 py-3 font-mono text-[0.72rem] text-muted-foreground">
                    {r.exit_time ? new Date(r.exit_time).toLocaleString("en-GB") : "\u2014"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-sm text-[0.65rem] font-mono uppercase tracking-wider border ${r.status === "in_campus" ? "text-success border-success/40 bg-success/10" : "text-muted-foreground border-border bg-muted/30"}`}
                    >
                      {r.status === "in_campus" ? "Active" : "Exited"}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-muted-foreground font-mono text-sm"
                  >
                    No records
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {selected && <PassDetailsModal data={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
export { Route };
