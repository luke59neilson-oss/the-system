import { ENGINE_NAME } from '@the-system/engine';
import { GmScreen } from './gm/GmScreen';

export function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  return (
    <div className="app">
      {path === '/gm' ? (
        <GmScreen />
      ) : (
        <main data-engine={ENGINE_NAME}>
          <h1>The System</h1>
          <p>Connecting to the System…</p>
        </main>
      )}
    </div>
  );
}
