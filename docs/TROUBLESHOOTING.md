# Troubleshooting

Problems at the table, and what to do about them. Most of these are also in
the GM console: the **Players join** panel has a folded
**Players can’t connect? Check …** list with the steps for the GM laptop's
operating system.

## Players cannot open the join address

- The server listens on port *30333* on every network interface.
- Check the address first: type it exactly as the **Players join** panel
  shows it, with `http://` and the port (for example
  `http://192.168.1.20:30333`), or scan the QR code. If the panel lists
  **Other addresses**, try those too.
- Open the address in a browser *on the GM laptop*. If it works there but
  not on a player's device, the network or the firewall is blocking it (below).

### Windows Firewall

The first time The System starts, Windows may ask whether to let it
communicate on networks. If you pressed **Cancel**, or the wifi is marked
Public, players are blocked.

1. Set the wifi to Private: **Settings → Network & internet → Wi-Fi → your
   network → Network profile type → Private**.
2. Allow the app: open Start, type **Allow an app through Windows Firewall**,
   press **Change settings**, and tick **The System** under **Private**.

### macOS firewall

Only for a Mac build made from the source code (there is no macOS download).

1. If macOS asked whether The System may accept incoming connections, choose
   **Allow**.
2. Otherwise open **System Settings → Network → Firewall → Options** and set
   The System to allow incoming connections.

### Linux

If the computer runs a firewall (for example `ufw`), allow incoming TCP
connections on the port in the join address (`sudo ufw allow 30333/tcp`, or
the port the panel shows).

### Same wifi, guest networks and client isolation

- Every device must be on the *same wifi* as the GM laptop. Phones on mobile
  data cannot reach it; turn mobile data off or wifi on.
- *Guest networks* usually stop devices from seeing each other. Put
  everyone on the main network instead.
- Some routers (and most hotel, café and campus wifi) turn on *client
  isolation* (also called AP isolation or "privacy separator"), which blocks
  device-to-device traffic even on the same network. Turn it off in the
  router settings if you can; otherwise use a phone hotspot from the GM's
  phone and connect the GM laptop and every player to it.
- A VPN on a player's device can route the address away from the local
  network. Pause it for the session.

## The address shows the wrong IP

- The join screen lists every IPv4 address of the GM laptop that is not
  internal, in adapter order. With a VPN,
  Ethernet and wifi all on, several addresses appear; players need the one
  on the wifi they share (usually `192.168.x.x` or `10.x.x.x`). Turning the
  VPN off removes its address.
- With no network at all the screen falls back to `127.0.0.1`, which only
  works on the GM laptop itself.

## The port is already in use

- The desktop app tries port 30333 and, if another program holds it (or
  Windows reserved it, e.g. Hyper-V port exclusions), the next 19 ports in
  turn and says so in a message: "Port
  30333 is used by another program, so The System is using port … this
  time." The join screen always shows
  the port it got, so use the address it shows rather than a saved one.
- If all 20 are taken it says "Ports 30333–30352 are all in use or blocked":
  close the program using them, or another copy of The System running in a
  terminal, and start again.

## "Unknown developer" or "unrecognized app" warnings

The app is not code-signed, so both systems warn
the first time it runs.

- *Windows* ("Windows protected your PC", SmartScreen): choose **More
  info**, then **Run anyway**. Windows remembers the choice.
- *macOS* (only for a Mac build made from the source code; there is no
  macOS download) ("cannot be opened because the developer cannot be verified"):
  Control-click (right-click) the app, choose **Open**, then **Open** again.
  On newer macOS versions, open **System Settings → Privacy & Security**,
  scroll to the message about The System and choose **Open Anyway**.

## A screen says "Reconnecting…"

- The badge at the top of every screen reads **Connected**, **Connecting…**,
  **Reconnecting…** or **Not connected**. **Reconnecting…** means the
  device lost the GM laptop (wifi dropped, the laptop slept, or the app was
  restarted). It retries on its own and catches up on everything that
  happened meanwhile; nothing a player saw before is lost.
- Keep the GM laptop plugged in and stop it sleeping during the session.
- If the app was closed, start it again: the join address and characters
  stay the same (unless the port changed, see above), and players' browsers
  reconnect by themselves.

## "GM key needed" in a browser

The GM console only opens inside the desktop app, or in another browser on
the GM laptop through the folded **Open the GM console in another browser on
this computer** link in the **Players join** panel. That link unlocks the
console: never send it to players. A player who opens `/gm` sees
**GM key needed** and nothing else.

## Where the campaign is saved

The desktop app keeps everything in its app-data folder, in `data/`:

| System | Folder |
| --- | --- |
| Windows | `%APPDATA%\The System\data` |
| macOS | `~/Library/Application Support/The System/data` |
| Linux | `~/.config/The System/data` |

- `campaigns/<id>/` holds each campaign's event log (`events.jsonl`) and its
  `portraits/` folder; `backups/` inside it gets a copy of both at every
  session end and every time the app quits.
- `exports/` holds the running session log and the end-of-session reports
  (the files to hand to Claude).
- Copy the whole `data` folder to back up or move to another laptop. Never
  edit the log files by hand.

## "Campaign … cannot load"

The app checks the whole event log before it opens a campaign. When something
is wrong it refuses, changes nothing, and the message names the campaign
folder and its newest backup (or says there are none yet). Quit The System
before copying any files.

- "saved by a newer version of The System": the log has changes this
  copy of the app does not know (an event type, field or version from a later
  build). Install the latest version and open it again; nothing needs
  restoring.
- "Event log line N is damaged": a line in `events.jsonl` is not valid
  data (a disk or sync error wrote rubbish over it). Copy the campaign folder
  somewhere safe first. Then copy `events.jsonl` (and `snapshot.json`, and the
  `portraits` folder if there is one) from the newest backup into the campaign
  folder. Changes made after that backup are lost; if you need them, keep the
  damaged copy and ask for help reading it.
- "its event log (events.jsonl) is missing" or "is empty, but its backups
  hold events": the log was moved, quarantined by antivirus, or only half
  copied. Look for it first (antivirus quarantine, the folder you copied
  from); otherwise restore the newest backup's files as above. If you
  emptied the log on purpose to start the campaign over, move the `backups`
  folder somewhere else (keep it) and start again: the campaign then opens
  blank.
- "updating it to the current rules failed": a newer app could not bring
  an older campaign up to its rules. Keep the app as it is and report the
  message; the newest backup still opens in the version that made it.
- "the disk lost writes": after a power cut the log is shorter than its
  last snapshot. Either restore the newest backup's files as above, or rename
  `snapshot.json` (keep the file) to open the log as it is, minus the lost
  events.

## "The campaign is already open"

Only one copy of The System may write a campaign at a time; the campaign
folder's `LOCK` file says which one has it. A crash or a forced quit leaves
the file behind, and the next start checks whether the program that wrote it
is still running (its process number and the time it started), so a leftover
`LOCK` normally clears itself.

- "already open (process N)": another copy really is running, often one
  started from a terminal. Close it (Task Manager on Windows, Activity
  Monitor on macOS) and start again.
- If no other copy is running and the message stays, delete the `LOCK` file
  the message names (inside `campaigns/<id>/`, see "Where the campaign is
  saved") and start again. Nothing else in the folder needs touching.
- "open on <computer>": the campaign folder is shared and another computer
  has it open. Quit The System there first; delete `LOCK` only if that
  computer is off.

## Only one window opens

The System runs once per computer. Starting it again brings the open window
to the front instead of starting a second server.
