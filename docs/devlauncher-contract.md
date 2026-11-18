# V2 launch profile contract

StackPilot saves profiles as JSON in `<app_data>/profiles/<name>.json`. Find the application data directory in **Settings → System → App Data Directory**.

## Example

```json
{
  "schema_version": "2",
  "id": "api-stack",
  "name": "FastAPI + PostgreSQL",
  "description": "Local backend and database",
  "project_root": "C:/work/my-api",
  "preferred_ide": "Vscode",
  "steps": [
    {
      "id": "db",
      "label": "PostgreSQL",
      "enabled": true,
      "kind": { "type": "run_command", "command": "docker compose up db" },
      "visibility": "captured",
      "execution_mode": "long_running",
      "completion": { "type": "process_started" },
      "failure_policy": "stop_run"
    },
    {
      "id": "api",
      "label": "Uvicorn",
      "enabled": true,
      "depends_on": ["db"],
      "kind": { "type": "run_command", "command": "uvicorn app.main:app --reload --port 8000" },
      "visibility": "captured",
      "execution_mode": "long_running",
      "completion": { "type": "port_open", "host": "127.0.0.1", "port": 8000 },
      "timeout": 60,
      "failure_policy": "stop_run",
      "retry_policy": { "max_retries": 1, "delay_ms": 1000 }
    },
    {
      "id": "docs",
      "label": "Open API docs",
      "enabled": true,
      "depends_on": ["api"],
      "kind": { "type": "open_url", "url": "http://127.0.0.1:8000/docs" },
      "completion": { "type": "external_launch_accepted" },
      "failure_policy": "warn_and_continue"
    }
  ]
}
```

## Profile fields

| Field | Purpose |
| --- | --- |
| `schema_version` | The current version is `2`. Older profiles with `actions` are migrated when accessed through the V2 API. |
| `id` | Stable profile identifier. |
| `name`, `description` | User-facing profile name and description. |
| `project_root` | Base directory for relative paths. |
| `environment_binding_id` | Link to project environment overrides. |
| `preferred_ide` | VS Code, PyCharm, GoLand, IDEA, WebStorm, Xcode, Visual Studio, or a custom editor. |
| `steps` | Nodes in the launch dependency graph. |

A step can include `id`, `label`, `enabled`, `kind`, `depends_on`, `working_directory`, `environment`, `visibility`, `execution_mode`, `completion`, `timeout`, `failure_policy`, `retry_policy`, and `metadata`.

## Step types

- `run_command` runs a command.
- `run_script` runs a script with `sh`, `bash`, `zsh`, `fish`, `cmd`, `powershell`, or `pwsh`.
- `open_application`, `open_url`, `open_terminal`, and `open_folder` launch the corresponding external application.
- `wait_for_port`, `wait_for_url`, and `wait_for_docker` wait for TCP, HTTP, or Docker readiness.
- `delay` pauses for a fixed time.

## Visibility and execution modes

`captured` sends stdout and stderr to StackPilot logs. `visible_terminal` runs in a native terminal window. `detached` starts an external process without capture. A `one_shot` step completes on successful exit. A `long_running` service remains active until it exits or is stopped.

- Windows uses `cmd /K` or Windows Terminal and stops the launcher's process tree with `taskkill /T`.
- Linux selects a terminal via `xdg-terminal-exec` or a supported fallback such as Ptyxis, GNOME Terminal, Konsole, or `x-terminal-emulator`. It runs the command through `sh -c` and keeps the window open with `exec $SHELL`. The command records its process group so StackPilot can stop it after the terminal launcher exits.
- macOS uses Terminal.app or iTerm2 via `osascript`.

Output from a visible-terminal step stays in that terminal. Docker Compose steps also write a sidecar log so errors such as a busy port or invalid Dockerfile are available in the run report.

## Completion and failure policies

A step can complete with `exit_success`, `process_started`, `port_open`, `url_ready`, `delay_elapsed`, `external_launch_accepted`, or `manual`. On failure, `stop_run` stops the run and its managed processes, `skip_dependents` skips dependent steps, and `warn_and_continue` continues with a `partial_success` result.

Dependencies must refer to existing step IDs and form an acyclic graph. Validation checks for empty commands, invalid ports or URLs, incompatible shells, and dependency cycles.

## Legacy profiles

The legacy API supports the flat `actions` array. V2 reads those actions as sequential steps and saves the profile in V2 format. Retain `actions` when a legacy integration still reads them.

## Project environments

An `EnvironmentBinding` can specify paths to tools like Python, Node, or Cargo, extra PATH entries, environment variables for installation or removal, an editor preference, and an absolute project path. StackPilot saves it as `<app_data>/project_environments/<binding_id>.json` and overlays it when launching the project. Missing or relative executable paths produce warnings.

See the [project environment implementation](../src-tauri/src/modules/project_environment/).
