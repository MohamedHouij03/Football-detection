const CLASSES = [
  { name: 'Player',     color: '#3B82F6', desc: 'All outfield players, including both teams. Mapped from model classes: Joueur, Player, person, big.' },
  { name: 'Goalkeeper', color: '#22C55E', desc: 'Goalkeeper, identified separately from outfield players. Mapped from: Gardien.' },
  { name: 'Referee',    color: '#F59E0B', desc: 'Match official. Mapped from: Arbitre, refere.' },
  { name: 'Ball',       color: '#EF4444', desc: 'The football. Mapped from: Ballon, Football, ball.' },
]

const METRICS = [
  { term: 'mAP@50',    def: 'Mean Average Precision at IoU 0.50. The primary accuracy metric — how often the AI finds the right objects in the right place at 50% overlap.' },
  { term: 'mAP@50-95', def: 'Stricter version of mAP measured across overlap thresholds from 50% to 95%.' },
  { term: 'Precision',  def: 'Of all objects the AI flagged, what percentage were actually correct detections.' },
  { term: 'Recall',     def: 'Of all real objects in the image, what percentage the AI successfully found.' },
]

const CHALLENGES = [
  'Players close together or overlapping on the pitch.',
  'Ball is small and can be motion-blurred in broadcast stills.',
  'Goalkeepers and outfield players can be difficult to distinguish at distance.',
  'Referees sometimes wear colours similar to players.',
]

const FUTURE = [
  'Per-team classification using jersey colour analysis.',
  'Heatmap and positional overlay on a top-down pitch view.',
  'Video frame extraction and frame-by-frame analysis.',
  'Higher-resolution input support for aerial drone footage.',
]

function Section({ title, children }) {
  return (
    <section className="docs-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export default function Docs() {
  return (
    <main className="container page">
      <div style={{ marginBottom: '2.5rem' }}>
        <h1 className="page-title">Documentation</h1>
        <p className="page-sub">Technical reference for the PitchVision football detection platform.</p>
      </div>

      <Section title="About the Project">
        <p>
          PitchVision is a football object detection application built as a university project.
          It uses a YOLOv8n model trained on football broadcast images to automatically
          identify players, goalkeepers, referees, and the ball in a single still image.
        </p>
        <p>
          The frontend is built with React and the backend is a FastAPI service that
          loads the trained model and runs inference on uploaded images.
        </p>
      </Section>

      <Section title="Detection Model">
        <h3>Architecture</h3>
        <p>
          YOLOv8n (nano) — the smallest and fastest variant of the YOLOv8 family,
          suitable for real-time inference on standard hardware.
        </p>

        <h3>Training</h3>
        <p>
          The model was trained for 50 epochs on a custom football dataset.
          Best checkpoint was saved at epoch 44 with mAP@50 of 42.78%.
          Training was performed on Kaggle using a GPU accelerator.
        </p>

        <h3>Inference settings</h3>
        <div className="card card-flush" style={{ overflowX: 'auto' }}>
          <table className="docs-table">
            <thead>
              <tr><th>Parameter</th><th>Value</th><th>Effect</th></tr>
            </thead>
            <tbody>
              <tr><td>Confidence threshold</td><td><code>0.10</code></td><td>Low threshold catches more objects, including partially visible ones.</td></tr>
              <tr><td>IoU threshold</td><td><code>0.45</code></td><td>Controls how much overlap is allowed between boxes before one is suppressed.</td></tr>
              <tr><td>Input size</td><td><code>640×640</code></td><td>Standard YOLOv8 input resolution.</td></tr>
              <tr><td>Test-time augmentation</td><td><code>enabled</code></td><td>Runs inference on flipped/scaled variants for improved recall.</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Detected Classes">
        <p>
          The underlying model was trained with mixed French and English class names.
          PitchVision normalises these into four display categories:
        </p>
        <div className="card card-flush" style={{ overflowX: 'auto' }}>
          <table className="docs-table">
            <thead>
              <tr><th>Category</th><th>Description</th></tr>
            </thead>
            <tbody>
              {CLASSES.map(c => (
                <tr key={c.name}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="class-dot" style={{ background: c.color }} />
                    {c.name}
                  </td>
                  <td>{c.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Accuracy Metrics Explained">
        <div className="card card-flush" style={{ overflowX: 'auto' }}>
          <table className="docs-table">
            <thead>
              <tr><th>Metric</th><th>What it means</th></tr>
            </thead>
            <tbody>
              {METRICS.map(m => (
                <tr key={m.term}>
                  <td><code>{m.term}</code></td>
                  <td>{m.def}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Known Limitations">
        <div className="content-grid">
          <div>
            <h3>Current challenges</h3>
            {CHALLENGES.map((c, i) => (
              <p key={i} style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{c}</p>
            ))}
          </div>
          <div>
            <h3>Potential improvements</h3>
            {FUTURE.map((f, i) => (
              <p key={i} style={{ margin: '0 0 0.6rem', fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{f}</p>
            ))}
          </div>
        </div>
      </Section>

    </main>
  )
}
