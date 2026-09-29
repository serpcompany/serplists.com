'use client';

import { useParams } from 'next/navigation';

import { templateEditorRouteKey } from '@/features/template-editor/navigationGuards';
import TemplateEditor from '@/views/TemplateEditor';

// The editor routes are siblings, so an unkeyed <TemplateEditor /> would keep one instance
// (and its errors, selection and pending save) from /templates/:id/edit to /templates/new.
const TemplateEditorRoute = () => {
  const { id } = useParams<{ id?: string }>();
  return <TemplateEditor key={templateEditorRouteKey(id)} />;
};

export default TemplateEditorRoute;
