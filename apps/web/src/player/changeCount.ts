import { useState } from 'react';

/** How many times `value` has changed since first render (drives the change glow). */
export function useChangeCount(value: string): number {
  const [seen, setSeen] = useState(value);
  const [count, setCount] = useState(0);
  if (value !== seen) {
    setSeen(value);
    setCount(count + 1);
  }
  return count;
}
