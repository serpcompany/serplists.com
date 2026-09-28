import React from "react";
import { AlertCircle, CheckCircle, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ImportPreview } from "@/features/template-backup/importFileSelection";
import { countImportPublicTemplates } from "@/lib/utils/templateBackup";
import type { ImportVisibility } from "@/lib/utils/templateBackup";

interface TemplateImportPreviewProps {
  confirmDisabled: boolean;
  exceedsTemplateLimit: boolean;
  isImporting: boolean;
  maxTemplatesPerImport: number;
  onCancel: () => void;
  onConfirm: () => void;
  oversizedAssetCount: number;
  preview: ImportPreview;
  /** The selected override; the public count follows it, not the file's own flags. */
  visibility: ImportVisibility;
}

/** The parsed file waiting for Confirm Import on the Import Templates page. */
export const TemplateImportPreview: React.FC<TemplateImportPreviewProps> = ({
  confirmDisabled,
  exceedsTemplateLimit,
  isImporting,
  maxTemplatesPerImport,
  onCancel,
  onConfirm,
  oversizedAssetCount,
  preview,
  visibility,
}) => (
  <Card className="border-dashed">
    <CardHeader className="pb-3">
      <CardTitle className="text-base flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-green-600" />
        Import Preview
        <span className="truncate text-sm font-normal text-muted-foreground">{preview.fileName}</span>
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex items-center gap-4">
        <Badge variant="secondary">{preview.templates.length} templates</Badge>
        <Badge variant="outline">{countImportPublicTemplates(preview.templates, visibility)} public</Badge>
      </div>

      <div className="space-y-2">
        <h4 className="font-medium">Templates to import:</h4>
        <div className="max-h-40 overflow-y-auto space-y-1">
          {preview.templates.map((template, index: number) => <div key={index} className="text-sm p-2 bg-muted rounded">
              <div className="font-medium">{template.title}</div>
              {template.description && <div className="text-muted-foreground truncate">{template.description}</div>}
              <div className="text-xs text-muted-foreground">
                {template.sections.length} sections
              </div>
            </div>)}
        </div>
      </div>

      {preview.warnings.length > 0 && <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Import Warnings
              </p>
              <ul className="text-amber-700 dark:text-amber-300 mt-1 space-y-1">
                {preview.warnings.map((warning, index: number) => <li key={index}>
                    • {warning.templateTitle}: {warning.message}
                  </li>)}
              </ul>
            </div>
          </div>
        </div>}

      {(exceedsTemplateLimit || oversizedAssetCount > 0) && <div className="bg-sky-50 dark:bg-sky-900/20 p-3 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-sky-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-sky-800 dark:text-sky-200">
                Import Policy (enforced)
              </p>
              <ul className="text-sky-700 dark:text-sky-300 mt-1 space-y-1">
                {exceedsTemplateLimit && <li>
                    • {preview.templates.length} templates selected; limit is {maxTemplatesPerImport} per import
                  </li>}
                {oversizedAssetCount > 0 && <li>
                    • {oversizedAssetCount} asset{oversizedAssetCount === 1 ? "" : "s"} over 5MB; compress or remove to import
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
              <li>• Limit: max {maxTemplatesPerImport} templates per import (enforced)</li>
              <li>• Limit: assets should be ≤ 5MB each (enforced when size is provided)</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={onConfirm}
          disabled={confirmDisabled}
          className="flex items-center gap-2"
        >
          <Upload className="h-4 w-4" />
          {isImporting ? "Importing..." : "Confirm Import"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </CardContent>
  </Card>
);
