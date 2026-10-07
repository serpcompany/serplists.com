import { CheckCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function CompleteRunButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      <CheckCircle data-icon="inline-start" />
      Complete run
    </Button>
  );
}
