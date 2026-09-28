import { useState } from "react";

import { createSingleFlight } from "@/lib/utils/singleFlight";

/**
 * A single-flight guard for a button's async action: `run` ignores clicks while the
 * action is running, and `isRunning` drives the button's disabled and busy state.
 */
export const useSingleFlight = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [flight] = useState(() => createSingleFlight(setIsRunning));
  return { isRunning, run: flight.run };
};
