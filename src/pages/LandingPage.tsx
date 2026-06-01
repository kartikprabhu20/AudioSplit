import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>AudioSplit</h1>
        <p>Tools for slicing and mapping audio.</p>
      </header>
      <main className="landing">
        <Link to="/voice" className="landing__card">
          <h2>VoiceSplit</h2>
          <p>Auto-segment spoken-word audio and export segment timings as JSON.</p>
          <span className="landing__cta">Open VoiceSplit →</span>
        </Link>
        <Link to="/music" className="landing__card">
          <h2>MusicSplit</h2>
          <p>Detect variations in music and author Beat Saber-style boxing punch maps.</p>
          <span className="landing__cta">Open MusicSplit →</span>
        </Link>
      </main>
    </div>
  )
}
