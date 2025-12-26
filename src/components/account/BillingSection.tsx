import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Check, Crown, Settings } from 'lucide-react';

interface SubscriptionData {
  subscribed: boolean;
  subscription_tier: string | null;
  subscription_end: string | null;
}

interface BillingSectionProps {
  subscription: SubscriptionData;
  onUpgrade: () => void;
  onManageSubscription: () => void;
}

export const BillingSection: React.FC<BillingSectionProps> = ({
  subscription,
  onUpgrade,
  onManageSubscription
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          <span>Billing & Subscription</span>
          <div className="ml-auto text-xs text-muted-foreground">
            Auto-updates
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Plan */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            {!subscription.subscribed ? (
              <div className="p-2 bg-muted rounded-full">
                <Settings className="h-4 w-4" />
              </div>
            ) : (
              <div className="p-2 bg-primary/10 rounded-full">
                <Crown className="h-4 w-4 text-primary" />
              </div>
            )}
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                {subscription.subscribed ? subscription.subscription_tier || 'Premium' : 'Free'} Plan
                <Badge variant={subscription.subscribed ? 'default' : 'secondary'}>
                  {subscription.subscribed ? 'Active' : 'Free'}
                </Badge>
              </h3>
              {subscription.subscription_end && !subscription.subscribed && (
                <p className="text-sm text-muted-foreground">
                  Canceled - Access until {new Date(subscription.subscription_end).toLocaleDateString()}
                </p>
              )}
              {subscription.subscription_end && subscription.subscribed && (
                <p className="text-sm text-muted-foreground">
                  Renews {new Date(subscription.subscription_end).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          
          {subscription.subscribed ? (
            <Button variant="outline" size="sm" onClick={onManageSubscription}>
              Manage
            </Button>
          ) : (
            <Button size="sm" onClick={onUpgrade}>
              Upgrade
            </Button>
          )}
        </div>
        
        {/* Features */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Your Plan Features</h4>
          <div className="space-y-2">
            {subscription.subscribed ? (
              <>
                <FeatureItem included text="Unlimited templates" />
                <FeatureItem included text="Private templates" />
                <FeatureItem included text="Analytics & insights" />
                <FeatureItem included text="Priority support" />
                <FeatureItem included text="API access" />
                <FeatureItem included text="Custom branding" />
              </>
            ) : (
              <>
                <FeatureItem included text="5 templates" />
                <FeatureItem included={false} text="Private templates" />
                <FeatureItem included={false} text="Analytics & insights" />
                <FeatureItem included text="Community support" />
                <FeatureItem included={false} text="API access" />
                <FeatureItem included={false} text="Custom branding" />
              </>
            )}
          </div>
        </div>
        
        {!subscription.subscribed && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
            <h4 className="font-semibold mb-2">Upgrade to Premium</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Get unlimited templates, analytics, and more with our Premium plan.
            </p>
            <Button onClick={onUpgrade} className="w-full">
              <Crown className="h-4 w-4 mr-2" />
              Upgrade Now - $9/month
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

function FeatureItem({ included, text }: { included: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className={`p-0.5 rounded-full ${included ? 'bg-green-100 text-green-600' : 'bg-muted text-muted-foreground'}`}>
        <Check className="h-3 w-3" />
      </div>
      <span className={included ? '' : 'text-muted-foreground'}>{text}</span>
    </div>
  );
}