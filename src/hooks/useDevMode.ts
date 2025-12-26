import { useState, useEffect } from 'react';

const DEV_OVERRIDE_KEY = 'dev-premium-override';

export const useDevMode = () => {
  const [devOverride, setDevOverride] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(DEV_OVERRIDE_KEY);
    if (stored) {
      setDevOverride(JSON.parse(stored));
    }
  }, []);

  const toggleDevOverride = () => {
    const newValue = !devOverride;
    setDevOverride(newValue);
    localStorage.setItem(DEV_OVERRIDE_KEY, JSON.stringify(newValue));
  };

  return {
    devOverride,
    toggleDevOverride
  };
};