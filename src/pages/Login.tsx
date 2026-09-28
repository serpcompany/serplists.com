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
import { needsFullPageLoad } from "@/lib/analyticsUrl";
import { authClient, getAuthStatus } from "@/lib/auth-client";
import { readLoginPrefill } from "@/lib/auth/loginPrefill";
import {
  DEV_TEST_USER_DEFAULT_PASSWORD,
  DEV_TEST_USER_PASSWORD_RESET_COMMAND,
} from "@/lib/auth/devUsers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import {
  buildEmailVerifiedCallbackURL,
  getLoginNotice,
  stripLoginNoticeParams,
} from "@/lib/auth/loginNotice";
import { buildAuthLinkState, getReturnPath, withReturnPath } from "@/lib/auth/returnPath";
import { buildConsoleSettingsPath } from "@/lib/routes";

function getVerificationFailure(search: string): string | null {
  const notice = getLoginNotice(search);
  return notice?.kind === "verification_failed" ? notice.message : null;
}

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
  // Read from the URL during the first render so the resend option shows
  // immediately; it stays after the one-shot params are removed.
  const [verificationFailure, setVerificationFailure] = useState<string | null>(() =>
    getVerificationFailure(location.search),
  );
  // Where the user was headed (with its query and hash), from router state or
  // the `next` parameter that survives the email verification link.
  const returnPath = getReturnPath(location);
  const from = returnPath ?? buildConsoleSettingsPath();
  const showResendVerification = Boolean(unverifiedEmail || verificationFailure);

  useEffect(() => {
    const prefill = readLoginPrefill(location.search, location.state);
    const notice = getLoginNotice(location.search);

    if (prefill.email) {
      setEmail(prefill.email);
      setUnverifiedEmail(prefill.email);
    }

    // Stable ids keep a StrictMode double effect from stacking duplicate toasts.
    if (notice?.kind === "verification_failed") {
      setVerificationFailure(notice.message);
      toast.error(notice.message, { id: "email-verification-failed" });
    } else if (notice?.kind === "verified") {
      toast.success(notice.message, { id: "email-verified" });
    } else if (notice?.kind === "verify_email") {
      toast.info(notice.message, { id: "verify-email-first" });
    }

    // Drop the one-shot params so a reload or back navigation does not replay
    // the notice. An email address from an old ?email= link moves into router
    // state so it leaves the URL (in any letter case) but still prefills the form.
    // The rerun that follows finds no params and does nothing.
    const remainingSearch =
      stripLoginNoticeParams(prefill.searchWithoutEmail ?? location.search) ?? prefill.searchWithoutEmail;
    if (remainingSearch !== null) {
      const state = typeof location.state === "object" && location.state !== null ? location.state : {};
      navigate(
        { pathname: location.pathname, search: remainingSearch, hash: location.hash },
        { replace: true, state: prefill.email ? { ...state, email: prefill.email } : location.state },
      );
    }
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Returning to an invite link after sign-in: if analytics tags run in this document,
      // load the invite as a new page so they never see its token. The return path
      // keeps its query and hash, so check both parts.
      const target = new URL(from, window.location.origin);
      if (needsFullPageLoad(target.pathname, target.search, window)) {
        window.location.replace(from);
        return;
      }
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
        callbackURL: buildEmailVerifiedCallbackURL(returnPath),
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
            to={withReturnPath("/register", returnPath)}
            state={buildAuthLinkState(returnPath)}
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

          {showResendVerification ? (
            <div
              role="status"
              className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"
            >
              {verificationFailure ?? "Verify your email before signing in."}
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
                aria-label={showPassword ? "Hide password" : "Show password"}
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {showResendVerification ? (
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
