
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
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Templates from "./pages/Templates";
import TemplateEditor from "./pages/TemplateEditor";
import ChecklistRun from "./pages/ChecklistRun";
import PublicTemplate from "./pages/PublicTemplate";
import ChecklistLibrary from "./pages/ChecklistLibrary";
import Categories from "./pages/Categories";
import Account from "./pages/Account";
import UserProfile from "./pages/UserProfile";
import Recipes from "./pages/Recipes";
import Features from "./pages/Features";
import Pricing from "./pages/Pricing";
import About from "./pages/About";
import Contact from "./pages/Contact";

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
            <Route path="/" element={<Layout><Index /></Layout>} />
            <Route path="/features" element={<Layout><Features /></Layout>} />
            <Route path="/pricing" element={<Layout><Pricing /></Layout>} />
            <Route path="/about" element={<Layout><About /></Layout>} />
            <Route path="/contact" element={<Layout><Contact /></Layout>} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            
            {/* Public Content Routes */}
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
              path="/recipes" 
              element={
                <Layout>
                  <Recipes />
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
              path="/run/shared/:shareToken"
              element={
                <Layout>
                  <ChecklistRun />
                </Layout>
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
