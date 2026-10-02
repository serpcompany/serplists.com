'use client';

import { Mail, MessageCircle } from 'lucide-react';

import { CardGrid } from '@/components/layout/CardGrid';
import { ListCard } from '@/components/layout/ListCard';
import { PageSection } from '@/components/layout/page-shell';
import { PageHero } from '@/components/layout/PageHero';
import { buttonVariants } from '@/components/ui/button';

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

      <PageSection className="pt-0" spacing="spacious" width="narrow">
        <CardGrid columns={1}>
          <ListCard
            actions={
              <a href="mailto:support@serplists.com" className={buttonVariants()}>
                support@serplists.com
              </a>
            }
            description="Send details about your issue, plus the account email if relevant."
            icon={<Mail />}
            title="Email support"
            titleAs="h2"
          />
          <ListCard
            actions={
              <a
                href="mailto:support@serplists.com?subject=SERP%20Lists%20feedback"
                className={buttonVariants({ variant: 'outline' })}
              >
                Share feedback
              </a>
            }
            description="Tell us what would make SERP Lists more useful for your workflow."
            icon={<MessageCircle />}
            title="Product feedback"
            titleAs="h2"
          />
        </CardGrid>
      </PageSection>
    </>
  );
};

export default Contact;
