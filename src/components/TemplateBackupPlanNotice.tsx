import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";

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

const Notice = ({ children, title }: { children: ReactNode; title: string }) => (
  <div className="rounded-lg border p-4 bg-muted/50">
    <div className="flex items-start gap-3">
      <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
      <div className="space-y-1">
        <div className="font-medium">{title}</div>
        {children}
      </div>
    </div>
  </div>
);

/**
 * Plan notice for import/export. An upgrade prompt appears only once the server has
 * said the plan is Free; a failed status check offers Retry and never an upgrade.
 */
export const TemplateBackupPlanNotice = ({
  billing,
  isTeamWorkspace,
  onRetry,
  onUpgrade,
}: TemplateBackupPlanNoticeProps) => {
  if (billing.status === "error") {
    return (
      <Notice title="Couldn't check your plan">
        <div className="text-sm text-muted-foreground">
          Import and export still work. Retry to load your plan details.
        </div>
        <Button className="mt-2" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </Notice>
    );
  }

  if (billing.status !== "known" || billing.isPaid) {
    return null;
  }

  return (
    <Notice title={isTeamWorkspace ? "Paid Organization feature" : "Pro feature"}>
      <div className="text-sm text-muted-foreground">
        {isTeamWorkspace
          ? ORGANIZATION_BACKUP_UPGRADE_MESSAGE
          : billing.billingEnabled
            ? "Template import/export is available on Pro."
            : BILLING_UNAVAILABLE_MESSAGE}
      </div>
      {!isTeamWorkspace ? (
        <Button className="mt-2" onClick={onUpgrade} disabled={!billing.billingEnabled}>
          {billing.billingEnabled ? "Upgrade to Pro" : "Upgrade unavailable"}
        </Button>
      ) : null}
    </Notice>
  );
};
