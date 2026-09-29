'use client';

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { USER_NAME_MAX_LENGTH } from "@/lib/schemas/userProfileSchema";

import { Link } from '@/components/navigation/Link';

const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register } = useAuth();
  const router = useAppRouter();
  // Carried from the page that sent the user here (for example an invite link)
  // so a new account lands back there, including after email verification.
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
          // The login page fills its form with the address; it never goes in the URL.
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
          <Link
            href={withReturnPath("/login", returnPath)}
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            maxLength={USER_NAME_MAX_LENGTH}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              className="pr-10"
              required
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

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm your password"
              className="pr-10"
              required
            />
            <button
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              type="button"
              onClick={() => setShowConfirmPassword((current) => !current)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthPageShell>
  );
};

export default Register;
