import { forwardRef } from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '../../lib/utils.js'

export const Progress = forwardRef(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full flex-1 rounded-full bg-lime transition-transform duration-300 ease-out"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
))
Progress.displayName = 'Progress'
