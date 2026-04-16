import * as React from 'react';

import { cn } from '@/lib/utils';

const ButtonGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center -space-x-px rounded-md', className)}
    {...props}
  />
));
ButtonGroup.displayName = 'ButtonGroup';

export { ButtonGroup };
