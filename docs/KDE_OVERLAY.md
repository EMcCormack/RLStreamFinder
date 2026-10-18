# Showing the overlay above Rocket League on KDE Plasma

KWin places an active fullscreen window above ordinary always-on-top windows. Rocket League's Borderless mode can still use that fullscreen layer, so the global shortcut can open RLStreamFinder behind the game.

RLStreamFinder detects KDE Plasma and installs an app-specific Overlay layer rule at startup. Your existing matching rule is left alone. The development and packaged apps have different window classes, so each needs its own rule.

If automatic setup fails, add the rule manually:

1. Open **System Settings → Window Management → Window Rules**.
2. Add a new rule and use **Detect Window Properties** to select the RLStreamFinder window. Match the app's window class so the rule only applies to RLStreamFinder.
3. Add the **Layer** property, set its policy to **Force**, and its value to **Overlay**.
4. Save the rule, restart RLStreamFinder, and try the shortcut while Rocket League is focused.

The rule is managed by KDE. To undo it, delete the RLStreamFinder overlay rule in Window Rules. The app adds it again on the next launch while running under KDE.
