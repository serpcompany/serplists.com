'use client';

import { Mail, MessageCircle } from 'lucide-react';

import { PageSection, Surface } from '@/components/layout/page-shell';
import { PageHero } from '@/components/layout/PageHero';
import { IconTile } from '@/components/layout/IconTile';
import { buttonVariants } from '@/components/ui/button';
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
              <IconTile>
                <Mail className="h-6 w-6" />
              </IconTile>
              <div className="space-y-2">
                <CardTitle>Email support</CardTitle>
                <CardDescription>
                  Send details about your issue, plus the account email if
                  relevant.
                </CardDescription>
              </div>
              <div className="pt-2">
                <a
                  href="mailto:support@serplists.com"
                  className={buttonVariants()}
                >support@serplists.com</a>
              </div>
            </CardHeader>
          </Surface>

          <Surface as="article" tone="docs">
            <CardHeader className="space-y-4">
              <IconTile>
                <MessageCircle className="h-6 w-6" />
              </IconTile>
              <div className="space-y-2">
                <CardTitle>Product feedback</CardTitle>
                <CardDescription>
                  Tell us what would make SERP Lists more useful for your
                  workflow.
                </CardDescription>
              </div>
              <div className="pt-2">
                <a
                  href="mailto:support@serplists.com?subject=SERP%20Lists%20feedback"
                  className={buttonVariants({ variant: 'outline' })}
                >
                    Share feedback
                  </a>
              </div>
            </CardHeader>
          </Surface>
        </div>
      </PageSection>
    </>
  );
};

export default Contact;
