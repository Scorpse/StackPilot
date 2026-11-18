<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import PageContainer from "$lib/components/ui/PageContainer.svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import LoadingState from "$lib/components/ui/LoadingState.svelte";
  import Icon from "$lib/components/ui/Icon.svelte";
  import Modal from "$lib/components/ui/Modal.svelte";
  import {
    listEnvironments,
    getOrCreateDefaultEnvironment,
    saveEnvironment,
    deleteEnvironment,
    bindProjectToEnvironment,
    unbindProjectFromEnvironment,
    openEnvironmentTerminal,
    configureVsCodeEnvironment,
    exportStandaloneEnvironment,
    calculateDiskUsage,
    cleanupSandbox,
    resolveToolsForProject,
  } from "$lib/modules/project_environment/api";
  import type {
    EnvironmentBinding,
    IsolationMode,
    EnvironmentDiskUsage,
    ToolOverride,
  } from "$lib/modules/project_environment/types";
  import { openProject } from "$lib/core/integration";
  import { selectFolder } from "$lib/modules/project_creator/api";
  import { notifySuccess, notifyError } from "$lib/core/toasts";
  import { i18n } from "$lib/core/i18n.svelte";


  let environments = $state<EnvironmentBinding[]>([]);
  let loading = $state(true);
  let searchQuery = $state("");

  // Modal State for Create / Edit
  let showModal = $state(false);
  let editingId = $state<string | null>(null);
  let modalName = $state("");
  let modalDescription = $state("");
  let modalIsolationMode = $state<IsolationMode>("isolated");
  let modalEnvVars = $state<{ key: string; value: string }[]>([]);
  let modalTools = $state<{ id: string; executable_path: string; version: string }[]>([]);
  let detectingTools = $state(false);
  let saving = $state(false);

  // Filtered environments
  let filteredEnvironments = $derived(
    environments.filter((env) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const matchName = (env.name || env.binding_id).toLowerCase().includes(q);
      const matchDesc = (env.description || "").toLowerCase().includes(q);
      const matchTools = Object.keys(env.tool_overrides || {}).some((t) => t.toLowerCase().includes(q));
      const matchProjects = (env.bound_projects || []).some((p) => p.toLowerCase().includes(q));
      return matchName || matchDesc || matchTools || matchProjects;
    })
  );

  let totalIsolated = $derived(environments.filter((e) => e.isolation_mode === "isolated").length);
  let totalProjects = $derived(
    environments.reduce((sum, e) => sum + (e.bound_projects ? e.bound_projects.length : 0), 0)
  );

  let diskUsages = $state<Record<string, EnvironmentDiskUsage>>({});

  let totalDiskUsageBytes = $derived(
    Object.values(diskUsages).reduce((sum, u) => sum + (u?.size_bytes || 0), 0)
  );
  let totalDiskUsageDisplay = $derived(
    totalDiskUsageBytes >= 1024 * 1024 * 1024
      ? `${(totalDiskUsageBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
      : totalDiskUsageBytes >= 1024 * 1024
      ? `${(totalDiskUsageBytes / (1024 * 1024)).toFixed(1)} MB`
      : totalDiskUsageBytes > 0
      ? `${(totalDiskUsageBytes / 1024).toFixed(1)} KB`
      : "0 B"
  );

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    try {
      // Ensure default exists
      await getOrCreateDefaultEnvironment();
      environments = await listEnvironments();

      // Query storage for isolated environments
      for (const env of environments) {
        if (env.isolation_mode === "isolated") {
          calculateDiskUsage(env.binding_id)
            .then((usage) => {
              diskUsages[env.binding_id] = usage;
            })
            .catch(() => {});
        }
      }
    } catch (e) {
      notifyError(i18n.t("environments.load_failed"), String(e));
    } finally {
      loading = false;
    }
  }

  async function handleCleanupSandbox(env: EnvironmentBinding) {
    const confirmed = confirm(
      i18n.t("environments.clear_cache_confirm", { name: env.name || env.binding_id })
    );
    if (!confirmed) return;
    try {
      const usage = await cleanupSandbox(env.binding_id);
      diskUsages[env.binding_id] = usage;
      notifySuccess(i18n.t("environments.cache_cleared"), i18n.t("environments.cache_size", { size: usage.size_display }));
    } catch (e) {
      notifyError(i18n.t("environments.cache_failed"), String(e));
    }
  }

  function openCreateModal() {
    editingId = null;
    modalName = "";
    modalDescription = "";
    modalIsolationMode = "isolated";
    modalEnvVars = [];
    modalTools = [];
    showModal = true;
  }

  function openEditModal(env: EnvironmentBinding) {
    editingId = env.binding_id;
    modalName = env.name || "";
    modalDescription = env.description || "";
    modalIsolationMode = env.isolation_mode;
    modalEnvVars = Object.entries(env.env_vars || {}).map(([key, value]) => ({ key, value }));
    modalTools = Object.entries(env.tool_overrides || {}).map(([id, t]) => ({
      id,
      executable_path: t.executable_path || "",
      version: t.version || "",
    }));
    showModal = true;
  }

  function addToolRow() {
    modalTools = [...modalTools, { id: "", executable_path: "", version: "" }];
  }

  function removeToolRow(index: number) {
    modalTools = modalTools.filter((_, i) => i !== index);
  }

  async function handleAutoDetectTools() {
    detectingTools = true;
    try {
      const candidates = ["node", "python", "cargo", "go", "git", "deno", "bun", "pnpm", "yarn"];
      const resolved = await resolveToolsForProject(candidates);
      const rows: { id: string; executable_path: string; version: string }[] = [];
      for (const [id, t] of Object.entries(resolved)) {
        rows.push({
          id,
          executable_path: t.executable_path || "",
          version: t.version || "",
        });
      }
      if (rows.length > 0) {
        modalTools = rows;
        notifySuccess(i18n.t("environments.tools_found"), i18n.t("environments.tools_found_detail", { count: String(rows.length) }));
      } else {
        notifyError(i18n.t("environments.tools_not_found"), i18n.t("environments.tools_not_found_detail"));
      }
    } catch (e) {
      notifyError(i18n.t("environments.discovery_failed"), String(e));
    } finally {
      detectingTools = false;
    }
  }

  function addEnvVarRow() {
    modalEnvVars = [...modalEnvVars, { key: "", value: "" }];
  }

  function removeEnvVarRow(index: number) {
    modalEnvVars = modalEnvVars.filter((_, i) => i !== index);
  }

  async function handleSave() {
    if (!modalName.trim()) {
      notifyError(i18n.t("environments.name_required"), i18n.t("environments.name_required_detail"));
      return;
    }

    saving = true;
    try {
      let bindingToSave: EnvironmentBinding;
      if (editingId) {
        const existing = environments.find((e) => e.binding_id === editingId);
        if (!existing) throw new Error(i18n.t("environments.not_found"));
        bindingToSave = { ...existing };
      } else {
        const now = new Date().toISOString();
        bindingToSave = {
          schema_version: 1,
          binding_id: `env_${Date.now().toString(16)}`,
          name: modalName.trim(),
          isolation_mode: modalIsolationMode,
          is_default: false,
          description: modalDescription.trim() || null,
          icon: "box",
          color: "orange",
          project_path: null,
          bound_projects: [],
          env_dir: null,
          tool_overrides: {},
          managed_path_entries: [],
          env_vars: {},
          env_vars_remove: [],
          preferred_ide: null,
          preferred_ide_args: null,
          created_at: now,
          updated_at: now,
        };
      }

      bindingToSave.name = modalName.trim();
      bindingToSave.description = modalDescription.trim() || null;
      bindingToSave.isolation_mode = modalIsolationMode;

      const toolMap: Record<string, ToolOverride> = {};
      for (const t of modalTools) {
        const idTrim = t.id.trim().toLowerCase();
        if (idTrim) {
          toolMap[idTrim] = {
            executable_path: t.executable_path.trim() || null,
            version: t.version.trim() || null,
            path_entries: [],
            env_vars: {},
          };
        }
      }
      bindingToSave.tool_overrides = toolMap;

      const envMap: Record<string, string> = {};
      for (const row of modalEnvVars) {
        if (row.key.trim()) {
          envMap[row.key.trim()] = row.value;
        }
      }
      bindingToSave.env_vars = envMap;

      await saveEnvironment(bindingToSave);
      notifySuccess(i18n.t("environments.saved"), i18n.t("environments.saved_detail", { name: bindingToSave.name }));
      showModal = false;
      await loadData();
    } catch (e) {
      notifyError(i18n.t("environments.save_failed"), String(e));
    } finally {
      saving = false;
    }
  }

  async function handleDelete(env: EnvironmentBinding) {
    if (env.is_default) {
      notifyError(i18n.t("environments.protected"), i18n.t("environments.default_cannot_delete"));
      return;
    }
    const confirmed = confirm(
      i18n.t("environments.delete_confirm")
    );
    if (!confirmed) return;

    try {
      await deleteEnvironment(env.binding_id);
      notifySuccess(i18n.t("environments.deleted"), i18n.t("environments.deleted_detail", { name: env.name || env.binding_id }));
      await loadData();
    } catch (e) {
      notifyError(i18n.t("environments.delete_failed"), String(e));
    }
  }

  async function handleOpenTerminal(env: EnvironmentBinding) {
    try {
      await openEnvironmentTerminal(env.binding_id);
      notifySuccess(i18n.t("environments.terminal"), i18n.t("environments.terminal_detail", { name: env.name || env.binding_id }));
    } catch (e) {
      notifyError(i18n.t("environments.terminal_failed"), String(e));
    }
  }

  async function handleBindProject(env: EnvironmentBinding) {
    try {
      const folder = await selectFolder();
      if (!folder) return;
      await bindProjectToEnvironment(env.binding_id, folder);
      notifySuccess(i18n.t("environments.project_bound"), i18n.t("environments.bound_detail", { path: folder, name: env.name || env.binding_id }));
      await loadData();
    } catch (e) {
      notifyError(i18n.t("environments.bind_failed"), String(e));
    }
  }

  async function handleUnbindProject(env: EnvironmentBinding, projectPath: string) {
    try {
      await unbindProjectFromEnvironment(env.binding_id, projectPath);
      notifySuccess(i18n.t("environments.project_unbound"), i18n.t("environments.project_unbound_detail"));
      await loadData();
    } catch (e) {
      notifyError(i18n.t("environments.unbind_failed"), String(e));
    }
  }

  async function handleOpenInWorkspace(projectPath: string, env: EnvironmentBinding) {
    try {
      await openProject(projectPath);
      goto("/workspace");
    } catch (e) {
      notifyError(i18n.t("environments.open_failed"), String(e));
    }
  }

  async function handleConfigureVsCode(env: EnvironmentBinding, projectPath: string) {
    try {
      await configureVsCodeEnvironment(env.binding_id, projectPath);
      notifySuccess("VS Code", i18n.t("environments.vscode_detail", { name: env.name || env.binding_id }));
    } catch (e) {
      notifyError(i18n.t("environments.vscode_failed"), String(e));
    }
  }

  async function handleExportStandalone(env: EnvironmentBinding, projectPath?: string) {
    try {
      let target = projectPath;
      if (!target) {
        target = env.project_path || (env.bound_projects && env.bound_projects[0]);
      }
      if (!target) {
        target = (await selectFolder()) || undefined;
      }
      if (!target) return;

      const res = await exportStandaloneEnvironment(env.binding_id, target);
      notifySuccess(
        i18n.t("environments.exported"),
        i18n.t("environments.exported_detail", { files: res.created_files.join(", "), path: res.target_dir })
      );
    } catch (e) {
      notifyError(i18n.t("environments.export_failed"), String(e));
    }
  }
</script>

<PageContainer width="wide">
  <PageHeader
    title={i18n.t("environments.title")}
    description={i18n.t("environments.subtitle")}
    icon="package"
  >
    {#snippet actions()}
      <Button
        variant="primary"
        icon="sparkles"
        onclick={openCreateModal}
      >
        {i18n.t("environments.create_btn")}
      </Button>
    {/snippet}
  </PageHeader>

  <!-- Compact Statistics Strip -->
  <div class="sp-env-stat-strip">
    <div class="stat-pill">
      <span class="stat-icon purple"><Icon name="layers" size={13} /></span>
      <span class="stat-num">{environments.length}</span>
      <span class="stat-text">{i18n.t("environments.stat_environments")}</span>
    </div>
    <div class="stat-pill">
      <span class="stat-icon amber"><Icon name="package" size={13} /></span>
      <span class="stat-num">{totalIsolated}</span>
      <span class="stat-text">{i18n.t("environments.stat_sandboxes")}</span>
    </div>
    <div class="stat-pill">
      <span class="stat-icon blue"><Icon name="folder" size={13} /></span>
      <span class="stat-num">{totalProjects}</span>
      <span class="stat-text">{i18n.t("environments.stat_projects")}</span>
    </div>
    <div class="stat-pill">
      <span class="stat-icon cyan"><Icon name="database" size={13} /></span>
      <span class="stat-num">{totalDiskUsageDisplay}</span>
      <span class="stat-text">{i18n.t("environments.stat_size")}</span>
    </div>
  </div>

  <!-- Search and filter bar -->
  <div class="sp-filter-bar">
    <div class="sp-search-wrapper">
      <Icon name="search" size={16} />
      <input
        type="text"
        placeholder={i18n.t("environments.search")}
        bind:value={searchQuery}
        class="sp-search-input"
      />
      {#if searchQuery}
        <button class="sp-clear-btn" onclick={() => searchQuery = ""}>✕</button>
      {/if}
    </div>
  </div>

  {#if loading}
    <LoadingState label={i18n.t("environments.loading")} />
  {:else if filteredEnvironments.length === 0}
    <EmptyState
      icon="package"
      title={i18n.t("environments.empty_title")}
      description={searchQuery
        ? i18n.t("environments.no_search_results")
        : (i18n.t("environments.empty_desc"))}
    >
      {#snippet action()}
        <Button variant="secondary" icon="sparkles" onclick={openCreateModal}>
          {i18n.t("environments.create_first")}
        </Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div class="sp-env-grid">
      {#each filteredEnvironments as env (env.binding_id)}
        <div class="sp-env-card" class:is-default={env.is_default}>
          <!-- Card Header: Title + Pills + Quick Icon Actions -->
          <div class="sp-env-head">
            <div class="sp-env-lead">
              <div class="sp-env-avatar" class:default-avatar={env.is_default}>
                <Icon name={env.is_default ? "globe" : "package"} size={18} />
              </div>
              <div class="sp-env-title-col">
                <div class="sp-env-name-row">
                  <h3 class="sp-env-name" title={env.name || env.binding_id}>{env.name || env.binding_id}</h3>
                  {#if env.is_default}
                    <span class="sp-pill pill-cyan">{i18n.t("environments.system")}</span>
                  {:else}
                    <span class="sp-pill pill-amber">Sandbox</span>
                    {#if diskUsages[env.binding_id]}
                      <span class="sp-pill pill-neutral" title={i18n.t("environments.sandbox_size")}>
                        <Icon name="database" size={10} />
                        {diskUsages[env.binding_id].size_display}
                      </span>
                    {/if}
                  {/if}
                </div>
                {#if env.description}
                  <p class="sp-env-desc" title={env.description}>{env.description}</p>
                {/if}
              </div>
            </div>

            <!-- Compact Icon Action Toolbar -->
            <div class="sp-env-toolbar">
              <button
                type="button"
                class="sp-tool-btn"
                onclick={() => handleOpenTerminal(env)}
                title={i18n.t("environments.open_terminal")}
              >
                <Icon name="terminal" size={14} />
              </button>
              <button
                type="button"
                class="sp-tool-btn"
                onclick={() => handleExportStandalone(env)}
                title={i18n.t("environments.export_activation_files")}
              >
                <Icon name="download" size={14} />
              </button>
              {#if env.isolation_mode === "isolated"}
                <button
                  type="button"
                  class="sp-tool-btn"
                  onclick={() => handleCleanupSandbox(env)}
                  title={i18n.t("environments.clear_cache")}
                >
                  <Icon name="refresh" size={14} />
                </button>
              {/if}
              <button
                type="button"
                class="sp-tool-btn"
                onclick={() => openEditModal(env)}
                title={i18n.t("environments.configure")}
              >
                <Icon name="settings" size={14} />
              </button>
              {#if !env.is_default}
                <button
                  type="button"
                  class="sp-tool-btn btn-danger"
                  onclick={() => handleDelete(env)}
                  title={i18n.t("environments.delete")}
                >
                  <Icon name="trash" size={14} />
                </button>
              {/if}
            </div>
          </div>

          <!-- Tools Section -->
          <div class="sp-env-block">
            <div class="sp-block-head">
              <div class="sp-block-title">
                <Icon name="wrench" size={12} />
                <span>{i18n.t("environments.tools")}</span>
              </div>
            </div>

            {#if Object.keys(env.tool_overrides || {}).length === 0}
              <div class="sp-block-empty">
                {env.is_default
                  ? i18n.t("environments.system_path")
                  : i18n.t("environments.inherited")}
              </div>
            {:else}
              <div class="sp-tools-tags">
                {#each Object.entries(env.tool_overrides) as [toolId, tool]}
                  <span class="sp-tool-tag" title={tool.executable_path || "PATH"}>
                    <span class="tool-name">{toolId}</span>
                    {#if tool.version}
                      <span class="tool-ver">v{tool.version}</span>
                    {/if}
                  </span>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Environment variables section -->
          {#if Object.keys(env.env_vars || {}).length > 0}
            <div class="sp-env-block">
              <div class="sp-block-head">
                <div class="sp-block-title">
                  <Icon name="layers" size={12} />
                  <span>{i18n.t("environments.variable_count", { count: String(Object.keys(env.env_vars).length) })}</span>
                </div>
              </div>
              <div class="sp-envvars-preview">
                {#each Object.entries(env.env_vars).slice(0, 3) as [k, v]}
                  <span class="sp-envvar-pill" title="{k}={v}"><code>{k}</code>={v}</span>
                {/each}
                {#if Object.keys(env.env_vars).length > 3}
                  <span class="sp-envvar-more">+{Object.keys(env.env_vars).length - 3}</span>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Bound Projects Section -->
          <div class="sp-env-block sp-projects-block">
            <div class="sp-block-head">
              <div class="sp-block-title">
                <Icon name="folder" size={12} />
                <span>{i18n.t("environments.project_count", { count: String((env.bound_projects || []).length) })}</span>
              </div>
              <button
                type="button"
                class="sp-mini-link-btn"
                onclick={() => handleBindProject(env)}
                title={i18n.t("environments.bind_project")}
              >
                <Icon name="plus" size={11} />
                <span>{i18n.t("environments.bind")}</span>
              </button>
            </div>

            {#if !env.bound_projects || env.bound_projects.length === 0}
              <div class="sp-block-empty">
                {i18n.t("environments.no_bound_projects")}
              </div>
            {:else}
              <div class="sp-projects-list">
                {#each env.bound_projects as projPath}
                  <div class="sp-project-row">
                    <div class="sp-project-label" title={projPath}>
                      <Icon name="folder" size={13} />
                      <span class="sp-proj-name">{projPath.split(/[\\/]/).filter(Boolean).pop() || projPath}</span>
                      <span class="sp-proj-sub">{projPath}</span>
                    </div>
                    <div class="sp-proj-btn-group">
                      <button
                        type="button"
                        class="sp-sub-btn"
                        onclick={() => handleOpenInWorkspace(projPath, env)}
                        title={i18n.t("environments.open_workspace")}
                      >
                        <Icon name="play" size={11} />
                      </button>
                      <button
                        type="button"
                        class="sp-sub-btn"
                        onclick={() => handleConfigureVsCode(env, projPath)}
                        title={i18n.t("environments.configure_vscode")}
                      >
                        <Icon name="terminal" size={11} />
                      </button>
                      <button
                        type="button"
                        class="sp-sub-btn"
                        onclick={() => handleExportStandalone(env, projPath)}
                        title={i18n.t("environments.export_activation")}
                      >
                        <Icon name="download" size={11} />
                      </button>
                      <button
                        type="button"
                        class="sp-sub-btn btn-del"
                        onclick={() => handleUnbindProject(env, projPath)}
                        title={i18n.t("environments.unbind_project")}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Create / Edit Modal -->
  <Modal
    open={showModal}
    onclose={() => showModal = false}
    title={editingId ? i18n.t("environments.edit_title") : i18n.t("environments.create_title")}
    description={i18n.t("environments.form_description")}
    size="lg"
  >
    <div class="sp-modal-form">
      <div class="sp-form-group">
        <label for="env-name" class="sp-form-label">{i18n.t("environments.name_label")}</label>
        <input
          id="env-name"
          type="text"
          placeholder={i18n.t("environments.name_placeholder")}
          bind:value={modalName}
          class="sp-form-input"
        />
      </div>

      <div class="sp-form-group">
        <label for="env-desc" class="sp-form-label">{i18n.t("environments.description_label")}</label>
        <input
          id="env-desc"
          type="text"
          placeholder={i18n.t("environments.description_placeholder")}
          bind:value={modalDescription}
          class="sp-form-input"
        />
      </div>

      <!-- Mode Selector -->
      <div class="sp-form-group">
        <span class="sp-form-label">{i18n.t("environments.isolation_type")}</span>
        <div class="sp-isolation-options">
          <label class="sp-option-card" class:selected={modalIsolationMode === "isolated"}>
            <input
              type="radio"
              name="isolation"
              value="isolated"
              checked={modalIsolationMode === "isolated"}
              onchange={() => modalIsolationMode = "isolated"}
            />
            <div class="sp-option-text">
              <div class="sp-option-head">
                <span class="sp-option-title">{i18n.t("environments.isolated")}</span>
                <Badge tone="amber">Sandboxed</Badge>
              </div>
              <p class="sp-option-desc">
                {i18n.t("environments.isolated_description")}
              </p>
            </div>
          </label>

          <label class="sp-option-card" class:selected={modalIsolationMode === "global"}>
            <input
              type="radio"
              name="isolation"
              value="global"
              checked={modalIsolationMode === "global"}
              onchange={() => modalIsolationMode = "global"}
            />
            <div class="sp-option-text">
              <div class="sp-option-head">
                <span class="sp-option-title">{i18n.t("environments.global")}</span>
                <Badge tone="neutral">Host</Badge>
              </div>
              <p class="sp-option-desc">
                {i18n.t("environments.global_description")}
              </p>
            </div>
          </label>
        </div>
      </div>

      <!-- Tools and Runtimes Section -->
      <div class="sp-form-group">
        <div class="sp-envvars-header">
          <div>
            <span class="sp-form-label">{i18n.t("environments.tools_and_runtimes")}</span>
            <span class="sp-form-hint">{i18n.t("environments.tools_hint")}</span>
          </div>
          <div class="sp-envvars-header-actions">
            <Button
              variant="secondary"
              size="sm"
              icon="sparkles"
              loading={detectingTools}
              onclick={handleAutoDetectTools}
            >
              {i18n.t("environments.auto_detect")}
            </Button>
            <Button variant="ghost" size="sm" icon="plus" onclick={addToolRow}>
              {i18n.t("environments.add_tool")}
            </Button>
          </div>
        </div>

        {#if modalTools.length === 0}
          <p class="sp-muted-text">{i18n.t("environments.empty_tools")}</p>
        {:else}
          <div class="sp-tools-modal-table">
            {#each modalTools as row, i}
              <div class="sp-tool-modal-row">
                <input
                  type="text"
                  placeholder="ID (node, python...)"
                  bind:value={row.id}
                  class="sp-form-input tool-id-input"
                />
                <input
                  type="text"
                  placeholder={i18n.t("environments.executable_placeholder")}
                  bind:value={row.executable_path}
                  class="sp-form-input tool-path-input"
                />
                <input
                  type="text"
                  placeholder={i18n.t("environments.version_placeholder")}
                  bind:value={row.version}
                  class="sp-form-input tool-ver-input"
                />
                <button
                  type="button"
                  class="sp-row-del-btn"
                  onclick={() => removeToolRow(i)}
                  title={i18n.t("environments.remove_tool")}
                >
                  ✕
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Extra Environment Variables -->
      <div class="sp-form-group">
        <div class="sp-envvars-header">
          <span class="sp-form-label">{i18n.t("environments.env_vars")}</span>
          <Button variant="ghost" size="sm" icon="plus" onclick={addEnvVarRow}>
            {i18n.t("environments.add_variable")}
          </Button>
        </div>

        {#if modalEnvVars.length === 0}
          <p class="sp-muted-text">{i18n.t("environments.empty_variables")}</p>
        {:else}
          <div class="sp-envvars-table">
            {#each modalEnvVars as row, i}
              <div class="sp-envvar-row">
                <input
                  type="text"
                  placeholder={i18n.t("environments.var_name")}
                  bind:value={row.key}
                  class="sp-form-input env-key-input"
                />
                <span class="sp-eq">=</span>
                <input
                  type="text"
                  placeholder={i18n.t("environments.var_value")}
                  bind:value={row.value}
                  class="sp-form-input env-val-input"
                />
                <button
                  type="button"
                  class="sp-row-del-btn"
                  onclick={() => removeEnvVarRow(i)}
                  title={i18n.t("environments.remove_variable")}
                >
                  ✕
                </button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#snippet footer()}
      <Button variant="ghost" onclick={() => showModal = false}>
        {i18n.t("environments.cancel")}
      </Button>
      <Button variant="primary" loading={saving} onclick={handleSave}>
        {editingId ? i18n.t("environments.save_changes") : i18n.t("environments.create")}
      </Button>
    {/snippet}
  </Modal>
</PageContainer>

<style>
  .sp-env-stat-strip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    background: var(--sp-bg-2, #161821);
    border: 1px solid var(--sp-border, #262c3c);
    border-radius: 8px;
    padding: 0.4rem 0.75rem;
    margin-bottom: 1rem;
  }

  .stat-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 2px 8px;
    background: var(--sp-bg-3, #1e222f);
    border-radius: 6px;
    font-size: 0.75rem;
  }

  .stat-icon {
    display: flex;
    align-items: center;
  }
  .stat-icon.purple { color: #c084fc; }
  .stat-icon.amber { color: #fbbf24; }
  .stat-icon.blue { color: #60a5fa; }
  .stat-icon.cyan { color: #22d3ee; }

  .stat-num {
    font-weight: 700;
    color: var(--sp-text, #f1f5f9);
    font-family: var(--sp-font-mono, monospace);
  }

  .stat-text {
    color: var(--sp-text-3, #94a3b8);
  }

  .sp-filter-bar {
    margin-bottom: 1rem;
  }

  .sp-search-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--sp-card-bg, #181b22);
    border: 1px solid var(--sp-border, #2d3343);
    border-radius: 6px;
    padding: 6px 12px;
    color: var(--sp-text-muted, #94a3b8);
    max-width: 440px;
  }

  .sp-search-input {
    background: transparent;
    border: none;
    outline: none;
    color: var(--sp-text, #f1f5f9);
    font-size: 13px;
    width: 100%;
  }

  .sp-clear-btn {
    background: none;
    border: none;
    color: var(--sp-text-muted, #94a3b8);
    cursor: pointer;
    font-size: 12px;
    padding: 2px 6px;
  }

  .sp-env-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 16px;
    align-items: stretch;
  }

  .sp-env-card {
    background: var(--sp-card-bg, #181b22);
    border: 1px solid var(--sp-border, #282e3e);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    box-sizing: border-box;
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    min-width: 0;
    overflow: hidden;
  }

  .sp-env-card:hover {
    border-color: rgba(245, 158, 11, 0.4);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  }

  .sp-env-card.is-default {
    border-color: rgba(59, 130, 246, 0.35);
  }

  .sp-env-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
  }

  .sp-env-lead {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    min-width: 0;
    flex: 1;
  }

  .sp-env-avatar {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: rgba(245, 158, 11, 0.12);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .sp-env-avatar.default-avatar {
    background: rgba(59, 130, 246, 0.12);
    color: #3b82f6;
    border-color: rgba(59, 130, 246, 0.25);
  }

  .sp-env-title-col {
    min-width: 0;
    flex: 1;
  }

  .sp-env-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .sp-env-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--sp-text, #f1f5f9);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 170px;
  }

  .sp-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10.5px;
    font-weight: 500;
    padding: 1px 6px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .pill-amber {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .pill-cyan {
    background: rgba(6, 182, 212, 0.15);
    color: #06b6d4;
    border: 1px solid rgba(6, 182, 212, 0.3);
  }

  .pill-neutral {
    background: rgba(255, 255, 255, 0.06);
    color: var(--sp-text-muted, #94a3b8);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .sp-env-desc {
    font-size: 12px;
    color: var(--sp-text-muted, #94a3b8);
    margin: 3px 0 0 0;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .sp-env-toolbar {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }

  .sp-tool-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--sp-text-muted, #94a3b8);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .sp-tool-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--sp-text, #f1f5f9);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .sp-tool-btn.btn-danger:hover {
    background: rgba(239, 68, 68, 0.12);
    color: #ef4444;
    border-color: rgba(239, 68, 68, 0.2);
  }

  .sp-env-block {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 7px;
    padding: 8px 10px;
    border: 1px solid rgba(255, 255, 255, 0.04);
  }

  .sp-block-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .sp-block-title {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--sp-text-muted, #94a3b8);
  }

  .sp-mini-link-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: none;
    border: none;
    color: var(--sp-accent, #3b82f6);
    font-size: 11px;
    cursor: pointer;
    padding: 1px 4px;
    border-radius: 4px;
  }

  .sp-mini-link-btn:hover {
    background: rgba(59, 130, 246, 0.1);
  }

  .sp-block-empty {
    font-size: 11.5px;
    color: var(--sp-text-muted, #64748b);
    font-style: italic;
  }

  .sp-tools-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .sp-tool-tag {
    background: var(--sp-card-bg, #1e222b);
    border: 1px solid var(--sp-border, #333b4f);
    border-radius: 5px;
    padding: 2px 7px;
    font-size: 11.5px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .tool-name {
    color: var(--sp-text, #f1f5f9);
    font-weight: 500;
  }

  .tool-ver {
    color: #f59e0b;
    font-family: monospace;
    font-size: 10.5px;
  }

  .sp-envvars-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .sp-envvar-pill {
    font-size: 11px;
    font-family: monospace;
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 6px;
    border-radius: 4px;
    color: #e2e8f0;
  }

  .sp-envvar-more {
    font-size: 11px;
    color: var(--sp-text-muted, #94a3b8);
  }

  .sp-projects-block {
    margin-top: auto;
  }

  .sp-projects-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    max-height: 140px;
    overflow-y: auto;
    padding-right: 2px;
  }

  .sp-project-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: var(--sp-card-bg, #1a1e27);
    border: 1px solid var(--sp-border, #2d3343);
    border-radius: 5px;
    padding: 4px 8px;
    min-width: 0;
  }

  .sp-project-label {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }

  .sp-proj-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--sp-text, #f1f5f9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sp-proj-sub {
    font-size: 10.5px;
    color: var(--sp-text-muted, #64748b);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sp-proj-btn-group {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .sp-sub-btn {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.06);
    color: var(--sp-text-muted, #94a3b8);
    border-radius: 4px;
    cursor: pointer;
    font-size: 10px;
    transition: all 0.12s ease;
  }

  .sp-sub-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: var(--sp-text, #f1f5f9);
  }

  .sp-sub-btn.btn-del:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.15);
  }

  /* Modal Form */
  .sp-modal-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .sp-form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .sp-form-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--sp-text, #f1f5f9);
  }

  .sp-form-input {
    background: var(--sp-input-bg, #14171f);
    border: 1px solid var(--sp-border, #2d3343);
    border-radius: 8px;
    padding: 8px 12px;
    color: var(--sp-text, #f1f5f9);
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .sp-form-input:focus {
    border-color: #f59e0b;
  }

  .sp-isolation-options {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .sp-option-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    border: 1px solid var(--sp-border, #2d3343);
    border-radius: 8px;
    padding: 12px;
    background: var(--sp-card-bg, #181b22);
    cursor: pointer;
    transition: border-color 0.15s ease;
  }

  .sp-option-card.selected {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.05);
  }

  .sp-option-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .sp-option-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--sp-text, #f1f5f9);
  }

  .sp-option-desc {
    font-size: 12px;
    color: var(--sp-text-muted, #94a3b8);
    margin: 4px 0 0 0;
    line-height: 1.4;
  }

  .sp-envvars-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .sp-muted-text {
    font-size: 12px;
    color: var(--sp-text-muted, #64748b);
    margin: 0;
  }

  .sp-envvars-table {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sp-envvar-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .env-key-input {
    flex: 1;
    font-family: monospace;
    font-size: 13px;
  }

  .env-val-input {
    flex: 2;
    font-family: monospace;
    font-size: 13px;
  }

  .sp-eq {
    color: var(--sp-text-muted, #94a3b8);
    font-weight: 700;
  }

  .sp-row-del-btn {
    background: transparent;
    border: none;
    color: var(--sp-text-muted, #94a3b8);
    cursor: pointer;
    font-size: 14px;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .sp-row-del-btn:hover {
    color: #ef4444;
  }

  /* Modal Tools Table */
  .sp-form-hint {
    display: block;
    font-size: var(--sp-fs-xs);
    color: var(--sp-text-3);
    margin-top: 2px;
  }

  .sp-envvars-header-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .sp-tools-modal-table {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sp-tool-modal-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tool-id-input {
    width: 130px;
    font-family: var(--sp-font-mono);
    font-size: 13px;
    font-weight: var(--sp-fw-medium);
  }

  .tool-path-input {
    flex: 2;
    font-family: var(--sp-font-mono);
    font-size: 12px;
  }

  .tool-ver-input {
    width: 100px;
    font-family: var(--sp-font-mono);
    font-size: 12px;
    color: var(--sp-amber-fg, #f59e0b);
  }
</style>
