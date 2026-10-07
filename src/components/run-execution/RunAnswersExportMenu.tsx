import { Download, FileJson, FileSpreadsheet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  buildRunAnswersFile,
  runHasFormFields,
  type RunAnswersExportFormat,
} from '@/features/run-execution/runAnswersExport';
import { downloadFile } from '@/lib/utils/downloadFile';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

type RunAnswersExportMenuProps = {
  run: ChecklistRun;
  template?: Pick<ChecklistTemplate, 'id' | 'title'> | undefined;
};

export function RunAnswersExportMenu({ run, template }: RunAnswersExportMenuProps) {
  if (!runHasFormFields(run)) {
    return null;
  }

  const exportAs = (format: RunAnswersExportFormat) => {
    downloadFile(buildRunAnswersFile(run, format, {
      exportedAt: new Date().toISOString(),
      origin: window.location.origin,
      template: template ? { id: template.id, title: template.title } : undefined,
    }));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Download data-icon="inline-start" />
        Export answers
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-(--anchor-width)">
        <DropdownMenuItem onClick={() => exportAs('csv')}>
          <FileSpreadsheet />
          Download CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportAs('json')}>
          <FileJson />
          Download JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
