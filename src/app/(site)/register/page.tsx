import { Suspense } from 'react';

import Register from '@/views/Register';

export default function Page() {
  return (
    <Suspense>
      <Register />
    </Suspense>
  );
}
