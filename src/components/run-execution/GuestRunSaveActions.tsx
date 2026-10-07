import type { ComponentProps } from 'react';
import { ListChecks, Save } from 'lucide-react';

import { Link } from '@/components/navigation/Link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useSaveGuestRunToAccount } from '@/features/guest-runs/useSaveGuestRunToAccount';
import type { ChecklistTemplate } from '@/types/checklist';

type SaveToAccountButtonProps = {
  isSaving: boolean;
  onSave: () => void;
  size?: ComponentProps<typeof Button>['size'];
};

export function SaveToAccountButton({ isSaving, onSave, size }: SaveToAccountButtonProps) {
  return (
    <Button disabled={isSaving} onClick={onSave} size={size} type="button">
      <Save data-icon="inline-start" />
      Save to account
    </Button>
  );
}

export function GuestRunSaveOffer({ template }: { template: ChecklistTemplate }) {
  const { isWorkspaceLoading } = useWorkspace();
  const saving = useSaveGuestRunToAccount(template);

  return (
    <Alert data-guest-run-notice="true">
      <ListChecks />
      <AlertTitle>Your run of this Template is saved in this browser only.</AlertTitle>
      <AlertDescription>
        <div className="mt-2">
          <SaveToAccountButton
            isSaving={saving.isSaving || isWorkspaceLoading}
            onSave={() => void saving.save()}
            size="sm"
          />
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function SignInToSaveLinks({ loginPath, registerPath }: { loginPath: string; registerPath: string }) {
  return (
    <>
      <Link className="font-medium text-foreground underline underline-offset-4" href={loginPath}>
        Log in
      </Link>{' '}
      or{' '}
      <Link className="font-medium text-foreground underline underline-offset-4" href={registerPath}>
        sign up
      </Link>{' '}
      to save it to your account.
    </>
  );
}
