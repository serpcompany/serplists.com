import { Suspense, type ComponentType, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import DashboardPage from '@/app/(app)/dashboard/page';
import RunPage from '@/app/(app)/dashboard/runs/[id]/page';
import TemplatePage from '@/app/(app)/dashboard/templates/[id]/page';
import TemplatesPage from '@/app/(app)/dashboard/templates/page';
import AboutPage from '@/app/(site)/about/page';
import ContactPage from '@/app/(site)/contact/page';
import FeaturesPage from '@/app/(site)/features/page';
import ForgotPasswordPage from '@/app/(site)/forgot-password/page';
import LoginPage from '@/app/(site)/login/page';
import PricingPage from '@/app/(site)/pricing/page';
import ProfilesPage, { metadata as profilesMetadata } from '@/app/(site)/profiles/page';
import RegisterPage from '@/app/(site)/register/page';
import ResetPasswordPage from '@/app/(site)/reset-password/page';
import TeamInvitePage from '@/app/(site)/team-invites/[token]/page';
import { JsonLd } from '@/components/seo/JsonLd';
import About from '@/views/About';
import ChecklistRun from '@/views/ChecklistRun';
import Contact from '@/views/Contact';
import DashboardHome from '@/views/DashboardHome';
import Features from '@/views/Features';
import ForgotPassword from '@/views/ForgotPassword';
import Login from '@/views/Login';
import Pricing from '@/views/Pricing';
import ProfilesDirectory, { ProfilesDirectoryFallback } from '@/views/ProfilesDirectory';
import Register from '@/views/Register';
import ResetPassword from '@/views/ResetPassword';
import TeamInviteAccept from '@/views/TeamInviteAccept';
import TemplateDetail from '@/views/TemplateDetail';
import Templates from '@/views/Templates';

import { findElementOf, isElement } from '../../support/elementTree';

const directViews: [string, () => ReactElement, ComponentType][] = [
  ['/dashboard/', DashboardPage, DashboardHome],
  ['/dashboard/runs/[id]/', RunPage, ChecklistRun],
  ['/dashboard/templates/[id]/', TemplatePage, TemplateDetail],
  ['/dashboard/templates/', TemplatesPage, Templates],
  ['/about/', AboutPage, About],
  ['/contact/', ContactPage, Contact],
  ['/features/', FeaturesPage, Features],
  ['/forgot-password/', ForgotPasswordPage, ForgotPassword],
  ['/pricing/', PricingPage, Pricing],
  ['/team-invites/[token]/', TeamInvitePage, TeamInviteAccept],
];

const viewsThatReadTheQuery: [string, () => ReactElement, ComponentType][] = [
  ['/login/', LoginPage, Login],
  ['/register/', RegisterPage, Register],
  ['/reset-password/', ResetPasswordPage, ResetPassword],
];

describe('the route pages', () => {
  it.each(directViews)('%s renders its view', (_path, Page, View) => {
    const element = Page();

    expect(element.type).toBe(View);
  });

  it.each(viewsThatReadTheQuery)('%s renders its view inside a Suspense boundary, as reading the query string needs', (_path, Page, View) => {
    const element = Page();

    expect(element.type).toBe(Suspense);
    expect(findElementOf(element, View)).not.toBeNull();
  });

  it('/profiles/ renders the directory with its JSON-LD, and the directory fallback while it loads', () => {
    const element = ProfilesPage();
    const jsonLd = findElementOf(element, JsonLd);
    const boundary = findElementOf(element, Suspense);

    expect(JSON.stringify(jsonLd?.props.data)).toContain('/profiles/');
    expect(JSON.stringify(jsonLd?.props.data)).toContain('Profiles');
    expect(findElementOf(boundary, ProfilesDirectory)).not.toBeNull();
    const fallback = boundary?.props.fallback;
    expect(isElement(fallback) && fallback.type === ProfilesDirectoryFallback).toBe(true);
    expect(profilesMetadata.alternates?.canonical).toContain('/profiles/');
  });
});
