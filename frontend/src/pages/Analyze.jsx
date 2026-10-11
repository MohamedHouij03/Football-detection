import { useState, useRef, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts'
import { motion, AnimatePresence } from 'motion/react'
import { UploadCloud, Loader2, X, Download } from 'lucide-react'
import { colorFor, pct, ScoreBar, ChartTooltip } from '../lib/detectionUi.jsx'
import { Button } from '../components/ui/button.jsx'
import { Card } from '../components/ui/card.jsx'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.jsx'
import PageHeader from '../components/PageHeader.jsx'

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
      'PitchVision Analysis Report', '='.repeat(36),
      `File:  ${file?.name || 'unknown'}`, `Total: ${results.total}`, '',
      'Breakdown:', ...classLines,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    downloadImage(URL.createObjectURL(blob), 'pitchvision_report.txt')
  }

  const classEntries = Object.entries(results?.classes || {})
    .sort((a, b) => b[1].count - a[1].count)

  const chartData = classEntries.map(([name, d]) => ({ name, count: d.count }))

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 lg:px-10">
      <PageHeader
        eyebrow="Single image"
        title="Image Detection"
        sub="Drop in a match photo and see every player and the ball, found and labelled."
      />

      {/* Upload zone */}
      {!file && (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-20 text-center transition-colors ${
            dragOver ? 'border-lime bg-lime-dim' : 'border-border-soft bg-surface hover:border-lime/30'
          }`}
        >
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFileChange} className="hidden" />
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-lime-dim">
            <UploadCloud className="h-6 w-6 text-lime" />
          </div>
          <div className="font-display text-base font-semibold text-ink-1">Drop a match photo here</div>
          <p className="text-sm text-ink-3">or click to browse &middot; JPG or PNG</p>
        </div>
      )}

      {/* Preview + action */}
      {file && !results && (
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <p className="mb-2 font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-ink-3">Preview</p>
            <div className="overflow-hidden rounded-xl border border-border-soft bg-surface">
              <img src={preview} alt="preview" className="w-full" />
            </div>
            <p className="mt-2 text-xs text-ink-3">{file.name} &middot; {(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <div className="flex flex-col justify-center">
            <p className="mb-1 text-sm font-semibold text-ink-1">Ready to analyze</p>
            <p className="mb-6 text-sm leading-relaxed text-ink-3">
              Takes a couple of seconds. We'll box up every player, goalkeeper, referee, and the ball.
            </p>
            {error && <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
            <div className="flex flex-col gap-2">
              <Button size="lg" onClick={analyze} disabled={loading}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing&hellip;</> : 'Analyze Image'}
              </Button>
              <Button variant="secondary" onClick={reset} disabled={loading}>
                <X className="h-4 w-4" /> Choose another image
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      <AnimatePresence>
        {results && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            {/* KPI row */}
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {classEntries.map(([name, d], i) => (
                <Card key={name} className="p-4" style={{ borderTopColor: colorFor(name, i), borderTopWidth: 3 }}>
                  <div className="font-display text-2xl font-bold" style={{ color: colorFor(name, i) }}>{d.count}</div>
                  <div className="mt-1 text-xs capitalize text-ink-3">{name}</div>
                </Card>
              ))}
              <Card className="p-4">
                <div className="font-display text-2xl font-bold text-ink-1">{results.total}</div>
                <div className="mt-1 text-xs text-ink-3">Total</div>
              </Card>
            </div>

            {/* Before / After */}
            <p className="mb-3 font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-ink-3">Before &amp; After</p>
            <div className="mb-8 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs text-ink-3">Original</p>
                <div className="overflow-hidden rounded-xl border border-border-soft"><img src={results.original} alt="original" className="w-full" /></div>
              </div>
              <div>
                <p className="mb-2 text-xs text-ink-3">Detected</p>
                <div className="overflow-hidden rounded-xl border border-border-soft"><img src={results.annotated} alt="annotated" className="w-full" /></div>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
                <TabsTrigger value="charts">Charts</TabsTrigger>
                <TabsTrigger value="download">Download</TabsTrigger>
              </TabsList>

              <TabsContent value="breakdown">
                <Card className="overflow-hidden">
                  {results.total === 0 ? (
                    <div className="p-6 text-sm text-ink-3">Nothing was detected in this image.</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border-soft text-left text-xs text-ink-3">
                          <th className="px-5 py-3 font-medium">Class</th>
                          <th className="px-5 py-3 font-medium">Count</th>
                          <th className="px-5 py-3 font-medium">Avg Score</th>
                          <th className="px-5 py-3 font-medium" style={{ minWidth: 160 }}>Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classEntries.map(([name, d], i) => (
                          <tr key={name} className="border-b border-border-soft last:border-0">
                            <td className="px-5 py-3 capitalize text-ink-1">
                              <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: colorFor(name, i) }} />
                              {name}
                            </td>
                            <td className="px-5 py-3 font-semibold text-ink-1">{d.count}</td>
                            <td className="px-5 py-3 text-ink-2">{pct(d.avg_score)}</td>
                            <td className="px-5 py-3"><ScoreBar value={d.avg_score} /></td>
                          </tr>
                        ))}
                        <tr>
                          <td className="px-5 py-3 font-semibold text-ink-2">Total</td>
                          <td className="px-5 py-3 font-bold text-ink-1">{results.total}</td>
                          <td colSpan={2} />
                        </tr>
                      </tbody>
                    </table>
                  )}
                </Card>
              </TabsContent>

              <TabsContent value="charts">
                {chartData.length === 0 ? (
                  <div className="rounded-lg border border-border-soft bg-surface p-6 text-sm text-ink-3">No detections to chart.</div>
                ) : (
                  <Card className="p-4">
                    <p className="mb-2 font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-ink-3">Object Distribution</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: '#6B7489', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#6B7489', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(184,255,69,0.06)' }} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {chartData.map((d, i) => (
                            <Cell key={d.name} fill={colorFor(d.name, i)} fillOpacity={0.9} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="download">
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    { title: 'Annotated Image', desc: 'PNG with all detections overlaid', label: 'Download PNG', action: () => downloadImage(results.annotated, `pitchvision_${file?.name || 'result'}.jpg`) },
                    { title: 'Detection Data',  desc: 'All detections as a CSV spreadsheet', label: 'Download CSV', action: downloadCsv },
                    { title: 'Summary Report',  desc: 'Plain-text summary of what was found', label: 'Download TXT', action: downloadTxt },
                  ].map(item => (
                    <Card key={item.title} className="flex flex-col gap-3 p-5">
                      <div>
                        <div className="text-sm font-semibold text-ink-1">{item.title}</div>
                        <p className="mt-1 text-xs text-ink-3">{item.desc}</p>
                      </div>
                      <Button variant="secondary" size="sm" onClick={item.action}>
                        <Download className="h-3.5 w-3.5" /> {item.label}
                      </Button>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            <div className="mt-8 border-t border-border-soft pt-6">
              <Button variant="ghost" onClick={reset}>Analyze another image</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
