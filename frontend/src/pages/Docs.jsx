import { useState, useEffect, useRef } from 'react'
import { Card } from '../components/ui/card.jsx'
import PageHeader from '../components/PageHeader.jsx'

const CLASSES = [
  { name: 'Player',     color: '#3B82F6', desc: 'Every outfield player on the pitch, either team.' },
  { name: 'Goalkeeper', color: '#22C55E', desc: 'Kept separate from outfield players.' },
  { name: 'Referee',    color: '#F59E0B', desc: 'Match officials, never pulled into the team-colour split.' },
  { name: 'Ball',       color: '#EF4444', desc: "The football itself, including when it's partly hidden in a crowd of players." },
]

const METRICS = [
  { term: 'mAP@50',    def: 'The headline accuracy number: how often the model finds the right object in roughly the right place (50% box overlap).' },
  { term: 'mAP@50-95', def: 'A stricter version of the same idea, averaged across tighter and tighter overlap requirements.' },
  { term: 'Precision', def: 'Of everything the model flagged, how much of it was actually there.' },
  { term: 'Recall',    def: 'Of everything that was actually there, how much the model actually found.' },
]

const CHALLENGES = [
  'Players bunched up or overlapping: boxes get messy and jersey colours bleed into each other.',
  "The ball is tiny and often motion-blurred, so it's the hardest thing on the pitch to catch reliably.",
  'Team colour is a simple averaging trick, not a trained model. It gets the odd player wrong, especially goalkeepers in a third kit colour.',
  'Everything runs on CPU here, so denser tracking (needed for smooth player IDs) costs real time. Short clips work much better than full matches.',
]

const WHATS_NEW = [
  'Player tracking that holds a consistent ID across a whole clip, not just per frame.',
  'Two-team colour splitting from shirt colour, used to tell passing options apart in the quiz.',
  'A tactics quiz: pause on a moment, pick a pass, see what actually happened.',
]

const SECTIONS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'model',     label: 'Detection Model' },
  { id: 'video',     label: 'Video Analysis' },
  { id: 'tracking',  label: 'Tracking & Teams' },
  { id: 'classes',   label: 'Detected Classes' },
  { id: 'metrics',   label: 'Accuracy Metrics' },
  { id: 'new',       label: "What's New" },
  { id: 'limits',    label: 'Limitations' },
]

function ParamTable({ rows }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-soft text-left text-xs text-ink-3">
            <th className="px-5 py-3 font-medium">Parameter</th>
            <th className="px-5 py-3 font-medium">Value</th>
            <th className="px-5 py-3 font-medium">Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border-soft last:border-0">
              <td className="px-5 py-3 text-ink-1">{r[0]}</td>
              <td className="px-5 py-3"><code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-lime">{r[1]}</code></td>
              <td className="px-5 py-3 text-ink-3">{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-10 border-b border-border-soft pb-10 pt-10 first:pt-0">
      <h2 className="mb-4 font-display text-xl font-semibold text-ink-1">{title}</h2>
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-ink-2">{children}</div>
    </section>
  )
}

export default function Docs() {
  const [active, setActive] = useState('overview')
  const sectionRefs = useRef({})

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length > 0) setActive(visible[0].target.id)
      },
      { rootMargin: '-10% 0px -70% 0px' }
    )
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 lg:px-10">
      <PageHeader eyebrow="Reference" title="Documentation" sub="How PitchVision actually works, from the model to the API." />

      <div className="grid gap-10 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav className="hidden lg:block">
          <div className="sticky top-10 flex flex-col gap-1">
            {SECTIONS.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active === s.id ? 'bg-lime-dim font-semibold text-lime' : 'text-ink-3 hover:text-ink-1'
                }`}
              >
                {s.label}
              </a>
            ))}
          </div>
        </nav>

        <div className="min-w-0">
          <Section id="overview" title="About the Project">
            <p>
              PitchVision started as a football object detector and grew into something more:
              it still finds every player, goalkeeper, referee, and the ball in a photo or video,
              but it can now also track those players across a clip, split them into two teams,
              and turn the footage into a playable tactics quiz.
            </p>
            <p>
              The frontend is React, the backend is a FastAPI service that loads the trained
              model once and serves inference, tracking, and quiz data over a small REST + WebSocket API.
            </p>
          </Section>

          <Section id="model" title="Detection Model">
            <h3 className="font-display text-sm font-semibold text-ink-1">Architecture</h3>
            <p>
              YOLO26n (nano), fine-tuned on SoccerNet-Tracking, a professionally annotated
              football dataset, chosen because it's fast enough to run on CPU and noticeably
              better at picking out small, distant objects like the ball.
            </p>
            <h3 className="mt-2 font-display text-sm font-semibold text-ink-1">Inference settings: image analysis</h3>
            <ParamTable rows={[
              ['Confidence threshold', '0.60', 'High enough to keep false positives out without hiding real detections.'],
              ['IoU threshold', '0.30', 'Suppresses duplicate boxes on the same object.'],
              ['Input size', '1280×1280', 'Higher resolution helps catch small/distant players.'],
              ['Test-time augmentation', 'enabled', 'A few flipped/scaled passes, averaged, for better recall.'],
            ]} />
          </Section>

          <Section id="video" title="Video Analysis">
            <p>
              Video is analysed in full before you can press play. CPU inference can't keep
              up with real playback speed, so rather than show overlays that lag behind, the whole
              clip is processed first and then played back with every box guaranteed to be
              exactly where it should be.
            </p>
            <ParamTable rows={[
              ['Sampling rate (Live)', '~6 fps', 'Plain per-frame detection, no tracking, fast enough for a full-match pass.'],
              ['Sampling rate (Quiz)', '~12 fps', "Denser sampling, needed so player tracking doesn't lose the thread between frames."],
              ['Input size', '960×960', 'A middle ground between speed and catching small objects on CPU.'],
            ]} />
            <p>
              Analysed clips are cached, so replaying or re-authoring a quiz question on the
              same clip never re-runs the model.
            </p>
          </Section>

          <Section id="tracking" title="Player Tracking &amp; Teams">
            <p>
              Quiz runs a tracking pass (ByteTrack) that gives each player
              a stable ID for the length of the clip, instead of detecting them fresh every frame.
              Once the whole clip's been seen, a second pass looks at each tracked player's shirt
              colour and splits everyone into two teams: simple k-means clustering on sampled
              jersey pixels, with the pitch's green masked out and crowded/overlapping players
              skipped so one player's sample doesn't pick up a neighbour's colour.
            </p>
            <p>
              It's a lightweight heuristic, not a trained classifier. See <em>Limitations</em> below
              for where it tends to get things wrong.
            </p>
          </Section>

          <Section id="classes" title="Detected Classes">
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-soft text-left text-xs text-ink-3">
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {CLASSES.map(c => (
                    <tr key={c.name} className="border-b border-border-soft last:border-0">
                      <td className="whitespace-nowrap px-5 py-3 text-ink-1">
                        <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
                        {c.name}
                      </td>
                      <td className="px-5 py-3 text-ink-3">{c.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </Section>

          <Section id="metrics" title="Accuracy Metrics Explained">
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-soft text-left text-xs text-ink-3">
                    <th className="px-5 py-3 font-medium">Metric</th>
                    <th className="px-5 py-3 font-medium">What it means</th>
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map(m => (
                    <tr key={m.term} className="border-b border-border-soft last:border-0">
                      <td className="whitespace-nowrap px-5 py-3"><code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-lime">{m.term}</code></td>
                      <td className="px-5 py-3 text-ink-3">{m.def}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </Section>

          <Section id="new" title="What's New">
            {WHATS_NEW.map((f, i) => <p key={i}>{f}</p>)}
          </Section>

          <Section id="limits" title="Known Limitations">
            <h3 className="font-display text-sm font-semibold text-ink-1">Worth knowing before you trust it</h3>
            {CHALLENGES.map((c, i) => <p key={i}>{c}</p>)}
          </Section>
        </div>
      </div>
    </main>
  )
}
