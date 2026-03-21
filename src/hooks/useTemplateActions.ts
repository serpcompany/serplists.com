import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplates } from '@/contexts/TemplatesContext';
import { toast } from 'sonner';
import { navigateToLoginWithReturnPath } from '@/lib/access-flow';

export const useTemplateActions = (templateId: string) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { createRun } = useTemplates();

  const handleStartRun = async () => {
    if (!user) {
      navigateToLoginWithReturnPath(navigate, location);
      return;
    }
    
    try {
      const run = await createRun({ templateId });
      if (run) {
        navigate(`/run/${run.id}`);
      }
    } catch (error) {
      console.error('Failed to create run:', error);
      toast.error('Please log in with admin/demo to start a checklist run');
    }
  };

  const handleEditTemplate = () => {
    navigate(`/templates/${templateId}`);
  };

  return {
    handleStartRun,
    handleEditTemplate,
    user
  };
};
