import React from "react";
import { AlertCircle, CheckCircle, Info, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import type { ImportPreview } from "@/features/template-backup/importFileSelection";
import { countImportPublicTemplates } from "@/lib/utils/templateBackup";
import type { ImportVisibility } from "@/lib/utils/templateBackup";
import { formatCount } from "@/lib/utils/pluralize";
import { TEMPLATE_IMPORT_MAX_ASSET_BYTES } from "@/lib/schemas/templateAssetLimits";
import { formatUploadLimit } from "@/lib/schemas/uploadLimits";

const ASSET_LIMIT = formatUploadLimit(TEMPLATE_IMPORT_MAX_ASSET_BYTES);

interface TemplateImportPreviewProps {
  confirmDisabled: boolean;
  exceedsTemplateLimit: boolean;
  isImporting: boolean;
  maxTemplatesPerImport: number;
  onCancel: () => void;
  onConfirm: () => void;
  oversizedAssetCount: number;
  preview: ImportPreview;
  visibility: ImportVisibility;
}

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
  <Card>
    <CardHeader>
      <CardTitle as="h2" className="flex items-center gap-2">
        <CheckCircle aria-hidden="true" className="size-4 text-muted-foreground" />
        Import Preview
      </CardTitle>
      <CardDescription className="wrap-anywhere">{preview.fileName}</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{formatCount(preview.templates.length, "template")}</Badge>
        <Badge variant="outline">{countImportPublicTemplates(preview.templates, visibility)} public</Badge>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Templates to import:</h3>
        <ItemGroup className="max-h-40 gap-1 overflow-y-auto">
          {preview.templates.map((template, index: number) => (
            <Item key={index} role="listitem" size="sm" variant="muted">
              <ItemContent className="min-w-0">
                <ItemTitle className="line-clamp-2 wrap-anywhere">{template.title}</ItemTitle>
                {template.description ? (
                  <ItemDescription className="line-clamp-1">{template.description}</ItemDescription>
                ) : null}
                <ItemDescription className="text-xs">
                  {formatCount(template.sections.length, "section")}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </div>

      {preview.warnings.length > 0 ? (
        <Alert>
          <AlertCircle />
          <AlertTitle>Import Warnings</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {preview.warnings.map((warning, index: number) => (
                <li key={index}>• {warning.templateTitle}: {warning.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {exceedsTemplateLimit || oversizedAssetCount > 0 ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Import Policy (enforced)</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {exceedsTemplateLimit ? (
                <li>
                  • {formatCount(preview.templates.length, "template")} selected; limit is {maxTemplatesPerImport} per import
                </li>
              ) : null}
              {oversizedAssetCount > 0 ? (
                <li>
                  • {formatCount(oversizedAssetCount, "asset")} over {ASSET_LIMIT}; templates with them will not be imported
                </li>
              ) : null}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Alert>
        <Info />
        <AlertTitle>Import Notes:</AlertTitle>
        <AlertDescription>
          <ul className="flex flex-col gap-1">
            <li>• Templates will be assigned new unique IDs</li>
            <li>• Visibility follows your selection above</li>
            <li>• Existing templates won&apos;t be affected</li>
            <li>• Slugs will be regenerated to avoid conflicts</li>
            <li>• Uploaded assets are not copied; re-upload if needed</li>
            <li>• Limit: max {maxTemplatesPerImport} templates per import (enforced)</li>
            <li>• Limit: assets up to {ASSET_LIMIT} each, the upload limit (checked when size is provided)</li>
          </ul>
        </AlertDescription>
      </Alert>
    </CardContent>
    <CardFooter className="flex-wrap gap-2">
      <Button onClick={onConfirm} disabled={confirmDisabled}>
        <Upload data-icon="inline-start" />
        {isImporting ? "Importing..." : "Confirm Import"}
      </Button>
      <Button variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    </CardFooter>
  </Card>
);
