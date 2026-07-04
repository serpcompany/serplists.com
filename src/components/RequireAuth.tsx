import type { ReactNode } from "react";
import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { Loader2 } from "lucide-react";

const RequireAuth = ({ children }: { children?: ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading || isAuthenticated) {
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
    isAuthenticated,
    isLoading,
    location.hash,
    location.pathname,
    location.search,
    navigate,
  ]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
};

export default RequireAuth;
