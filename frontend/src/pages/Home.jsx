import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ScanSearch, Video, Target, BookOpen, ArrowRight } from 'lucide-react'
import { Button } from '../components/ui/button.jsx'
import { Card } from '../components/ui/card.jsx'
import { Badge } from '../components/ui/badge.jsx'

const FEATURES = [
  {
    to: '/analyze',
    icon: ScanSearch,
    title: 'Image Detection',
    desc: 'Drop in a match photo and get every player, goalkeeper, referee, and the ball boxed and scored in seconds.',
  },
  {
    to: '/live',
    icon: Video,
    title: 'Video Detection',
    desc: 'Upload a clip. We analyze it frame by frame, then play it back with every detection perfectly in sync.',
  },
  {
    to: '/quiz',
    icon: Target,
    title: 'Tactical Quiz',
    desc: 'Watch tracked footage, get paused on a real decision, and pick the pass you\'d make.',
  },
  {
    to: '/docs',
    icon: BookOpen,
    title: 'Documentation',
    desc: 'The model, the architecture, the dataset, and exactly how accurate it actually is.',
  },
]

const DETECTED_ITEMS = [
  { color: '#3B82F6', name: 'Players',     desc: 'Every outfield player, both teams, marked in blue.' },
  { color: '#22C55E', name: 'Goalkeepers', desc: 'Picked out from the rest of the squad, even on a quiet night.' },
  { color: '#F59E0B', name: 'Referees',    desc: "Spotted by where they stand, not just what they're wearing." },
  { color: '#EF4444', name: 'Ball',        desc: 'Tracked even when it disappears behind a crowd of legs for a moment.' },
]

const USE_CASES = [
  { title: 'Coaches',          desc: 'Pull up a match image and see the shape instantly, no more pausing the video to count heads.' },
  { title: 'Analysts',         desc: 'Turn broadcast stills into player counts and positions you can actually use, in a fraction of the time manual tagging takes.' },
  { title: 'Scouts',           desc: 'One upload gets you player positions, ball location, and officials: a quick read on any match photo.' },
  { title: 'Content creators', desc: 'Drop detection overlays onto match photos for social posts, highlight clips, or breakdowns that actually look analysed.' },
]

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] } }),
}

export default function Home() {
  const navigate = useNavigate()

  return (
    <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 lg:px-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border-soft">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: "url('/img/pitch-hero.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-bg via-bg/95 to-bg/60" />
        <div className="absolute inset-0 bg-grid-fade" />
        <div
          className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(184,255,69,0.18), transparent 70%)' }}
        />

        <div className="relative px-6 py-16 sm:px-10 sm:py-24">
          <motion.div initial="hidden" animate="show" variants={fadeUp}>
            <Badge className="mb-6">Football analysis, built for real footage</Badge>
          </motion.div>

          <motion.h1
            initial="hidden" animate="show" custom={1} variants={fadeUp}
            className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink-1 sm:text-6xl"
          >
            See the game<br />
            <span className="text-lime">differently.</span>
          </motion.h1>

          <motion.p
            initial="hidden" animate="show" custom={2} variants={fadeUp}
            className="mt-6 max-w-xl text-base text-ink-2 sm:text-lg"
          >
            Upload a match clip and watch every player and the ball get found in seconds.
            Then turn that same clip into a tactics quiz you can actually play.
          </motion.p>

          <motion.div
            initial="hidden" animate="show" custom={3} variants={fadeUp}
            className="mt-9 flex flex-wrap gap-3"
          >
            <Button size="lg" onClick={() => navigate('/analyze')}>
              Upload and Analyze
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/quiz')}>
              Try the Tactics Quiz
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Four feature cards */}
      <section className="mt-16">
        <p className="mb-5 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink-3">
          Explore PitchVision
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ to, icon: Icon, title, desc }, i) => (
            <motion.div
              key={to}
              initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}
              custom={i} variants={fadeUp}
            >
              <Card
                onClick={() => navigate(to)}
                className="group h-full cursor-pointer p-5 transition-all hover:border-lime/30 hover:shadow-glow"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-lime-dim">
                  <Icon className="h-5 w-5 text-lime" strokeWidth={2} />
                </div>
                <h3 className="font-display text-sm font-semibold text-ink-1">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-3">{desc}</p>
                <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-lime opacity-0 transition-opacity group-hover:opacity-100">
                  Open <ArrowRight className="h-3 w-3" />
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* What gets detected */}
      <section className="mt-20 grid gap-10 lg:grid-cols-2">
        <div>
          <p className="mb-5 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink-3">
            How it works
          </p>
          <div className="flex flex-col gap-5">
            {[
              { n: '1', title: 'Upload an image',  desc: "A broadcast screenshot, a training-ground photo, whatever you've got. JPG or PNG." },
              { n: '2', title: 'Click Analyze',    desc: 'The model scans the frame and boxes up every player and the ball, labelled and scored.' },
              { n: '3', title: 'Download results', desc: 'Grab the annotated image, a CSV, or a plain-text summary, whichever fits your workflow.' },
            ].map(s => (
              <div key={s.n} className="flex gap-4">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-lime-soft bg-lime-dim text-xs font-bold text-lime">
                  {s.n}
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink-1">{s.title}</div>
                  <p className="mt-1 text-sm text-ink-3">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-5 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink-3">
            What gets detected
          </p>
          <div className="flex flex-col divide-y divide-border-soft rounded-xl border border-border-soft bg-surface">
            {DETECTED_ITEMS.map(item => (
              <div key={item.name} className="flex items-start gap-3 p-4">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
                <div>
                  <div className="text-sm font-semibold text-ink-1">{item.name}</div>
                  <p className="mt-0.5 text-sm text-ink-3">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quiz callout */}
      <section className="relative mt-20 overflow-hidden rounded-2xl border border-border-soft p-10 sm:p-14">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: "url('/img/quiz-callout.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/90 to-bg/50" />
        <div className="relative">
          <p className="mb-3 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-lime">
            Beyond detection
          </p>
          <h2 className="font-display text-2xl font-semibold text-ink-1 sm:text-3xl">
            Play the moment, not just watch it
          </h2>
          <p className="mt-4 max-w-xl text-sm text-ink-2 sm:text-base">
            In <strong className="text-ink-1">Quiz</strong>, the video pauses right on a big decision: a pass choice,
            a tricky moment. You call it, then watch what the player actually did.
          </p>
          <Button variant="secondary" className="mt-6" onClick={() => navigate('/quiz')}>
            See player tracking in action
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Who uses it */}
      <section className="mt-20">
        <p className="mb-5 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink-3">
          Who uses it
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {USE_CASES.map(uc => (
            <Card key={uc.title} className="p-5">
              <h3 className="font-display text-sm font-semibold text-ink-1">{uc.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-3">{uc.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <footer className="mt-24 border-t border-border-soft pt-8 text-center text-xs text-ink-3">
        PitchVision &nbsp;&middot;&nbsp; Detection, tracking &amp; a tactics quiz, built on YOLO26 &amp; React
      </footer>
    </main>
  )
}
