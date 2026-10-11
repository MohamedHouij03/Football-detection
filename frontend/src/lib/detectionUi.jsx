// Shared presentation helpers for detection results (Analyze + Live pages)

// Colors assigned to each raw model class name
export const CLASS_COLORS = {
  // current model (merged classes)
  player:     '#3B82F6',
  goalkeeper: '#22C55E',
  referee:    '#F59E0B',
  ball:       '#EF4444',
  // older model checkpoints (mixed French/English classes) — kept so
  // switching back to models/best.pt still renders sensible colors
  Arbitre:  '#F59E0B',
  Ballon:   '#EF4444',
  Football: '#3B82F6',
  Gardien:  '#22C55E',
  Joueur:   '#3B82F6',
  Player:   '#3B82F6',
  big:      '#8B5CF6',
  person:   '#3B82F6',
  refere:   '#F59E0B',
}

export const FALLBACK_COLORS = ['#3B82F6','#22C55E','#F59E0B','#EF4444','#8B5CF6','#EC4899']

export function colorFor(name, index = 0) {
  return CLASS_COLORS[name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

// Team colors for tracked player boxes, colored by jersey-color cluster (0 or 1)
// instead of by class. Referee/ball keep their class color via colorFor.
export const TEAM_COLORS = { 0: '#3B82F6', 1: '#EF4444' }

export function teamColorFor(team) {
  return team == null ? null : TEAM_COLORS[team]
}

export function pct(n) { return (n * 100).toFixed(0) + '%' }

export function ScoreBar({ value }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-lime" style={{ width: Math.round(value * 100) + '%' }} />
      </div>
      <span className="font-mono text-xs text-ink-3">{Math.round(value * 100)}%</span>
    </div>
  )
}

export const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border-soft bg-surface-2 px-3 py-2 text-xs shadow-card">
      <span className="text-ink-3">{payload[0].payload.name}: </span>
      <strong className="text-ink-1">{payload[0].value}</strong>
    </div>
  )
}
