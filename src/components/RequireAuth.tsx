import type { ReactNode } from "react";
import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { requireAuthState } from "@/lib/auth/sessionCheck";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const RequireAuth = ({ children }: { children?: ReactNode }) => {
  const { isAuthenticated, isLoading, sessionUnavailable, retrySessionCheck } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const state = requireAuthState({ isAuthenticated, isLoading, sessionUnavailable });

  useEffect(() => {
    if (state !== "redirect") {
      return;
    }

    navigate("/login", {
      replace: true,
      state: {
        from: {
          hash: location.hash,
          pathname: location.pathname,
          search: location.search,
        },
      },
    });
  }, [
    state,
    location.hash,
    location.pathname,
    location.search,
    navigate,
  ]);

  if (state === "unavailable") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-muted-foreground">
          We couldn't confirm that you're signed in. Check your connection and try again.
        </p>
        <Button onClick={retrySessionCheck}>Try again</Button>
      </div>
    );
  }

  if (state !== "allowed") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
};

export default RequireAuth;
