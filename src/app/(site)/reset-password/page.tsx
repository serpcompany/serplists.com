import { Suspense } from 'react';

import ResetPassword from '@/views/ResetPassword';

export default function Page() {
  // The reset token arrives in the query, which a statically rendered page only knows in the
  // browser; the server never renders it.
  return (
    <Suspense>
      <ResetPassword />
    </Suspense>
  );
}
