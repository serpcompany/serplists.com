import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import ChecklistRun from '@/views/ChecklistRun';

// A run opened through its share link: no site header, since a guest may not have an account.
export default function Page() {
  return (
    <RouteErrorBoundary>
      <ChecklistRun />
    </RouteErrorBoundary>
  );
}
