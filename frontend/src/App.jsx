import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Home from './pages/Home.jsx'
import Analyze from './pages/Analyze.jsx'
import Live from './pages/Live.jsx'
import Quiz from './pages/Quiz.jsx'
import Accuracy from './pages/Accuracy.jsx'
import Docs from './pages/Docs.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-bg bg-grid bg-fixed">
        <Sidebar />
        <div className="lg:pl-64">
          <Routes>
            <Route path="/"         element={<Home />} />
            <Route path="/analyze"  element={<Analyze />} />
            <Route path="/live"     element={<Live />} />
            <Route path="/quiz"     element={<Quiz />} />
            <Route path="/accuracy" element={<Accuracy />} />
            <Route path="/docs"     element={<Docs />} />
            <Route path="*"         element={<Home />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
