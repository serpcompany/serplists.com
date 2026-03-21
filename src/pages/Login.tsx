import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { authClient, getAuthStatus } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { DEV_TEST_USER_DEFAULT_PASSWORD, DEV_TEST_USER_PASSWORD_RESET_COMMAND } from "@/lib/auth/devUsers";
const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const {
    login,
    isAuthenticated,
    isLoading
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/account";

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const prefilledEmail = searchParams.get("email");
    if (prefilledEmail) {
      setEmail(prefilledEmail);
      setUnverifiedEmail(prefilledEmail);
    }

    if (searchParams.get("verify_email") === "1") {
      toast.info("Verify your email first, then sign in.");
    }

    if (searchParams.get("verified") === "1") {
      toast.success("Email verified. You can sign in now.");
    }
  }, [location.search]);

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(from, {
        replace: true
      });
    }
  }, [isAuthenticated, isLoading, navigate, from]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.ok) {
        toast.success("Login successful");
        setUnverifiedEmail(null);
      } else {
        if (result.errorCode === "EMAIL_NOT_VERIFIED") {
          setUnverifiedEmail(email);
          toast.error("Email not verified. Check your inbox or resend verification.");
        } else {
          toast.error(result.error || "Invalid email or password");
        }
      }
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
        callbackURL: "/login?verified=1",
      });

      if (result?.error) {
        toast.error(result.error.message || "Unable to resend verification email");
      } else {
        toast.success("Verification email sent.");
      }
    } catch (error) {
      toast.error("Unable to resend verification email");
      console.error("Resend verification error:", error);
    } finally {
      setIsResendingVerification(false);
    }
  };
  const handleDemoLogin = () => {
    setEmail("admin");
    setPassword("demo");
  };
  return (
    <AuthPageShell
      title="Sign in to your account"
      description={
        import.meta.env.DEV ? (
          <span className="text-yellow-600 dark:text-yellow-400">🧪 Development Mode - Use quick login buttons below</span>
        ) : undefined
      }
      footer={
        <>
          Or{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            create a new account
          </Link>
        </>
      }
    >
      {import.meta.env.DEV && (
        <div className="space-y-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEmail("admin@test.com");
                setPassword(DEV_TEST_USER_DEFAULT_PASSWORD);
              }}
              className="text-xs"
            >
              <div className="mr-1 h-2 w-2 rounded-full bg-red-500" />
              Fill Admin
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEmail("john@test.com");
                setPassword(DEV_TEST_USER_DEFAULT_PASSWORD);
              }}
              className="text-xs"
            >
              <div className="mr-1 h-2 w-2 rounded-full bg-blue-500" />
              Fill John
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEmail("jane@test.com");
                setPassword(DEV_TEST_USER_DEFAULT_PASSWORD);
              }}
              className="text-xs"
            >
              <div className="mr-1 h-2 w-2 rounded-full bg-purple-500" />
              Fill Jane
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEmail("bob@test.com");
                setPassword(DEV_TEST_USER_DEFAULT_PASSWORD);
              }}
              className="text-xs"
            >
              <div className="mr-1 h-2 w-2 rounded-full bg-green-500" />
              Fill Bob
            </Button>
          </div>
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            Default local seed password: <code>{DEV_TEST_USER_DEFAULT_PASSWORD}</code>. If you changed a persona password, run <code>{DEV_TEST_USER_PASSWORD_RESET_COMMAND}</code>.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <div className="text-right">
            <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...
            </>
          ) : (
            "Sign in with email"
          )}
        </Button>
        {unverifiedEmail && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isResendingVerification}
            onClick={handleResendVerification}
          >
            {isResendingVerification ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resending verification...
              </>
            ) : (
              "Resend verification email"
            )}
          </Button>
        )}
      </form>
    </AuthPageShell>
  );
};
export default Login;
