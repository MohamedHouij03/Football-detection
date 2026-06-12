import { useNavigate } from 'react-router-dom'

const DETECTED_ITEMS = [
  { color: '#3B82F6', name: 'Players',     desc: 'All outfield players from both teams, labelled in blue.' },
  { color: '#22C55E', name: 'Goalkeepers', desc: 'Identified separately from outfield players, shown in green.' },
  { color: '#F59E0B', name: 'Referees',    desc: 'Match officials detected by their position on the pitch.' },
  { color: '#EF4444', name: 'Ball',        desc: 'The football itself, including partially occluded situations.' },
]

const USE_CASES = [
  { title: 'Coaches',           desc: 'Review match images quickly without manually counting or annotating players. Focus on tactics, not tagging.' },
  { title: 'Analysts',          desc: 'Extract player counts from broadcast stills to feed into statistical workflows, faster than manual annotation.' },
  { title: 'Scouts',            desc: 'Get a quick breakdown of any match image: player counts, ball position, referee location.' },
  { title: 'Content creators',  desc: 'Overlay detections on match photos for social media, highlight reels, or educational breakdowns.' },
]

export default function Home() {
  const navigate = useNavigate()

  return (
    <>
      <main className="container page">
        {/* Hero */}
        <section className="hero">
          <span className="hero-eyebrow">Football Analysis Platform</span>
          <h1 className="hero-title">
            Analyze Football Footage<br />
            <span className="accent">in Seconds</span>
          </h1>
          <p className="hero-sub">
            Upload a match image and instantly see every player, referee, and ball
            detected. No setup required.
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/analyze')}>
            Upload and Analyze →
          </button>
        </section>

        <hr className="divider" />

        {/* How it works + What gets detected */}
        <div className="content-grid" style={{ marginBottom: '2.5rem' }}>
          {/* Steps */}
          <div>
            <p className="section-title">How it works</p>
            <div className="steps">
              {[
                { n: '1', title: 'Upload an image',  desc: 'Any photo from a match broadcast, training session, or tactical camera. JPG or PNG.' },
                { n: '2', title: 'Click Analyze',    desc: 'Our AI scans the image and highlights every person and the ball with labels.' },
                { n: '3', title: 'Download results', desc: 'Save the annotated image, a CSV data export, or a plain-text summary.' },
              ].map(s => (
                <div key={s.n} className="step">
                  <div className="step-num">{s.n}</div>
                  <div>
                    <div className="step-title">{s.title}</div>
                    <p className="step-desc">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detected objects */}
          <div>
            <p className="section-title">What gets detected</p>
            <div className="detect-list">
              {DETECTED_ITEMS.map(item => (
                <div key={item.name} className="detect-item">
                  <div className="detect-dot" style={{ background: item.color }} />
                  <div>
                    <div className="detect-name">{item.name}</div>
                    <p className="detect-desc">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <hr className="divider" />

        {/* Who uses it */}
        <section>
          <p className="section-title" style={{ marginBottom: '1.25rem' }}>Who uses it</p>
          <div className="feature-grid">
            {USE_CASES.map(uc => (
              <div key={uc.title} className="feature-card">
                <div className="feature-title">{uc.title}</div>
                <p className="feature-desc">{uc.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container">
          PitchVision &nbsp;·&nbsp; Football Object Detection &nbsp;·&nbsp; Built with YOLOv8 &amp; React
        </div>
      </footer>
    </>
  )
}
