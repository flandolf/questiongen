import React from "react";
import { Card, StatusBadge } from "./SettingsUI";
import { cn } from "@/lib/utils";
import { Zap, Clock, DollarSign, Database, Settings, Image as ImageIcon, File } from "lucide-react";
import { fmt } from "./formatters";
import type { ModelStats, StatsColumn } from "./types";

const STAT_ROWS: { icon: React.ReactNode; label: string; get: (s: ModelStats) => string | boolean | null }[] = [
  { icon: <Zap className="h-3.5 w-3.5" />, label: "Throughput (p50)", get: s => fmt.tps(s.tpsP50) },
  { icon: <Clock className="h-3.5 w-3.5" />, label: "Latency TTFT (p50)", get: s => fmt.latency(s.latencyP50) },
  { icon: <DollarSign className="h-3.5 w-3.5" />, label: "Input price", get: s => fmt.price(s.promptPricePerToken) },
  { icon: <DollarSign className="h-3.5 w-3.5" />, label: "Output price", get: s => fmt.price(s.completionPricePerToken) },
  { icon: <Database className="h-3.5 w-3.5" />, label: "Context window", get: s => fmt.context(s.contextLength) },
  { icon: <Clock className="h-3.5 w-3.5" />, label: "Uptime (30 m)", get: s => fmt.uptime(s.uptimeLast30m) },
  { icon: <Settings className="h-3.5 w-3.5" />, label: "Structured output", get: s => s.supportsStructuredOutput },
  { icon: <ImageIcon className="h-3.5 w-3.5" />, label: "Vision / images", get: s => s.supportsImages ?? null },
  { icon: <File className="h-3.5 w-3.5" />, label: "Files / documents", get: s => s.supportsFiles ?? null },
];

export function StatsTable({ columns }: { columns: StatsColumn[] }) {
  const gridCols = (["", "grid-cols-2", "grid-cols-3", "grid-cols-4"] as const)[columns.length];
  return (
    <Card className="overflow-hidden">
      <div className={cn("grid text-xs font-medium text-muted-foreground bg-muted/50 px-4 py-2.5 border-b border-border", gridCols)}>
        <span>Metric</span>
        {columns.map((c, i) => (
          <span key={i} className="truncate min-w-0" title={c.label}>{c.label}</span>
        ))}
      </div>
      <div className="divide-y divide-border">
        {STAT_ROWS.map((row, ri) => (
          <div key={ri} className={cn("grid items-center px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors", gridCols)}>
            <span className="flex items-center gap-2 text-muted-foreground">{row.icon}{row.label}</span>
            {columns.map((col, ci) => (
              <span key={ci}>
                {col.loading
                  ? <span className="text-muted-foreground animate-pulse text-sm">Loading…</span>
                  : col.stats
                    ? <StatusBadge value={row.get(col.stats)} />
                    : <span className="text-muted-foreground text-sm">—</span>}
              </span>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}
