# Troubleshooting

<!-- M11.4 draft (wip): headings and verified facts only; the next run
completes each section against the desktop app and server code. -->

## Players cannot open the join address

- The server listens on port **30333** on every network interface
  (`apps/server/src/config.ts`: `DEFAULT_PORT`, `DEFAULT_HOST 0.0.0.0`).
- TODO: firewall prompts (Windows Defender, macOS application firewall).
- TODO: same wifi, guest networks and client isolation.

## The address shows the wrong IP

- TODO: several network adapters (VPN, Ethernet and wifi); how the join
  screen picks addresses (`apps/server/src/lan.ts`).

## The port is already in use

- TODO.

## "Unknown developer" or "unrecognized app" warnings

- TODO: Windows SmartScreen ("More info" → "Run anyway"); macOS Gatekeeper
  (right-click → Open, or System Settings → Privacy & Security).
