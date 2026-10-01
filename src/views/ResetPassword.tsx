'use client';

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { validatePasswordPolicy } from "@/lib/auth/passwordPolicy";
import { readResetPasswordLink } from "@/lib/auth/resetPasswordLink";
import { submitPasswordReset } from "@/lib/auth/passwordReset";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { replaceCurrentUrl } from "@/lib/navigation/replaceCurrentUrl";
import { moveOnAfterAnAccountChange } from "@/lib/navigation/moveOnAfterAnAccountChange";
import { useAppRouter } from "@/lib/navigation/useAppRouter";
import { buildForgotPasswordPath, buildLoginPath } from "@/lib/routes";

import { Link } from '@/components/navigation/Link';

const removeResetTokenFromUrl = () => {
  const { searchWithoutToken } = readResetPasswordLink(window.location.search);
  if (searchWithoutToken !== null) {
    replaceCurrentUrl(`${window.location.pathname}${searchWithoutToken}${window.location.hash}`);
  }
};

const ResetPassword = () => {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const router = useAppRouter();
  const { isAuthenticated, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [{ token, error }] = useState(() => readResetPasswordLink(search));

  useEffect(() => {
    removeResetTokenFromUrl();
  }, [search]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!token) {
      toast.error("Reset token is missing or invalid.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    const policy = validatePasswordPolicy(password);
    if (!policy.ok) {
      toast.error(policy.message);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitPasswordReset({
        resetPassword: () => authClient.resetPassword({ newPassword: password, token }),
        signOutLocally: logout,
        isSignedIn: isAuthenticated,
      });
      if (!result.ok) {
        toast.error(result.message);
      } else {
        toast.success("Password updated. Please sign in again.");
        moveOnAfterAnAccountChange(() => router.replace(buildLoginPath()));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (error || !token) {
    return (
      <AuthPageShell
        title="Reset link expired"
        description="That reset link is no longer valid."
        footer={<Link href={buildForgotPasswordPath()}>Request a new link</Link>}
      >
        <Alert role="status">
          <TriangleAlert />
          <AlertTitle>Please request a new reset email to continue.</AlertTitle>
        </Alert>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      title="Set a new password"
      description="Choose a new password for your account."
      footer={
        <>
          Remembered it? <Link href={buildLoginPath()}>Back to sign in</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 data-icon="inline-start" className="animate-spin" /> Updating password...
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </FieldGroup>
      </form>
    </AuthPageShell>
  );
};

export default ResetPassword;
