import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import type { SecondMetrics } from '@/types'

interface SingleLineProps {
  title: string
  data: SecondMetrics[]
  dataKey: string
  color: string
  id: string
  lines?: never
}

interface MultiLineProps {
  title: string
  data: SecondMetrics[]
  lines: { key: string; color: string; label: string }[]
  id: string
  dataKey?: never
  color?: never
}

type MetricsChartProps = SingleLineProps | MultiLineProps

export function MetricsChart(props: MetricsChartProps) {
  const { title, data, id } = props

  return (
    <div id={id} className="bg-sf-surface border border-sf-border rounded-xl p-4">
      <h3 className="text-sm font-medium text-sf-textSecondary mb-3">
        {title}
      </h3>
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          {props.lines ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2130" />
              <XAxis
                dataKey="second"
                stroke="#64748b"
                fontSize={11}
                tickFormatter={(v: number) => `${v}s`}
              />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1d27',
                  border: '1px solid #2a2d3a',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#e2e8f0',
                }}
                labelFormatter={(v: number) => `Segundo ${v}`}
              />
              {props.lines.map((line) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  stroke={line.color}
                  strokeWidth={2}
                  dot={false}
                  name={line.label}
                />
              ))}
            </LineChart>
          ) : (
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2130" />
              <XAxis
                dataKey="second"
                stroke="#64748b"
                fontSize={11}
                tickFormatter={(v: number) => `${v}s`}
              />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1d27',
                  border: '1px solid #2a2d3a',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#e2e8f0',
                }}
                labelFormatter={(v: number) => `Segundo ${v}`}
              />
              <defs>
                <linearGradient
                  id={`gradient-${id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={props.color}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={props.color}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey={props.dataKey}
                stroke={props.color}
                fill={`url(#gradient-${id})`}
                strokeWidth={2}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
