import { Route, createRoutesFromElements } from 'react-router-dom';
import { AppShell, RethrowRouteError } from './components/AppShell';
import { Layout } from './components/Layout';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import RequireAuth from '@/components/RequireAuth';
import { LegacyRedirect } from '@/components/LegacyRedirect';
import Index from './views/Index';
import Login from './views/Login';
import Register from './views/Register';
import ForgotPassword from './views/ForgotPassword';
import ResetPassword from './views/ResetPassword';
import Dashboard from './views/Dashboard';
import Archive from './views/Archive';
import Templates from './views/Templates';
import TemplateImportExport from './views/TemplateImportExport';
import DashboardSettings from './views/DashboardSettings';
import TemplateEditorRoute from './views/TemplateEditorRoute';
import TemplateDetail from './views/TemplateDetail';
import ChecklistRun from './views/ChecklistRun';
import PublicTemplate from './views/PublicTemplate';
import ChecklistLibrary from './views/ChecklistLibrary';
import Categories from './views/Categories';
import CategoryDetailRoute from './views/CategoryDetailRoute';
import TeamInviteAccept from './views/TeamInviteAccept';
import UserProfile from './views/UserProfile';
import Features from './views/Features';
import Pricing from './views/Pricing';
import About from './views/About';
import Contact from './views/Contact';
import NotFound from './views/NotFound';
import {
  LEGACY_CONSOLE_HOME_PATH,
  LEGACY_ACCOUNT_PATH,
  LEGACY_CONSOLE_PROFILE_PATH,
  LEGACY_PUBLIC_LIBRARY_PATH,
  buildConsoleArchivePath,
  buildConsoleHomePath,
  buildConsoleRunsPath,
  buildConsoleSettingsPath,
  buildConsoleTemplateCreatePath,
  buildConsoleTemplateImportPath,
  buildConsoleTemplatesPath,
  buildPublicTemplatesPath,
} from './lib/routes';

// Rendered by a data router (see App.tsx) so pages can block navigation with
// useBlocker while they hold unsaved changes.
export const appRoutes = createRoutesFromElements(
  <Route element={<AppShell />} errorElement={<RethrowRouteError />}>
    {/* Public Routes */}

    {/* Canonical Public Content Routes */}
    <Route
      path={LEGACY_PUBLIC_LIBRARY_PATH}
      element={
        <LegacyRedirect to={buildPublicTemplatesPath()} />
      }
    />
    <Route
      path="/share/:shareToken"
      element={<RouteErrorBoundary><ChecklistRun /></RouteErrorBoundary>}
    />
    {/* Canonical Private Routes */}
    <Route
      path={LEGACY_CONSOLE_HOME_PATH}
      element={<LegacyRedirect to={buildConsoleHomePath()} />}
    />
    <Route
      path={buildConsoleHomePath()}
      element={
        <RequireAuth>
          <LegacyRedirect to={buildConsoleTemplatesPath()} />
        </RequireAuth>
      }
    />
    <Route element={<Layout />}>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/forgot-password"
        element={<ForgotPassword />}
      />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/"
        element={<Index />}
      />
      <Route
        path="/features"
        element={<Features />}
      />
      <Route
        path="/features/:featureSlug"
        element={<Features />}
      />
      <Route
        path="/pricing"
        element={<Pricing />}
      />
      <Route
        path="/about"
        element={<About />}
      />
      <Route
        path="/contact"
        element={<Contact />}
      />
      <Route
        path="/team-invites/:token"
        element={<TeamInviteAccept />}
      />
      <Route
        path={buildPublicTemplatesPath()}
        element={<ChecklistLibrary />}
      />
      <Route
        path="/categories"
        element={<Categories />}
      />
      <Route
        path="/categories/:categorySlug"
        element={<CategoryDetailRoute />}
      />
      <Route
        path="/profile/:username/:templateSlug"
        element={<PublicTemplate />}
      />
      <Route
        path="/profile/:username"
        element={<UserProfile />}
      />
    </Route>

    <Route
      element={
        <RequireAuth>
          <Layout />
        </RequireAuth>
      }
    >
      <Route
        path={buildConsoleRunsPath()}
        element={<Dashboard />}
      />
      <Route
        path={buildConsoleSettingsPath()}
        element={<DashboardSettings />}
      />
      <Route
        path={buildConsoleArchivePath()}
        element={<Archive />}
      />
      <Route
        path={buildConsoleTemplatesPath()}
        element={<Templates />}
      />
      <Route
        path={buildConsoleTemplateImportPath()}
        element={<TemplateImportExport />}
      />
      <Route
        path={buildConsoleTemplateCreatePath()}
        element={<TemplateEditorRoute />}
      />
      <Route
        path="/dashboard/templates/:id"
        element={<TemplateDetail />}
      />
      <Route
        path="/dashboard/templates/:id/edit"
        element={<TemplateEditorRoute />}
      />
      <Route
        path="/dashboard/runs/:id"
        element={<ChecklistRun />}
      />
      <Route
        path="/run/:id"
        element={<ChecklistRun />}
      />

      {/* Legacy Private Route Aliases */}
      <Route
        path="/console/templates/:id"
        element={<TemplateDetail />}
      />
      <Route
        path="/console/templates/:id/edit"
        element={<TemplateEditorRoute />}
      />
      <Route
        path="/console/runs/:id"
        element={<ChecklistRun />}
      />
      <Route
        path={LEGACY_CONSOLE_PROFILE_PATH}
        element={<LegacyRedirect to={buildConsoleSettingsPath()} />}
      />
      <Route
        path={LEGACY_ACCOUNT_PATH}
        element={<LegacyRedirect to={buildConsoleSettingsPath()} />}
      />
    </Route>
    <Route
      path="*"
      element={
        <Layout>
          <NotFound />
        </Layout>
      }
    />
  </Route>,
);
