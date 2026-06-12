import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ScatterChart, Scatter
} from 'recharts'

const CHART_STYLE = {
  background: '#161616',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 10,
  padding: '1rem 0.5rem 0.5rem',
  marginBottom: '1.5rem',
}

const TICK = { fill: '#666', fontSize: 11 }

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 6, padding: '8px 12px', fontSize: 11,
    }}>
      <p style={{ color: '#888', marginBottom: 4 }}>Epoch {label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong style={{ color: '#f0f0f0' }}>{(p.value * 100).toFixed(1)}%</strong>
        </p>
      ))}
    </div>
  )
}

const PrTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 6, padding: '8px 12px', fontSize: 11,
    }}>
      <p style={{ color: '#888', marginBottom: 4 }}>Epoch {d.epoch}</p>
      <p style={{ color: '#3b82f6' }}>Recall: <strong style={{ color: '#f0f0f0' }}>{(d.recall * 100).toFixed(1)}%</strong></p>
      <p style={{ color: '#22c55e' }}>Precision: <strong style={{ color: '#f0f0f0' }}>{(d.precision * 100).toFixed(1)}%</strong></p>
    </div>
  )
}

function ChartTitle({ children }) {
  return (
    <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#666', padding: '0 0.75rem 0.75rem' }}>
      {children}
    </p>
  )
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
    <main className="container page">
      <div className="alert alert-error">{error}</div>
    </main>
  )

  if (!data) return (
    <main className="container page">
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', color: 'var(--text-2)' }}>
        <div className="spinner" /> Loading accuracy data…
      </div>
    </main>
  )

  const { best = {}, history = [] } = data
  const map50     = best.map50     || 0
  const precision = best.precision || 0
  const recall    = best.recall    || 0
  const map5095   = best.map5095   || 0

  return (
    <main className="container page">
      <div style={{ marginBottom: '2rem' }}>
        <h1 className="page-title">Model Accuracy</h1>
        <p className="page-sub">A plain-English look at how well the detection AI performs.</p>
      </div>

      {/* Summary */}
      <div className="summary-card">
        At its best checkpoint, the AI found{' '}
        <strong>{(recall * 100).toFixed(0)}% of all objects</strong> present in an image,
        and when it flagged something, it was correct{' '}
        <strong>{(precision * 100).toFixed(0)}% of the time</strong>.
        Overall accuracy (mAP@50) reached{' '}
        <span className="highlight">{(map50 * 100).toFixed(1)}%</span> —
        a solid score for a challenging multi-class football detection task.
      </div>

      {/* KPIs */}
      <p className="section-title">Best results achieved</p>
      <div className="kpi-row" style={{ marginBottom: '2.5rem' }}>
        <div className="kpi-card kpi-accent">
          <div className="kpi-value">{(map50 * 100).toFixed(1)}%</div>
          <div className="kpi-label">Overall Accuracy</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 2 }}>mAP@50</div>
        </div>
        <div className="kpi-card kpi-blue">
          <div className="kpi-value">{(precision * 100).toFixed(1)}%</div>
          <div className="kpi-label">Precision</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 2 }}>When found, correct</div>
        </div>
        <div className="kpi-card kpi-gold">
          <div className="kpi-value">{(recall * 100).toFixed(1)}%</div>
          <div className="kpi-label">Recall</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 2 }}>Objects found</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{(map5095 * 100).toFixed(1)}%</div>
          <div className="kpi-label">Strict Accuracy</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 2 }}>mAP@50-95</div>
        </div>
      </div>

      {/* Metrics over time */}
      <p className="section-title">Accuracy improved over training</p>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', marginBottom: '1rem', lineHeight: 1.65 }}>
        The chart shows how detection accuracy improved as the AI trained. Higher is better on all lines.
      </p>
      <div style={CHART_STYLE}>
        <ChartTitle>Evaluation Metrics over Training</ChartTitle>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={history} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="epoch" tick={TICK} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 1]} tickFormatter={v => (v * 100).toFixed(0) + '%'} tick={TICK} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#888' }} />
            <Line type="monotone" dataKey="precision" name="Precision" stroke="#3b82f6" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="recall"    name="Recall"    stroke="#22c55e" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="map50"     name="mAP@50"    stroke="#f59e0b" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="map5095"   name="mAP@50-95" stroke="#ef4444" dot={false} strokeWidth={2} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* PR scatter */}
      <p className="section-title" style={{ marginTop: '2rem' }}>Precision vs. Recall</p>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', marginBottom: '1rem', lineHeight: 1.65 }}>
        Each dot is one training round. The AI improves as dots move toward the top-right.
      </p>
      <div style={CHART_STYLE}>
        <ChartTitle>Precision–Recall per Epoch</ChartTitle>
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="recall"    name="Recall"    type="number" domain={[0, 1]} tickFormatter={v => (v * 100).toFixed(0) + '%'} tick={TICK} axisLine={false} tickLine={false} label={{ value: 'Recall', position: 'insideBottom', offset: -2, fill: '#666', fontSize: 11 }} />
            <YAxis dataKey="precision" name="Precision" type="number" domain={[0, 1]} tickFormatter={v => (v * 100).toFixed(0) + '%'} tick={TICK} axisLine={false} tickLine={false} />
            <Tooltip content={<PrTooltip />} />
            <Scatter data={history} fill="#22c55e" fillOpacity={0.7} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Technical details */}
      <div style={{ marginTop: '2rem' }}>
        <button
          className="btn btn-ghost"
          onClick={() => setShowTechnical(s => !s)}
          style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}
        >
          {showTechnical ? '▲' : '▼'} &nbsp;Training details — for technical users
        </button>

        {showTechnical && (
          <div style={{ marginTop: '1.5rem' }}>
            <div className="content-grid">
              <div>
                <p className="section-title">Training Losses</p>
                <div style={CHART_STYLE}>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={history} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="epoch" tick={TICK} axisLine={false} tickLine={false} />
                      <YAxis tick={TICK} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 11 }} labelFormatter={v => `Epoch ${v}`} />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#888' }} />
                      <Line type="monotone" dataKey="train_box" name="Box"   stroke="#3b82f6" dot={false} strokeWidth={1.5} />
                      <Line type="monotone" dataKey="train_cls" name="Class" stroke="#22c55e" dot={false} strokeWidth={1.5} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="section-title">Validation Losses</p>
                <div style={CHART_STYLE}>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={history} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="epoch" tick={TICK} axisLine={false} tickLine={false} />
                      <YAxis tick={TICK} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 11 }} labelFormatter={v => `Epoch ${v}`} />
                      <Legend wrapperStyle={{ fontSize: 11, color: '#888' }} />
                      <Line type="monotone" dataKey="val_box" name="Box"   stroke="#f59e0b" dot={false} strokeWidth={1.5} />
                      <Line type="monotone" dataKey="val_cls" name="Class" stroke="#ef4444" dot={false} strokeWidth={1.5} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <p className="section-title" style={{ marginTop: '1.5rem' }}>Full Training Log</p>
            <div className="card card-flush" style={{ overflowX: 'auto' }}>
              <table className="det-table">
                <thead>
                  <tr>
                    <th>Epoch</th>
                    <th>mAP@50</th>
                    <th>mAP@50-95</th>
                    <th>Precision</th>
                    <th>Recall</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(row => (
                    <tr key={row.epoch}>
                      <td>{row.epoch}</td>
                      <td>{row.map50    != null ? (row.map50    * 100).toFixed(2) + '%' : '—'}</td>
                      <td>{row.map5095  != null ? (row.map5095  * 100).toFixed(2) + '%' : '—'}</td>
                      <td>{row.precision!= null ? (row.precision* 100).toFixed(2) + '%' : '—'}</td>
                      <td>{row.recall   != null ? (row.recall   * 100).toFixed(2) + '%' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
