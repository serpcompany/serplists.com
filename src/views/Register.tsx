'use client';

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { getAuthStatus } from "@/lib/auth-client";
import { buildEmailVerifiedCallbackURL } from "@/lib/auth/loginNotice";
import { handOffLoginEmail } from "@/lib/auth/loginPrefill";
import { getAuthErrorMessage } from "@/lib/auth/authErrors";
import { validatePasswordPolicy } from "@/lib/auth/passwordPolicy";
import {
  getPostRegisterDestination,
  getReturnPath,
  withReturnPath,
} from "@/lib/auth/returnPath";
import { useAppRouter } from "@/lib/navigation/useAppRouter";
import { buildLoginPath } from "@/lib/routes";
import { USER_NAME_MAX_LENGTH } from "@/lib/schemas/userProfileSchema";

import { Link } from '@/components/navigation/Link';

const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register } = useAuth();
  const router = useAppRouter();
  const returnPath = getReturnPath(useSearchParams());

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    const passwordPolicy = validatePasswordPolicy(password);
    if (!passwordPolicy.ok) {
      toast.error(passwordPolicy.message);
      return;
    }

    setIsSubmitting(true);
    try {
      const authStatus = await getAuthStatus();
      if (authStatus.accountRegistrationAvailable === false) {
        toast.error("Account email verification is temporarily unavailable. Please contact support.");
        return;
      }

      const result = await register(name, email, password, buildEmailVerifiedCallbackURL(returnPath));
      if (result.ok) {
        const requiresEmailVerification = Boolean(
          result.requiresEmailVerification || authStatus.emailVerificationRequired,
        );
        toast.success(
          requiresEmailVerification
            ? "Account created. Check your email to verify your address before signing in."
            : "Registration successful",
        );
        if (requiresEmailVerification) {
          handOffLoginEmail(email);
        }
        router.replace(getPostRegisterDestination({ requiresEmailVerification, returnPath }));
      } else {
        toast.error(result.error ?? "Registration failed.");
      }
    } catch (error) {
      toast.error(getAuthErrorMessage(error, "An error occurred during registration"));
      console.error("Registration error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPageShell
      title="Create your account"
      description="Sign up with email and password"
      footer={
        <>
          Already have an account?{" "}
          <Link href={withReturnPath(buildLoginPath(), returnPath)}>Sign in</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              maxLength={USER_NAME_MAX_LENGTH}
              required
            />
          </Field>

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

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <PasswordInput
              id="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="confirmPassword">Confirm Password</FieldLabel>
            <PasswordInput
              id="confirmPassword"
              toggleLabel="confirm password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm your password"
              required
            />
          </Field>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 data-icon="inline-start" className="animate-spin" />
                Creating account...
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </FieldGroup>
      </form>
    </AuthPageShell>
  );
};

export default Register;
