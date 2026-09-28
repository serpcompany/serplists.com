import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Upload, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { useTemplateLists } from "@/contexts/TemplatesContext";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import { downloadBackupFile, exportPortableTemplatesToJSON, parseTemplatesFromFile } from "@/lib/utils/templateBackup";
import type { TemplateImportResult } from "@/lib/utils/templateBackup";
import type { ChecklistTemplate, TemplateImportOptions, TemplateImportSummary } from "@/types/checklist";
import { exportTemplatePack } from "@/features/template-backup/exportTemplatePack";
import { handleAccessFailure, startBillingCheckout } from "@/lib/access-flow";
import { getAccessFailure } from "@/lib/api-errors";
import { useBillingStatus } from "@/hooks/useBillingStatus";
import { cn } from "@/lib/utils";
import { ORGANIZATION_BACKUP_UPGRADE_MESSAGE, TemplateBackupPlanNotice } from "@/components/TemplateBackupPlanNotice";

interface TemplateBackupProps {
  className?: string;
}

const MAX_TEMPLATES_PER_IMPORT = 5;
const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024; // 2MB
const SUPPORTED_IMPORT_EXTENSIONS = [".json", ".md", ".markdown", ".yaml", ".yml"];

const countOversizedAssets = (templates: ChecklistTemplate[]): number => {
  let count = 0;
  templates.forEach((template) => {
    template.sections.forEach((section) => {
      section.items.forEach((item) => {
        item.contents?.forEach((content) => {
          if (content.type !== "image" && content.type !== "video" && content.type !== "file") return;
          if (typeof content.fileSize === "number" && content.fileSize > MAX_ASSET_BYTES) {
            count += 1;
          }
        });
      });
    });
  });
  return count;
};

export const TemplateBackup: React.FC<TemplateBackupProps> = ({
  className
}) => {
  type ImportVisibility = NonNullable<TemplateImportOptions["visibility"]>;
  // The export is built on the server, so this page never loads the public catalog.
  const {
    allTemplates,
    importTemplates,
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
  const billingEnabled = billing.status === "known" ? billing.billingEnabled : true;
  // Only a plan the server reported as Free is gated here. When the status check
  // failed, actions go through and the server's 403 upgrade_required decides.
  const isKnownFreePlan = billing.status === "known" && !billing.isPaid;
  const hasBackupAccess = billing.status === "error" || (billing.status === "known" && billing.isPaid);
  const workspaceTemplateLabel = isTeamWorkspace ? "Organization Templates" : "My Templates";
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<TemplateImportResult | null>(null);
  const [lastImportSummary, setLastImportSummary] = useState<TemplateImportSummary | null>(null);
  const [includePublicTemplates, setIncludePublicTemplates] = useState(false);
  const [importVisibility, setImportVisibility] = useState<ImportVisibility>("preserve");

  const ownedTemplates = activeTeamId
    ? allTemplates.filter(t => t.teamId === activeTeamId)
    : user
      ? allTemplates.filter(t => t.userId === user.id && !t.teamId)
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

  const handleBackupFailure = async (error: unknown, fallbackMessage: string) => {
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
    });
  };

  const handleExportAll = async () => {
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

    try {
      const result = await exportTemplatePack(
        {
          includePublic: includePublicTemplates,
          knownOwnedCount: templatesLoading ? null : ownedTemplates.length,
          teamId: activeTeamId,
        },
        { download: (pack) => downloadBackupFile(pack) },
      );
      if (result.kind === "empty") {
        toast.error("No templates available to export");
        return;
      }
      toast.success(`Exported ${result.count} templates successfully`);
    } catch (error) {
      console.error("Export error:", error);
      await handleBackupFailure(error, "Failed to export templates");
    }
  };
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    const isSupported = SUPPORTED_IMPORT_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
    if (!isSupported) {
      toast.error("Please select a JSON, Markdown, or YAML template file");
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      toast.error("Import file too large (max 2MB)");
      return;
    }
    setLastImportSummary(null);
    setIsImporting(true);
    try {
      const parsedTemplates = await parseTemplatesFromFile(file);
      setImportPreview(parsedTemplates);
      toast.success(`Preview: ${parsedTemplates.templates.length} templates ready to import`);
    } catch (error) {
      toast.error(`Failed to parse file: ${(error as Error).message}`);
      setImportPreview(null);
    } finally {
      setIsImporting(false);
    }
  };
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

    if (importOversizeAssets > 0) {
      toast.error("Import blocked: one or more assets are over 5MB (compress or re-upload after import)");
      return;
    }

    setIsImporting(true);
    try {
      // The importPreview has already been validated by parseTemplatesFromJSON
      const result = await importTemplates(importPreview.templates, {
        visibility: importVisibility
      });
      setLastImportSummary(result);
      if (result.failed.length > 0) {
        const failedTitles = result.failed
          .slice(0, 2)
          .map((failure) => failure.title)
          .join(", ");
        const overflowLabel =
          result.failed.length > 2 ? ` +${result.failed.length - 2} more` : "";
        toast.error(`Imported ${result.imported}/${result.total}. Failed: ${failedTitles}${overflowLabel}`);
      } else {
        toast.success(`Successfully imported ${result.imported}/${result.total} templates`);
      }
      setImportPreview(null);
      // Reset file input
      const fileInput = document.getElementById('template-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (error) {
      await handleBackupFailure(error, "Failed to import templates");
    } finally {
      setIsImporting(false);
    }
  };
  const handleCancelImport = () => {
    setImportPreview(null);
    const fileInput = document.getElementById('template-file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };
  const downloadSampleTemplate = () => {
    const sampleTemplate: ChecklistTemplate = {
      id: "sample-template-001",
      title: "Moving Checklist",
      description: "A comprehensive checklist to help you organize your move and ensure nothing is forgotten.",
      userId: "sample",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPublic: true,
      slug: "moving-checklist-sample",
      categories: ["moving", "packing"],
      tags: ["relocation", "organization", "home"],
      sections: [{
        id: "section-planning",
        title: "Planning Phase (8 weeks before)",
        items: [{
          id: "item-research",
          title: "Research moving companies",
          description: "Get quotes from at least 3 different moving companies",
          contents: [{
            id: "content-tips",
            type: "text",
            value: "**Tips for choosing a moving company:**\n\n- Check online reviews and BBB ratings\n- Verify licensing and insurance\n- Get written estimates\n- Ask about additional fees"
          }]
        }, {
          id: "item-budget",
          title: "Create moving budget",
          description: "Plan all expenses including movers, supplies, and unexpected costs",
          contents: []
        }, {
          id: "item-timeline",
          title: "Create moving timeline",
          description: "Plan key milestones and deadlines",
          contents: [{
            id: "content-timeline",
            type: "subItems",
            value: "",
            subItems: [{
              id: "sub-1",
              title: "8 weeks: Start planning and research"
            }, {
              id: "sub-2",
              title: "6 weeks: Book moving company"
            }, {
              id: "sub-3",
              title: "4 weeks: Start packing non-essentials"
            }, {
              id: "sub-4",
              title: "2 weeks: Confirm all arrangements"
            }, {
              id: "sub-5",
              title: "1 week: Pack essentials box"
            }]
          }]
        }]
      }, {
        id: "section-preparation",
        title: "Preparation Phase (4 weeks before)",
        items: [{
          id: "item-declutter",
          title: "Declutter and organize",
          description: "Sort through belongings and decide what to keep, donate, or discard",
          contents: []
        }, {
          id: "item-supplies",
          title: "Gather packing supplies",
          description: "Collect boxes, tape, bubble wrap, labels, and markers",
          contents: [{
            id: "content-supplies",
            type: "subItems",
            value: "",
            subItems: [{
              id: "supply-1",
              title: "Moving boxes (various sizes)"
            }, {
              id: "supply-2",
              title: "Packing tape"
            }, {
              id: "supply-3",
              title: "Bubble wrap or newspaper"
            }, {
              id: "supply-4",
              title: "Labels and permanent markers"
            }, {
              id: "supply-5",
              title: "Stretch wrap for furniture"
            }]
          }]
        }, {
          id: "item-change-address",
          title: "Change address with important services",
          description: "Update your address with banks, utilities, and subscription services",
          contents: []
        }]
      }, {
        id: "section-moving-day",
        title: "Moving Day",
        items: [{
          id: "item-essentials",
          title: "Pack essentials box",
          description: "Keep important items easily accessible",
          contents: []
        }, {
          id: "item-inventory",
          title: "Create inventory list",
          description: "Document all items being moved",
          contents: []
        }, {
          id: "item-final-walkthrough",
          title: "Final walkthrough",
          description: "Check all rooms, closets, and storage areas",
          contents: []
        }]
      }]
    };
    const sampleBackup = exportPortableTemplatesToJSON([sampleTemplate], "Sample Export");
    downloadBackupFile(sampleBackup, "sample-moving-checklist-portable.json");
    toast.success("Sample portable template pack downloaded. You can import it to preview the new JSON format.");
  };
  const publicTemplateCount = ownedTemplates.filter(t => t.isPublic).length;
  const privateTemplateCount = ownedTemplates.filter(t => !t.isPublic).length;
  return <section
    className={cn("rounded-xl border border-border bg-card p-6", className)}
    data-template-import-export="true"
  >
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <FileText className="h-5 w-5 text-muted-foreground" />
          Template JSON Import & Export
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Export portable template packs or import compatible JSON files for {activeWorkspace.name}.
        </p>
      </div>
      <div className="w-fit rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
        Portable packs
      </div>
    </div>

    <div className="mt-6 space-y-6">
          {user ? (
            <TemplateBackupPlanNotice
              billing={billing}
              isTeamWorkspace={isTeamWorkspace}
              onRetry={billing.refetch}
              onUpgrade={() => void handleUpgrade()}
            />
          ) : null}

          {user && isTeamWorkspace && !canEditTemplates ? (
            <div className="rounded-lg border p-4 bg-muted/50">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <div className="font-medium">Editor access required</div>
                  <div className="text-sm text-muted-foreground">
                    You can view this Organization, but importing or exporting templates requires editor access.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Current Templates Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{ownedTemplates.length}</div>
              <div className="text-sm text-muted-foreground">{workspaceTemplateLabel}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{publicTemplateCount}</div>
              <div className="text-sm text-muted-foreground">Public</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{privateTemplateCount}</div>
              <div className="text-sm text-muted-foreground">Private</div>
            </div>
          </div>

          <Separator />

	          {/* Export Section */}
	          <div className="space-y-4">
	            <h3 className="text-lg font-semibold">Export Templates</h3>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div>
                  <Label htmlFor="include-public-templates" className="text-sm font-medium">
                    Include public community templates
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Exports your templates plus any public templates you can see into the portable pack format.
                  </p>
                </div>
                <Switch
                  id="include-public-templates"
                  checked={includePublicTemplates}
                  onCheckedChange={setIncludePublicTemplates}
                  disabled={!user || !hasBackupAccess || !canEditTemplates}
                />
              </div>
	            <Button onClick={handleExportAll} className="flex items-center gap-2" disabled={!user || !hasBackupAccess || !canEditTemplates}>
	              <Download className="h-4 w-4" />
	              Export Portable Pack
	            </Button>
	          </div>

          <Separator />

	          {/* Import Section */}
	          <div className="space-y-4">
	            <h3 className="text-lg font-semibold">Import Templates</h3>
              <div className="space-y-2">
                <Label>Import visibility</Label>
                <Select value={importVisibility} onValueChange={(value) => setImportVisibility(value as ImportVisibility)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose visibility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preserve">Preserve visibility from file</SelectItem>
                    <SelectItem value="public">Force public</SelectItem>
                    <SelectItem value="private">Force private</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Templates missing a visibility flag default to private.
                </p>
              </div>
	            <div className="space-y-2">
	              <Label htmlFor="template-file-input">Select a YAML, JSON, or Markdown template file</Label>
	              <Input id="template-file-input" type="file" accept=".json,.md,.markdown,.yaml,.yml" onChange={handleFileSelect} disabled={isImporting || !user || !hasBackupAccess || !canEditTemplates} />
	              <p className="text-sm text-muted-foreground">
	                Need an example?{" "}
	                <Button variant="link" className="p-0 h-auto text-primary" onClick={downloadSampleTemplate}>
	                  Download sample portable pack
	                </Button>
	              </p>
	            </div>

            {/* Import Preview */}
            {importPreview && <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Import Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Badge variant="secondary">{importPreview.templates.length} templates</Badge>
                    <Badge variant="outline">
                      {importPreview.templates.filter(t => t.isPublic).length} public
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">Templates to import:</h4>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {importPreview.templates.map((template, index: number) => <div key={index} className="text-sm p-2 bg-muted rounded">
                          <div className="font-medium">{template.title}</div>
                          {template.description && <div className="text-muted-foreground truncate">{template.description}</div>}
                          <div className="text-xs text-muted-foreground">
                            {template.sections.length} sections
                          </div>
                        </div>)}
                    </div>
                  </div>

                  {importPreview.warnings.length > 0 && <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-amber-800 dark:text-amber-200">
                            Import Warnings
                          </p>
                          <ul className="text-amber-700 dark:text-amber-300 mt-1 space-y-1">
                            {importPreview.warnings.map((warning, index: number) => <li key={index}>
                                • {warning.templateTitle}: {warning.message}
                              </li>)}
                          </ul>
                        </div>
                      </div>
                    </div>}

                  {(exceedsTemplateLimit || importOversizeAssets > 0) && <div className="bg-sky-50 dark:bg-sky-900/20 p-3 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-sky-600 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-sky-800 dark:text-sky-200">
                            Import Policy (enforced)
                          </p>
                          <ul className="text-sky-700 dark:text-sky-300 mt-1 space-y-1">
                            {exceedsTemplateLimit && <li>
                                • {importPreview.templates.length} templates selected; limit is {MAX_TEMPLATES_PER_IMPORT} per import
                              </li>}
                            {importOversizeAssets > 0 && <li>
                                • {importOversizeAssets} asset{importOversizeAssets === 1 ? "" : "s"} over 5MB; compress or remove to import
                              </li>}
                          </ul>
                        </div>
                      </div>
                    </div>}

                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-yellow-800 dark:text-yellow-200">
                          Import Notes:
                        </p>
                        <ul className="text-yellow-700 dark:text-yellow-300 mt-1 space-y-1">
                          <li>• Templates will be assigned new unique IDs</li>
                          <li>• Visibility follows your selection above</li>
                          <li>• Existing templates won&apos;t be affected</li>
                          <li>• Slugs will be regenerated to avoid conflicts</li>
                          <li>• Uploaded assets are not copied; re-upload if needed</li>
                          <li>• Limit: max {MAX_TEMPLATES_PER_IMPORT} templates per import (enforced)</li>
                          <li>• Limit: assets should be ≤ 5MB each (enforced when size is provided)</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleConfirmImport}
                      disabled={isImporting || exceedsTemplateLimit || importOversizeAssets > 0}
                      className="flex items-center gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      {isImporting ? "Importing..." : "Confirm Import"}
                    </Button>
                    <Button variant="outline" onClick={handleCancelImport}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>}

            {lastImportSummary && <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    {lastImportSummary.failed.length > 0 ? <AlertCircle className="h-4 w-4 text-amber-600" /> : <CheckCircle className="h-4 w-4 text-green-600" />}
                    Last Import Result
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Badge variant="secondary">{lastImportSummary.total} attempted</Badge>
                    <Badge variant="outline">{lastImportSummary.imported} imported</Badge>
                    {lastImportSummary.failed.length > 0 ? <Badge variant="destructive">{lastImportSummary.failed.length} failed</Badge> : null}
                  </div>

                  {lastImportSummary.successes.length > 0 ? <div className="space-y-2">
                      <h4 className="font-medium">Imported:</h4>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {lastImportSummary.successes.map((success) => <div key={success.id} className="text-sm p-2 bg-muted rounded">
                            <div className="font-medium">{success.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {success.visibility} • /{success.slug}
                            </div>
                          </div>)}
                      </div>
                    </div> : null}

                  {lastImportSummary.failed.length > 0 ? <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-amber-800 dark:text-amber-200">
                            Failed Templates
                          </p>
                          <ul className="text-amber-700 dark:text-amber-300 mt-1 space-y-1">
                            {lastImportSummary.failed.map((failure) => <li key={`${failure.index}-${failure.title}`}>
                                • {failure.title}: {failure.reason}
                              </li>)}
                          </ul>
                        </div>
                      </div>
                    </div> : null}
                </CardContent>
              </Card>}
          </div>
    </div>
  </section>;
};
