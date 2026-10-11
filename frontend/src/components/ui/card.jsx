import { forwardRef } from 'react'
import { cn } from '../../lib/utils.js'

export const Card = forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('rounded-xl border border-border-soft bg-surface shadow-card', className)}
    {...props}
  />
))
Card.displayName = 'Card'

export const CardHeader = forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...props} />
))
CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('font-display text-sm font-semibold text-ink-1', className)} {...props} />
))
CardTitle.displayName = 'CardTitle'

export const CardDescription = forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-xs text-ink-3', className)} {...props} />
))
CardDescription.displayName = 'CardDescription'

export const CardContent = forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
))
CardContent.displayName = 'CardContent'
