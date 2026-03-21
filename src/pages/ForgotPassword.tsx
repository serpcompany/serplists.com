import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { authClient, getAuthStatus } from "@/lib/auth-client";

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

      const redirectTo = `${window.location.origin}/reset-password`;
      const result = await authClient.requestPasswordReset({ email, redirectTo });

      if (result?.error) {
        toast.error(result.error.message || "Unable to send reset email");
      } else {
        setSubmitted(true);
        toast.success("If an account exists, a reset link has been sent.");
      }
    } catch (error) {
      toast.error("Unable to send reset email");
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
          Remembered it?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {submitted ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Check your inbox for a reset link. If it doesn&apos;t show up, check spam or try again.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending link...
              </>
            ) : (
              "Send reset link"
            )}
          </Button>
        </form>
      )}
    </AuthPageShell>
  );
};

export default ForgotPassword;
