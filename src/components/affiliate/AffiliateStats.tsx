import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Users, DollarSign, Eye, TrendingUp } from 'lucide-react';
// Supabase removed - using Cloudflare API
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { toast } from 'sonner';

interface AffiliateStatsProps {
  profile: unknown;
}

export const AffiliateStats = ({ profile }: AffiliateStatsProps) => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    visits: 0,
    conversions: 0,
    conversionRate: 0
  });

  useEffect(() => {
    if (profile?.id) {
      loadAffiliateStats();
    }
  }, [profile?.id]);

  const loadAffiliateStats = async () => {
    try {
      // TODO: Replace with Cloudflare API call
      // const visits = await api.getReferralStats(profile.id);
      const totalVisits = 0;
      const conversions = 0;
      const conversionRate = 0;

      setStats({
        visits: totalVisits,
        conversions,
        conversionRate
      });
      
      console.log('Affiliate stats disabled - needs Cloudflare API implementation');
    } catch (error) {
      console.error('Error loading affiliate stats:', error);
    }
  };

  const copyAffiliateLink = (templateId?: string) => {
    const baseUrl = window.location.origin;
    const url = templateId 
      ? `${baseUrl}/template/${templateId}?ref=${profile.affiliate_code}`
      : `${baseUrl}?ref=${profile.affiliate_code}`;
    
    navigator.clipboard.writeText(url);
    toast.success('Affiliate link copied to clipboard!');
  };

  if (!profile?.affiliate_code) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Affiliate Program
          </CardTitle>
          <CardDescription>
            Earn $5 for every person you refer who signs up!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Affiliate Code */}
          <div className="space-y-2">
            <Label htmlFor="affiliate-code">Your Affiliate Code</Label>
            <div className="flex gap-2">
              <Input
                id="affiliate-code"
                value={profile.affiliate_code}
                readOnly
                className="font-mono"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyAffiliateLink()}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Sample Affiliate Link */}
          <div className="space-y-2">
            <Label>Sample Affiliate Link</Label>
            <div className="flex gap-2">
              <Input
                value={`${window.location.origin}?ref=${profile.affiliate_code}`}
                readOnly
                className="text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyAffiliateLink()}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this link or add ?ref={profile.affiliate_code} to any template URL
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-2 bg-blue-100 rounded-full">
                <Eye className="h-6 w-6 text-blue-600" />
              </div>
              <div className="text-2xl font-bold">{stats.visits}</div>
              <div className="text-sm text-muted-foreground">Visits</div>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-2 bg-green-100 rounded-full">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <div className="text-2xl font-bold">{profile.referral_count || 0}</div>
              <div className="text-sm text-muted-foreground">Referrals</div>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-2 bg-purple-100 rounded-full">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <div className="text-2xl font-bold">{stats.conversionRate.toFixed(1)}%</div>
              <div className="text-sm text-muted-foreground">Conversion</div>
            </div>
            
            <div className="text-center">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-2 bg-yellow-100 rounded-full">
                <DollarSign className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="text-2xl font-bold">${(profile.total_earnings || 0).toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">Earned</div>
            </div>
          </div>

          {/* How it works */}
          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">How it works:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Share any checklist template with your affiliate code</li>
              <li>• When someone signs up through your link, you earn $5</li>
              <li>• Track your progress with real-time analytics</li>
              <li>• Earnings are tracked automatically</li>
            </ul>
          </div>

          {profile.referral_count > 0 && (
            <Badge variant="secondary" className="w-fit">
              🎉 You've referred {profile.referral_count} user{profile.referral_count !== 1 ? 's' : ''}!
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
};