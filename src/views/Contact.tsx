'use client';

import { Mail, MessageCircle } from 'lucide-react';

import {
  IconBadge,
  PageHero,
  PageSection,
  Surface,
} from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const Contact = () => {
  return (
    <>
      <PageSection spacing="hero">
        <PageHero
          align="center"
          eyebrow="Contact"
          description="Questions, feedback, or support requests? Reach out and we will respond as soon as possible."
          title="Talk to the team behind SERP Lists."
        />
      </PageSection>

      <PageSection className="pt-0" spacing="spacious">
        <div className="grid gap-6 md:grid-cols-2">
          <Surface as="article" tone="docs">
            <CardHeader className="space-y-4">
              <IconBadge>
                <Mail className="h-6 w-6" />
              </IconBadge>
              <div className="space-y-2">
                <CardTitle>Email support</CardTitle>
                <CardDescription>
                  Send details about your issue, plus the account email if
                  relevant.
                </CardDescription>
              </div>
              <div className="pt-2">
                <Button asChild>
                  <a href="mailto:support@serplists.com">support@serplists.com</a>
                </Button>
              </div>
            </CardHeader>
          </Surface>

          <Surface as="article" tone="docs">
            <CardHeader className="space-y-4">
              <IconBadge>
                <MessageCircle className="h-6 w-6" />
              </IconBadge>
              <div className="space-y-2">
                <CardTitle>Product feedback</CardTitle>
                <CardDescription>
                  Tell us what would make SERP Lists more useful for your
                  workflow.
                </CardDescription>
              </div>
              <div className="pt-2">
                <Button asChild variant="outline">
                  <a href="mailto:support@serplists.com?subject=SERP%20Lists%20feedback">
                    Share feedback
                  </a>
                </Button>
              </div>
            </CardHeader>
          </Surface>
        </div>
      </PageSection>
    </>
  );
};

export default Contact;
