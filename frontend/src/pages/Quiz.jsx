import { useState, useRef, useEffect, useCallback } from 'react'
import { Loader2, Target, Trophy } from 'lucide-react'
import { listVideos, getMediaUrl, listQuestions, startSession, submitAnswer, completeSession } from '../lib/quizApi.js'
import { teamColorFor } from '../lib/detectionUi.jsx'
import { Button } from '../components/ui/button.jsx'
import { Card } from '../components/ui/card.jsx'
import { Progress } from '../components/ui/progress.jsx'
import PageHeader from '../components/PageHeader.jsx'

// A gentle arc between two points instead of a straight line, so a pass choice reads
// visually as a pass trajectory rather than a ruler-straight connector. `bend` is signed
// so multiple options fanning out from the same passer don't all overlap.
function curvedPath(x1, y1, x2, y2, bend) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const px = -dy / len
  const py = dx / len
  const cx = mx + px * bend
  const cy = my + py * bend
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
}

// Stable per-track display numbers for the whole clip, based on each track's x position
// at first appearance — gives consistent left-to-right-ish numbering that stays attached
// to the same player for the life of their track (not recomputed every frame).
function assignTrackNumbers(frames) {
  const firstSeenX = new Map()
  for (const f of frames) {
    for (const d of f.detections) {
      if (d.track_id == null || firstSeenX.has(d.track_id)) continue
      firstSeenX.set(d.track_id, d.bbox[0])
    }
  }
  const ordered = [...firstSeenX.entries()].sort((a, b) => a[1] - b[1])
  const map = {}
  ordered.forEach(([trackId], i) => { map[trackId] = i + 1 })
  return map
}

export default function Quiz() {
  const [videos, setVideos] = useState([])
  const [videosLoaded, setVideosLoaded] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [loading, setLoading] = useState(false)

  const [selected, setSelected] = useState(null)
  const [questions, setQuestions] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [answeredIds, setAnsweredIds] = useState(() => new Set())
  const [activeQuestion, setActiveQuestion] = useState(null)
  const [pickedChoiceId, setPickedChoiceId] = useState(null)
  const [revealCorrectId, setRevealCorrectId] = useState(null)
  const [finished, setFinished] = useState(false)

  const [trackState, setTrackState] = useState('idle') // idle | loading | ready | error
  const [trackProgress, setTrackProgress] = useState(0)
  const [activeDetections, setActiveDetections] = useState([])
  const [isPlaying, setIsPlaying] = useState(false)

  const videoRef = useRef()
  const wsRef = useRef(null)
  const framesRef = useRef([])          // [{timestamp, detections:[{track_id,class_name,bbox}]}]
  const trackNumbersRef = useRef({})    // {track_id: stable display number}
  const teamMapRef = useRef({})         // {track_id: 0 | 1} — player/goalkeeper only, referees excluded
  const lastShownIdxRef = useRef(-1)
  const activeQuestionRef = useRef(null)

  useEffect(() => {
    listVideos()
      // The Spain vs Argentina broadcast clip is reserved for Live mode only.
      .then(d => setVideos((d.videos || []).filter(v => v.question_count > 0 && !/spain/i.test(v.display_name))))
      .catch(e => setLoadError(e.message))
      .finally(() => setVideosLoaded(true))
  }, [])

  useEffect(() => () => wsRef.current?.close(), [])

  const beginTracking = useCallback((jobId) => {
    setTrackState('loading')
    setTrackProgress(0)
    framesRef.current = []
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/match/${jobId}`)
    wsRef.current = ws
    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data)
      if (msg.type === 'frame') {
        framesRef.current.push({ timestamp: msg.timestamp, detections: msg.detections })
        setTrackProgress(msg.total_frames ? Math.min(100, Math.round((msg.frame_idx / msg.total_frames) * 100)) : 0)
      } else if (msg.type === 'teams') {
        teamMapRef.current = msg.team_map || {}
      } else if (msg.type === 'done') {
        trackNumbersRef.current = assignTrackNumbers(framesRef.current)
        setTrackState('ready')
      } else if (msg.type === 'error') {
        setLoadError(msg.detail)
        setTrackState('error')
      }
    }
    ws.onerror = () => { setLoadError('Player tracking connection failed.'); setTrackState('error') }
  }, [])

  const pick = async (video) => {
    setLoading(true)
    setLoadError(null)
    try {
      const [{ media_url }, { questions: qs }, { session_id }] = await Promise.all([
        getMediaUrl(video.video_hash),
        listQuestions(video.video_hash),
        startSession(video.video_hash),
      ])
      setSelected({ ...video, media_url })
      setQuestions(qs)
      setSessionId(session_id)
      setAnsweredIds(new Set())
      setFinished(false)

      // Player tracking is driven by job_id, not video_hash — re-register this video
      // (it's always sourced from the local library) to get a fresh job_id, then run
      // the same tracking pipeline Match Mode uses. Hits cache if already analyzed.
      const res = await fetch('/api/video/analyze-local', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: video.display_name }),
      })
      if (!res.ok) throw new Error('Could not open this clip for tracking.')
      const job = await res.json()
      beginTracking(job.job_id)
    } catch (e) {
      setLoadError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Classic quiz-game framing: one "Start Quiz" button, no clip picker. Auto-selects
  // whichever clip has the most questions so a first-time player gets the fullest round.
  const startQuiz = () => {
    if (videos.length === 0) return
    const best = [...videos].sort((a, b) => b.question_count - a.question_count)[0]
    pick(best)
  }

  const reset = () => {
    wsRef.current?.close()
    wsRef.current = null
    setSelected(null)
    setQuestions([])
    setSessionId(null)
    setActiveQuestion(null)
    setFinished(false)
    setTrackState('idle')
    setIsPlaying(false)
  }

  // One loop drives both the tracked-overlay sync and the question-pause trigger, so
  // they read the same currentTime and can't drift apart from each other.
  useEffect(() => {
    if (!isPlaying || trackState !== 'ready') return
    let raf
    const tick = () => {
      const v = videoRef.current
      if (v) {
        const t = v.currentTime
        const frames = framesRef.current
        let idx = -1
        for (let i = frames.length - 1; i >= 0; i--) {
          if (frames[i].timestamp <= t + 0.1) { idx = i; break }
        }
        if (idx !== lastShownIdxRef.current) {
          lastShownIdxRef.current = idx
          setActiveDetections(idx >= 0 ? frames[idx].detections : [])
        }

        if (!activeQuestionRef.current) {
          const next = questions.find(q => !answeredIds.has(q.id) && t >= q.timestamp)
          if (next) {
            v.pause()
            activeQuestionRef.current = next
            setActiveQuestion(next)
            setPickedChoiceId(null)
            setRevealCorrectId(null)
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, trackState, questions, answeredIds])

  const onPlay = () => setIsPlaying(true)
  const onPause = () => setIsPlaying(false)
  const onEnded = async () => {
    setIsPlaying(false)
    if (sessionId) { try { await completeSession(sessionId) } catch { /* non-critical */ } }
    setFinished(true)
  }

  const isPassQuestion = (q) => q.choices.length > 0 && q.choices.every(c => c.from_track_id != null && c.to_track_id != null)

  const footPoint = (trackId) => {
    const d = activeDetections.find(dd => dd.track_id === trackId)
    if (!d || !selected) return null
    const [x1, y1, x2, y2] = d.bbox
    return { x: ((x1 + x2) / 2 / selected.width) * 100, y: (y2 / selected.height) * 100 }
  }

  const choose = async (choice) => {
    if (!activeQuestion || pickedChoiceId) return
    setPickedChoiceId(choice.id)
    try {
      const result = await submitAnswer(sessionId, activeQuestion.id, choice.id)
      setRevealCorrectId(result.correct_choice_id)
    } catch (e) {
      setLoadError(e.message)
    }
    setTimeout(() => {
      setAnsweredIds(prev => new Set(prev).add(activeQuestion.id))
      activeQuestionRef.current = null
      setActiveQuestion(null)
      setPickedChoiceId(null)
      setRevealCorrectId(null)
      videoRef.current?.play()
    }, 1600)
  }

  const trackProgressLabel = trackState === 'loading' ? `Tracking players, ${trackProgress}%` : ''

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 lg:px-10">
      {selected && (
        <PageHeader
          eyebrow="Tactical quiz"
          title="Quiz"
          sub="Watch the clip, trace your pass when it pauses, then see what really happened."
        />
      )}

      {!selected && (
        <div className="relative -mx-5 overflow-hidden rounded-2xl border border-border-soft sm:-mx-8 lg:-mx-10">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-25"
            style={{ backgroundImage: "url('/img/pitch-hero.jpg')", backgroundPosition: 'center 30%' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-bg via-bg/90 to-bg" />
          <div className="absolute inset-0 bg-grid-fade" />

          <div className="relative flex flex-col items-center px-6 py-20 text-center sm:py-28">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-lime-dim">
              <Target className="h-6 w-6 text-lime" />
            </div>
            <p className="mb-3 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-lime">
              Tactics Quiz
            </p>
            <h1 className="max-w-xl font-display text-3xl font-semibold leading-tight text-ink-1 sm:text-4xl">
              Think you'd make the right call?
            </h1>
            <p className="mt-5 max-w-md text-sm text-ink-2 sm:text-base">
              Every clip plays with full player tracking. When it pauses on a big decision,
              pick the pass you'd make, then watch what actually happened.
            </p>

            <ol className="mt-8 flex max-w-md flex-col gap-3 text-left">
              {[
                'Watch the clip. Every player is tracked live and numbered.',
                "When it pauses, trace the pass you think is right.",
                'Right or wrong, the clip keeps rolling so you see the real outcome.',
              ].map((rule, i) => (
                <li key={i} className="flex gap-3 text-sm text-ink-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-lime-soft bg-lime-dim font-mono text-xs font-bold text-lime">
                    {i + 1}
                  </span>
                  {rule}
                </li>
              ))}
            </ol>

            {loadError && <div className="mt-6 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">{loadError}</div>}

            {videosLoaded && videos.length === 0 && !loadError ? (
              <p className="mt-8 text-sm text-ink-3">No clips are set up for the quiz yet. Add questions in Coach mode first.</p>
            ) : (
              <Button size="lg" className="mt-8" onClick={startQuiz} disabled={loading || !videosLoaded}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading&hellip;</> : 'Start Quiz'}
              </Button>
            )}
          </div>
        </div>
      )}

      {selected && (
        <>
          {trackState !== 'ready' ? (
            <Card className="mb-6 p-8">
              {trackState === 'error' ? (
                <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">{loadError}</div>
              ) : (
                <>
                  <div className="mb-5 flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-lime" />
                    <span className="text-sm text-ink-2">
                      {trackProgressLabel || 'Getting the clip ready…'} Once this is done, every player keeps their number for the rest of the video.
                    </span>
                  </div>
                  <Progress value={trackProgress} />
                </>
              )}
            </Card>
          ) : (
            <div className="relative mb-6 overflow-hidden rounded-xl border border-border-soft bg-black">
              <video ref={videoRef} src={selected.media_url} controls className="w-full" onPlay={onPlay} onPause={onPause} onEnded={onEnded} />

              {/* Continuous numbered player markers — follow the tracked players every frame.
                  Referees are excluded two ways: by class_name, and by requiring a team_map
                  entry (referees/ball are never given one — see tactiq/teams.py), which also
                  catches the rare case where the detector mislabels a referee as "player". */}
              <div className="pointer-events-none absolute inset-0">
                {activeDetections
                  .filter(d =>
                    (d.class_name === 'player' || d.class_name === 'goalkeeper') &&
                    d.track_id != null &&
                    teamMapRef.current[String(d.track_id)] != null
                  )
                  .map((d, i) => {
                    const [x1, y1, x2, y2] = d.bbox
                    const left = ((x1 + x2) / 2 / selected.width) * 100
                    const top = (y2 / selected.height) * 100
                    const num = trackNumbersRef.current[d.track_id] ?? '?'
                    const color = teamColorFor(teamMapRef.current[String(d.track_id)]) || '#B8FF45'
                    return (
                      <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%`, top: `${top}%` }}>
                        <div className="h-4 w-7 rounded-full border" style={{ borderColor: color, background: `${color}30` }} />
                        <div
                          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-1 py-px text-[0.6rem] font-bold leading-none text-black"
                          style={{ background: color }}
                        >
                          {num}
                        </div>
                      </div>
                    )
                  })}
              </div>

              {activeQuestion && isPassQuestion(activeQuestion) && (
                <div className="absolute inset-0">
                  <div className="absolute inset-x-0 top-0 bg-black/70 px-4 py-3 text-center backdrop-blur-sm">
                    <div className="mx-auto max-w-lg text-sm font-medium text-white sm:text-base">{activeQuestion.prompt}</div>
                    {pickedChoiceId && (
                      <div className={`mt-1.5 text-sm font-bold ${revealCorrectId === pickedChoiceId ? 'text-lime' : 'text-red-400'}`}>
                        {revealCorrectId === pickedChoiceId ? 'Correct!' : 'Not quite. The better pass is highlighted in green.'}
                      </div>
                    )}
                  </div>

                  <svg viewBox={`0 0 ${selected.width} ${selected.height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                    {activeQuestion.choices.map((c, i) => {
                      const from = footPoint(c.from_track_id)
                      const to = footPoint(c.to_track_id)
                      if (!from || !to) return null
                      const x1 = (from.x / 100) * selected.width
                      const y1 = (from.y / 100) * selected.height
                      const x2 = (to.x / 100) * selected.width
                      const y2 = (to.y / 100) * selected.height
                      const bendSign = i % 2 === 0 ? 1 : -1
                      const bend = (30 + i * 12) * bendSign
                      const d = curvedPath(x1, y1, x2, y2, bend)

                      let stroke = 'rgba(255,255,255,0.85)'
                      let opacity = 1
                      if (pickedChoiceId) {
                        if (c.id === revealCorrectId) stroke = '#B8FF45'
                        else if (c.id === pickedChoiceId) stroke = '#EF4444'
                        else opacity = 0.15
                      }

                      return (
                        <g key={c.id} opacity={opacity}>
                          <path d={d} stroke={stroke} strokeWidth={4} fill="none" vectorEffect="non-scaling-stroke"
                            style={{ filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.8))' }} />
                          {!pickedChoiceId && (
                            <path d={d} stroke="transparent" strokeWidth={28} fill="none" vectorEffect="non-scaling-stroke"
                              style={{ cursor: 'pointer', pointerEvents: 'stroke' }} onClick={() => choose(c)} />
                          )}
                          <circle cx={x2} cy={y2} r={6} fill={stroke} />
                        </g>
                      )
                    })}
                  </svg>
                </div>
              )}

              {activeQuestion && !isPassQuestion(activeQuestion) && (
                <div className="absolute inset-0 flex flex-col items-center justify-end gap-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-6">
                  <div className="text-center text-base font-medium text-white">{activeQuestion.prompt}</div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {activeQuestion.choices.map(c => {
                      const isPicked = pickedChoiceId === c.id
                      const isCorrect = revealCorrectId === c.id
                      let cls = 'border-white/20 bg-white/10 text-white hover:border-lime/40'
                      if (pickedChoiceId) {
                        if (isCorrect) cls = 'border-lime bg-lime/20 text-lime'
                        else if (isPicked) cls = 'border-red-500 bg-red-500/20 text-red-400'
                        else cls = 'border-white/10 bg-white/5 text-white/40'
                      }
                      return (
                        <button
                          key={c.id}
                          onClick={() => choose(c)}
                          disabled={!!pickedChoiceId}
                          className={`rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${cls}`}
                        >
                          {c.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {finished && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/95 backdrop-blur-sm">
                  <Trophy className="h-8 w-8 text-lime" />
                  <div className="text-base font-semibold text-ink-1">Clip finished</div>
                  <div className="text-sm text-ink-3">{answeredIds.size} / {questions.length} questions answered</div>
                </div>
              )}
            </div>
          )}

          <Button variant="ghost" onClick={reset}>Back to start</Button>
        </>
      )}
    </main>
  )
}
