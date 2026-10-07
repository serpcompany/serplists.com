import type { ComponentProps, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

type BusyButtonProps = ComponentProps<typeof Button> & {
  busy: boolean;
  busyLabel: ReactNode;
};

export function BusyButton({ busy, busyLabel, children, disabled, ...props }: BusyButtonProps) {
  return (
    <Button {...props} disabled={disabled ?? busy}>
      {busy ? (
        <>
          <Loader2 data-icon="inline-start" className="animate-spin" />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
