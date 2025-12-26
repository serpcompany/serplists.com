import React from 'react';
import { Button } from '@/components/ui/button';
import { Play, Edit } from 'lucide-react';

interface TemplateActionsProps {
  user: unknown;
  template: { userId: string; id: string };
  onStartRun: () => void;
  onEditTemplate: () => void;
  showDebug?: boolean;
}

export const TemplateActions: React.FC<TemplateActionsProps> = ({
  user,
  template,
  onStartRun,
  onEditTemplate,
  showDebug = false
}) => {
  const isOwner = user?.id === template.userId;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3 sm:items-center">
        <Button 
          onClick={onStartRun} 
          className="w-full sm:w-auto flex items-center justify-center gap-2"
        >
          <Play className="h-4 w-4" />
          <span>
            {user ? "Run" : "Login"}
          </span>
        </Button>
        
        {/* Always show edit button if user is logged in and owns template */}
        {user && isOwner && (
          <Button 
            variant="outline" 
            onClick={onEditTemplate}
            className="w-full sm:w-auto flex items-center justify-center gap-2"
          >
            <Edit className="h-4 w-4" />
            <span>Edit</span>
          </Button>
        )}
        
        {/* Debug info - remove this after testing */}
        {showDebug && process.env.NODE_ENV === 'development' && (
          <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
            Debug: User: {user?.id ? 'Logged in' : 'Not logged in'} | 
            Template Owner: {template.userId} | 
            Is Owner: {isOwner ? 'Yes' : 'No'}
          </div>
        )}
      </div>
    </div>
  );
};