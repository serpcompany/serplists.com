'use client';

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { LabeledInput, StatusNotice } from "@/components/auth/AuthFields";
import { AuthPageShell, BackToSignInFooter } from "@/components/auth/AuthPageShell";
import { BusyButton } from "@/components/shared/BusyButton";
import { FieldGroup } from "@/components/ui/field";
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
        <StatusNotice icon={<TriangleAlert />}>Please request a new reset email to continue.</StatusNotice>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      title="Set a new password"
      description="Choose a new password for your account."
      footer={<BackToSignInFooter />}
    >
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <LabeledInput
            id="password"
            label="New password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            required
          />
          <LabeledInput
            id="confirmPassword"
            label="Confirm password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="••••••••"
            required
          />
          <BusyButton type="submit" busy={isSubmitting} busyLabel="Updating password...">
            Update password
          </BusyButton>
        </FieldGroup>
      </form>
    </AuthPageShell>
  );
};

export default ResetPassword;
