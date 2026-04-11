import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        success: 'border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
        info: 'border-transparent bg-sky-500/15 text-sky-600 dark:text-sky-300',
        warning: 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300',
        muted: 'border-transparent bg-slate-500/15 text-slate-600 dark:text-slate-300',
        danger: 'border-transparent bg-red-500/15 text-red-700 dark:text-red-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
