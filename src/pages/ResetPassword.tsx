import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { validatePasswordPolicy } from "@/lib/auth/passwordPolicy";

const ResetPassword = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const token = searchParams.get("token");
  const error = searchParams.get("error");

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
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result?.error) {
        toast.error(result.error.message || "Unable to reset password");
      } else {
        toast.success("Password updated. Please sign in again.");
        navigate("/login", { replace: true });
      }
    } catch (err) {
      toast.error("Unable to reset password");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (error) {
    return (
      <AuthPageShell
        title="Reset link expired"
        description="That reset link is no longer valid."
        footer={
          <>
            <Link to="/forgot-password" className="font-medium text-primary hover:underline">
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
          <Link to="/login" className="font-medium text-primary hover:underline">
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
