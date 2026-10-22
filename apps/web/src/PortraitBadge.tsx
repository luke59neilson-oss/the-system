import { useState } from 'react';
import { initials } from './player/join';

/**
 * A character portrait (M4.4): the stored image, or a monogram when there is
 * none or it fails to load (e.g. a campaign imported without its portraits
 * folder). Framed in the grade metal when a `theme-*` class is given.
 */
export function PortraitBadge({
  name,
  src,
  className = '',
}: {
  name: string;
  src: string | null | undefined;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const show = src && failed !== src ? src : null;
  return (
    <span className={`portrait${className}`} aria-hidden="true" data-testid="portrait">
      {show ? <img src={show} alt="" onError={() => setFailed(show)} /> : initials(name)}
    </span>
  );
}
