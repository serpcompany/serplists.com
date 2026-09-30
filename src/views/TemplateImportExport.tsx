'use client';

import { FileJson } from 'lucide-react';

import { TemplateBackup } from '@/components/TemplateBackup';
import {
  DashboardContentShell,
  DashboardPageHeader,
} from '@/components/dashboard/DashboardContentShell';
import { Badge } from '@/components/ui/badge';

const TemplateImportExport = () => (
  <DashboardContentShell width="narrow">
    <DashboardPageHeader
      title="Import Templates"
      description="Move checklist packs between environments or bootstrap your template library from a portable JSON sample."
      actions={
        <Badge className="hidden sm:inline-flex" variant="outline">
          <FileJson data-icon="inline-start" />
          JSON packs
        </Badge>
      }
    />

    <TemplateBackup />
  </DashboardContentShell>
);

export default TemplateImportExport;
