import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BILLING_UNAVAILABLE_MESSAGE } from "@/lib/api-errors";
import type { BillingStatusState } from "@/lib/billing";

export const ORGANIZATION_BACKUP_UPGRADE_MESSAGE =
  "Template import/export requires a paid Organization plan.";

type TemplateBackupPlanNoticeProps = {
  billing: BillingStatusState;
  isTeamWorkspace: boolean;
  onRetry: () => void;
  onUpgrade: () => void;
};

const Notice = ({ action, children, title }: { action?: ReactNode; children: ReactNode; title: string }) => (
  <Alert>
    <AlertCircle />
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription>
      <p>{children}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </AlertDescription>
  </Alert>
);

export const TemplateBackupPlanNotice = ({
  billing,
  isTeamWorkspace,
  onRetry,
  onUpgrade,
}: TemplateBackupPlanNoticeProps) => {
  if (billing.status === "error") {
    return (
      <Notice
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        }
        title="Couldn't check your plan"
      >
        Import and export still work. Retry to load your plan details.
      </Notice>
    );
  }

  if (billing.status !== "known" || billing.isPaid) {
    return null;
  }

  return (
    <Notice
      action={
        !isTeamWorkspace ? (
          <Button size="sm" onClick={onUpgrade} disabled={!billing.billingEnabled}>
            {billing.billingEnabled ? "Upgrade to Pro" : "Upgrade unavailable"}
          </Button>
        ) : undefined
      }
      title={isTeamWorkspace ? "Paid Organization feature" : "Pro feature"}
    >
      {isTeamWorkspace
        ? ORGANIZATION_BACKUP_UPGRADE_MESSAGE
        : billing.billingEnabled
          ? "Template import/export is available on Pro."
          : BILLING_UNAVAILABLE_MESSAGE}
    </Notice>
  );
};
