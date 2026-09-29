'use client';

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { validatePasswordPolicy } from "@/lib/auth/passwordPolicy";
import { readResetPasswordLink } from "@/lib/auth/resetPasswordLink";
import { submitPasswordReset } from "@/lib/auth/passwordReset";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { replaceCurrentUrl } from "@/lib/navigation/replaceCurrentUrl";
import { useAppRouter } from "@/lib/navigation/useAppRouter";

import { Link } from '@/components/navigation/Link';

const ResetPassword = () => {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const router = useAppRouter();
  const { isAuthenticated, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Read the link once: the token then leaves the URL, so later renders cannot see it there.
  const [{ token, error }] = useState(() => readResetPasswordLink(search));

  // Takes the token out of the address bar and history, keeping the page and its state.
  useEffect(() => {
    const { searchWithoutToken } = readResetPasswordLink(window.location.search);
    if (searchWithoutToken !== null) {
      replaceCurrentUrl(`${window.location.pathname}${searchWithoutToken}${window.location.hash}`);
    }
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
        router.replace("/login");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // A reload after the token left the URL lands here with no token: offer a new link
  // instead of a form that cannot succeed.
  if (error || !token) {
    return (
      <AuthPageShell
        title="Reset link expired"
        description="That reset link is no longer valid."
        footer={
          <>
            <Link href="/forgot-password" className="font-medium text-primary hover:underline">
              Request a new link
            </Link>
          </>
        }
      >
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Please request a new reset email to continue.
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      title="Set a new password"
      description="Choose a new password for your account."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating password...
            </>
          ) : (
            "Update password"
          )}
        </Button>
      </form>
    </AuthPageShell>
  );
};

export default ResetPassword;
