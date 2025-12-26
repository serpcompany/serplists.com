import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle } from 'lucide-react';
import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { ChecklistItem, ChecklistSection } from '@/types/checklist';

interface ChecklistContentProps {
  selectedData: { item: ChecklistItem; section: ChecklistSection } | null;
}

export const ChecklistContent: React.FC<ChecklistContentProps> = ({ selectedData }) => {
  if (!selectedData) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <CheckCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">Select a task from the sidebar to view details</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Checkbox disabled className="opacity-50" />
            <div>
              <CardTitle>{selectedData.item.title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                From section: {selectedData.section.title}
              </p>
            </div>
          </div>
        </div>
        {selectedData.item.description && (
          <p className="text-muted-foreground">
            {selectedData.item.description}
          </p>
        )}
      </CardHeader>
      
      <CardContent>
        <ContentRenderer 
          contents={selectedData.item.contents || []} 
          disabled={true}
        />
      </CardContent>
    </Card>
  );
};