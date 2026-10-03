import { Square } from "lucide-react";
export function AppHeader() {
  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background/80 backdrop-blur">
      <div className="flex items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
        <Square className="w-3.5 h-3.5" />
        BSF Army Force · Gate Entry Face Recognition System
      </div>
      <div className="flex items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.18em] text-success">
        <span className="status-dot" />
        Secure Link
      </div>
    </header>
  );
}
export function PageHeader({ eyebrow, title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8">
      <div>
        <div className="eyebrow mb-2">{eyebrow}</div>
        <h1 className="text-4xl font-bold font-display tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted-foreground font-mono">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
