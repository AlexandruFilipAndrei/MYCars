import * as React from 'react'

import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'block h-11 min-w-0 w-full max-w-full rounded-2xl border border-input bg-card px-4 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        type === 'date' &&
          'appearance-none pr-4 text-left leading-normal [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-date-and-time-value]:min-h-0 [&::-webkit-date-and-time-value]:p-0 [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:leading-normal [&::-webkit-datetime-edit]:block [&::-webkit-datetime-edit]:p-0 [&::-webkit-datetime-edit-fields-wrapper]:p-0',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export { Input }
