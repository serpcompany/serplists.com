import {
  BrowserRouter as Router,
  Route,
  Routes,
} from 'react-router-dom';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentHeadProvider } from '@/components/shared/DocumentHeadProvider';
import { AuthProvider } from './contexts/CloudflareAuthContext';
import { TemplatesProvider } from './contexts/TemplatesContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DevLoginBar } from './components/DevLoginBar';
import RequireAuth from '@/components/RequireAuth';
import { LegacyRedirect } from '@/components/LegacyRedirect';
import Index from './pages/Index';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Templates from './pages/Templates';
import TemplateImportExport from './pages/TemplateImportExport';
import DashboardSettings from './pages/DashboardSettings';
import TemplateEditor from './pages/TemplateEditor';
import TemplateDetail from './pages/TemplateDetail';
import ChecklistRun from './pages/ChecklistRun';
import PublicTemplate from './pages/PublicTemplate';
import ChecklistLibrary from './pages/ChecklistLibrary';
import Categories from './pages/Categories';
import CategoryDetail from './pages/CategoryDetail';
import TeamInviteAccept from './pages/TeamInviteAccept';
import UserProfile from './pages/UserProfile';
import Features from './pages/Features';
import Pricing from './pages/Pricing';
import About from './pages/About';
import Contact from './pages/Contact';
import NotFound from './pages/NotFound';
import {
  LEGACY_CONSOLE_HOME_PATH,
  LEGACY_ACCOUNT_PATH,
  LEGACY_CONSOLE_PROFILE_PATH,
  LEGACY_PUBLIC_LIBRARY_PATH,
  buildConsoleHomePath,
  buildConsoleRunsPath,
  buildConsoleSettingsPath,
  buildConsoleTemplateCreatePath,
  buildConsoleTemplateImportPath,
  buildConsoleTemplatesPath,
  buildPublicTemplatesPath,
} from './lib/routes';
import { applyStoredTheme, subscribeToThemeChanges } from './lib/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      retry: 1,
    },
  },
});

// Applies the stored theme, and a theme chosen in another tab, on every route, including
// those with no theme toggle.
const RootThemeSync = () => {
  useEffect(() => {
    applyStoredTheme();
    return subscribeToThemeChanges(() => undefined);
  }, []);

  return null;
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <DocumentHeadProvider>
        <ErrorBoundary>
          <TooltipProvider>
            <AuthProvider>
              <WorkspaceProvider>
                <TemplatesProvider>
                  <RootThemeSync />
                  <Router
                    future={{
                      v7_relativeSplatPath: true,
                    }}
                  >
                  <Routes>
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
                      element={<ChecklistRun />}
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
                        element={<CategoryDetail />}
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
                        path={buildConsoleTemplatesPath()}
                        element={<Templates />}
                      />
                      <Route
                        path={buildConsoleTemplateImportPath()}
                        element={<TemplateImportExport />}
                      />
                      <Route
                        path={buildConsoleTemplateCreatePath()}
                        element={<TemplateEditor />}
                      />
                      <Route
                        path="/dashboard/templates/:id"
                        element={<TemplateDetail />}
                      />
                      <Route
                        path="/dashboard/templates/:id/edit"
                        element={<TemplateEditor />}
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
                        element={<TemplateEditor />}
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
                  </Routes>
                  <DevLoginBar />
                  <Toaster />
                  </Router>
                </TemplatesProvider>
              </WorkspaceProvider>
            </AuthProvider>
          </TooltipProvider>
        </ErrorBoundary>
      </DocumentHeadProvider>
    </QueryClientProvider>
  );
};

export default App;
