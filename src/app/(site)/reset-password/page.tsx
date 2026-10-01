import { Suspense } from 'react';

import ResetPassword from '@/views/ResetPassword';

export default function Page() {
  return (
    <Suspense>
      <ResetPassword />
    </Suspense>
  );
}
