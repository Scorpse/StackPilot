<script lang="ts">
  import { i18n } from "$lib/core/i18n.svelte";
  import type { TranslationKey } from "$lib/core/i18n.svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { analyzeProjectV2, saveProfileV2 } from "$lib/modules/devlauncher/api";
  import { goto } from "$app/navigation";
  import {
    applyStepPatch,
    failurePolicyLabel,
    stepKindLabel,
    stepKindSummary,
    visibilityLabel,
    type DraftProfile,
    type FailurePolicy,
    type LaunchStep,
    type StepKind,
    type Visibility,
  } from "$lib/modules/devlauncher/types";
  import Icon from "$lib/components/ui/Icon.svelte";
  import type { IconName } from "$lib/components/ui/icons";
  import {
    buildStep,
    emptyAddTemplateDraft,
    type AddTemplate,
    type AddTemplateDraft,
  } from "$lib/modules/devlauncher/stepBuilder";
  import { markProfileCreated } from "$lib/modules/devlauncher/onboarding";
  import { markHelpDid, HELP, HINT_ANALYZE } from "$lib/core/help";
  import HelpHint from "$lib/components/ui/HelpHint.svelte";
  import PageContainer from "$lib/components/ui/PageContainer.svelte";
  import PageHeader from "$lib/components/ui/PageHeader.svelte";
  import Card from "$lib/components/ui/Card.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";

  let projectPath = $state("");
  let draft = $state<DraftProfile | null>(null);
  let loading = $state(false);
  let saving = $state(false);
  let error = $state("");
  let savedOk = $state(false);

  let expanded = $state(new Set<string>());
  let showAddPanel = $state(false);
  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  let addTpl = $state<AddTemplateDraft>(emptyAddTemplateDraft());

  const failurePolicies: Array<{ key: FailurePolicy; label: string }> = [
    { key: "stop_run", label: failurePolicyLabel("stop_run") },
    { key: "skip_dependents", label: failurePolicyLabel("skip_dependents") },
    { key: "warn_and_continue", label: failurePolicyLabel("warn_and_continue") },
  ];

  const visibilities: Array<{ key: Visibility; label: string }> = [
    { key: "captured", label: visibilityLabel("captured") },
    { key: "visible_terminal", label: visibilityLabel("visible_terminal") },
    { key: "detached", label: visibilityLabel("detached") },
  ];

  function addStep(tpl: AddTemplate) {
    if (!draft) return;
    const steps = [...draft.profile.steps, buildStep(tpl, addTpl, projectPath)];
    draft = { ...draft, profile: { ...draft.profile, steps } };
    addTpl = { ...addTpl, command: "", workdir: "", path: "", url: "" };
  }

  function removeStep(index: number) {
    if (!draft) return;
    const steps = draft.profile.steps.filter((_, i) => i !== index);
    draft = { ...draft, profile: { ...draft.profile, steps } };
  }

  function onDropStep(index: number) {
    if (dragIndex === null || dragIndex === index || !draft) return;
    const steps = [...draft.profile.steps];
    const [moved] = steps.splice(dragIndex, 1);
    steps.splice(index, 0, moved);
    draft = { ...draft, profile: { ...draft.profile, steps } };
    dragIndex = null;
    dragOverIndex = null;
  }

  async function pickFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: i18n.t("analyze.pick_project"),
      });
      if (selected) {
        projectPath = selected;
        draft = null;
        error = "";
        savedOk = false;
        // Автоматически запускаем анализ при выборе папки для быстрого UX
        void handleAnalyze();
      }
    } catch (e) {
      error = i18n.t("analyze.pick_error", { error: String(e) });
    }
  }

  async function handleAnalyze() {
    if (!projectPath) return;
    loading = true;
    error = "";
    savedOk = false;
    draft = null;
    expanded = new Set();
    try {
      draft = await analyzeProjectV2(projectPath);
      markHelpDid(HELP.devlAnalyzeDone);
    } catch (e) {
      error = i18n.t("analyze.scan_error", { error: String(e) });
    }
    loading = false;
  }

  async function handleSave() {
    if (!draft) return;
    saving = true;
    error = "";
    savedOk = false;
    try {
      await saveProfileV2(draft.profile);
      markProfileCreated();
      markHelpDid(HELP.devlAnalyzeDone);
      savedOk = true;
    } catch (e) {
      error = i18n.t("analyze.save_error", { error: String(e) });
    }
    saving = false;
  }

  function updateStep(index: number, patch: Partial<LaunchStep>) {
    if (!draft) return;
    const steps = draft.profile.steps.map((s, i) =>
      i === index ? applyStepPatch(s, patch) : s,
    );
    draft = { ...draft, profile: { ...draft.profile, steps } };
  }

  function toggleEnabled(index: number) {
    if (!draft) return;
    updateStep(index, { enabled: !draft.profile.steps[index].enabled });
  }

  function updateTimeout(index: number, raw: string) {
    const value = raw.trim();
    if (value === "") {
      updateStep(index, { timeout: null });
      return;
    }
    const num = parseInt(value, 10);
    if (!Number.isNaN(num) && num > 0) {
      updateStep(index, { timeout: num });
    }
  }

  function toggleExpand(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded = next;
  }

  function confidenceLabel(confidence: string): string {
    switch (confidence) {
      case "high": return i18n.t("analyze.confidence_high_label");
      case "medium": return i18n.t("analyze.confidence_medium_label");
      default: return i18n.t("analyze.confidence_low_label");
    }
  }

  function stepIconForKind(kind: StepKind): IconName {
    switch (kind.type) {
      case "open_terminal": return "terminal";
      case "run_command":
      case "run_script": return "play";
      case "open_folder": return "folder";
      case "open_url": return "globe";
      case "wait_for_port":
      case "wait_for_url":
      case "wait_for_docker": return "refresh";
      case "delay": return "clock";
      default: return "layers";
    }
  }
</script>

<PageContainer width="wide">
  <PageHeader
    title={i18n.t("analyze.title" as TranslationKey)}
    description={i18n.t("analyze.subtitle" as TranslationKey)}
    icon="search"
  >
    {#snippet actions()}
      {#if projectPath}
        <Button
          variant="secondary"
          size="sm"
          icon="folder"
          onclick={pickFolder}
        >
          {i18n.t("analyze.select_folder" as TranslationKey)}
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon="refresh"
          loading={loading}
          onclick={handleAnalyze}
        >
          {loading ? (i18n.t("analyze.analyzing" as TranslationKey)) : (i18n.t("analyze.analyze_btn" as TranslationKey))}
        </Button>
      {/if}
      {#if draft}
        <Button
          variant="primary"
          size="sm"
          icon="bookmark"
          loading={saving}
          onclick={handleSave}
        >
          {saving ? (i18n.t("analyze.saving" as TranslationKey)) : (i18n.t("analyze.save_profile" as TranslationKey))}
        </Button>
      {/if}
    {/snippet}
  </PageHeader>

  <HelpHint
    id={HINT_ANALYZE.id}
    resolvedBy={HINT_ANALYZE.resolvedBy}
    icon="search"
    title={i18n.t("help.analyze.title") as TranslationKey}
    text={i18n.t("help.analyze.body") as TranslationKey}
  />

  {#if error}
    <div class="sp-banner sp-banner-error" role="alert">
      <span class="sp-banner-icon"><Icon name="alert" size={16} /></span>
      <span class="sp-banner-text">{error}</span>
    </div>
  {/if}

  {#if savedOk}
    <div class="sp-banner sp-banner-success" role="status">
      <span class="sp-banner-icon"><Icon name="check" size={16} /></span>
      <div class="sp-banner-content">
        <strong>{i18n.t("analyze.saved" as TranslationKey)}</strong>
        <span class="sp-banner-desc">{i18n.t("analyze.profile_saved_detail")}</span>
      </div>
      <div class="sp-banner-actions">
        <Button size="sm" variant="primary" icon="layers" href="/workspace">
          {i18n.t("analyze.go_workspace")}
        </Button>
        <Button size="sm" variant="secondary" icon="bookmark" href="/devlauncher/profiles">
          {i18n.t("analyze.go_to_profiles" as TranslationKey)}
        </Button>
      </div>
    </div>
  {/if}

  {#if !draft}
    <!-- ================================================================
         Начальное состояние: Сканер проекта + Инфо-блоки возможностей
         ================================================================ -->
    <div class="sp-analyze-landing">
      <Card variant="elevated" padding="lg">
        <div class="sp-hero-scanner">
          <div class="sp-hero-icon-box" aria-hidden="true">
            <Icon name="search" size={28} />
          </div>
          <div class="sp-hero-body">
            <h2 class="sp-hero-title">
              {projectPath ? i18n.t("analyze.folder_ready") : i18n.t("analyze.choose_local")}
            </h2>
            <p class="sp-hero-desc">
              {i18n.t("analyze.intro_scan")}
            </p>

            {#if projectPath}
              <div class="sp-hero-path-box">
                <span class="sp-path-icon"><Icon name="folder" size={16} /></span>
                <span class="sp-path-text" title={projectPath}>{projectPath}</span>
                <Badge tone="lime" dot>{i18n.t("analyze.ready_badge")}</Badge>
              </div>
            {/if}

            <div class="sp-hero-actions">
              {#if !projectPath}
                <Button
                  variant="primary"
                  size="lg"
                  icon="folder"
                  onclick={pickFolder}
                >
                  {i18n.t("analyze.select_folder" as TranslationKey)}
                </Button>
              {:else}
                <Button
                  variant="primary"
                  size="lg"
                  icon="refresh"
                  loading={loading}
                  onclick={handleAnalyze}
                >
                  {loading ? (i18n.t("analyze.analyzing" as TranslationKey)) : i18n.t("analyze.start_analysis")}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  icon="folder"
                  onclick={pickFolder}
                >
                  {i18n.t("analyze.change_folder")}
                </Button>
              {/if}
            </div>
          </div>
        </div>
      </Card>

      <!-- Информационные блоки возможностей -->
      <div class="sp-features-grid">
        <Card variant="glass" padding="md">
          <div class="sp-feature-item">
            <div class="sp-feature-icon-badge" aria-hidden="true">
              <Icon name="layers" size={20} />
            </div>
            <h4 class="sp-feature-title">{i18n.t("analyze.detect_title")}</h4>
            <p class="sp-feature-desc">
              {i18n.t("analyze.detect_detail")}
            </p>
          </div>
        </Card>

        <Card variant="glass" padding="md">
          <div class="sp-feature-item">
            <div class="sp-feature-icon-badge" aria-hidden="true">
              <Icon name="terminal" size={20} />
            </div>
            <h4 class="sp-feature-title">{i18n.t("analyze.steps_title")}</h4>
            <p class="sp-feature-desc">
              {i18n.t("analyze.steps_detail")}
            </p>
          </div>
        </Card>

        <Card variant="glass" padding="md">
          <div class="sp-feature-item">
            <div class="sp-feature-icon-badge" aria-hidden="true">
              <Icon name="bookmark" size={20} />
            </div>
            <h4 class="sp-feature-title">{i18n.t("analyze.profile_title")}</h4>
            <p class="sp-feature-desc">
              {i18n.t("analyze.profile_detail")}
            </p>
          </div>
        </Card>
      </div>
    </div>
  {:else}
    <!-- ================================================================
         Результат анализа: Редактор профиля и сформированных действий
         ================================================================ -->
    <div class="sp-editor-layout">
      <!-- Верхняя сводка профиля -->
      <Card variant="elevated" padding="lg">
        <div class="sp-profile-summary">
          <div class="sp-profile-info">
            <div class="sp-profile-title-row">
              <h2 class="sp-profile-name">{draft.profile.name}</h2>
              <Badge tone="cyan">{i18n.t("analyze.draft_badge")}</Badge>
              <Badge tone="neutral">{i18n.t("analyze.action_count", { count: draft.profile.steps.length })}</Badge>
            </div>
            <p class="sp-profile-desc">{draft.profile.description || i18n.t("analyze.generated_description")}</p>
            <div class="sp-profile-path-chip">
              <Icon name="folder" size={14} />
              <span>{projectPath}</span>
            </div>
          </div>
          <div class="sp-profile-actions">
            <Button
              variant="primary"
              size="md"
              icon="bookmark"
              loading={saving}
              onclick={handleSave}
            >
              {saving ? (i18n.t("analyze.saving" as TranslationKey)) : (i18n.t("analyze.save_profile" as TranslationKey))}
            </Button>
          </div>
        </div>
      </Card>

      <!-- Диагностические заметки -->
      {#if draft.diagnostics.length > 0}
        <Card variant="glass" padding="md" title={i18n.t("analyze.diagnostics" as TranslationKey)}>
          <div class="sp-diagnostics-list">
            {#each draft.diagnostics as d, i (i)}
              <div
                class="sp-diag-item"
                class:sp-diag-warning={d.severity === "warning"}
                class:sp-diag-error={d.severity === "error"}
              >
                <div class="sp-diag-icon">
                  <Icon name={d.severity === "error" ? "alert" : "info"} size={15} />
                </div>
                <div class="sp-diag-text-block">
                  <span class="sp-diag-message">{d.message}</span>
                  {#if d.file}
                    <code class="sp-diag-file">{d.file}</code>
                  {/if}
                </div>
                <div class="sp-diag-meta">
                  <Badge tone={d.confidence === "high" ? "lime" : d.confidence === "medium" ? "amber" : "neutral"}>
                    {i18n.t("analyze.confidence" as TranslationKey)}: {confidenceLabel(d.confidence)}
                  </Badge>
                </div>
              </div>
            {/each}
          </div>
        </Card>
      {/if}

      <!-- Секция шагов запуска -->
      <Card variant="elevated" padding="md">
        {#snippet actions()}
          <div class="sp-steps-toolbar">
            <Button
              variant="secondary"
              size="sm"
              icon={showAddPanel ? "x" : "plus"}
              onclick={() => (showAddPanel = !showAddPanel)}
            >
              {showAddPanel ? (i18n.t("analyze.hide_templates") as TranslationKey) : (i18n.t("analyze.add_action") as TranslationKey)}
            </Button>
            <span class="sp-drag-hint">{i18n.t("analyze.drag_hint")}</span>
          </div>
        {/snippet}

        <div class="sp-steps-header">
          <h3 class="sp-section-heading">{i18n.t("analyze.launch_steps", { count: draft.profile.steps.length })}</h3>
        </div>

        {#if showAddPanel}
          <div class="sp-template-panel">
            <div class="sp-tpl-grid">
              <div class="sp-tpl-card">
                <div class="sp-tpl-info">
                  <span class="sp-tpl-name">{i18n.t("analyze.empty_terminal")}</span>
                  <span class="sp-tpl-desc">{i18n.t("analyze.empty_terminal_detail")}</span>
                </div>
                <Button size="sm" variant="secondary" icon="plus" onclick={() => addStep({ kind: "terminal_plain" })}>
                  {i18n.t("analyze.add_step")}
                </Button>
              </div>

              <div class="sp-tpl-card sp-tpl-card-fields">
                <div class="sp-tpl-info">
                  <span class="sp-tpl-name">{i18n.t("analyze.terminal_command")}</span>
                  <span class="sp-tpl-desc">{i18n.t("analyze.terminal_command_detail")}</span>
                </div>
                <div class="sp-tpl-inputs">
                  <input type="text" placeholder={i18n.t("analyze.dev_command_placeholder")} bind:value={addTpl.command} />
                  <input type="text" placeholder={i18n.t("analyze.working_dir_placeholder")} bind:value={addTpl.workdir} />
                </div>
                <Button size="sm" variant="secondary" icon="plus" onclick={() => addStep({ kind: "terminal_cmd" })}>
                  {i18n.t("analyze.add_step")}
                </Button>
              </div>

              <div class="sp-tpl-card sp-tpl-card-fields">
                <div class="sp-tpl-info">
                  <span class="sp-tpl-name">{i18n.t("analyze.run_command")}</span>
                  <span class="sp-tpl-desc">{i18n.t("analyze.run_command_detail")}</span>
                </div>
                <div class="sp-tpl-inputs">
                  <input type="text" placeholder={i18n.t("analyze.test_command_placeholder")} bind:value={addTpl.command} />
                  <input type="text" placeholder={i18n.t("analyze.working_dir_placeholder")} bind:value={addTpl.workdir} />
                </div>
                <Button size="sm" variant="secondary" icon="plus" onclick={() => addStep({ kind: "run_command" })}>
                  {i18n.t("analyze.add_step")}
                </Button>
              </div>

              <div class="sp-tpl-card sp-tpl-card-fields">
                <div class="sp-tpl-info">
                  <span class="sp-tpl-name">{i18n.t("analyze.open_folder")}</span>
                  <span class="sp-tpl-desc">{i18n.t("analyze.open_folder_detail")}</span>
                </div>
                <div class="sp-tpl-inputs">
                  <input type="text" placeholder={i18n.t("analyze.project_path_placeholder")} bind:value={addTpl.path} />
                </div>
                <Button size="sm" variant="secondary" icon="plus" onclick={() => addStep({ kind: "open_folder" })}>
                  {i18n.t("analyze.add_step")}
                </Button>
              </div>

              <div class="sp-tpl-card sp-tpl-card-fields">
                <div class="sp-tpl-info">
                  <span class="sp-tpl-name">{i18n.t("analyze.open_url")}</span>
                  <span class="sp-tpl-desc">{i18n.t("analyze.open_url_detail")}</span>
                </div>
                <div class="sp-tpl-inputs">
                  <input type="text" placeholder="http://localhost:3000" bind:value={addTpl.url} />
                </div>
                <Button size="sm" variant="secondary" icon="plus" onclick={() => addStep({ kind: "open_url" })}>
                  {i18n.t("analyze.add_step")}
                </Button>
              </div>

              <div class="sp-tpl-card sp-tpl-card-fields">
                <div class="sp-tpl-info">
                  <span class="sp-tpl-name">{i18n.t("analyze.wait_port")}</span>
                  <span class="sp-tpl-desc">{i18n.t("analyze.wait_port_detail")}</span>
                </div>
                <div class="sp-tpl-inputs sp-tpl-inputs-row">
                  <input type="text" placeholder={i18n.t("analyze.host_placeholder")} bind:value={addTpl.host} style="width: 110px;" />
                  <input type="number" placeholder={i18n.t("analyze.port_placeholder")} bind:value={addTpl.port} style="width: 90px;" />
                  <input type="number" placeholder={i18n.t("analyze.timeout_placeholder")} bind:value={addTpl.timeout} style="width: 110px;" />
                </div>
                <Button size="sm" variant="secondary" icon="plus" onclick={() => addStep({ kind: "wait_port" })}>
                  {i18n.t("analyze.add_step")}
                </Button>
              </div>

              <div class="sp-tpl-card sp-tpl-card-fields">
                <div class="sp-tpl-info">
                  <span class="sp-tpl-name">{i18n.t("analyze.delay_step")}</span>
                  <span class="sp-tpl-desc">{i18n.t("analyze.delay_detail")}</span>
                </div>
                <div class="sp-tpl-inputs sp-tpl-inputs-row">
                  <input type="number" placeholder={i18n.t("analyze.seconds_placeholder")} bind:value={addTpl.seconds} style="width: 120px;" />
                </div>
                <Button size="sm" variant="secondary" icon="plus" onclick={() => addStep({ kind: "delay" })}>
                  {i18n.t("analyze.add_step")}
                </Button>
              </div>
            </div>
          </div>
        {/if}

        <div class="sp-action-list" role="list">
          {#each draft.profile.steps as step, i (step.id)}
            <div
              class="sp-action-card"
              class:expanded={expanded.has(step.id)}
              class:disabled={!step.enabled}
              class:drag-over={dragOverIndex === i}
              draggable="true"
              ondragstart={(e) => {
                dragIndex = i;
                if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
              }}
              ondragover={(e) => {
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                dragOverIndex = i;
              }}
              ondragleave={() => {
                if (dragOverIndex === i) dragOverIndex = null;
              }}
              ondrop={(e) => {
                e.preventDefault();
                onDropStep(i);
              }}
              ondragend={() => {
                dragIndex = null;
                dragOverIndex = null;
              }}
            >
              <div class="sp-card-row">
                <div class="sp-drag-handle" title={i18n.t("analyze.drag_reorder" as TranslationKey)}>
                  <span>⋮⋮</span>
                </div>

                <div class="sp-step-kind-icon" aria-hidden="true">
                  <Icon name={stepIconForKind(step.kind)} size={16} />
                </div>

                <div
                  class="sp-step-details"
                  onclick={() => toggleExpand(step.id)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => e.key === "Enter" && toggleExpand(step.id)}
                >
                  <div class="sp-step-header-line">
                    <span class="sp-step-title">{step.label || i18n.t("analyze.untitled" as TranslationKey)}</span>
                    <Badge tone="neutral">{stepKindLabel(step.kind)}</Badge>
                  </div>
                  <span class="sp-step-summary">{stepKindSummary(step.kind)}</span>
                </div>

                <div class="sp-step-controls">
                  <button
                    type="button"
                    class="sp-toggle-pill"
                    class:on={step.enabled}
                    onclick={() => toggleEnabled(i)}
                    title={step.enabled ? (i18n.t("analyze.disable" as TranslationKey)) : (i18n.t("analyze.enable" as TranslationKey))}
                  >
                    {step.enabled ? (i18n.t("analyze.on" as TranslationKey)) : (i18n.t("analyze.off" as TranslationKey))}
                  </button>

                  <button
                    type="button"
                    class="sp-icon-action-btn"
                    class:expanded={expanded.has(step.id)}
                    onclick={() => toggleExpand(step.id)}
                    title={i18n.t("analyze.expand" as TranslationKey)}
                  >
                    <Icon name="chevronRight" size={14} />
                  </button>

                  <button
                    type="button"
                    class="sp-icon-action-btn sp-action-delete"
                    onclick={() => removeStep(i)}
                    title={i18n.t("analyze.delete" as TranslationKey)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>

              {#if expanded.has(step.id)}
                <div class="sp-card-editor-panel">
                  <div class="sp-editor-grid">
                    <div class="sp-field">
                      <label for="step-label-{step.id}">{i18n.t("analyze.label" as TranslationKey)}</label>
                      <input
                        id="step-label-{step.id}"
                        type="text"
                        value={step.label}
                        oninput={(e) => updateStep(i, { label: (e.target as HTMLInputElement).value })}
                        placeholder={i18n.t("analyze.label_placeholder" as TranslationKey)}
                      />
                    </div>

                    <div class="sp-field">
                      <label for="step-timeout-{step.id}">{i18n.t("analyze.timeout_default")}</label>
                      <input
                        id="step-timeout-{step.id}"
                        type="number"
                        value={step.timeout ?? ""}
                        oninput={(e) => updateTimeout(i, (e.target as HTMLInputElement).value)}
                        placeholder="120"
                      />
                    </div>

                    <div class="sp-field">
                      <label for="step-fail-{step.id}">{i18n.t("analyze.failure_policy_label")}</label>
                      <select
                        id="step-fail-{step.id}"
                        value={step.failure_policy ?? ""}
                        onchange={(e) => {
                          const v = (e.target as HTMLSelectElement).value;
                          updateStep(i, { failure_policy: (v as FailurePolicy) || null });
                        }}
                      >
                        <option value="">{failurePolicyLabel(null)}</option>
                        {#each failurePolicies as fp}
                          <option value={fp.key}>{fp.label}</option>
                        {/each}
                      </select>
                    </div>

                    <div class="sp-field">
                      <label for="step-vis-{step.id}">{i18n.t("analyze.terminal_visibility")}</label>
                      <select
                        id="step-vis-{step.id}"
                        value={step.visibility ?? ""}
                        onchange={(e) => {
                          const v = (e.target as HTMLSelectElement).value;
                          updateStep(i, { visibility: (v as Visibility) || null });
                        }}
                      >
                        <option value="">{visibilityLabel(null)}</option>
                        {#each visibilities as vis}
                          <option value={vis.key}>{vis.label}</option>
                        {/each}
                      </select>
                    </div>
                  </div>

                  {#if (step.depends_on ?? []).length > 0}
                    <div class="sp-field sp-field-full">
                      <span class="sp-label">{i18n.t("analyze.runs_after")}</span>
                      <div class="sp-chips">
                        {#each step.depends_on ?? [] as dep}
                          <span class="sp-chip">{dep}</span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </Card>

      <!-- Нижняя кнопка сохранения -->
      <div class="sp-footer-save">
        <Button
          variant="primary"
          size="lg"
          icon="bookmark"
          loading={saving}
          onclick={handleSave}
        >
          {saving ? (i18n.t("analyze.saving" as TranslationKey)) : (i18n.t("analyze.save_profile" as TranslationKey))}
        </Button>
      </div>
    </div>
  {/if}
</PageContainer>

<style>
  /* Banners / Alerts */
  .sp-banner {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--sp-radius-lg);
    margin-bottom: var(--sp-6);
    font-size: var(--sp-fs-sm);
  }

  .sp-banner-error {
    background: var(--sp-danger-soft);
    color: var(--sp-danger);
    border: 1px solid var(--sp-danger-border);
  }

  .sp-banner-success {
    background: var(--sp-success-soft);
    color: var(--sp-success);
    border: 1px solid var(--sp-success-border);
    justify-content: space-between;
  }

  .sp-banner-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sp-banner-desc {
    color: var(--sp-text-2);
    font-size: var(--sp-fs-xs);
  }

  .sp-banner-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    flex-shrink: 0;
  }

  /* Landing Screen */
  .sp-analyze-landing {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
  }

  .sp-hero-scanner {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-5);
  }

  .sp-hero-icon-box {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.75rem;
    height: 3.75rem;
    border-radius: var(--sp-radius-xl);
    background: var(--sp-surface-grad), var(--sp-bg-2);
    color: var(--sp-accent);
    border: 1px solid var(--sp-border);
    box-shadow: var(--sp-gloss-top), 0 0 20px var(--sp-accent-glow);
    flex-shrink: 0;
  }

  .sp-hero-body {
    flex: 1;
    min-width: 0;
  }

  .sp-hero-title {
    margin: 0;
    font-size: var(--sp-fs-xl);
    font-weight: var(--sp-fw-bold);
    color: var(--sp-text-1);
    letter-spacing: -0.02em;
  }

  .sp-hero-desc {
    margin: var(--sp-2) 0 0;
    font-size: var(--sp-fs-sm);
    color: var(--sp-text-3);
    line-height: var(--sp-lh-normal);
    max-width: 48rem;
  }

  .sp-hero-path-box {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    margin-top: var(--sp-4);
    padding: var(--sp-2) var(--sp-3);
    background: var(--sp-bg-2);
    border: 1px solid var(--sp-border);
    border-radius: var(--sp-radius-md);
    max-width: 100%;
  }

  .sp-path-icon {
    color: var(--sp-text-3);
    display: flex;
  }

  .sp-path-text {
    font-family: var(--sp-font-mono);
    font-size: var(--sp-fs-xs);
    color: var(--sp-text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 38rem;
  }

  .sp-hero-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-top: var(--sp-5);
    flex-wrap: wrap;
  }

  /* Capabilities 3-Grid */
  .sp-features-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-4);
  }

  .sp-feature-item {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .sp-feature-icon-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--sp-radius-lg);
    background: var(--sp-surface-grad), var(--sp-bg-2);
    color: var(--sp-text-2);
    border: 1px solid var(--sp-border);
    box-shadow: var(--sp-gloss-top);
    margin-bottom: var(--sp-1);
  }

  .sp-feature-title {
    margin: 0;
    font-size: var(--sp-fs-md);
    font-weight: var(--sp-fw-semibold);
    color: var(--sp-text-1);
  }

  .sp-feature-desc {
    margin: 0;
    font-size: var(--sp-fs-xs);
    color: var(--sp-text-3);
    line-height: var(--sp-lh-normal);
  }

  /* Editor Layout */
  .sp-editor-layout {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
  }

  .sp-profile-summary {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--sp-4);
    flex-wrap: wrap;
  }

  .sp-profile-info {
    flex: 1;
    min-width: 0;
  }

  .sp-profile-title-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    flex-wrap: wrap;
  }

  .sp-profile-name {
    margin: 0;
    font-size: var(--sp-fs-xl);
    font-weight: var(--sp-fw-bold);
    color: var(--sp-text-1);
    letter-spacing: -0.02em;
  }

  .sp-profile-desc {
    margin: var(--sp-1) 0 0;
    font-size: var(--sp-fs-sm);
    color: var(--sp-text-3);
  }

  .sp-profile-path-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    margin-top: var(--sp-3);
    padding: 0.2rem 0.6rem;
    background: var(--sp-bg-2);
    border: 1px solid var(--sp-border);
    border-radius: var(--sp-radius-sm);
    font-family: var(--sp-font-mono);
    font-size: var(--sp-fs-xs);
    color: var(--sp-text-3);
  }

  .sp-profile-actions {
    flex-shrink: 0;
  }

  /* Diagnostics */
  .sp-diagnostics-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .sp-diag-item {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--sp-radius-md);
    background: var(--sp-bg-2);
    border: 1px solid var(--sp-border);
    font-size: var(--sp-fs-xs);
  }

  .sp-diag-item.sp-diag-warning {
    border-color: var(--sp-warning-border);
    background: var(--sp-warning-soft);
  }

  .sp-diag-item.sp-diag-error {
    border-color: var(--sp-danger-border);
    background: var(--sp-danger-soft);
  }

  .sp-diag-icon {
    display: flex;
    flex-shrink: 0;
  }

  .sp-diag-item.sp-diag-warning .sp-diag-icon { color: var(--sp-warning); }
  .sp-diag-item.sp-diag-error .sp-diag-icon { color: var(--sp-danger); }

  .sp-diag-text-block {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    flex-wrap: wrap;
  }

  .sp-diag-message {
    color: var(--sp-text-1);
  }

  .sp-diag-file {
    font-family: var(--sp-font-mono);
    font-size: var(--sp-fs-xs);
    color: var(--sp-text-3);
    background: var(--sp-bg-1);
    padding: 1px 4px;
    border-radius: var(--sp-radius-xs);
  }

  .sp-diag-meta {
    flex-shrink: 0;
  }

  /* Steps section */
  .sp-steps-header {
    margin-bottom: var(--sp-4);
  }

  .sp-section-heading {
    margin: 0;
    font-size: var(--sp-fs-md);
    font-weight: var(--sp-fw-semibold);
    color: var(--sp-text-1);
  }

  .sp-steps-toolbar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .sp-drag-hint {
    font-size: var(--sp-fs-xs);
    color: var(--sp-text-3);
  }

  /* Template Picker */
  .sp-template-panel {
    background: var(--sp-surface-grad), var(--sp-bg-2);
    border: 1px solid var(--sp-border);
    border-radius: var(--sp-radius-lg);
    padding: var(--sp-4);
    margin-bottom: var(--sp-4);
  }

  .sp-tpl-grid {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .sp-tpl-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-3);
    background: var(--sp-bg-1);
    border: 1px solid var(--sp-border);
    border-radius: var(--sp-radius-md);
  }

  .sp-tpl-card-fields {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .sp-tpl-info {
    flex: 1;
    min-width: 180px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sp-tpl-name {
    font-size: var(--sp-fs-sm);
    font-weight: var(--sp-fw-semibold);
    color: var(--sp-text-1);
  }

  .sp-tpl-desc {
    font-size: var(--sp-fs-xs);
    color: var(--sp-text-3);
  }

  .sp-tpl-inputs {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    flex: 2;
    min-width: 220px;
  }

  .sp-tpl-inputs-row {
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
  }

  .sp-tpl-inputs input {
    padding: 0.35rem 0.6rem;
    background: var(--sp-bg-2);
    border: 1px solid var(--sp-border);
    border-radius: var(--sp-radius-sm);
    font-size: var(--sp-fs-xs);
    color: var(--sp-text-1);
    font-family: inherit;
  }

  .sp-tpl-inputs input:focus {
    outline: none;
    border-color: var(--sp-accent);
  }

  /* Action Cards List */
  .sp-action-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .sp-action-card {
    background: var(--sp-surface-grad), var(--sp-bg-1);
    border: 1px solid var(--sp-border);
    border-radius: var(--sp-radius-lg);
    box-shadow: var(--sp-gloss-top), var(--sp-shadow-1);
    transition: all 0.15s ease;
  }

  .sp-action-card.disabled {
    opacity: 0.55;
  }

  .sp-action-card.drag-over {
    border-color: var(--sp-accent);
    box-shadow: 0 0 16px var(--sp-accent-glow);
  }

  .sp-card-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: 0.65rem 0.85rem;
  }

  .sp-drag-handle {
    cursor: grab;
    color: var(--sp-text-3);
    font-size: 0.85rem;
    user-select: none;
    padding: 0 2px;
  }

  .sp-drag-handle:active {
    cursor: grabbing;
  }

  .sp-step-kind-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: var(--sp-radius-md);
    background: var(--sp-bg-2);
    border: 1px solid var(--sp-border);
    color: var(--sp-text-2);
    flex-shrink: 0;
  }

  .sp-step-details {
    flex: 1;
    min-width: 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sp-step-header-line {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .sp-step-title {
    font-size: var(--sp-fs-sm);
    font-weight: var(--sp-fw-semibold);
    color: var(--sp-text-1);
  }

  .sp-step-summary {
    font-size: var(--sp-fs-xs);
    color: var(--sp-text-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sp-step-controls {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    flex-shrink: 0;
  }

  .sp-toggle-pill {
    padding: 0.2rem 0.55rem;
    border-radius: var(--sp-radius-sm);
    border: 1px solid var(--sp-border);
    background: var(--sp-bg-2);
    color: var(--sp-text-3);
    font-size: var(--sp-fs-xs);
    font-weight: var(--sp-fw-bold);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sp-toggle-pill.on {
    background: var(--sp-success-soft);
    border-color: var(--sp-success-border);
    color: var(--sp-success);
  }

  .sp-icon-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.85rem;
    height: 1.85rem;
    border-radius: var(--sp-radius-md);
    border: 1px solid var(--sp-border);
    background: transparent;
    color: var(--sp-text-3);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .sp-icon-action-btn:hover {
    background: var(--sp-bg-2);
    color: var(--sp-text-1);
  }

  .sp-icon-action-btn.expanded :global(.sp-icon) {
    transform: rotate(90deg);
  }

  .sp-icon-action-btn :global(.sp-icon) {
    transition: transform 0.15s ease;
  }

  .sp-action-delete:hover {
    background: var(--sp-danger-soft);
    border-color: var(--sp-danger-border);
    color: var(--sp-danger);
  }

  /* Card Expanded Form */
  .sp-card-editor-panel {
    border-top: 1px solid var(--sp-border);
    padding: var(--sp-4);
    background: var(--sp-surface-grad), var(--sp-bg-2);
    border-radius: 0 0 var(--sp-radius-lg) var(--sp-radius-lg);
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .sp-editor-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--sp-3);
  }

  .sp-field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .sp-field-full {
    grid-column: 1 / -1;
  }

  .sp-field label,
  .sp-field .sp-label {
    font-size: var(--sp-fs-xs);
    font-weight: var(--sp-fw-medium);
    color: var(--sp-text-2);
  }

  .sp-field input,
  .sp-field select {
    padding: 0.4rem 0.65rem;
    background: var(--sp-bg-1);
    border: 1px solid var(--sp-border);
    border-radius: var(--sp-radius-md);
    color: var(--sp-text-1);
    font-size: var(--sp-fs-sm);
    font-family: inherit;
    transition: border-color 0.15s ease;
  }

  .sp-field input:focus,
  .sp-field select:focus {
    outline: none;
    border-color: var(--sp-accent);
  }

  .sp-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1);
    margin-top: var(--sp-1);
  }

  .sp-chip {
    padding: 0.15rem 0.5rem;
    border-radius: var(--sp-radius-xs);
    border: 1px solid var(--sp-border);
    background: var(--sp-bg-1);
    font-family: var(--sp-font-mono);
    font-size: var(--sp-fs-xs);
    color: var(--sp-text-2);
  }

  .sp-footer-save {
    display: flex;
    justify-content: center;
    padding: var(--sp-4) 0;
  }

  @media (max-width: 900px) {
    .sp-features-grid {
      grid-template-columns: 1fr;
    }
    .sp-editor-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
