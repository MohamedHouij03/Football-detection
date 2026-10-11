import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils.js'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider',
  {
    variants: {
      variant: {
        default: 'bg-lime-dim text-lime border border-lime-soft',
        muted: 'bg-surface-2 text-ink-3 border border-border-soft',
        live: 'bg-red-500/10 text-red-400 border border-red-500/25',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
