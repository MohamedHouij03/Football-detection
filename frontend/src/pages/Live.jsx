import { useState, useRef, useCallback, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'
import { motion } from 'motion/react'
import { UploadCloud, Loader2, X } from 'lucide-react'
import { colorFor, pct, ScoreBar, ChartTooltip } from '../lib/detectionUi.jsx'
import { Button } from '../components/ui/button.jsx'
import { Card } from '../components/ui/card.jsx'
import { Progress } from '../components/ui/progress.jsx'
import { Badge } from '../components/ui/badge.jsx'
import PageHeader from '../components/PageHeader.jsx'

const MAX_TIMELINE_POINTS = 300

export default function Live() {
  const [library, setLibrary] = useState([])
  const [libraryError, setLibraryError] = useState(null)
  const [meta, setMeta]     = useState(null)   // { job_id, media_url, fps, total_frames, width, height, duration }
  const [loadingSource, setLoadingSource] = useState(false)
  const [error, setError]   = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const [isPlaying, setIsPlaying]   = useState(false)
  const [wsState, setWsState]       = useState('idle') // idle | streaming | done | stopped | error
  const [processedFrames, setProcessedFrames] = useState(0)
  const [activeDetections, setActiveDetections] = useState([])
  const [cumulative, setCumulative] = useState({})
  const [timeline, setTimeline]     = useState([])

  const fileRef = useRef()
  const videoRef = useRef()
  const wsRef = useRef(null)
  const startedRef = useRef(false)
  const framesRef = useRef([])       // all received { timestamp, detections }
  const lastShownIdxRef = useRef(-1)

  useEffect(() => {
    fetch('/api/video/library')
      .then(res => res.json())
      .then(data => setLibrary(data.videos || []))
      .catch(() => setLibraryError('Could not load the video library.'))
  }, [])

  useEffect(() => () => wsRef.current?.close(), [])

  // Analyze the whole video up front (no live/real-time pipeline) so that once
  // playback starts, every overlay is guaranteed to be accurate — nothing lags
  // or goes blank because inference is still catching up to the playhead.
  useEffect(() => {
    if (meta && !startedRef.current) {
      startedRef.current = true
      beginAnalysis()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta])

  // Sync overlay boxes to the video's actual playback position
  useEffect(() => {
    if (!isPlaying) return
    let raf
    const tick = () => {
      const t = videoRef.current ? videoRef.current.currentTime : 0
      const frames = framesRef.current
      let idx = -1
      for (let i = frames.length - 1; i >= 0; i--) {
        if (frames[i].timestamp <= t + 0.08) { idx = i; break }
      }
      if (idx !== lastShownIdxRef.current) {
        lastShownIdxRef.current = idx
        setActiveDetections(idx >= 0 ? frames[idx].detections : [])
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying])

  const resetAnalysisState = () => {
    startedRef.current = false
    framesRef.current = []
    lastShownIdxRef.current = -1
    setWsState('idle')
    setProcessedFrames(0)
    setActiveDetections([])
    setCumulative({})
    setTimeline([])
  }

  const pickLibraryVideo = async (filename) => {
    setLoadingSource(true)
    setError(null)
    resetAnalysisState()
    try {
      const res = await fetch('/api/video/analyze-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Server error ${res.status}`)
      }
      setMeta(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingSource(false)
    }
  }

  const pickUpload = useCallback(async (f) => {
    if (!f) return
    setLoadingSource(true)
    setError(null)
    resetAnalysisState()
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/video/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Server error ${res.status}`)
      }
      setMeta(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingSource(false)
    }
  }, [])

  const onFileChange = (e) => pickUpload(e.target.files[0])
  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    pickUpload(e.dataTransfer.files[0])
  }

  const beginAnalysis = () => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/video/${meta.job_id}`)
    wsRef.current = ws
    setWsState('streaming')

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data)
      if (msg.type === 'frame') {
        framesRef.current.push({ timestamp: msg.timestamp, detections: msg.detections })
        setProcessedFrames(msg.frame_idx)
        setTimeline(prev => {
          const next = [...prev, { t: msg.timestamp, total: msg.total }]
          return next.length > MAX_TIMELINE_POINTS ? next.slice(next.length - MAX_TIMELINE_POINTS) : next
        })
        setCumulative(prev => {
          const next = { ...prev }
          for (const [name, d] of Object.entries(msg.classes || {})) {
            const cur = next[name] || { count: 0, scoreSum: 0 }
            next[name] = { count: cur.count + d.count, scoreSum: cur.scoreSum + d.avg_score * d.count }
          }
          return next
        })
      } else if (msg.type === 'done') setWsState('done')
      else if (msg.type === 'stopped') setWsState('stopped')
      else if (msg.type === 'error') { setError(msg.detail); setWsState('error') }
    }
    ws.onerror = () => setError('Connection to the analysis stream failed.')
  }

  const onPlay = () => setIsPlaying(true)
  const onPause = () => setIsPlaying(false)
  const onEnded = () => setIsPlaying(false)

  const reset = () => {
    wsRef.current?.close()
    wsRef.current = null
    setMeta(null)
    setError(null)
    setIsPlaying(false)
    resetAnalysisState()
    if (fileRef.current) fileRef.current.value = ''
  }

  const classEntries = Object.entries(cumulative)
    .map(([name, d]) => [name, { count: d.count, avg_score: d.count ? d.scoreSum / d.count : 0 }])
    .sort((a, b) => b[1].count - a[1].count)

  const totalDetections = classEntries.reduce((sum, [, d]) => sum + d.count, 0)

  const stateLabel = { idle: 'Preparing…', streaming: 'Analyzing', done: 'Ready to play', stopped: 'Stopped', error: 'Error' }[wsState]
  const analysisPct = meta?.total_frames ? Math.min(100, Math.round((processedFrames / meta.total_frames) * 100)) : 0

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 lg:px-10">
      <PageHeader
        eyebrow="Full clip"
        title="Video Detection"
        sub="Pick a match video. We analyze it fully first, then play it back with every detection perfectly in sync."
      />

      {/* Source picker */}
      {!meta && (
        <>
          <p className="mb-3 font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-ink-3">Video Library</p>
          {libraryError && <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">{libraryError}</div>}
          {library.length === 0 && !libraryError && (
            <div className="mb-7 rounded-lg border border-border-soft bg-surface px-4 py-3 text-sm text-ink-3">
              No videos in the library yet. Drop <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-xs">.mp4</code> files into the <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-xs">videos/</code> folder, or upload one below.
            </div>
          )}
          {library.length > 0 && (
            <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {library.map(v => (
                <Card
                  key={v.filename}
                  onClick={() => !loadingSource && pickLibraryVideo(v.filename)}
                  className="cursor-pointer p-4 transition-colors hover:border-lime/30"
                >
                  <div className="truncate text-sm font-semibold text-ink-1">{v.filename}</div>
                  <div className="mt-1 text-xs text-ink-3">
                    {Math.floor(v.duration / 60)}:{String(Math.round(v.duration % 60)).padStart(2, '0')}
                    &nbsp;&middot;&nbsp;{v.width}×{v.height}&nbsp;&middot;&nbsp;{v.size_mb} MB
                  </div>
                </Card>
              ))}
            </div>
          )}

          <p className="mb-3 font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-ink-3">Or Upload Your Own</p>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
              dragOver ? 'border-lime bg-lime-dim' : 'border-border-soft bg-surface hover:border-lime/30'
            }`}
          >
            <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={onFileChange} className="hidden" />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-lime-dim">
              <UploadCloud className="h-6 w-6 text-lime" />
            </div>
            <div className="font-display text-base font-semibold text-ink-1">Drop a match video here</div>
            <p className="text-sm text-ink-3">or click to browse &middot; MP4, MOV, or WebM</p>
          </div>

          {loadingSource && (
            <div className="mt-6 flex items-center gap-3 rounded-lg border border-border-soft bg-surface px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-lime" />
              <span className="text-sm text-ink-3">Loading video&hellip;</span>
            </div>
          )}
          {error && <div className="mt-6 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
        </>
      )}

      {/* Player + overlay */}
      {meta && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="mb-3 flex items-center gap-3">
            {wsState === 'streaming' ? <Badge variant="live">Analyzing</Badge> : (
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-ink-3">{stateLabel}</span>
            )}
            {wsState !== 'idle' && wsState !== 'done' && (
              <span className="text-xs text-ink-3">{processedFrames} / {meta.total_frames} frames ({analysisPct}%)</span>
            )}
          </div>

          {wsState !== 'done' ? (
            <Card className="mb-6 p-8">
              {wsState === 'error' ? (
                <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
              ) : (
                <>
                  <div className="mb-5 flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-lime" />
                    <span className="text-sm text-ink-2">
                      Analyzing the full video before playback, so every detection box lines up exactly. This can take a while on CPU.
                    </span>
                  </div>
                  <Progress value={analysisPct} />
                </>
              )}
            </Card>
          ) : (
            <div className="relative mb-6 overflow-hidden rounded-xl border border-border-soft bg-black">
              <video
                ref={videoRef}
                src={meta.media_url}
                controls
                className="w-full"
                onPlay={onPlay}
                onPause={onPause}
                onEnded={onEnded}
              />
              <div className="pointer-events-none absolute inset-0">
                {activeDetections.map((d, i) => {
                  const [x1, y1, x2, y2] = d.bbox
                  const left = (x1 / meta.width) * 100
                  const top = (y1 / meta.height) * 100
                  const w = ((x2 - x1) / meta.width) * 100
                  const h = ((y2 - y1) / meta.height) * 100
                  const c = colorFor(d.class_name)
                  return (
                    <div
                      key={i}
                      className="absolute rounded-sm border-2"
                      style={{ left: `${left}%`, top: `${top}%`, width: `${w}%`, height: `${h}%`, borderColor: c }}
                    >
                      <span
                        className="absolute -top-5 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[0.65rem] font-semibold text-black"
                        style={{ background: c }}
                      >
                        {d.class_name} {Math.round(d.score * 100)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <Button variant="ghost" onClick={reset} className="mb-7">
            <X className="h-4 w-4" /> Choose another video
          </Button>

          {/* KPI row */}
          <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {classEntries.map(([name, d], i) => (
              <Card key={name} className="p-4" style={{ borderTopColor: colorFor(name, i), borderTopWidth: 3 }}>
                <div className="font-display text-2xl font-bold" style={{ color: colorFor(name, i) }}>{d.count}</div>
                <div className="mt-1 text-xs capitalize text-ink-3">{name}</div>
              </Card>
            ))}
            <Card className="p-4">
              <div className="font-display text-2xl font-bold text-ink-1">{totalDetections}</div>
              <div className="mt-1 text-xs text-ink-3">Total</div>
            </Card>
          </div>

          {/* Timeline chart */}
          <p className="mb-3 font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-ink-3">Detections Over Time</p>
          {timeline.length === 0 ? (
            <div className="mb-7 rounded-lg border border-border-soft bg-surface px-4 py-3 text-sm text-ink-3">Analysis starting&hellip;</div>
          ) : (
            <Card className="mb-7 p-4">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={timeline} margin={{ top: 12, right: 24, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="t" tick={{ fill: '#6B7489', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={t => `${t}s`} />
                  <YAxis tick={{ fill: '#6B7489', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(184,255,69,0.2)' }} />
                  <Line type="monotone" dataKey="total" stroke="#B8FF45" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Breakdown */}
          <p className="mb-3 font-mono text-[0.68rem] font-semibold uppercase tracking-wider text-ink-3">Breakdown</p>
          <Card className="overflow-hidden">
            {classEntries.length === 0 ? (
              <div className="p-6 text-sm text-ink-3">Nothing detected so far.</div>
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
                </tbody>
              </table>
            )}
          </Card>
        </motion.div>
      )}
    </main>
  )
}
