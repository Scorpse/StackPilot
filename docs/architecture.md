# Architecture and modules

## DevLauncher

The overview shows the current and recent projects, quick actions, and saved profiles. **Analyze** drafts a profile from the project files. **Profiles** manages saved scenarios. **Processes** starts commands, streams output, and stops managed processes.

The launch engine supports legacy `actions` and the newer `steps` dependency graph. Independent steps can run in parallel. A step can run a one-shot command or a long-running service, open a terminal, browser, editor or folder, or wait for a port, URL, or Docker. The engine reports step progress and an overall result of `succeeded`, `partial_success`, `failed`, or `cancelled`. Logs are bounded. PID tracking identifies an `exact`, `terminal_wrapper`, `approximate`, or `detached` process. Stop cancels a run and its managed process trees.

`FsProjectAnalyzer` looks up to eight directory levels deep for manifests, lockfiles, entry points, Docker and Compose files, IDE configuration, tests, and CI. It reports technologies, inferable versions, missing configuration, and project hints with diagnostics and confidence ratings. Analysis reads project files without running installers or changing the repository. Review the draft before saving it, especially inferred commands and ports.

## Project Creator

The wizard assembles a `WizardContext`, validates the stack, and generates an `ExecutionPlan`.

1. Select a project type, including API, web, desktop, mobile, CLI, bot, library, data pipeline, embedded, browser extension, or custom.
2. Select languages, frameworks, infrastructure services, and tools.
3. Choose Docker or local infrastructure and add Git, VS Code, CI, or tests when needed.
4. Review the recipe and file previews. A step’s `overwrite` flag controls whether an existing file can be replaced.
5. Confirm execution. The wizard reports file writes and command activity for each step and can open the result in DevLauncher.

The compatibility checks catch missing dependencies, tools that perform the same role, and framework features duplicated by an additional tool. Errors block generation. Warnings provide information for review. The [Project Creator technical documentation](../src-tauri/src/modules/project_creator/docs/) contains the metadata schema, compatibility rules, and implementation status.

## Toolchain

- **Manage Everything** shows catalog definitions and the state detected on the machine. Filters cover status, health, category, origin, capabilities, and execution method.
- **Build Environment** uses project type, languages, and frameworks to calculate required, recommended, and optional tools. The plan accounts for dependencies, conflicts, and services handled by project Compose files.
- **Tool Marketplace** shows the OS-specific catalog. Scan first to enable filters based on installed versions, health, and origin.

Scanning is read-only. Detection uses PATH, version probes, known paths, and the Windows registry on Windows. Health states distinguish missing tools, broken PATH, unhealthy installs, updates, manual installs, and Docker alternatives. The environment also gets a health score from 0 to 100.

Before installation, the plan reports the source, approximate size, elevation requirement, and checksum when available. Tools marked `manual_install` show instructions. Windows uses winget and official installers. macOS uses Homebrew. Linux uses the supported distribution package manager or official scripts. `VersionResolver` checks current versions from sources such as GitHub Releases. Jobs can be cancelled, retried, and recovered. Existing tools can be adopted manually.

## Workspace

Workspace opens the current project files. Closing it does not delete the project or automatically stop externally launched processes.

- **Overview** shows the project and active processes.
- **Runtime** shows process states such as `starting`, `running`, `ready`, `exited`, `crashed`, `killed`, `timed_out`, and `cancelled`.
- **Session** shows elapsed time, process count, and errors.
- **Logs** shows captured process output. **Problems** derives messages from process state.
- **Info** shows the profile, path, stack, and metadata. **Files** reads and writes within the selected project.

## Settings

Settings controls application paths, theme, language, font size, accent color, autosave, route restoration, local profile information, and custom GUI applications. The AI panel saves its fields locally. The current application does not send requests to OpenAI, Anthropic, Ollama, or custom endpoints from this panel.
