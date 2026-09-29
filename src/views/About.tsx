'use client';

import { ShieldCheck, Target, Users } from 'lucide-react';

import {
  IconBadge,
  PageHero,
  PageSection,
  Surface,
} from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { Link } from '@/components/navigation/Link';

const VALUES = [
  {
    title: "Clarity",
    description: "Make every step explicit so teams run work the same way every time.",
    icon: Target,
  },
  {
    title: "Consistency",
    description: "Standardize repeatable processes without slowing down day-to-day work.",
    icon: ShieldCheck,
  },
  {
    title: "Community",
    description: "Share public checklists to help others move faster with proven workflows.",
    icon: Users,
  },
] as const;

const About = () => {
  return (
    <>
      <PageSection spacing="hero">
        <PageHero
          actions={
            <>
              <Button asChild>
                <Link href="/features">Explore Features</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/contact">Contact Us</Link>
              </Button>
            </>
          }
          align="center"
          eyebrow="About"
          description="SERP Lists helps teams and solo operators turn repeatable work into checklists that are easy to run, track, and share."
          title="Build repeatable work that feels easy to discover and execute."
        />
      </PageSection>

      <PageSection className="pt-0" spacing="spacious">
        <div className="grid gap-6 md:grid-cols-3">
          {VALUES.map((value) => {
            const Icon = value.icon;

            return (
              <Surface key={value.title} as="article" tone="docs">
                <CardHeader className="space-y-4">
                  <IconBadge>
                    <Icon className="h-6 w-6" />
                  </IconBadge>
                  <div className="space-y-2">
                    <CardTitle>{value.title}</CardTitle>
                    <CardDescription>{value.description}</CardDescription>
                  </div>
                </CardHeader>
              </Surface>
            );
          })}
        </div>
      </PageSection>
    </>
  );
};

export default About;
