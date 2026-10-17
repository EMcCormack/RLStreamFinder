# Rocket League overlay

On Windows, the installed app registers a small Rust watcher to start at sign-in. It checks for `RocketLeague.exe` every five seconds and launches Electron through Squirrel only when the game starts. Electron then stays in the system tray so the global **Ctrl+Alt+R** shortcut is available. Press it to show the transparent scanner above the game; press it again to hide the scanner. Electron exits after the game closes unless you opened its regular window. Double-click the tray icon to open that window, or use the tray menu to quit.

Use Rocket League's **Borderless** display mode. Windows cannot reliably place a desktop Electron window over a game using exclusive fullscreen. The overlay is interactive, so opening it gives the scanner keyboard and mouse focus; hide it with the shortcut to return to the game.

The app starts hidden when the watcher launches it. Opening it from the Start menu shows the regular window. Automatic sign-in launch is installed by packaged Windows builds; development runs and isolated smoke tests do not change login settings.
