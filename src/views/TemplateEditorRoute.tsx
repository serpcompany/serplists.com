'use client';

import { useParams } from 'next/navigation';

import { templateEditorRouteKey } from '@/features/template-editor/navigationGuards';
import TemplateEditor from '@/views/TemplateEditor';

const TemplateEditorRoute = () => {
  const { id } = useParams<{ id?: string }>();
  return <TemplateEditor key={templateEditorRouteKey(id)} />;
};

export default TemplateEditorRoute;
