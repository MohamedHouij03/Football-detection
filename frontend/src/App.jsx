import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import Home from './pages/Home.jsx'
import Analyze from './pages/Analyze.jsx'
import Accuracy from './pages/Accuracy.jsx'
import Docs from './pages/Docs.jsx'

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('pv-theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('pv-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return (
    <BrowserRouter>
      <Navbar theme={theme} onThemeToggle={toggleTheme} />
      <Routes>
        <Route path="/"         element={<Home />} />
        <Route path="/analyze"  element={<Analyze />} />
        <Route path="/accuracy" element={<Accuracy />} />
        <Route path="/docs"     element={<Docs />} />
        <Route path="*"         element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}
