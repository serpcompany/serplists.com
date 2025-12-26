import { useEffect } from 'react';
// Supabase removed - using Cloudflare API

export const useAffiliateTracking = () => {
  useEffect(() => {
    const trackReferralVisit = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const refCode = urlParams.get('ref');
      
      if (refCode) {
        // Store referral code in sessionStorage for later use
        sessionStorage.setItem('referral_code', refCode);
        
        try {
          // TODO: Replace with Cloudflare API call
          // Get referrer info
          // const { data: referrer } = await api.getReferrerByCode(refCode);
          // if (referrer) {
          //   await api.trackReferralVisit({
          //     referral_code: refCode,
          //     referrer_id: referrer.id,
          //     user_agent: navigator.userAgent,
          //     template_id: extractTemplateIdFromUrl()
          //   });
          // }
          console.log('Affiliate tracking disabled - needs Cloudflare API implementation');
        } catch (error) {
          console.error('Error tracking referral visit:', error);
        }
      }
    };

    const extractTemplateIdFromUrl = () => {
      // Extract template ID from current URL if on a template page
      const path = window.location.pathname;
      const templateMatch = path.match(/\/template\/([^/]+)/);
      return templateMatch ? templateMatch[1] : null;
    };

    trackReferralVisit();
  }, []);

  const generateShareUrl = (templateId: string, affiliateCode: string, baseUrl?: string) => {
    const base = baseUrl || window.location.origin;
    return `${base}/template/${templateId}?ref=${affiliateCode}`;
  };

  const trackConversion = async (newUserId: string) => {
    const referralCode = sessionStorage.getItem('referral_code');
    
    if (referralCode) {
      try {
        // TODO: Replace with Cloudflare API call
        // const { data: referrer } = await api.getReferrerByCode(referralCode);
        // if (referrer) {
        //   await api.createReferral({
        //     referrer_id: referrer.id,
        //     referred_user_id: newUserId,
        //     referral_code: referralCode,
        //     reward_amount: 5.00
        //   });
        //   await api.markVisitAsConverted(referralCode, newUserId);
        // }
        // Clear the referral code from storage
        sessionStorage.removeItem('referral_code');
        console.log('Conversion tracking disabled - needs Cloudflare API implementation');
      } catch (error) {
        console.error('Error tracking conversion:', error);
      }
    }
  };

  return {
    generateShareUrl,
    trackConversion
  };
};