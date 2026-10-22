import { GmScreen } from './gm/GmScreen';
import { PlayerHome } from './player/JoinScreen';
import { PlayerScreen } from './player/PlayerScreen';

export function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  const play = /^\/play\/([^/]+)$/.exec(path);
  let screen;
  if (path === '/gm') screen = <GmScreen />;
  else if (play?.[1]) screen = <PlayerScreen characterId={decodeURIComponent(play[1])} />;
  else screen = <PlayerHome />;
  return <div className="app">{screen}</div>;
}
