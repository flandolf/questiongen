import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export function AccuracyTrendChart({ data }: { data: { label: string; overallAccuracy: number }[] }) {
  return (
    <div style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" minTickGap={8} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          <Tooltip formatter={
            (value) => `${Number(value).toFixed(1)}%`
          } />
          <Legend />
          <Line type="monotone" dataKey="overallAccuracy" stroke="#10b981" strokeWidth={2} dot={false} name="Overall Accuracy" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
