# StackPilot 1.4.0

[Русская версия](RELEASE_NOTES.ru.md)

## Project environments

- Projects can use separate runtimes, libraries, tools, and environment variables.
- The new **Environments** screen shows active environments, paths, and installed packages.
- Project Creator can select an isolation mode. Workspace applies the linked environment when opening an IDE or terminal.
- The CLI supports `stkpil env list`, `run`, `shell`, `bind`, and `export`. Export writes `activate.bat` or `activate.sh` for standalone use.

## Interactive project wizard

- `stkpil create` walks through presets and technology choices in the terminal.
- Stack constraints check compatibility across languages, databases, frameworks, and tools.
- The AdonisJS backend generator and dependency installation scripts were corrected.

## Platform improvements

- Linux rendering and initialization were improved for WebKitGTK, Wayland, and X11, including hardware acceleration and window transparency. The Arch packages were updated and an install script was added.
- macOS uses the native `open` command to launch apps and IDEs. Toolchain detection handles Homebrew and paths on Apple Silicon and Intel.

## Toolchain interface

- **Manage Everything** uses a grid to display installed software.
- The summary shows more detail about the environment and system tools.
