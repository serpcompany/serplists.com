import { Suspense } from 'react';

import Login from '@/views/Login';

export default function Page() {
  // The page reads its query (notices, the return path), which a statically rendered page
  // only knows in the browser.
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
