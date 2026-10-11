import { useState, useRef, useCallback, useEffect } from 'react'
import { registerVideo, listQuestions, createQuestion, updateQuestion, deleteQuestion } from '../lib/quizApi.js'

const EMPTY_FORM = { prompt: '', choices: ['', '', ''], explanation: '' }

export default function Coach() {
  const [library, setLibrary] = useState([])
  const [libraryError, setLibraryError] = useState(null)
  const [meta, setMeta] = useState(null)       // {job_id, media_url, fps, width, height, duration}
  const [videoHash, setVideoHash] = useState(null)
  const [loadingSource, setLoadingSource] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const [questions, setQuestions] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [formTimestamp, setFormTimestamp] = useState(0)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)

  const [playerMarkers, setPlayerMarkers] = useState([])
  const [detecting, setDetecting] = useState(false)

  const fileRef = useRef()
  const videoRef = useRef()

  useEffect(() => {
    fetch('/api/video/library')
      .then(res => res.json())
      .then(data => setLibrary(data.videos || []))
      .catch(() => setLibraryError('Could not load the video library.'))
  }, [])

  const refreshQuestions = useCallback((vh) => {
    listQuestions(vh).then(d => setQuestions(d.questions || [])).catch(e => setError(e.message))
  }, [])

  const afterSourceReady = useCallback(async (jobMeta) => {
    setMeta(jobMeta)
    try {
      const reg = await registerVideo(jobMeta)
      setVideoHash(reg.video_hash)
      refreshQuestions(reg.video_hash)
    } catch (e) {
      setError(e.message)
    }
  }, [refreshQuestions])

  const pickLibraryVideo = async (filename) => {
    setLoadingSource(true)
    setError(null)
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
      await afterSourceReady(await res.json())
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
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/video/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Server error ${res.status}`)
      }
      await afterSourceReady(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingSource(false)
    }
  }, [afterSourceReady])

  const onFileChange = (e) => pickUpload(e.target.files[0])
  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    pickUpload(e.dataTransfer.files[0])
  }

  const reset = () => {
    setMeta(null)
    setVideoHash(null)
    setQuestions([])
    setError(null)
    setFormOpen(false)
    setPlayerMarkers([])
    if (fileRef.current) fileRef.current.value = ''
  }

  // Detect players at whatever frame the video is currently paused on, so the Coach
  // can see numbered options before writing choice text that references them. Reuses
  // the existing single-image /api/detect endpoint — no tracking/backend changes
  // needed, this just captures the current <video> frame to a canvas and posts it.
  const detectPlayersHere = useCallback(async () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    setDetecting(true)
    setError(null)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = v.videoWidth
      canvas.height = v.videoHeight
      canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
      const fd = new FormData()
      fd.append('file', blob, 'frame.jpg')
      const res = await fetch('/api/detect', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Detection failed (${res.status})`)
      }
      const data = await res.json()
      const markers = (data.detections || [])
        .filter(d => d.class_name === 'player' || d.class_name === 'goalkeeper')
        .sort((a, b) => a.bbox[0] - b.bbox[0])   // left-to-right — stable, predictable numbering
        .map((d, i) => {
          const [x1, y1, x2, y2] = d.bbox
          return {
            number: i + 1,
            left: ((x1 + x2) / 2 / canvas.width) * 100,
            top: (y2 / canvas.height) * 100,   // foot point — bottom-center of the box
          }
        })
      setPlayerMarkers(markers)
    } catch (e) {
      setError(e.message)
    } finally {
      setDetecting(false)
    }
  }, [])

  const openAddForm = () => {
    if (videoRef.current) videoRef.current.pause()
    setFormTimestamp(videoRef.current ? videoRef.current.currentTime : 0)
    setForm(EMPTY_FORM)
    setEditingId(null)
    setFormOpen(true)
    detectPlayersHere()
  }

  const openEditForm = (q) => {
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = q.timestamp }
    setFormTimestamp(q.timestamp)
    setForm({ prompt: q.prompt, choices: q.choices.map(c => c.label), explanation: q.explanation || '' })
    setEditingId(q.id)
    setFormOpen(true)
    setTimeout(detectPlayersHere, 150)   // let the currentTime seek land before capturing
  }

  const saveForm = async () => {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        video_hash: videoHash,
        timestamp: formTimestamp,
        prompt: form.prompt,
        choices: form.choices,
        explanation: form.explanation,
      }
      if (editingId) await updateQuestion(editingId, payload)
      else await createQuestion(payload)
      setFormOpen(false)
      refreshQuestions(videoHash)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const removeQuestion = async (id) => {
    try {
      await deleteQuestion(id)
      refreshQuestions(videoHash)
    } catch (e) {
      setError(e.message)
    }
  }

  const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

  return (
    <main className="container page">
      <div style={{ marginBottom: '2rem' }}>
        <h1 className="page-title">Coach</h1>
        <p className="page-sub">Pick a clip, scrub to the moment that matters, and set up a pass decision with three choices — this is what players see in Quiz.</p>
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
            <p className="upload-sub">or click to browse &nbsp;·&nbsp; MP4, MOV, or WebM</p>
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
          <div className="video-shell" style={{ marginBottom: '0.6rem' }}>
            <video ref={videoRef} src={meta.media_url} controls />
            {playerMarkers.length > 0 && (
              <div className="video-overlay">
                {playerMarkers.map(m => (
                  <div key={m.number} className="player-marker" style={{ left: `${m.left}%`, top: `${m.top}%` }}>
                    <div className="player-marker-circle" />
                    <div className="player-marker-number">{m.number}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <button className="btn btn-secondary" onClick={detectPlayersHere} disabled={detecting}>
              {detecting ? 'Detecting…' : playerMarkers.length > 0 ? 'Re-detect at this frame' : 'Detect players here'}
            </button>
            {playerMarkers.length > 0 && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
                {playerMarkers.length} player{playerMarkers.length === 1 ? '' : 's'} numbered left → right — pause on a moment, then re-run this after scrubbing.
              </span>
            )}
          </div>

          {/* Timeline with question markers */}
          <div style={{ position: 'relative', height: 10, marginBottom: '1rem' }}>
            <div className="progress-track" style={{ position: 'absolute', inset: 0 }} />
            {questions.map(q => (
              <button
                key={q.id}
                title={`${fmtTime(q.timestamp)} — ${q.prompt}`}
                onClick={() => { if (videoRef.current) { videoRef.current.currentTime = q.timestamp; videoRef.current.pause() } }}
                style={{
                  position: 'absolute', left: `${(q.timestamp / meta.duration) * 100}%`, top: -3,
                  width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)',
                  border: '2px solid var(--bg)', cursor: 'pointer', transform: 'translateX(-50%)', padding: 0,
                }}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.75rem' }}>
            <button className="btn btn-primary" onClick={openAddForm}>+ Add question at current time</button>
            <button className="btn btn-ghost" onClick={reset}>← Choose another video</button>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>{error}</div>}

          {formOpen && (
            <div className="card" style={{ padding: '1.5rem', marginBottom: '1.75rem' }}>
              <p className="section-title">{editingId ? 'Edit question' : 'New question'} at {fmtTime(formTimestamp)}</p>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-2)', margin: '0.75rem 0 0.25rem' }}>Prompt</label>
              <input
                className="text-input"
                value={form.prompt}
                onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                placeholder="You're the midfielder in possession. What's the best decision?"
                style={{ width: '100%' }}
              />
              {form.choices.map((c, i) => (
                <div key={i}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-2)', margin: '0.75rem 0 0.25rem' }}>
                    Choice {i + 1}
                  </label>
                  <input
                    className="text-input"
                    value={c}
                    onChange={e => setForm(f => ({ ...f, choices: f.choices.map((cc, ii) => ii === i ? e.target.value : cc) }))}
                    style={{ width: '100%' }}
                  />
                </div>
              ))}
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-2)', margin: '0.75rem 0 0.25rem' }}>
                Explanation (optional, shown nowhere yet — for your own notes)
              </label>
              <input
                className="text-input"
                value={form.explanation}
                onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button className="btn btn-primary" onClick={saveForm} disabled={saving}>
                  {saving ? 'Saving…' : 'Save question'}
                </button>
                <button className="btn btn-ghost" onClick={() => setFormOpen(false)}>Cancel</button>
              </div>
            </div>
          )}

          <p className="section-title">Questions ({questions.length})</p>
          <div className="card card-flush">
            {questions.length === 0
              ? <div className="alert alert-info" style={{ margin: '1rem' }}>No questions yet — play the clip and add one at a moment that matters.</div>
              : (
                <table className="det-table">
                  <thead>
                    <tr><th>Time</th><th>Prompt</th><th>Choices</th><th></th></tr>
                  </thead>
                  <tbody>
                    {questions.map(q => (
                      <tr key={q.id}>
                        <td style={{ fontWeight: 600 }}>{fmtTime(q.timestamp)}</td>
                        <td>{q.prompt}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
                          {q.choices.map(c => c.label).join(' · ')}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn btn-ghost" style={{ padding: '0.25rem 0.6rem' }} onClick={() => openEditForm(q)}>Edit</button>
                          <button className="btn btn-ghost" style={{ padding: '0.25rem 0.6rem' }} onClick={() => removeQuestion(q.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </div>
        </>
      )}
    </main>
  )
}
