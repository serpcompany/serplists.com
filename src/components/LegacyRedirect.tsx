import { Navigate, useLocation } from "react-router-dom";

/**
 * Redirects a legacy path to its canonical one, keeping the query string and hash.
 * A plain <Navigate to="/path" /> drops them, which loses state such as the
 * ?billing= result that Stripe appends when it returns the buyer.
 */
export function LegacyRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate replace to={{ pathname: to, search, hash }} />;
}
