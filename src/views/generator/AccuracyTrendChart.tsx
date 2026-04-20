import { Line, LineChart, ResponsiveContainer } from 'recharts';

export function AccuracyTrendChart({
  data,
  minimal = true,
}: {
  data: { label: string; overallAccuracy: number }[];
  minimal?: boolean;
}) {
  return (
    <div style={{ width: '100%', height: minimal ? 40 : 180 }}>
      <ResponsiveContainer width='100%' height='100%'>
        <LineChart
          data={data}
          margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
        >
          <Line
            type='monotone'
            dataKey='overallAccuracy'
            stroke='currentColor'
            strokeWidth={2}
            dot={false}
            animationDuration={1500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
