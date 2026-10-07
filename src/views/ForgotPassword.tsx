'use client';

import { useState } from "react";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { LabeledInput, StatusNotice } from "@/components/auth/AuthFields";
import { AuthPageShell, BackToSignInFooter } from "@/components/auth/AuthPageShell";
import { BusyButton } from "@/components/shared/BusyButton";
import { FieldGroup } from "@/components/ui/field";
import { authClient, getAuthStatus } from "@/lib/auth-client";
import { getAuthErrorMessage } from "@/lib/auth/authErrors";
import { buildResetPasswordPath } from "@/lib/routes";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const authStatus = await getAuthStatus();
      if (!authStatus.emailAuthAvailable) {
        toast.error("Password reset email is temporarily unavailable. Please contact support.");
        return;
      }

      const redirectTo = `${window.location.origin}${buildResetPasswordPath()}`;
      const result = await authClient.requestPasswordReset({ email, redirectTo });

      if (result?.error) {
        toast.error(getAuthErrorMessage(result.error, "Unable to send reset email"));
      } else {
        setSubmitted(true);
        toast.success("If an account exists, a reset link has been sent.");
      }
    } catch (error) {
      toast.error(getAuthErrorMessage(error, "Unable to send reset email"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPageShell
      title="Reset your password"
      description="We'll email you a link to reset your password."
      footer={<BackToSignInFooter />}
    >
      {submitted ? (
        <StatusNotice icon={<MailCheck />}>
          Check your inbox for a reset link. If it doesn&apos;t show up, check spam or try again.
        </StatusNotice>
      ) : (
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <LabeledInput
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
            <BusyButton type="submit" busy={isSubmitting} busyLabel="Sending link...">
              Send reset link
            </BusyButton>
          </FieldGroup>
        </form>
      )}
    </AuthPageShell>
  );
};

export default ForgotPassword;
