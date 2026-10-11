import { useState, useRef, useCallback, useEffect } from 'react'
import { colorFor, teamColorFor } from '../lib/detectionUi.jsx'

export default function Match() {
  const [library, setLibrary] = useState([])
  const [libraryError, setLibraryError] = useState(null)
  const [meta, setMeta] = useState(null)   // { job_id, media_url, fps, total_frames, width, height, duration }
  const [loadingSource, setLoadingSource] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const [isPlaying, setIsPlaying] = useState(false)
  const [wsState, setWsState] = useState('idle') // idle | streaming | done | stopped | error
  const [processedFrames, setProcessedFrames] = useState(0)
  const [activeDetections, setActiveDetections] = useState([])
  const [teamMap, setTeamMap] = useState({})
  const [videoHash, setVideoHash] = useState(null)

  const fileRef = useRef()
  const videoRef = useRef()
  const wsRef = useRef(null)
  const startedRef = useRef(false)
  const framesRef = useRef([])       // all received { timestamp, detections }
  const lastShownIdxRef = useRef(-1)

  useEffect(() => {
    fetch('/api/video/library')
      .then(res => res.json())
      // The Spain vs Argentina broadcast clip is reserved for Live mode only.
      .then(data => setLibrary((data.videos || []).filter(v => !/spain/i.test(v.filename))))
      .catch(() => setLibraryError('Could not load the video library.'))
  }, [])

  useEffect(() => () => wsRef.current?.close(), [])

  // Same "fully analyze before allowing playback" pattern as Live.jsx — tracking is
  // CPU-bound and much slower than real time, so overlays must never try to keep up
  // with live playback; the whole clip is tracked once, then played back guaranteed-synced.
  useEffect(() => {
    if (meta && !startedRef.current) {
      startedRef.current = true
      beginAnalysis()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta])

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
    setTeamMap({})
    setVideoHash(null)
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
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/match/${meta.job_id}`)
    wsRef.current = ws
    setWsState('streaming')

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data)
      if (msg.type === 'frame') {
        framesRef.current.push({ timestamp: msg.timestamp, detections: msg.detections })
        setProcessedFrames(msg.frame_idx)
      } else if (msg.type === 'teams') {
        setTeamMap(msg.team_map || {})
      } else if (msg.type === 'done') {
        setWsState('done')
        setVideoHash(msg.video_hash || null)
      } else if (msg.type === 'stopped') setWsState('stopped')
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

  const stateLabel = { idle: 'Preparing…', streaming: 'Tracking', done: 'Ready to play', stopped: 'Stopped', error: 'Error' }[wsState]
  const analysisPct = meta?.total_frames ? Math.min(100, Math.round((processedFrames / meta.total_frames) * 100)) : 0

  const teamCounts = Object.values(teamMap).reduce((acc, t) => {
    acc[t] = (acc[t] || 0) + 1
    return acc
  }, {})

  return (
    <main className="container page">
      <div style={{ marginBottom: '2rem' }}>
        <h1 className="page-title">Match</h1>
        <p className="page-sub">Every player tracked across the clip and split into two teams by shirt colour. This is what powers the tactics quiz.</p>
      </div>

      {!meta && (
        <>
          <p className="section-title">Video Library</p>
          {libraryError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{libraryError}</div>}
          {library.length === 0 && !libraryError && (
            <div className="alert alert-info" style={{ marginBottom: '1.75rem' }}>
              No videos in the library yet. Drop <code>.mp4</code> files into the <code>videos/</code> folder, or upload one below.
            </div>
          )}
          {library.length > 0 && (
            <div className="video-lib-grid" style={{ marginBottom: '1.75rem' }}>
              {library.map(v => (
                <button key={v.filename} className="video-lib-card" onClick={() => pickLibraryVideo(v.filename)} disabled={loadingSource}>
                  <div className="video-lib-name">{v.filename}</div>
                  <div className="video-lib-meta">
                    {Math.floor(v.duration / 60)}:{String(Math.round(v.duration % 60)).padStart(2, '0')}
                    &nbsp;·&nbsp;{v.width}×{v.height}&nbsp;·&nbsp;{v.size_mb} MB
                  </div>
                </button>
              ))}
            </div>
          )}

          <p className="section-title">Or Upload Your Own</p>
          <div
            className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={onFileChange} />
            <div className="upload-title">Drop a match clip here</div>
            <p className="upload-sub">or click to browse &nbsp;·&nbsp; short clips work best, tracking takes longer than a quick scan</p>
          </div>

          {loadingSource && (
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.5rem' }}>
              <div className="spinner" />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Loading video…</span>
            </div>
          )}
          {error && <div className="alert alert-error" style={{ marginTop: '1.5rem' }}>{error}</div>}
        </>
      )}

      {meta && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
            {wsState === 'streaming' && <span className="live-dot" />}
            <span style={{
              fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: wsState === 'streaming' ? 'var(--red)' : 'var(--text-3)',
            }}>
              {stateLabel}
            </span>
            {wsState !== 'idle' && wsState !== 'done' && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                &nbsp;·&nbsp; {processedFrames} / {meta.total_frames} frames ({analysisPct}%)
              </span>
            )}
          </div>

          {wsState !== 'done' ? (
            <div className="card" style={{ padding: '2rem', marginBottom: '1.5rem' }}>
              {wsState === 'error' ? (
                <div className="alert alert-error">{error}</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div className="spinner" />
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-2)' }}>
                      Following every player through the clip and working out the two teams by shirt colour. This takes a bit longer than a quick scan, but only has to happen once.
                    </span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${analysisPct}%` }} />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="video-shell" style={{ marginBottom: '1.5rem' }}>
              <video
                ref={videoRef}
                src={meta.media_url}
                controls
                onPlay={onPlay}
                onPause={onPause}
                onEnded={onEnded}
              />
              <div className="video-overlay">
                {activeDetections.map((d, i) => {
                  const [x1, y1, x2, y2] = d.bbox
                  const left = (x1 / meta.width) * 100
                  const top = (y1 / meta.height) * 100
                  const w = ((x2 - x1) / meta.width) * 100
                  const h = ((y2 - y1) / meta.height) * 100
                  const team = d.track_id != null ? teamMap[String(d.track_id)] : undefined
                  const c = teamColorFor(team) || colorFor(d.class_name)
                  const label = d.track_id != null ? `#${d.track_id} ${d.class_name}` : d.class_name
                  return (
                    <div key={i} className="det-box" style={{ left: `${left}%`, top: `${top}%`, width: `${w}%`, height: `${h}%`, borderColor: c }}>
                      <span className="det-box-label" style={{ background: c }}>{label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <button className="btn btn-ghost" onClick={reset} style={{ marginBottom: '1.75rem' }}>Choose another video</button>

          {wsState === 'done' && (
            <div className="kpi-row" style={{ marginBottom: '1.75rem' }}>
              <div className="kpi-card" style={{ borderTop: '3px solid #3B82F6' }}>
                <div className="kpi-value" style={{ color: '#3B82F6' }}>{teamCounts[0] || 0}</div>
                <div className="kpi-label">Team A players</div>
              </div>
              <div className="kpi-card" style={{ borderTop: '3px solid #EF4444' }}>
                <div className="kpi-value" style={{ color: '#EF4444' }}>{teamCounts[1] || 0}</div>
                <div className="kpi-label">Team B players</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-value">{Object.keys(teamMap).length}</div>
                <div className="kpi-label">Tracked players</div>
              </div>
            </div>
          )}

          {videoHash && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
              video_hash: <code>{videoHash}</code>
            </p>
          )}
        </>
      )}
    </main>
  )
}
