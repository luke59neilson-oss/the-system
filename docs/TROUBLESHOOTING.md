# Troubleshooting

<!-- M11.4 draft (wip): headings and verified facts only; the next run
completes each section against the desktop app and server code. -->

## Players cannot open the join address

- The server listens on port **30333** on every network interface
  (`apps/server/src/config.ts`: `DEFAULT_PORT`, `DEFAULT_HOST 0.0.0.0`).
- TODO: firewall prompts (Windows Defender, macOS application firewall).
- TODO: same wifi, guest networks and client isolation.

## The address shows the wrong IP

- The join screen lists every IPv4 address of the GM laptop that is not
  internal, in adapter order (`apps/server/src/lan.ts`). With a VPN,
  Ethernet and wifi all on, several addresses appear; players need the one
  on the wifi they share (usually `192.168.x.x` or `10.x.x.x`). Turning the
  VPN off removes its address.
- With no network at all the screen falls back to `127.0.0.1`, which only
  works on the GM laptop itself.

## The port is already in use

- The desktop app tries port 30333 and, if another program holds it (or
  Windows reserved it, e.g. Hyper-V port exclusions), the next 19 ports in
  turn (`apps/desktop/src/launch.ts`, MS.7). The join screen always shows
  the port it got, so use the address it shows rather than a saved one.
- If all 20 are taken it says "Ports 30333–30352 are all in use or blocked":
  close the program using them, or another copy of The System running in a
  terminal, and start again.

## "Unknown developer" or "unrecognized app" warnings

The app is not code-signed (no paid services; ROADMAP MS.6, M10), so both systems warn
the first time it runs.

- **Windows** ("Windows protected your PC", SmartScreen): choose **More
  info**, then **Run anyway**. Windows remembers the choice.
- **macOS** ("cannot be opened because the developer cannot be verified"):
  Control-click (right-click) the app, choose **Open**, then **Open** again.
  On newer macOS versions, open **System Settings → Privacy & Security**,
  scroll to the message about The System and choose **Open Anyway**.
