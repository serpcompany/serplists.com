import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Bug, ExternalLink } from 'lucide-react';

interface DeveloperSectionProps {
  devOverride: boolean;
  onToggleDevOverride: () => void;
  onTestGHLIntegration: () => void;
  loading: boolean;
}

export const DeveloperSection: React.FC<DeveloperSectionProps> = ({
  devOverride,
  onToggleDevOverride,
  onTestGHLIntegration,
  loading
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="h-5 w-5" />
          Developer Settings
          <Badge variant="outline" className="ml-2">Beta</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">Development Mode</span>
              {devOverride && (
                <Badge variant="destructive" className="text-xs">Active</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Override subscription checks for development
            </p>
          </div>
          <Switch
            checked={devOverride}
            onCheckedChange={onToggleDevOverride}
          />
        </div>
        
        <div className="pt-2 border-t">
          <h4 className="text-sm font-medium mb-3">Integrations</h4>
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={onTestGHLIntegration}
              disabled={loading}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Test GHL Integration
            </Button>
          </div>
        </div>
        
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            These settings are for testing purposes only and do not affect production behavior.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};