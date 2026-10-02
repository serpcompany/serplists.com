'use client';

import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient, getAuthStatus } from "@/lib/auth-client";
import { getAuthErrorMessage } from "@/lib/auth/authErrors";
import { buildLoginPath, buildResetPasswordPath } from "@/lib/routes";

import { Link } from '@/components/navigation/Link';

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
      footer={
        <>
          Remembered it? <Link href={buildLoginPath()}>Back to sign in</Link>
        </>
      }
    >
      {submitted ? (
        <Alert role="status">
          <MailCheck />
          <AlertTitle>
            Check your inbox for a reset link. If it doesn&apos;t show up, check spam or try again.
          </AlertTitle>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </Field>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 data-icon="inline-start" className="animate-spin" /> Sending link...
                </>
              ) : (
                "Send reset link"
              )}
            </Button>
          </FieldGroup>
        </form>
      )}
    </AuthPageShell>
  );
};

export default ForgotPassword;
