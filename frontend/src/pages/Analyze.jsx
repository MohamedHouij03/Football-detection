import { useState, useRef, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'

// Colors assigned to each raw model class name
const CLASS_COLORS = {
  Arbitre:  '#F59E0B',
  Ballon:   '#EF4444',
  Football: '#3B82F6',
  Gardien:  '#22C55E',
  Joueur:   '#3B82F6',
  Player:   '#3B82F6',
  ball:     '#EF4444',
  big:      '#8B5CF6',
  person:   '#3B82F6',
  player:   '#3B82F6',
  refere:   '#F59E0B',
}

const FALLBACK_COLORS = ['#3B82F6','#22C55E','#F59E0B','#EF4444','#8B5CF6','#EC4899']

function colorFor(name, index = 0) {
  return CLASS_COLORS[name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

function pct(n) { return (n * 100).toFixed(0) + '%' }

function ScoreBar({ value }) {
  return (
    <div className="score-bar-wrap">
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: Math.round(value * 100) + '%' }} />
      </div>
      <span className="score-text">{Math.round(value * 100)}%</span>
    </div>
  )
}

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#1a1a1a', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, padding:'6px 10px', fontSize:12 }}>
      <span style={{ color:'#f0f0f0' }}>{payload[0].payload.name}: </span>
      <strong style={{ color:'#f0f0f0' }}>{payload[0].value}</strong>
    </div>
  )
}

export default function Analyze() {
  const [file, setFile]         = useState(null)
  const [preview, setPreview]   = useState(null)
  const [results, setResults]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [activeTab, setActiveTab] = useState('breakdown')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef()

  const pick = useCallback((f) => {
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setResults(null)
    setError(null)
  }, [])

  const onFileChange = (e) => pick(e.target.files[0])
  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    pick(e.dataTransfer.files[0])
  }

  const analyze = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/detect', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Server error ${res.status}`)
      }
      const data = await res.json()
      setResults(data)
      setActiveTab('breakdown')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setFile(null); setPreview(null); setResults(null); setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const downloadImage = (src, name) => {
    const a = document.createElement('a'); a.href = src; a.download = name; a.click()
  }

  const downloadCsv = () => {
    if (!results?.detections) return
    const rows = results.detections.map(d => `${d.class_name},${d.score},${d.bbox.join(',')}`)
    const blob = new Blob([['class,score,x1,y1,x2,y2', ...rows].join('\n')], { type: 'text/csv' })
    downloadImage(URL.createObjectURL(blob), 'pitchvision_detections.csv')
  }

  const downloadTxt = () => {
    if (!results) return
    const classLines = Object.entries(results.classes || {})
      .map(([name, d]) => `  ${name.padEnd(14)}: ${d.count}`)
    const lines = [
      'PitchVision — Analysis Report', '='.repeat(36),
      `File:  ${file?.name || 'unknown'}`, `Total: ${results.total}`, '',
      'Breakdown:', ...classLines,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    downloadImage(URL.createObjectURL(blob), 'pitchvision_report.txt')
  }

  // Sorted class entries for display
  const classEntries = Object.entries(results?.classes || {})
    .sort((a, b) => b[1].count - a[1].count)

  const chartData = classEntries.map(([name, d]) => ({ name, count: d.count }))

  return (
    <main className="container page">
      <div style={{ marginBottom: '2rem' }}>
        <h1 className="page-title">Analyze</h1>
        <p className="page-sub">Upload a match image to detect objects on the pitch.</p>
      </div>

      {/* Upload zone */}
      {!file && (
        <div
          className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} />
          <div className="upload-title">Drop a match photo here</div>
          <p className="upload-sub">or click to browse &nbsp;·&nbsp; JPG or PNG</p>
        </div>
      )}

      {/* Preview + action */}
      {file && !results && (
        <div className="content-grid" style={{ alignItems: 'start' }}>
          <div>
            <p className="img-label">Preview</p>
            <div className="img-wrap"><img src={preview} alt="preview" /></div>
            <p style={{ fontSize:'0.72rem', color:'var(--text-3)', marginTop:'0.5rem' }}>
              {file.name} &nbsp;·&nbsp; {(file.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <div style={{ paddingTop: '1.25rem' }}>
            <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-1)', marginBottom:'0.35rem' }}>
              Ready to analyze
            </p>
            <p style={{ fontSize:'0.8rem', color:'var(--text-2)', marginBottom:'1.5rem', lineHeight:1.65 }}>
              Click the button below. The AI will scan the image and highlight every object it finds.
            </p>
            {error && <div className="alert alert-error" style={{ marginBottom:'1rem' }}>{error}</div>}
            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
              <button className="btn btn-primary btn-full" onClick={analyze} disabled={loading}>
                {loading ? <><div className="spinner" />&nbsp;Analyzing…</> : 'Analyze Image'}
              </button>
              <button className="btn btn-secondary btn-full" onClick={reset} disabled={loading}>
                Choose another image
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <>
          {/* KPI row — dynamic, one card per detected class */}
          <div className="kpi-row" style={{ marginBottom: '1.75rem' }}>
            {classEntries.map(([name, d], i) => (
              <div key={name} className="kpi-card" style={{ borderTop: `3px solid ${colorFor(name, i)}` }}>
                <div className="kpi-value" style={{ color: colorFor(name, i) }}>{d.count}</div>
                <div className="kpi-label">{name}</div>
              </div>
            ))}
            <div className="kpi-card">
              <div className="kpi-value">{results.total}</div>
              <div className="kpi-label">Total</div>
            </div>
          </div>

          {/* Before / After */}
          <p className="section-title">Before &amp; After</p>
          <div className="img-grid" style={{ marginBottom: '1.75rem' }}>
            <div>
              <p className="img-label">Original</p>
              <div className="img-wrap"><img src={results.original} alt="original" /></div>
            </div>
            <div>
              <p className="img-label">Detected</p>
              <div className="img-wrap"><img src={results.annotated} alt="annotated" /></div>
            </div>
          </div>

          {/* Tabs */}
          <div className="tabs">
            {['breakdown', 'charts', 'download'].map(t => (
              <button key={t} className={`tab-btn ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Breakdown */}
          {activeTab === 'breakdown' && (
            <div className="card card-flush">
              {results.total === 0
                ? <div className="alert alert-info" style={{ margin:'1rem' }}>Nothing was detected in this image.</div>
                : (
                  <table className="det-table">
                    <thead>
                      <tr>
                        <th>Class</th><th>Count</th><th>Avg Score</th>
                        <th style={{ minWidth: 140 }}>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {classEntries.map(([name, d], i) => (
                        <tr key={name}>
                          <td>
                            <span className="class-dot" style={{ background: colorFor(name, i) }} />
                            {name}
                          </td>
                          <td style={{ fontWeight: 600 }}>{d.count}</td>
                          <td>{pct(d.avg_score)}</td>
                          <td><ScoreBar value={d.avg_score} /></td>
                        </tr>
                      ))}
                      <tr>
                        <td style={{ fontWeight:600, color:'var(--text-2)' }}>Total</td>
                        <td style={{ fontWeight:700 }}>{results.total}</td>
                        <td colSpan={2} />
                      </tr>
                    </tbody>
                  </table>
                )
              }
            </div>
          )}

          {/* Charts */}
          {activeTab === 'charts' && (
            chartData.length === 0
              ? <div className="alert alert-info">No detections to chart.</div>
              : (
                <div className="chart-wrap">
                  <p style={{ fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#666', padding:'0 0.75rem 0.75rem' }}>
                    Object Distribution
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} margin={{ top:4, right:24, left:0, bottom:4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill:'#666', fontSize:11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill:'#666', fontSize:11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill:'rgba(255,255,255,0.04)' }} />
                      <Bar dataKey="count" radius={[4,4,0,0]}>
                        {chartData.map((d, i) => (
                          <Cell key={d.name} fill={colorFor(d.name, i)} fillOpacity={0.9} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
          )}

          {/* Download */}
          {activeTab === 'download' && (
            <div className="content-grid">
              {[
                { title:'Annotated Image', desc:'PNG with all detections overlaid',     label:'Download PNG', action:() => downloadImage(results.annotated, `pitchvision_${file?.name || 'result'}.jpg`) },
                { title:'Detection Data',  desc:'All detections as a CSV spreadsheet',  label:'Download CSV', action:downloadCsv },
                { title:'Summary Report',  desc:'Plain-text summary of what was found', label:'Download TXT', action:downloadTxt },
              ].map(item => (
                <div key={item.title} className="card" style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                  <div>
                    <div style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--text-1)', marginBottom:'0.2rem' }}>{item.title}</div>
                    <p style={{ fontSize:'0.78rem', color:'var(--text-2)' }}>{item.desc}</p>
                  </div>
                  <button className="btn btn-secondary" onClick={item.action}>{item.label}</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop:'2rem', paddingTop:'1.5rem', borderTop:'1px solid var(--border)' }}>
            <button className="btn btn-ghost" onClick={reset}>← Analyze another image</button>
          </div>
        </>
      )}
    </main>
  )
}
