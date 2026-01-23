import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    login,
    isAuthenticated,
    isLoading
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/account";

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
      const success = await login(email, password);
      if (success) {
        toast.success("Login successful");
        navigate(from, {
          replace: true
        });
      } else {
        toast.error("Invalid email or password");
      }
    } catch (error) {
      toast.error("An error occurred during login");
      console.error("Login error:", error);
    } finally {
      setIsSubmitting(false);
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
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEmail("admin@test.com");
              setPassword("password123");
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
              setPassword("password123");
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
              setPassword("password123");
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
              setPassword("password123");
            }}
            className="text-xs"
          >
            <div className="mr-1 h-2 w-2 rounded-full bg-green-500" />
            Fill Bob
          </Button>
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
      </form>
    </AuthPageShell>
  );
};
export default Login;
