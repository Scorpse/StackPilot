# StackPilot

[Русская документация](README.ru.md) · [Upstream project](https://github.com/cheburek4535/StackPilot) · [1.4.0 release notes](RELEASE_NOTES.md)

StackPilot is a desktop application and command-line tool for creating, inspecting, and running development projects. It uses Tauri 2, Rust, and SvelteKit. This fork defaults to English. Choose Russian in **Settings → Appearance → Language** to switch back.

![StackPilot dashboard](docs/screenshot3.png)

## Start here

| Task | What to use |
| --- | --- |
| Open an existing project | **DevLauncher → Analyze** detects the stack, suggested commands and ports. Review the generated draft before saving or running it. |
| Run a local stack | Save a launch profile with commands, dependencies, readiness checks, and optional IDE or browser steps. DevLauncher shows logs and can stop managed processes. |
| Check your toolchain | Scan for installed tools and review diagnostics. The install plan shows the source, dependencies, administrator requirements, and checksum when available. |
| Keep runtimes per project | Create a development environment, choose executable paths or versions, and link your project folder. Export activation scripts for use outside StackPilot. |
| Start a new project | Use Project Creator to select a project type, frameworks and infrastructure. Review the recipe and file preview before generating files. |
| Follow a running project | Use Workspace for the active processes, output, problems, project information and files. |

StackPilot is developed primarily for Windows. Upstream also publishes Linux and macOS packages. The [upstream release page](https://github.com/cheburek4535/StackPilot/releases) contains binaries from the original project. To run the English fork, build it from this repository.

## Build from source

Install Node.js 20 or later, npm, stable Rust, and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). Windows requires MSVC build tools and WebView2. Linux requires WebKitGTK 4.1 and related system packages. macOS requires the Xcode command-line tools.

```sh
git clone https://github.com/Scorpse/StackPilot.git
cd StackPilot
npm ci
npm run tauri dev
```

For packaged builds, run `npm run tauri build`. The Tauri CLI embeds the frontend assets in the production build. For frontend-only development with mocked desktop commands, run `npm run dev`.

```sh
npm run check
npm test
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

## Command line

The `stkpil` binary supports the following workflows. The source invocation works without installing it on PATH.

```sh
cargo run --locked --manifest-path src-tauri/Cargo.toml --bin stkpil -- --help
stkpil analyze /path/to/project --json
stkpil launch /path/to/project --dry-run
stkpil launch /path/to/project --all --no-open
stkpil doctor
stkpil list
stkpil create
stkpil env list
```

- `analyze` reads project metadata and suggests commands, tooling and ports.
- `launch` uses a saved profile or analyzes the project folder for launchable services. Use `--dry-run` to inspect the commands first.
- `doctor` reports tool versions and can offer installation. `status`, `install`, and `update` operate on individual tools or categories according to their help.
- `create` opens the interactive project wizard. Run `stkpil create --help` for scriptable flags and `stkpil list` for available project types, frameworks and tools.
- `env run`, `env shell`, `env bind`, and `env export` work with project environments. Run `stkpil env --help` for usage.
- `open` opens a project folder in the configured editor.

## Data and execution

Settings, projects' launch profiles, and development environment bindings live under the application data directory shown in **Settings → System**. Opening a workspace uses the project’s existing files. Tool installation can modify the machine and may require elevated privileges. Launch profiles execute local commands with your user permissions. Review imported profiles and commands before running them.

## Further reading

- [Architecture and modules](docs/architecture.md)
- [Launch profile schema and examples](docs/devlauncher-contract.md)
- [Upstream site](https://cheburek4535.github.io/StackPilot)

## License

StackPilot is distributed under the [GNU Affero General Public License v3.0 only](LICENSE). The original project is maintained by [cheburek4535](https://github.com/cheburek4535/StackPilot).
