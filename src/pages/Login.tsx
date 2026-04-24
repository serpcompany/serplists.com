import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/CloudflareAuthContext";
import { authClient, getAuthStatus } from "@/lib/auth-client";
import {
  DEV_TEST_USER_DEFAULT_PASSWORD,
  DEV_TEST_USER_PASSWORD_RESET_COMMAND,
} from "@/lib/auth/devUsers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthPageShell } from "@/components/auth/AuthPageShell";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/account";

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const prefilledEmail = searchParams.get("email");

    if (prefilledEmail) {
      setEmail(prefilledEmail);
      setUnverifiedEmail(prefilledEmail);
    }

    if (searchParams.get("verify_email") === "1") {
      toast.info("Verify your email first, then sign in.");
    }

    if (searchParams.get("verified") === "1") {
      toast.success("Email verified. You can sign in now.");
    }
  }, [location.search]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [from, isAuthenticated, isLoading, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await login(email, password);

      if (result.ok) {
        toast.success("Login successful");
        setUnverifiedEmail(null);
        return;
      }

      if (result.errorCode === "EMAIL_NOT_VERIFIED") {
        setUnverifiedEmail(email);
        toast.error("Email not verified. Check your inbox or resend verification.");
        return;
      }

      toast.error(result.error || "Invalid email or password");
    } catch (error) {
      toast.error("An error occurred during login");
      console.error("Login error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    const targetEmail = (unverifiedEmail || email).trim();
    if (!targetEmail) {
      toast.error("Enter your email first.");
      return;
    }

    setIsResendingVerification(true);

    try {
      const authStatus = await getAuthStatus();
      if (!authStatus.emailAuthAvailable) {
        toast.error("Verification email is temporarily unavailable. Please contact support.");
        return;
      }

      const result = await authClient.sendVerificationEmail({
        email: targetEmail,
        callbackURL: "/login?verified=1",
      });

      if (result?.error) {
        toast.error(result.error.message || "Unable to resend verification email");
        return;
      }

      toast.success("Verification email sent.");
    } catch (error) {
      toast.error("Unable to resend verification email");
      console.error("Resend verification error:", error);
    } finally {
      setIsResendingVerification(false);
    }
  };

  return (
    <AuthPageShell
      title="Welcome back"
      description="Sign in to your account to continue"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link
            to="/register"
            className="font-medium text-primary hover:underline"
          >
            Sign up
          </Link>
        </>
      }
    >
        <form onSubmit={handleSubmit} className="space-y-4">
          {import.meta.env.DEV ? (
            <div className="space-y-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmail("checklists@serp.co");
                    setPassword(DEV_TEST_USER_DEFAULT_PASSWORD);
                  }}
                  className="text-xs"
                >
                  <div className="mr-1 h-2 w-2 rounded-full bg-amber-500" />
                  Fill SERP
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmail("admin@test.com");
                    setPassword(DEV_TEST_USER_DEFAULT_PASSWORD);
                  }}
                  className="text-xs"
                >
                  <div className="mr-1 h-2 w-2 rounded-full bg-red-500" />
                  Fill Admin
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmail("john@test.com");
                    setPassword(DEV_TEST_USER_DEFAULT_PASSWORD);
                  }}
                  className="text-xs"
                >
                  <div className="mr-1 h-2 w-2 rounded-full bg-blue-500" />
                  Fill John
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmail("jane@test.com");
                    setPassword(DEV_TEST_USER_DEFAULT_PASSWORD);
                  }}
                  className="text-xs"
                >
                  <div className="mr-1 h-2 w-2 rounded-full bg-purple-500" />
                  Fill Jane
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmail("bob@test.com");
                    setPassword(DEV_TEST_USER_DEFAULT_PASSWORD);
                  }}
                  className="text-xs"
                >
                  <div className="mr-1 h-2 w-2 rounded-full bg-green-500" />
                  Fill Bob
                </Button>
              </div>
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                Default local seed password: <code>{DEV_TEST_USER_DEFAULT_PASSWORD}</code>. If you changed a persona password, run{" "}
                <code>{DEV_TEST_USER_PASSWORD_RESET_COMMAND}</code>.
              </p>
            </div>
          ) : null}

          {unverifiedEmail ? (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
              Verify your email before signing in.
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                required
                disabled={isSubmitting || isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                to="/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Forgot password?
              </Link>
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10"
                required
                disabled={isSubmitting || isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {unverifiedEmail ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleResendVerification}
              disabled={isResendingVerification}
              className="w-full"
            >
              {isResendingVerification ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resending verification…
                </>
              ) : (
                "Resend verification email"
              )}
            </Button>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting || isLoading}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
    </AuthPageShell>
  );
};

export default Login;
