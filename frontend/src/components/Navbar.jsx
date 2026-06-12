import { NavLink, useNavigate } from 'react-router-dom'

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1"  x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1"  y1="12" x2="3"  y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
)

const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)

export default function Navbar({ theme, onThemeToggle }) {
  const navigate = useNavigate()

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <button className="nav-logo" onClick={() => navigate('/')}>
          Pitch<span className="accent">Vision</span>
        </button>

        <div className="nav-links">
          <NavLink to="/"         className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Home</NavLink>
          <NavLink to="/analyze"  className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Analyze</NavLink>
          <NavLink to="/accuracy" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Accuracy</NavLink>
          <NavLink to="/docs"     className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Docs</NavLink>
        </div>

        <div className="nav-actions">
          <button
            className="btn-icon"
            onClick={onThemeToggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </nav>
  )
}
