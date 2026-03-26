import {
  BrowserRouter as Router,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './contexts/CloudflareAuthContext';
import { TemplatesProvider } from './contexts/TemplatesContext';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DevLoginBar } from './components/DevLoginBar';
import RequireAuth from '@/components/RequireAuth';
import Index from './pages/Index';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Templates from './pages/Templates';
import TemplateEditor from './pages/TemplateEditor';
import TemplateDetail from './pages/TemplateDetail';
import ChecklistRun from './pages/ChecklistRun';
import PublicTemplate from './pages/PublicTemplate';
import ChecklistLibrary from './pages/ChecklistLibrary';
import Categories from './pages/Categories';
import Account from './pages/Account';
import UserProfile from './pages/UserProfile';
import Features from './pages/Features';
import Pricing from './pages/Pricing';
import About from './pages/About';
import Contact from './pages/Contact';
import NotFound from './pages/NotFound';
import {
  LEGACY_CONSOLE_HOME_PATH,
  LEGACY_PUBLIC_TEMPLATES_PATH,
  buildConsoleHomePath,
  buildConsoleRunsPath,
  buildConsoleTemplateCreatePath,
  buildConsoleTemplatesPath,
  buildPublicTemplatesPath,
} from './lib/routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      retry: 1,
    },
  },
});

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <ErrorBoundary>
          <TooltipProvider>
            <AuthProvider>
              <TemplatesProvider>
                <Router>
                  <Routes>
                    {/* Public Routes */}
                    <Route
                      path="/"
                      element={
                        <Layout>
                          <Index />
                        </Layout>
                      }
                    />
                    <Route
                      path="/features"
                      element={
                        <Layout>
                          <Features />
                        </Layout>
                      }
                    />
                    <Route
                      path="/features/:featureSlug"
                      element={
                        <Layout>
                          <Features />
                        </Layout>
                      }
                    />
                    <Route
                      path="/pricing"
                      element={
                        <Layout>
                          <Pricing />
                        </Layout>
                      }
                    />
                    <Route
                      path="/about"
                      element={
                        <Layout>
                          <About />
                        </Layout>
                      }
                    />
                    <Route
                      path="/contact"
                      element={
                        <Layout>
                          <Contact />
                        </Layout>
                      }
                    />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route
                      path="/forgot-password"
                      element={<ForgotPassword />}
                    />
                    <Route path="/reset-password" element={<ResetPassword />} />

                    {/* Canonical Public Content Routes */}
                    <Route
                      path={LEGACY_PUBLIC_TEMPLATES_PATH}
                      element={
                        <Navigate replace to={buildPublicTemplatesPath()} />
                      }
                    />
                    <Route
                      path={buildPublicTemplatesPath()}
                      element={
                        <Layout>
                          <ChecklistLibrary />
                        </Layout>
                      }
                    />
                    <Route
                      path="/categories"
                      element={
                        <Layout>
                          <Categories />
                        </Layout>
                      }
                    />
                    <Route
                      path="/categories/:categorySlug"
                      element={
                        <Layout>
                          <ChecklistLibrary />
                        </Layout>
                      }
                    />
                    <Route
                      path="/share/:shareToken"
                      element={
                        <Layout>
                          <ChecklistRun />
                        </Layout>
                      }
                    />
                    <Route
                      path="/profile/:username/:templateSlug"
                      element={
                        <Layout>
                          <PublicTemplate />
                        </Layout>
                      }
                    />
                    <Route
                      path="/profile/:username"
                      element={
                        <Layout>
                          <UserProfile />
                        </Layout>
                      }
                    />

                    {/* Canonical Private Routes */}
                    <Route
                      path={LEGACY_CONSOLE_HOME_PATH}
                      element={<Navigate replace to={buildConsoleHomePath()} />}
                    />
                    <Route
                      path={buildConsoleHomePath()}
                      element={
                        <RequireAuth>
                          <Layout>
                            <Dashboard />
                          </Layout>
                        </RequireAuth>
                      }
                    />
                    <Route
                      path={buildConsoleRunsPath()}
                      element={
                        <RequireAuth>
                          <Layout>
                            <Dashboard />
                          </Layout>
                        </RequireAuth>
                      }
                    />
                    <Route
                      path={buildConsoleTemplatesPath()}
                      element={
                        <RequireAuth>
                          <Layout>
                            <Templates />
                          </Layout>
                        </RequireAuth>
                      }
                    />
                    <Route
                      path={buildConsoleTemplateCreatePath()}
                      element={
                        <RequireAuth>
                          <TemplateEditor />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/dashboard/templates/:id"
                      element={
                        <RequireAuth>
                          <Layout>
                            <TemplateDetail />
                          </Layout>
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/dashboard/templates/:id/edit"
                      element={
                        <RequireAuth>
                          <TemplateEditor />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/dashboard/runs/:id"
                      element={
                        <RequireAuth>
                          <Layout>
                            <ChecklistRun />
                          </Layout>
                        </RequireAuth>
                      }
                    />

                    {/* Legacy Private Route Aliases */}
                    <Route
                      path="/console/templates/:id"
                      element={
                        <RequireAuth>
                          <Layout>
                            <TemplateDetail />
                          </Layout>
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/console/templates/:id/edit"
                      element={
                        <RequireAuth>
                          <TemplateEditor />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/console/runs/:id"
                      element={
                        <RequireAuth>
                          <Layout>
                            <ChecklistRun />
                          </Layout>
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/account"
                      element={
                        <RequireAuth>
                          <Layout>
                            <Account />
                          </Layout>
                        </RequireAuth>
                      }
                    />
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
            </AuthProvider>
          </TooltipProvider>
        </ErrorBoundary>
      </HelmetProvider>
    </QueryClientProvider>
  );
};

export default App;
