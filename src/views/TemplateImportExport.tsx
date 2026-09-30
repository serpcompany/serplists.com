'use client';

import { FileJson } from 'lucide-react';

import { TemplateBackup } from '@/components/TemplateBackup';
import {
  DashboardContentShell,
  DashboardPageHeader,
  DashboardPageBody,
} from '@/components/dashboard/DashboardContentShell';

const TemplateImportExport = () => (
  <DashboardContentShell>
    <DashboardPageHeader
      title="Import Templates"
      description="Move checklist packs between environments or bootstrap your template library from a portable JSON sample."
      actions={
        <div className="hidden rounded-full border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground sm:flex sm:items-center sm:gap-2">
          <FileJson className="h-4 w-4" />
          JSON packs
        </div>
      }
    />

    <DashboardPageBody>
      <div className="max-w-4xl">
        <TemplateBackup />
      </div>
    </DashboardPageBody>
  </DashboardContentShell>
);

export default TemplateImportExport;
