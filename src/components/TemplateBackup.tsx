import React, { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Download } from "lucide-react";
import { Stat } from "@/components/layout/Stat";
import { useTemplateLists } from "@/contexts/TemplatesContext";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import { downloadBackupFile, exportPortableTemplatesToJSON, parseTemplatesFromFile } from "@/lib/utils/templateBackup";
import { IMPORT_VISIBILITY_LABELS, type ImportVisibility } from "@/lib/utils/templateBackup";
import type { ChecklistTemplate, TemplateImportSummary } from "@/types/checklist";
import type { PageVisit } from "@/lib/navigation/pageVisit";
import { exportTemplatePack } from "@/features/template-backup/exportTemplatePack";
import { buildSampleTemplate } from "@/features/template-backup/sampleTemplate";
import { usePublicCatalogLoader } from "@/features/template-backup/publicCatalogLoader";
import { selectImportFile } from "@/features/template-backup/importFileSelection";
import type { ImportPreview } from "@/features/template-backup/importFileSelection";
import { handleAccessFailure, startBillingCheckout } from "@/lib/access-flow";
import { getAccessFailure } from "@/lib/api-errors";
import { useBillingStatus } from "@/hooks/useBillingStatus";
import { usePageVisit } from "@/hooks/usePageVisit";
import { useSingleFlight } from "@/hooks/useSingleFlight";
import {
  formatExportSummaryMessage, formatImportSummaryMessage, getImportSummaryFromError,
} from "@/lib/templates/templateImportSummary";
import { MAX_TEMPLATES_PER_IMPORT } from "@/lib/templates/templateImportLimits";
import { isPersonalTemplateOf } from "@/lib/templates/templateOwnership";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/utils/pluralize";
import { countOversizedTemplateAssets } from "@/lib/schemas/templateAssetLimits";
import { ORGANIZATION_BACKUP_UPGRADE_MESSAGE, TemplateBackupPlanNotice } from "@/components/TemplateBackupPlanNotice";
import { TemplateImportPreview } from "@/components/TemplateImportPreview";
import { TemplateImportResult } from "@/components/TemplateImportResult";
import { ListLoadErrorState } from "@/components/dashboard/ListLoadErrorState";

interface TemplateBackupProps {
  className?: string;
}

// The same check the API applies per template; it only warns here.
const countOversizedAssets = (templates: ChecklistTemplate[]): number =>
  templates.reduce((count, template) => count + countOversizedTemplateAssets(template.sections), 0);

export const TemplateBackup: React.FC<TemplateBackupProps> = ({
  className
}) => {
  // The export is built on the server, so this page never loads the public catalog.
  const {
    allTemplates,
    importTemplates,
    refetchTemplates,
    templatesError,
    templatesLoading,
  } = useTemplateLists();
  const {
    user
  } = useAuth();
  const {
    activeTeamId,
    activeWorkspace,
    canEditTemplates,
    isTeamWorkspace,
  } = useWorkspace();
  const billing = useBillingStatus({ enabled: !!user, teamId: activeTeamId, userId: user?.id });
  const loadPublicCatalog = usePublicCatalogLoader();
  // Export and import await a request; a checkout for its failure starts only while the
  // user is still on this page.
  const beginVisit = usePageVisit();
  const billingEnabled = billing.status === "known" ? billing.billingEnabled : true;
  // Only a plan the server reported as Free is gated here. When the status check
  // failed, actions go through and the server's 403 upgrade_required decides.
  const isKnownFreePlan = billing.status === "known" && !billing.isPaid;
  const hasBackupAccess = billing.status === "error" || (billing.status === "known" && billing.isPaid);
  const workspaceTemplateLabel = isTeamWorkspace ? "Organization Templates" : "My Templates";
  // Until the list loads, the context may not be restored yet (an Organization reads as
  // Personal while it loads), so export and import wait and the counts show a dash.
  const backupControlsOff = !user || templatesLoading || !hasBackupAccess || !canEditTemplates;
  const formatStatCount = (count: number) => (templatesLoading ? "–" : count);
  // One export at a time: a second click would scan every Template again and download a copy.
  const exportFlight = useSingleFlight();
  const isExporting = exportFlight.isRunning;
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [lastImportSummary, setLastImportSummary] = useState<TemplateImportSummary | null>(null);
  const [includePublicTemplates, setIncludePublicTemplates] = useState(false);
  const [importVisibility, setImportVisibility] = useState<ImportVisibility>("preserve");

  const ownedTemplates = activeTeamId
    ? allTemplates.filter(t => t.teamId === activeTeamId)
    : user
      ? allTemplates.filter((t) => isPersonalTemplateOf(t, user.id))
      : [];
  const importOversizeAssets = importPreview ? countOversizedAssets(importPreview.templates) : 0;
  const exceedsTemplateLimit = importPreview ? importPreview.templates.length > MAX_TEMPLATES_PER_IMPORT : false;

  const handleUpgrade = async () => {
    if (isTeamWorkspace) {
      toast.error(ORGANIZATION_BACKUP_UPGRADE_MESSAGE);
      return;
    }
    await startBillingCheckout(billingEnabled);
  };

  const handleBackupFailure = async (error: unknown, fallbackMessage: string, visit: PageVisit) => {
    if (isTeamWorkspace) {
      const failure = getAccessFailure(error, fallbackMessage);
      toast.error(
        failure.kind === "upgrade_required"
          ? ORGANIZATION_BACKUP_UPGRADE_MESSAGE
          : failure.message,
      );
      return;
    }

    await handleAccessFailure(error, {
      billingEnabled,
      fallbackMessage,
      isCurrent: visit.isCurrent,
    });
  };

  const exportAll = async () => {
    if (templatesLoading) return;
    if (!user) {
      toast.error("Log in to export your templates");
      return;
    }

    if (!canEditTemplates) {
      toast.error("You need editor access to export this Organization's templates.");
      return;
    }

    if (isKnownFreePlan) {
      await handleUpgrade();
      return;
    }

    const visit = beginVisit();
    try {
      const summary = await exportTemplatePack(
        {
          includePublic: includePublicTemplates,
          teamId: activeTeamId,
          userId: user.id,
          ownedTemplateIds: ownedTemplates.map((t) => t.id),
        },
        { download: (pack) => downloadBackupFile(pack), loadPublicCatalog },
      );
      // Templates that cannot be made valid are left out (manifest.skippedTemplates): name them.
      const { kind, message } = formatExportSummaryMessage(summary);
      toast[kind](message, summary.skipped.length > 0 ? { duration: 15000 } : undefined);
    } catch (error) {
      console.error("Export error:", error);
      await handleBackupFailure(error, "Failed to export templates", visit);
    }
  };
  const handleExportAll = () => void exportFlight.run(exportAll);
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) =>
    selectImportFile(event.currentTarget, {
      onError: (message) => toast.error(message),
      onPreview: (result, fileName) => {
        setImportPreview({ ...result, fileName });
        toast.success(`Preview: ${formatCount(result.templates.length, "template")} ready to import`);
      },
      parse: parseTemplatesFromFile,
      resetPreview: () => {
        setImportPreview(null);
        setLastImportSummary(null);
      },
      setBusy: setIsImporting,
    });
  const handleConfirmImport = async () => {
    if (!importPreview || !user) return;

    if (!canEditTemplates) {
      toast.error("You need editor access to import templates into this Organization.");
      return;
    }

    if (isKnownFreePlan) {
      await handleUpgrade();
      return;
    }

    if (exceedsTemplateLimit) {
      toast.error(`Import limited to ${MAX_TEMPLATES_PER_IMPORT} templates per file for now`);
      return;
    }

    const visit = beginVisit();
    setLastImportSummary(null);
    setIsImporting(true);
    try {
      // The importPreview has already been validated by parseTemplatesFromJSON
      const result = await importTemplates(importPreview.templates, {
        visibility: importVisibility
      });
      setLastImportSummary(result);
      const { kind, message } = formatImportSummaryMessage(result);
      toast[kind](message);
      setImportPreview(null);
    } catch (error) {
      // When every template fails, the API still sends the per-template summary. Show it,
      // and keep the preview so the file can be fixed and imported again.
      const summary = getImportSummaryFromError(error);
      if (summary) {
        setLastImportSummary(summary);
        toast.error(formatImportSummaryMessage(summary).message);
      } else {
        await handleBackupFailure(error, "Failed to import templates", visit);
      }
    } finally {
      setIsImporting(false);
    }
  };
  const handleCancelImport = () => setImportPreview(null);
  const downloadSampleTemplate = () => {
    const sampleTemplate = buildSampleTemplate();
    const sampleBackup = exportPortableTemplatesToJSON([sampleTemplate], "Sample Export");
    downloadBackupFile(sampleBackup, "sample-moving-checklist-portable.json");
    toast.success("Sample portable template pack downloaded. You can import it to preview the new JSON format.");
  };
  const publicTemplateCount = ownedTemplates.filter(t => t.isPublic).length;
  const privateTemplateCount = ownedTemplates.filter(t => !t.isPublic).length;
  const includePublicDescriptionId = "include-public-templates-description";
  const importVisibilityId = "template-import-visibility";
  return <div className={cn("flex flex-col gap-6", className)} data-template-import-export="true">
    <Card>
      <CardHeader>
        <CardTitle>Template JSON Import &amp; Export</CardTitle>
        <CardDescription>
          Export portable template packs or import compatible JSON files for {activeWorkspace.name}.
        </CardDescription>
        <CardAction>
          <Badge variant="outline">Portable packs</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {user ? (
          <TemplateBackupPlanNotice
            billing={billing}
            isTeamWorkspace={isTeamWorkspace}
            onRetry={billing.refetch}
            onUpgrade={() => void handleUpgrade()}
          />
        ) : null}

        {user && isTeamWorkspace && !canEditTemplates ? (
          <Alert>
            <AlertCircle />
            <AlertTitle>Editor access required</AlertTitle>
            <AlertDescription>
              You can view this Organization, but importing or exporting templates requires editor access.
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Current Templates Stats; a failed list is not zero templates. Export still
            works: the server's pack decides what this context owns. */}
        {templatesError ? (
          <ListLoadErrorState error={templatesError} listName="templates" onRetry={() => void refetchTemplates()} titleAs="h3" />
        ) : (
          <div className="grid grid-cols-3 gap-4" aria-busy={templatesLoading}>
            <Stat label={workspaceTemplateLabel} value={formatStatCount(ownedTemplates.length)} />
            <Stat label="Public" value={formatStatCount(publicTemplateCount)} />
            <Stat label="Private" value={formatStatCount(privateTemplateCount)} />
          </div>
        )}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Export Templates</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="include-public-templates">Include public community templates</FieldLabel>
            <FieldDescription id={includePublicDescriptionId}>
              Exports your templates plus any public templates you can see into the portable pack format.
            </FieldDescription>
          </FieldContent>
          <Switch
            // A native button, so the Label's htmlFor names it.
            nativeButton
            render={<button type="button" />}
            id="include-public-templates"
            aria-describedby={includePublicDescriptionId}
            checked={includePublicTemplates}
            onCheckedChange={setIncludePublicTemplates}
            disabled={backupControlsOff || isExporting}
          />
        </Field>
        <div>
          <Button onClick={handleExportAll} disabled={backupControlsOff || isExporting} aria-busy={isExporting}>
            <Download data-icon="inline-start" />
            {isExporting ? "Exporting..." : "Export Portable Pack"}
          </Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Import Templates</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={importVisibilityId}>Import visibility</FieldLabel>
            <Select items={IMPORT_VISIBILITY_LABELS} value={importVisibility} onValueChange={(value) => setImportVisibility(value as ImportVisibility)}>
              <SelectTrigger className="w-full sm:w-72" id={importVisibilityId}>
                <SelectValue placeholder="Choose visibility" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(IMPORT_VISIBILITY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Templates missing a visibility flag default to private.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="template-file-input">Select a YAML, JSON, or Markdown template file</FieldLabel>
            <Input id="template-file-input" type="file" accept=".json,.md,.markdown,.yaml,.yml" onChange={handleFileSelect} disabled={isImporting || backupControlsOff} />
            <FieldDescription>
              Need an example?{" "}
              <Button variant="link" className="h-auto p-0" onClick={downloadSampleTemplate} type="button">
                Download sample portable pack
              </Button>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>

    {importPreview ? (
      <TemplateImportPreview
        confirmDisabled={isImporting || templatesLoading || exceedsTemplateLimit}
        exceedsTemplateLimit={exceedsTemplateLimit}
        isImporting={isImporting}
        maxTemplatesPerImport={MAX_TEMPLATES_PER_IMPORT}
        onCancel={handleCancelImport}
        onConfirm={handleConfirmImport}
        oversizedAssetCount={importOversizeAssets}
        preview={importPreview}
        visibility={importVisibility}
      />
    ) : null}

    {lastImportSummary ? <TemplateImportResult summary={lastImportSummary} /> : null}
  </div>;
};
