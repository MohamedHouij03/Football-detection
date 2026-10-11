import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ScatterChart, Scatter
} from 'recharts'
import { ChevronDown, Loader2 } from 'lucide-react'
import { Card } from '../components/ui/card.jsx'
import { Button } from '../components/ui/button.jsx'
import PageHeader from '../components/PageHeader.jsx'

const TICK = { fill: '#6B7489', fontSize: 11 }
const GRID = 'rgba(255,255,255,0.06)'

const TOOLTIP_CLS = 'rounded-lg border border-border-soft bg-surface-2 px-3 py-2 text-xs shadow-card'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className={TOOLTIP_CLS}>
      <p className="mb-1 text-ink-3">Epoch {label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong className="text-ink-1">{(p.value * 100).toFixed(1)}%</strong>
        </p>
      ))}
    </div>
  )
}

const PrTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className={TOOLTIP_CLS}>
      <p className="mb-1 text-ink-3">Epoch {d.epoch}</p>
      <p className="text-[#3b82f6]">Recall: <strong className="text-ink-1">{(d.recall * 100).toFixed(1)}%</strong></p>
      <p className="text-lime">Precision: <strong className="text-ink-1">{(d.precision * 100).toFixed(1)}%</strong></p>
    </div>
  )
}

function ChartTitle({ children }) {
  return <p className="mb-2 font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-ink-3">{children}</p>
}

export default function Accuracy() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [showTechnical, setShowTechnical] = useState(false)

  useEffect(() => {
    fetch('/api/accuracy')
      .then(r => { if (!r.ok) throw new Error('Training data not found'); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
  }, [])

  if (error) return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 lg:px-10">
      <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
    </main>
  )

  if (!data) return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 lg:px-10">
      <div className="flex items-center gap-3 text-ink-2">
        <Loader2 className="h-4 w-4 animate-spin text-lime" /> Loading accuracy data&hellip;
      </div>
    </main>
  )

  const { best = {}, history = [] } = data
  const map50     = best.map50     || 0
  const precision = best.precision || 0
  const recall    = best.recall    || 0
  const map5095   = best.map5095   || 0

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 lg:px-10">
      <PageHeader eyebrow="Model performance" title="Model Accuracy" sub="How well the detection model is actually doing, in plain numbers." />

      {/* Summary */}
      <Card className="mb-8 border-lime/20 bg-lime-dim p-5 text-sm leading-relaxed text-ink-1">
        At its best checkpoint, the AI found{' '}
        <strong>{(recall * 100).toFixed(0)}% of all objects</strong> present in an image,
        and when it flagged something, it was correct{' '}
        <strong>{(precision * 100).toFixed(0)}% of the time</strong>.
        Overall accuracy (mAP@50) reached{' '}
        <span className="font-semibold text-lime">{(map50 * 100).toFixed(1)}%</span>,
        a solid score for a challenging multi-class football detection task.
      </Card>

      {/* KPIs */}
      <p className="mb-3 font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-ink-3">Best results achieved</p>
      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-t-2 border-t-lime p-4">
          <div className="font-display text-2xl font-bold text-lime">{(map50 * 100).toFixed(1)}%</div>
          <div className="mt-1 text-xs text-ink-3">Overall Accuracy</div>
          <div className="mt-0.5 text-[0.65rem] text-ink-3/70">mAP@50</div>
        </Card>
        <Card className="border-t-2 border-t-[#3b82f6] p-4">
          <div className="font-display text-2xl font-bold text-[#3b82f6]">{(precision * 100).toFixed(1)}%</div>
          <div className="mt-1 text-xs text-ink-3">Precision</div>
          <div className="mt-0.5 text-[0.65rem] text-ink-3/70">When found, correct</div>
        </Card>
        <Card className="border-t-2 border-t-[#f59e0b] p-4">
          <div className="font-display text-2xl font-bold text-[#f59e0b]">{(recall * 100).toFixed(1)}%</div>
          <div className="mt-1 text-xs text-ink-3">Recall</div>
          <div className="mt-0.5 text-[0.65rem] text-ink-3/70">Objects found</div>
        </Card>
        <Card className="p-4">
          <div className="font-display text-2xl font-bold text-ink-1">{(map5095 * 100).toFixed(1)}%</div>
          <div className="mt-1 text-xs text-ink-3">Strict Accuracy</div>
          <div className="mt-0.5 text-[0.65rem] text-ink-3/70">mAP@50-95</div>
        </Card>
      </div>

      {/* Metrics over time */}
      <p className="mb-2 font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-ink-3">Accuracy improved over training</p>
      <p className="mb-4 text-sm leading-relaxed text-ink-2">
        The chart shows how detection accuracy improved as the AI trained. Higher is better on all lines.
      </p>
      <Card className="mb-10 p-4">
        <ChartTitle>Evaluation Metrics over Training</ChartTitle>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={history} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="epoch" tick={TICK} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 1]} tickFormatter={v => (v * 100).toFixed(0) + '%'} tick={TICK} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#6B7489' }} />
            <Line type="monotone" dataKey="precision" name="Precision" stroke="#3b82f6" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="recall"    name="Recall"    stroke="#B8FF45" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="map50"     name="mAP@50"    stroke="#f59e0b" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="map5095"   name="mAP@50-95" stroke="#ef4444" dot={false} strokeWidth={2} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* PR scatter */}
      <p className="mb-2 font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-ink-3">Precision vs. Recall</p>
      <p className="mb-4 text-sm leading-relaxed text-ink-2">
        Each dot is one training round. The AI improves as dots move toward the top-right.
      </p>
      <Card className="mb-10 p-4">
        <ChartTitle>Precision vs. Recall per Epoch</ChartTitle>
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="recall" name="Recall" type="number" domain={[0, 1]} tickFormatter={v => (v * 100).toFixed(0) + '%'} tick={TICK} axisLine={false} tickLine={false}
              label={{ value: 'Recall', position: 'insideBottom', offset: -2, fill: '#6B7489', fontSize: 11 }} />
            <YAxis dataKey="precision" name="Precision" type="number" domain={[0, 1]} tickFormatter={v => (v * 100).toFixed(0) + '%'} tick={TICK} axisLine={false} tickLine={false} />
            <Tooltip content={<PrTooltip />} />
            <Scatter data={history} fill="#B8FF45" fillOpacity={0.7} />
          </ScatterChart>
        </ResponsiveContainer>
      </Card>

      {/* Technical details */}
      <Button variant="ghost" onClick={() => setShowTechnical(s => !s)} className="text-ink-2">
        <ChevronDown className={`h-4 w-4 transition-transform ${showTechnical ? 'rotate-180' : ''}`} />
        Training details (for technical users)
      </Button>

      {showTechnical && (
        <div className="mt-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <ChartTitle>Training Losses</ChartTitle>
              <Card className="p-4">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={history} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="epoch" tick={TICK} axisLine={false} tickLine={false} />
                    <YAxis tick={TICK} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#161F30', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }} labelFormatter={v => `Epoch ${v}`} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#6B7489' }} />
                    <Line type="monotone" dataKey="train_box" name="Box" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="train_cls" name="Class" stroke="#B8FF45" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </div>
            <div>
              <ChartTitle>Validation Losses</ChartTitle>
              <Card className="p-4">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={history} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="epoch" tick={TICK} axisLine={false} tickLine={false} />
                    <YAxis tick={TICK} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#161F30', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }} labelFormatter={v => `Epoch ${v}`} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#6B7489' }} />
                    <Line type="monotone" dataKey="val_box" name="Box" stroke="#f59e0b" dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="val_cls" name="Class" stroke="#ef4444" dot={false} strokeWidth={1.5} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </div>

          <p className="mb-3 mt-6 font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-ink-3">Full Training Log</p>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-soft text-left text-xs text-ink-3">
                  <th className="px-5 py-3 font-medium">Epoch</th>
                  <th className="px-5 py-3 font-medium">mAP@50</th>
                  <th className="px-5 py-3 font-medium">mAP@50-95</th>
                  <th className="px-5 py-3 font-medium">Precision</th>
                  <th className="px-5 py-3 font-medium">Recall</th>
                </tr>
              </thead>
              <tbody>
                {history.map(row => (
                  <tr key={row.epoch} className="border-b border-border-soft text-ink-2 last:border-0">
                    <td className="px-5 py-2.5">{row.epoch}</td>
                    <td className="px-5 py-2.5">{row.map50     != null ? (row.map50     * 100).toFixed(2) + '%' : 'n/a'}</td>
                    <td className="px-5 py-2.5">{row.map5095   != null ? (row.map5095   * 100).toFixed(2) + '%' : 'n/a'}</td>
                    <td className="px-5 py-2.5">{row.precision != null ? (row.precision * 100).toFixed(2) + '%' : 'n/a'}</td>
                    <td className="px-5 py-2.5">{row.recall    != null ? (row.recall    * 100).toFixed(2) + '%' : 'n/a'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </main>
  )
}
