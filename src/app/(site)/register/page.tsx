import { Suspense } from 'react';

import Register from '@/views/Register';

export default function Page() {
  // The page reads its query (the return path), which a statically rendered page only knows
  // in the browser.
  return (
    <Suspense>
      <Register />
    </Suspense>
  );
}
