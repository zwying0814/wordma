import { useState } from 'react';

import './counter.css';

type CounterProps = {
  start?: number;
};

export default function Counter({ start = 0 }: CounterProps) {
  const [count, setCount] = useState(start);

  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      Count: {count}
    </button>
  );
}
