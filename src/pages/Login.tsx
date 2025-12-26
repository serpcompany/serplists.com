import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { toast } from "sonner";
import { Loader2, CheckCircle, Info } from "lucide-react";
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
  return <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center">
            
            
          </Link>
          
          <p className="mt-2 text-sm text-gray-600">
            Or{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              create a new account
            </Link>
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in to your account</CardTitle>
            {import.meta.env.DEV && (
              <CardDescription className="text-yellow-600 dark:text-yellow-400">
                🧪 Development Mode - Use quick login buttons below
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {import.meta.env.DEV && (
              <div className="grid grid-cols-2 gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmail('admin@test.com');
                    setPassword('password123');
                  }}
                  className="text-xs"
                >
                  <div className="w-2 h-2 rounded-full bg-red-500 mr-1" />
                  Fill Admin
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmail('john@test.com');
                    setPassword('password123');
                  }}
                  className="text-xs"
                >
                  <div className="w-2 h-2 rounded-full bg-blue-500 mr-1" />
                  Fill John
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmail('jane@test.com');
                    setPassword('password123');
                  }}
                  className="text-xs"
                >
                  <div className="w-2 h-2 rounded-full bg-purple-500 mr-1" />
                  Fill Jane
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEmail('bob@test.com');
                    setPassword('password123');
                  }}
                  className="text-xs"
                >
                  <div className="w-2 h-2 rounded-full bg-green-500 mr-1" />
                  Fill Bob
                </Button>
              </div>
            )}
            
            <OAuthButtons mode="login" />
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or continue with email</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...
                  </> : "Sign in with email"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>;
};
export default Login;