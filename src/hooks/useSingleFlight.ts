import { useState } from "react";

import { createSingleFlight } from "@/lib/utils/singleFlight";

export const useSingleFlight = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [flight] = useState(() => createSingleFlight(setIsRunning));
  return { isRunning, run: flight.run };
};
