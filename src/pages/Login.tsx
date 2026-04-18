import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-foreground">
            <CheckCircle2 className="h-6 w-6 text-background" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your account to continue
          </p>
        </div>

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
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
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

          <div className="flex items-center gap-2">
            <Checkbox
              id="remember"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(Boolean(checked))}
              disabled={isSubmitting || isLoading}
            />
            <Label
              htmlFor="remember"
              className="text-sm font-normal text-muted-foreground"
            >
              Remember me for 30 days
            </Label>
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

        <div className="my-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or continue with</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="outline">
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google
          </Button>
          <Button type="button" variant="outline">
            <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            GitHub
          </Button>
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            to="/register"
            className="font-medium text-foreground hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
