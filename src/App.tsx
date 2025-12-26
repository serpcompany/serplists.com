
import React from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider, useAuth } from "./contexts/CloudflareAuthContext";
import { TemplatesProvider } from "./contexts/TemplatesContext";
import { Layout } from "./components/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DevLoginBar } from "./components/DevLoginBar";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Templates from "./pages/Templates";
import TemplateEditor from "./pages/TemplateEditor";
import ChecklistRun from "./pages/ChecklistRun";
import Pages from "./pages/Pages";
import PublicPost from "./pages/PublicPost";
import PublicTemplate from "./pages/PublicTemplate";
import ChecklistLibrary from "./pages/ChecklistLibrary";
import Categories from "./pages/Categories";
import Account from "./pages/Account";
import UserProfile from "./pages/UserProfile";
import { useAffiliateTracking } from "./hooks/useAffiliateTracking";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      retry: 1,
    },
  },
});

const AppWithTracking = () => {
  useAffiliateTracking(); // Track referral visits
  return null;
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <ErrorBoundary>
          <TooltipProvider>
            <AuthProvider>
              <TemplatesProvider>
                <Router>
                  <AppWithTracking />
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Layout><Index /></Layout>} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* Public Content Routes */}
            <Route 
              path="/pages/:slug"
              element={
                <Layout>
                  <PublicPost />
                </Layout>
              } 
            />
            <Route 
              path="/checklists/:slug" 
              element={
                <Layout>
                  <PublicTemplate />
                </Layout>
              } 
            />
            <Route 
              path="/checklists" 
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
              path="/checklists/category/:category" 
              element={
                <Layout>
                  <ChecklistLibrary />
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

            {/* Private Routes */}
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </PrivateRoute>
              }
            />
            <Route
              path="/templates"
              element={
                <PrivateRoute>
                  <Layout>
                    <Templates />
                  </Layout>
                </PrivateRoute>
              }
            />
            <Route
              path="/templates/new"
              element={
                <PrivateRoute>
                  <Layout>
                    <TemplateEditor />
                  </Layout>
                </PrivateRoute>
              }
            />
            <Route
              path="/templates/:id"
              element={
                <PrivateRoute>
                  <Layout>
                    <TemplateEditor />
                  </Layout>
                </PrivateRoute>
              }
            />
            <Route
              path="/templates/:id/edit"
              element={
                <PrivateRoute>
                  <Layout>
                    <TemplateEditor />
                  </Layout>
                </PrivateRoute>
              }
            />
            <Route
              path="/run/:id"
              element={
                <PrivateRoute>
                  <Layout>
                    <ChecklistRun />
                  </Layout>
                </PrivateRoute>
              }
            />
            <Route
              path="/pages"
              element={
                <PrivateRoute>
                  <Layout>
                    <Pages />
                  </Layout>
                </PrivateRoute>
              }
            />
            <Route
              path="/account"
              element={
                <PrivateRoute>
                  <Layout>
                    <Account />
                  </Layout>
                </PrivateRoute>
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

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

export default App;
