import { readFileSync } from 'node:fs';

export default function Bad() {
  return <div>{String(readFileSync)}</div>;
}
