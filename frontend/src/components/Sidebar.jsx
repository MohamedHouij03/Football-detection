import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Home, ScanSearch, Video, Target, BarChart3, BookOpen, Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet.jsx'
import { cn } from '../lib/utils.js'

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/analyze', label: 'Image Detection', icon: ScanSearch },
  { to: '/live', label: 'Video Detection', icon: Video },
  { to: '/quiz', label: 'Tactical Quiz', icon: Target },
  { to: '/accuracy', label: 'Accuracy', icon: BarChart3 },
  { to: '/docs', label: 'Documentation', icon: BookOpen },
]

function Logo({ onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 px-1 py-1 text-left">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime text-[#0B1019] font-display font-bold text-sm">
        PV
      </span>
      <span className="font-display text-base font-semibold tracking-tight text-ink-1">
        Pitch<span className="text-lime">Vision</span>
      </span>
    </button>
  )
}

function NavList({ onNavigate }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-lime-dim text-lime'
                : 'text-ink-2 hover:bg-white/5 hover:text-ink-1'
            )
          }
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function Sidebar() {
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [modelStatus, setModelStatus] = useState('checking') // checking | online | offline

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setModelStatus(d.model_found ? 'online' : 'offline'))
      .catch(() => setModelStatus('offline'))
  }, [])

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border-soft bg-surface/60 backdrop-blur-xl lg:flex">
        <div className="px-4 py-5">
          <Logo onClick={() => navigate('/')} />
        </div>
        <Separator />
        <div className="flex-1 overflow-y-auto py-4">
          <NavList />
        </div>
        <div className="border-t border-border-soft px-4 py-4">
          <div className="flex items-center gap-2 text-[0.7rem] text-ink-3">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                modelStatus === 'online' && 'bg-lime animate-pulse-dot',
                modelStatus === 'offline' && 'bg-red-500',
                modelStatus === 'checking' && 'bg-ink-3'
              )}
            />
            {modelStatus === 'online' && ''}
            {modelStatus === 'offline' && 'Backend unreachable'}
            {modelStatus === 'checking' && 'Checking status…'}
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border-soft bg-bg/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Logo onClick={() => navigate('/')} />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger className="rounded-md p-2 text-ink-2 hover:bg-white/5 hover:text-ink-1">
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent>
            <div className="px-4 py-5">
              <Logo onClick={() => { navigate('/'); setMobileOpen(false) }} />
            </div>
            <Separator />
            <div className="py-4">
              <NavList onNavigate={() => setMobileOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </header>
    </>
  )
}

function Separator() {
  return <div className="h-px w-full bg-border-soft" />
}
