import { ENGINE_NAME } from '@the-system/engine';

export function App() {
  return (
    <main data-engine={ENGINE_NAME}>
      <h1>The System</h1>
      <p>Connecting to the System…</p>
    </main>
  );
}
