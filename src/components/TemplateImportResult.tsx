import { AlertCircle, CheckCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { formatImportFailure } from "@/lib/templates/templateImportSummary";
import type { TemplateImportSummary } from "@/types/checklist";

export function TemplateImportResult({ summary }: { summary: TemplateImportSummary }) {
  const hasFailures = summary.failed.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          {hasFailures ? (
            <AlertCircle aria-hidden="true" className="size-4 text-muted-foreground" />
          ) : (
            <CheckCircle aria-hidden="true" className="size-4 text-muted-foreground" />
          )}
          Last Import Result
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{summary.total} attempted</Badge>
          <Badge variant="outline">{summary.imported} imported</Badge>
          {hasFailures ? <Badge variant="destructive">{summary.failed.length} failed</Badge> : null}
        </div>

        {summary.successes.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Imported:</h3>
            <ItemGroup className="max-h-32 gap-1 overflow-y-auto">
              {summary.successes.map((success) => (
                <Item key={success.id} role="listitem" size="sm" variant="muted">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="line-clamp-2 wrap-anywhere">{success.title}</ItemTitle>
                    <ItemDescription className="wrap-anywhere">
                      {success.visibility} • /{success.slug}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          </div>
        ) : null}

        {hasFailures ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Failed Templates</AlertTitle>
            <AlertDescription>
              <ul className="flex flex-col gap-1">
                {summary.failed.map((failure) => (
                  <li key={`${failure.index}-${failure.title}`}>• {formatImportFailure(failure)}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
