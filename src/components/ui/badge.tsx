import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        success: 'border-transparent bg-success/15 text-success',
        info: 'border-transparent bg-primary/15 text-primary',
        warning: 'border-transparent bg-warning/15 text-warning',
        muted: 'border-transparent bg-muted text-muted-foreground',
        danger: 'border-transparent bg-destructive/15 text-destructive',
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
