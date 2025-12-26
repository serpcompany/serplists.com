import React from 'react';
import { Button } from '@/components/ui/button';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  className = ''
}) => {
  return (
    <div className={`min-h-screen bg-background ${className}`}>
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="text-center">
          <Icon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h1 className="mb-4 text-3xl font-bold">{title}</h1>
          <p className="mb-6 text-muted-foreground">{description}</p>
          {action && (
            <Button onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};