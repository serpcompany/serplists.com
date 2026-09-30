'use client';

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Lock, Mail, MailWarning } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/CloudflareAuthContext";
import { needsFullPageLoad } from "@/lib/analyticsUrl";
import { authClient, getAuthStatus } from "@/lib/auth-client";
import {
  buildKeptLoginState,
  peekHandedOffLoginEmail,
  readKeptLoginEmail,
  readLoginPrefill,
  takeHandedOffLoginEmail,
} from "@/lib/auth/loginPrefill";
import { getAuthErrorMessage } from "@/lib/auth/authErrors";
import {
  DEV_TEST_USER_DEFAULT_PASSWORD,
  DEV_TEST_USER_PASSWORD_RESET_COMMAND,
} from "@/lib/auth/devUsers";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  buildEmailVerifiedCallbackURL,
  getLoginNotice,
  stripLoginNoticeParams,
} from "@/lib/auth/loginNotice";
import {
  getPostSignInDestination,
  getReturnPath,
  toSameOriginPath,
  withReturnPath,
} from "@/lib/auth/returnPath";
import { replaceCurrentUrl } from "@/lib/navigation/replaceCurrentUrl";
import { useAppRouter } from "@/lib/navigation/useAppRouter";
import { buildForgotPasswordPath, buildRegisterPath } from "@/lib/routes";

import { Link } from '@/components/navigation/Link';

// The seeded personas the form can fill in, outside production.
const DEV_PERSONAS = [
  { email: "checklists@serp.co", label: "Fill SERP" },
  { email: "admin@test.com", label: "Fill Admin" },
  { email: "john@test.com", label: "Fill John" },
  { email: "jane@test.com", label: "Fill Jane" },
  { email: "bob@test.com", label: "Fill Bob" },
];

function getVerificationFailure(search: string): string | null {
  const notice = getLoginNotice(search);
  return notice?.kind === "verification_failed" ? notice.message : null;
}

// The address to fill in (readLoginPrefill), from the live URL and this entry's state. It is
// read, not taken, so rendering can read it: the effect below takes the handed-over address
// and keeps it in this entry's state, so the value stays the same.
const readPrefillEmail = (): string | null =>
  readLoginPrefill(
    window.location.search,
    peekHandedOffLoginEmail() ?? readKeptLoginEmail(window.history.state),
  ).email;
const subscribeToHistory = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  // Read from the URL during the first render so the resend option shows
  // immediately; it stays after the one-shot params are removed.
  const failureInUrl = getVerificationFailure(search);
  const [verificationFailure, setVerificationFailure] = useState<string | null>(failureInUrl);
  // A failed link opened later (the query changed) shows its resend option too.
  const [seenFailure, setSeenFailure] = useState(failureInUrl);
  if (seenFailure !== failureInUrl) {
    setSeenFailure(failureInUrl);
    if (failureInUrl) setVerificationFailure(failureInUrl);
  }
  // Fills the form when an address arrives: the server has no URL state or storage, so it
  // and hydration render an empty field.
  const prefillEmail = useSyncExternalStore(subscribeToHistory, readPrefillEmail, () => null);
  const [filledEmail, setFilledEmail] = useState<string | null>(null);
  if (filledEmail !== prefillEmail) {
    setFilledEmail(prefillEmail);
    if (prefillEmail) {
      setEmail(prefillEmail);
      setUnverifiedEmail(prefillEmail);
    }
  }
  // Where the user was headed (with its query and hash): the `next` parameter, which
  // also survives the email verification link. With none, the console home.
  const returnPath = getReturnPath(searchParams);
  const from = getPostSignInDestination(returnPath);
  const showResendVerification = Boolean(unverifiedEmail || verificationFailure);

  // Runs again whenever the query changes; `search` is only its trigger, the effect reads
  // the live URL and this entry's state.
  useEffect(() => {
    const currentSearch = window.location.search;
    const prefill = readLoginPrefill(
      currentSearch,
      takeHandedOffLoginEmail() ?? readKeptLoginEmail(window.history.state),
    );
    const notice = getLoginNotice(currentSearch);

    // Stable ids keep a StrictMode double effect from stacking duplicate toasts.
    if (notice?.kind === "verification_failed") {
      toast.error(notice.message, { id: "email-verification-failed" });
    } else if (notice?.kind === "verified") {
      toast.success(notice.message, { id: "email-verified" });
    } else if (notice?.kind === "verify_email") {
      toast.info(notice.message, { id: "verify-email-first" });
    }

    // Drop the one-shot params so a reload or back navigation does not replay the notice.
    // The address (from sign-up, or an old ?email= link, in any letter case) stays out of
    // the URL but moves into this entry's state, so a reload still fills the form. The
    // rerun that follows finds no params and changes nothing.
    const remainingSearch =
      stripLoginNoticeParams(prefill.searchWithoutEmail ?? currentSearch) ?? prefill.searchWithoutEmail;
    const keptState = prefill.email ? buildKeptLoginState(prefill.email) : null;
    const keepsEmail = prefill.email !== readKeptLoginEmail(window.history.state);
    if (remainingSearch !== null || keepsEmail) {
      replaceCurrentUrl(
        `${window.location.pathname}${remainingSearch ?? currentSearch}${window.location.hash}`,
        keptState,
      );
    }
  }, [search]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Returning to an invite link after sign-in: if analytics tags run in this document,
      // load the invite as a new page so they never see its token. The return path
      // keeps its query and hash, so check both parts. Only a path on this origin is
      // followed, never the raw value.
      const destination = toSameOriginPath(from, window.location.origin) ?? getPostSignInDestination(null);
      const target = new URL(destination, window.location.origin);
      if (needsFullPageLoad(target.pathname, target.search, window)) {
        window.location.replace(destination);
        return;
      }
      router.replace(destination);
    }
  }, [from, isAuthenticated, isLoading, router]);

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
        toast.error(getAuthErrorMessage(result.error, "Unable to resend verification email"));
        return;
      }

      toast.success("Verification email sent.");
    } catch (error) {
      toast.error(getAuthErrorMessage(error, "Unable to resend verification email"));
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
          <Link href={withReturnPath(buildRegisterPath(), returnPath)}>Sign up</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          {process.env.NODE_ENV !== "production" ? (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
              <div className="grid grid-cols-2 gap-2">
                {DEV_PERSONAS.map((persona) => (
                  <Button
                    key={persona.email}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEmail(persona.email);
                      setPassword(DEV_TEST_USER_DEFAULT_PASSWORD);
                    }}
                  >
                    {persona.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Default local seed password: <code>{DEV_TEST_USER_DEFAULT_PASSWORD}</code>. If you changed a persona password, run{" "}
                <code>{DEV_TEST_USER_PASSWORD_RESET_COMMAND}</code>.
              </p>
            </div>
          ) : null}

          {showResendVerification ? (
            <Alert role="status">
              <MailWarning />
              <AlertTitle>{verificationFailure ?? "Verify your email before signing in."}</AlertTitle>
            </Alert>
          ) : null}

          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting || isLoading}
              />
              <InputGroupAddon>
                <Mail />
              </InputGroupAddon>
            </InputGroup>
          </Field>

          <Field>
            <div className="flex items-center">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Link
                href={buildForgotPasswordPath()}
                className="ml-auto text-sm underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              icon={<Lock />}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isSubmitting || isLoading}
            />
          </Field>

          <Field>
            {showResendVerification ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleResendVerification}
                disabled={isResendingVerification}
              >
                {isResendingVerification ? (
                  <>
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                    Resending verification…
                  </>
                ) : (
                  "Resend verification email"
                )}
              </Button>
            ) : null}

            <Button type="submit" disabled={isSubmitting || isLoading}>
              {isSubmitting ? (
                <>
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </AuthPageShell>
  );
};

export default Login;
