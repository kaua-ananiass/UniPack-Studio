import {
  createProjectAudioSignedUrl,
  createCloudProjectRecord,
  deletePublishedAnimation,
  deleteCloudProjectRecord,
  fetchOwnProjects,
  fetchPublicAnimations,
  getCurrentSession,
  getCurrentUser,
  hasSupabaseConfig,
  onAuthStateChange,
  publishAnimation,
  removeProjectAudioClip,
  signInWithEmail,
  signOutCurrentUser,
  signUpWithEmail,
  uploadProjectAudioClip,
  updateCloudProjectRecord,
} from "./supabase-service.js";

const LED_LIBRARY_KEY = "unipack-led-library-v1";
const AUDIO_LIBRARY_KEY = "unipack-audio-library-v1";
const LAST_PROJECT_PATH_KEY = "unipack-last-project-path-v1";
const AUDIO_CLIP_DRAFT_DB_NAME = "unipack-audio-clip-drafts-v1";
const AUDIO_CLIP_DRAFT_STORE_NAME = "drafts";
const MIN_AUDIBLE_SAMPLE = 0.0025;
const MIN_CLIP_DURATION_SECONDS = 0.001;

const state = {
  project: null,
  currentChain: 1,
  selectedPadKey: null,
  selectedSoundIndex: 0,
  selectedLedIndex: 0,
  previewSpeedOverrides: {},
  ledPreviewTimers: [],
  localLedLibrary: loadLedLibrary(),
  remoteLedLibrary: [],
  ledLibrary: [],
  ledLibrarySyncing: false,
  ledLibrarySyncError: "",
  supabaseUserId: "",
  authMode: "signin",
  authUser: null,
  cloudProjects: [],
  cloudProjectsLoading: false,
  cloudProjectsError: "",
  ledLibraryPanelSubview: "local",
  ledCommunitySort: "rating_desc",
  editorAnimationLibraryPage: 0,
  ledLibraryPickerOpen: false,
  audioLibrary: [],
  audioLibraryPickerOpen: false,
  projectPanelOpen: false,
  currentView: "editor",
  audioClipSubview: "preview",
  editorMediaSubview: "preview",
  audioEditorChannel: new BroadcastChannel("unipack-audio-editor"),
  audio: new Audio(),
  audioObjectUrl: "",
  audioClipEditor: createInitialAudioClipEditorState(),
  ledStudioEditor: createInitialLedStudioEditorState(),
};

state.audio.preload = "auto";
syncLedLibraryState();

const LED_PRESETS = [
  ["custom", "Atual do arquivo"],
  ["single", "Fixo"],
  ["blink", "Pisca"],
  ["pulse", "Pulse"],
  ["ripple", "Ripple"],
  ["cross", "Cruz"],
  ["sweep-x", "Varredura horizontal"],
  ["sweep-y", "Varredura vertical"],
];

const LAUNCHPAD_ARGB = [
  0x00000000, 0x77fafafa, 0xaafafafa, 0xfffafafa, 0xfff8bbd0, 0xffef5350, 0xffe57373, 0xffef9a9a,
  0xfffff3e0, 0xffffa726, 0xffffb960, 0xffffcc80, 0xffffe0b2, 0xffffee58, 0xfffff59d, 0xfffff9c4,
  0xffdcedc8, 0xff8bc34a, 0xffaed581, 0xffbfdf9f, 0xff5ee2b0, 0xff00ce3c, 0xff00ba43, 0xff119c3f,
  0xff57ecc1, 0xff00e864, 0xff00e05c, 0xff00d545, 0xff7afddd, 0xff00e4c5, 0xff00e0b2, 0xff01eec6,
  0xff49efef, 0xff00e7d8, 0xff00e5d1, 0xff01efde, 0xff6addff, 0xff00dafe, 0xff01d6ff, 0xff08acdc,
  0xff73cefe, 0xff0d9bf7, 0xff148de4, 0xff2a77c9, 0xff8693ff, 0xff2196f3, 0xff4668f6, 0xff4153dc,
  0xffb095ff, 0xff8453fd, 0xff634acd, 0xff5749c5, 0xffffb7ff, 0xffe863fb, 0xffd655ed, 0xffd14fe9,
  0xfffc99e3, 0xffe736c2, 0xffe52fbe, 0xffe334b6, 0xffed353e, 0xffffa726, 0xfff4df0b, 0xff8bc34a,
  0xff5cd100, 0xff00d29e, 0xff2388ff, 0xff3669fd, 0xff00b4d0, 0xff475cdc, 0xddfafafa, 0xccfafafa,
  0xfff72737, 0xffd2ea7b, 0xffc8df10, 0xff7fe422, 0xff00c931, 0xff00d7a6, 0xff00d8fc, 0xff0b9bfc,
  0xff585cf5, 0xffac59f0, 0xffd980dc, 0xffb8814a, 0xffff9800, 0xffabdf22, 0xff9ee154, 0xff66bb6a,
  0xff3bda47, 0xff6fdeb9, 0xff27dbda, 0xff9cc8fd, 0xff79b8f7, 0xffafafef, 0xffd580eb, 0xfff74fca,
  0xffea8a1f, 0xffdbdb08, 0xff9cd60d, 0xfff3d335, 0xffc8af41, 0xff00ca69, 0xff24d2b0, 0xff757ebe,
  0xff5388db, 0xffe5c5a6, 0xffe93b3b, 0xfff9a2a1, 0xffed9c65, 0xffe1ca72, 0xffb8da78, 0xff98d52c,
  0xff626cbd, 0xffcac8a0, 0xff90d4c2, 0xffceddfe, 0xffbeccf7, 0x55fafafa, 0x77fafafa, 0xaafafafa,
  0xfffe1624, 0xffcd2724, 0xff9ccc65, 0xff009c1b, 0xffffff00, 0xffbeb212, 0xfff5d01d, 0xffe37829,
];

const refs = {
  appShell: document.querySelector("#app-shell"),
  projectPath: document.querySelector("#project-path"),
  pickProjectPath: document.querySelector("#pick-project-path"),
  createProject: document.querySelector("#create-project"),
  loadProject: document.querySelector("#load-project"),
  saveProject: document.querySelector("#save-project"),
  exportProject: document.querySelector("#export-project"),
  status: document.querySelector("#status"),
  projectToolbarShell: document.querySelector("#project-toolbar-shell"),
  authTabs: document.querySelector("#auth-tabs"),
  authSigninTab: document.querySelector("#auth-signin-tab"),
  authSignupTab: document.querySelector("#auth-signup-tab"),
  authGuestPanel: document.querySelector("#auth-guest-panel"),
  authUserPanel: document.querySelector("#auth-user-panel"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  authSubmit: document.querySelector("#auth-submit"),
  authStatus: document.querySelector("#auth-status"),
  authUserName: document.querySelector("#auth-user-name"),
  authUserEmail: document.querySelector("#auth-user-email"),
  authUserMeta: document.querySelector("#auth-user-meta"),
  authSignout: document.querySelector("#auth-signout"),
  cloudProjectShell: document.querySelector("#cloud-project-shell"),
  cloudProjectTitle: document.querySelector("#cloud-project-title"),
  cloudProjectSubtitle: document.querySelector("#cloud-project-subtitle"),
  cloudProjectName: document.querySelector("#cloud-project-name"),
  cloudProjectCreate: document.querySelector("#cloud-project-create"),
  cloudProjectSave: document.querySelector("#cloud-project-save"),
  cloudProjectRefresh: document.querySelector("#cloud-project-refresh"),
  cloudProjectStatus: document.querySelector("#cloud-project-status"),
  cloudProjectList: document.querySelector("#cloud-project-list"),
  stats: document.querySelector("#stats"),
  infoFields: document.querySelector("#info-fields"),
  extraInfo: document.querySelector("#extra-info"),
  addExtraInfo: document.querySelector("#add-extra-info"),
  toggleProjectPanel: document.querySelector("#toggle-project-panel"),
  projectPanel: document.querySelector("#project-panel"),
  projectTitlePill: document.querySelector("#project-title-pill"),
  chainTabs: document.querySelector("#chain-tabs"),
  currentChainLabel: document.querySelector("#current-chain-label"),
  soundLibrary: document.querySelector("#sound-library"),
  soundCountPill: document.querySelector("#sound-count-pill"),
  soundOptions: document.querySelector("#sound-options"),
  audioSidebar: document.querySelector(".audio-sidebar"),
  padGrid: document.querySelector("#pad-grid"),
  selectedPadBadge: document.querySelector("#selected-pad-badge"),
  soundEditor: document.querySelector("#sound-editor"),
  ledEditor: document.querySelector("#led-editor"),
  viewNavbar: document.querySelector(".view-navbar"),
  audioLibraryPanel: document.querySelector("#audio-library-panel"),
  toggleAudioLibrary: document.querySelector("#toggle-audio-library"),
  addSoundRow: document.querySelector("#add-sound-row"),
  addLedAnimation: document.querySelector("#add-led-animation"),
  ledPrevAnimation: document.querySelector("#led-prev-animation"),
  ledNextAnimation: document.querySelector("#led-next-animation"),
  mainViewShell: document.querySelector("#main-view-shell"),
  mainWorkspace: document.querySelector("#main-workspace"),
  viewMainTab: document.querySelector("#view-main-tab"),
  viewAudioTab: document.querySelector("#view-audio-tab"),
  viewLedTab: document.querySelector("#view-led-tab"),
  viewLibraryTab: document.querySelector("#view-library-tab"),
  clipEditorPanel: document.querySelector("#clip-editor-panel"),
  clipViewPreviewTab: document.querySelector("#clip-view-preview-tab"),
  clipViewLibraryTab: document.querySelector("#clip-view-library-tab"),
  clipEditorPreviewView: document.querySelector("#clip-editor-preview-view"),
  clipLibraryView: document.querySelector("#clip-library-view"),
  ledStudioPanel: document.querySelector("#led-studio-panel"),
  ledStudioPadPill: document.querySelector("#led-studio-pad-pill"),
  ledStudioAddButton: document.querySelector("#led-studio-add-button"),
  ledStudioContent: document.querySelector("#led-studio-content"),
  ledLibraryPanel: document.querySelector("#led-library-panel"),
  ledLibraryPadPill: document.querySelector("#led-library-pad-pill"),
  ledLibraryContent: document.querySelector("#led-library-content"),
  clipPadPill: document.querySelector("#clip-pad-pill"),
  clipCloseButton: document.querySelector("#clip-close-button"),
  clipFileInput: document.querySelector("#clip-file-input"),
  clipName: document.querySelector("#clip-name"),
  clipStartInput: document.querySelector("#clip-start-input"),
  clipEndInput: document.querySelector("#clip-end-input"),
  clipZoomInput: document.querySelector("#clip-zoom-input"),
  clipStretchInput: document.querySelector("#clip-stretch-input"),
  clipPreviewButton: document.querySelector("#clip-preview-button"),
  clipSaveButton: document.querySelector("#clip-save-button"),
  clipContinueButton: document.querySelector("#clip-continue-button"),
  clipFullButton: document.querySelector("#clip-full-button"),
  clipZoomFitButton: document.querySelector("#clip-zoom-fit-button"),
  clipStatus: document.querySelector("#clip-status"),
  clipSelectionLength: document.querySelector("#clip-selection-length"),
  clipZoomValue: document.querySelector("#clip-zoom-value"),
  clipStretchValue: document.querySelector("#clip-stretch-value"),
  clipWindowValue: document.querySelector("#clip-window-value"),
  clipPlayheadValue: document.querySelector("#clip-playhead-value"),
  clipPanLeftButton: document.querySelector("#clip-pan-left-button"),
  clipPanSlider: document.querySelector("#clip-pan-slider"),
  clipPanRightButton: document.querySelector("#clip-pan-right-button"),
  clipCanvasWrap: document.querySelector("#clip-canvas-wrap"),
  clipCanvas: document.querySelector("#clip-canvas"),
  clipSelectionOverlay: document.querySelector("#clip-selection-overlay"),
  clipSelectionWindow: document.querySelector("#clip-selection-window"),
  clipStartHandle: document.querySelector("#clip-start-handle"),
  clipEndHandle: document.querySelector("#clip-end-handle"),
};

const clipCanvasContext = refs.clipCanvas?.getContext("2d");

const infoFieldConfig = [
  { key: "title", label: "Titulo", type: "text" },
  { key: "producerName", label: "Produtor", type: "text" },
  { key: "buttonX", label: "Pads na horizontal", type: "number" },
  { key: "buttonY", label: "Pads na vertical", type: "number" },
  { key: "chain", label: "Quantidade de chains", type: "number" },
  { key: "squareButton", label: "Square Button", type: "boolean" },
  { key: "landscape", label: "Landscape", type: "boolean" },
  { key: "website", label: "Website", type: "text" },
];

refs.createProject.addEventListener("click", () => createProject());
refs.pickProjectPath.addEventListener("click", async () => {
  await chooseFolderInto(refs.projectPath);
});
refs.loadProject.addEventListener("click", () => loadProject());
refs.saveProject.addEventListener("click", () => saveProject());
refs.exportProject.addEventListener("click", () => exportProjectZip());
refs.authSigninTab?.addEventListener("click", () => {
  state.authMode = "signin";
  renderAuthPanel();
});
refs.authSignupTab?.addEventListener("click", () => {
  state.authMode = "signup";
  renderAuthPanel();
});
refs.authSubmit?.addEventListener("click", () => {
  void handleAuthSubmit();
});
refs.authPassword?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    void handleAuthSubmit();
  }
});
refs.authSignout?.addEventListener("click", () => {
  void handleAuthSignOut();
});
refs.cloudProjectCreate?.addEventListener("click", () => {
  void createCloudProjectFromUi();
});
refs.cloudProjectSave?.addEventListener("click", () => {
  void saveCurrentProjectOnline();
});
refs.cloudProjectRefresh?.addEventListener("click", () => {
  void refreshCloudProjects({ quiet: false });
});
refs.toggleProjectPanel.addEventListener("click", () => {
  state.projectPanelOpen = !state.projectPanelOpen;
  renderProjectPanelVisibility();
});
refs.addExtraInfo.addEventListener("click", () => {
  if (!state.project) return;
  state.project.infoExtra.push({ key: "", value: "" });
  renderInfo();
});
refs.toggleAudioLibrary.addEventListener("click", () => {
  refs.audioLibraryPanel?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
});
refs.addSoundRow.addEventListener("click", () => {
  const pad = getSelectedPad();
  if (!pad) return;
  pad.sounds.push({ soundFile: "", loop: 1, wormhole: null });
  state.selectedSoundIndex = pad.sounds.length - 1;
  renderSelectedPadEditor();
  renderGrid();
  renderStats();
});
refs.addLedAnimation.addEventListener("click", () => {
  const pad = getSelectedPad();
  if (!pad) return;
  state.ledLibraryPickerOpen = !state.ledLibraryPickerOpen;
  renderLedEditor(pad);
});
refs.ledPrevAnimation?.addEventListener("click", () => {
  const pad = getSelectedPad();
  if (!pad?.ledAnimations?.length) return;
  state.selectedLedIndex = Math.max(0, state.selectedLedIndex - 1);
  renderLedEditor(pad);
});
refs.ledNextAnimation?.addEventListener("click", () => {
  const pad = getSelectedPad();
  if (!pad?.ledAnimations?.length) return;
  state.selectedLedIndex = Math.min(pad.ledAnimations.length - 1, state.selectedLedIndex + 1);
  renderLedEditor(pad);
});
refs.viewMainTab.addEventListener("click", () => {
  state.currentView = "editor";
  renderViewNavigation();
});
refs.viewAudioTab.addEventListener("click", () => {
  const pad = getSelectedPad();
  if (pad && ensureAudioClipEditorTargetFromSelection()) {
    state.currentView = "audio";
    renderViewNavigation();
    renderAudioClipEditorPanel();
    resizeAudioClipCanvas();
    renderAudioClipEditorCanvas();
    return;
  }
  state.currentView = "audio";
  renderViewNavigation();
  renderAudioClipEditorPanel();
  resizeAudioClipCanvas();
  renderAudioClipEditorCanvas();
});
refs.viewLedTab.addEventListener("click", () => {
  state.currentView = "led";
  renderViewNavigation();
  renderLedStudioPanel();
});
refs.viewLibraryTab.addEventListener("click", () => {
  state.currentView = "library";
  renderViewNavigation();
  renderLedLibraryPanel();
});
refs.clipViewPreviewTab?.addEventListener("click", () => {
  state.audioClipSubview = "preview";
  renderAudioClipEditorPanel();
});
refs.clipViewLibraryTab?.addEventListener("click", () => {
  state.audioClipSubview = "library";
  renderAudioClipEditorPanel();
});
refs.ledStudioAddButton?.addEventListener("click", () => {
  const pad = getSelectedPad();
  if (!pad) return;
  state.ledLibraryPickerOpen = !state.ledLibraryPickerOpen;
  renderLedEditor(pad);
});
refs.clipCloseButton.addEventListener("click", () => closeAudioEditor());
refs.clipFileInput.addEventListener("click", () => {
  refs.clipFileInput.value = "";
});
refs.clipFileInput.addEventListener("change", async () => {
  const [file] = refs.clipFileInput.files || [];
  if (file) {
    ensureAudioClipEditorTargetFromSelection();
    await loadAudioClipFile(file);
  }
});
refs.clipName.addEventListener("input", () => {
  state.audioClipEditor.suggestedName = ensureWavFileName(refs.clipName.value || state.audioClipEditor.suggestedName);
  scheduleAudioClipDraftPersist();
});
refs.clipStartInput.addEventListener("input", () => {
  if (!state.audioClipEditor.audioBuffer) return;
  state.audioClipEditor.selectionStart = clampTime(
    parseFloatSafe(refs.clipStartInput.value, 0),
    0,
    state.audioClipEditor.selectionEnd
  );
  syncAudioClipInputs();
  renderAudioClipEditorCanvas();
  scheduleAudioClipDraftPersist();
});
refs.clipEndInput.addEventListener("input", () => {
  if (!state.audioClipEditor.audioBuffer) return;
  state.audioClipEditor.selectionEnd = clampTime(
    parseFloatSafe(refs.clipEndInput.value, state.audioClipEditor.audioBuffer.duration),
    state.audioClipEditor.selectionStart,
    state.audioClipEditor.audioBuffer.duration
  );
  syncAudioClipInputs();
  renderAudioClipEditorCanvas();
  scheduleAudioClipDraftPersist();
});
refs.clipZoomInput.addEventListener("input", () => {
  state.audioClipEditor.zoom = Math.max(1, parseFloatSafe(refs.clipZoomInput.value, 1));
  clampAudioClipViewAfterZoom();
  renderAudioClipEditorCanvas();
  scheduleAudioClipDraftPersist();
});
refs.clipStretchInput.addEventListener("input", () => {
  state.audioClipEditor.stretch = Math.max(1, parseFloatSafe(refs.clipStretchInput.value, 1.5));
  resizeAudioClipCanvas();
  renderAudioClipEditorCanvas();
  scheduleAudioClipDraftPersist();
});
refs.clipPreviewButton.addEventListener("click", async () => previewAudioClipSelection());
refs.clipSaveButton.addEventListener("click", async () => saveAudioClipSelection());
refs.clipContinueButton.addEventListener("click", () => continueAudioClipFromSelectionEnd());
refs.clipFullButton.addEventListener("click", () => {
  if (!state.audioClipEditor.audioBuffer) return;
  state.audioClipEditor.selectionStart = 0;
  state.audioClipEditor.selectionEnd = state.audioClipEditor.audioBuffer.duration;
  state.audioClipEditor.viewStartOverride = 0;
  syncAudioClipInputs();
  renderAudioClipEditorCanvas();
  scheduleAudioClipDraftPersist();
});
refs.clipZoomFitButton.addEventListener("click", () => {
  zoomAudioClipToSelection();
  scheduleAudioClipDraftPersist();
});
refs.clipPanLeftButton.addEventListener("click", () => {
  panAudioClipWindow(-1);
  scheduleAudioClipDraftPersist();
});
refs.clipPanRightButton.addEventListener("click", () => {
  panAudioClipWindow(1);
  scheduleAudioClipDraftPersist();
});
refs.clipPanSlider.addEventListener("input", () => {
  state.audioClipEditor.viewStartOverride = parseFloatSafe(refs.clipPanSlider.value, 0);
  renderAudioClipEditorCanvas();
  scheduleAudioClipDraftPersist();
});
refs.clipSelectionOverlay.addEventListener("pointerdown", (event) => {
  if (event.target === refs.clipSelectionOverlay) {
    handleAudioClipPointerDown(event);
  }
});
refs.clipStartHandle.addEventListener("pointerdown", (event) => beginAudioClipHandleDrag(event, "start"));
refs.clipEndHandle.addEventListener("pointerdown", (event) => beginAudioClipHandleDrag(event, "end"));
window.addEventListener("pointermove", (event) => handleAudioClipPointerMove(event));
window.addEventListener("pointerup", (event) => handleAudioClipPointerUp(event));
window.addEventListener("pointercancel", (event) => handleAudioClipPointerUp(event));
window.addEventListener("resize", () => {
  resizeAudioClipCanvas();
  renderAudioClipEditorCanvas();
});
state.audioEditorChannel.addEventListener("message", async (event) => {
  const payload = event.data || {};
  if (payload.type !== "clip-created" || !state.project) return;
  if (payload.projectPath !== state.project.projectPath) return;
  applyImportedClipToProject(payload.importedFile, payload.padKey, payload.soundIndex, payload.sound);
  setStatus("Corte recebido do editor de audio.", "success");
});

resizeAudioClipCanvas();
renderAudioClipEditorPanel();
renderAudioClipEditorCanvas();
initializeApp();

function initializeApp() {
  const savedPath = loadRememberedProjectPath();
  refs.projectPath.value = savedPath;
  renderAll();
  void initializeAuth();
  void initializeSupabaseLedLibrary();
  if (savedPath) {
    if (savedPath.startsWith("cloud:")) {
      refs.projectPath.value = "";
      setStatus("Entrando na conta para reabrir seu projeto online...", "");
      return;
    }
    void loadProject(savedPath, { fromRemembered: true });
    return;
  }
  setStatus("Escolha uma pasta para carregar um projeto ou criar um pack em branco.", "");
}

async function loadProject(path = refs.projectPath.value.trim(), options = {}) {
  const targetPath = String(path || "").trim();
  if (!targetPath) {
    setStatus("Escolha uma pasta de projeto para carregar.", "error");
    return false;
  }
  if (targetPath.startsWith("cloud:")) {
    const projectId = targetPath.slice("cloud:".length).trim();
    if (!projectId) {
      setStatus("Projeto online invalido.", "error");
      return false;
    }
    if (!state.authUser) {
      setStatus("Entre com sua conta para abrir este projeto online.", "error");
      return false;
    }
    let record = state.cloudProjects.find((entry) => entry.id === projectId);
    if (!record) {
      await refreshCloudProjects({ quiet: true, restoreRemembered: false });
      record = state.cloudProjects.find((entry) => entry.id === projectId);
    }
    if (!record) {
      setStatus("O projeto online nao foi encontrado na sua conta.", "error");
      clearRememberedProjectPath();
      return false;
    }
    openCloudProjectRecord(record);
    return true;
  }

  setStatus("Carregando projeto...");
  try {
    const response = await fetch(`/api/project?path=${encodeURIComponent(targetPath)}`);
    const project = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(project.error || "Falha ao carregar o projeto.");
    }

    state.project = normalizeProject(project);
    syncAudioLibraryFromProject(state.project);
    state.audioLibraryPickerOpen = false;
    refs.toggleAudioLibrary.textContent = "Biblioteca";
    resetAudioClipEditor();
    refs.projectPath.value = state.project.projectPath;
    rememberProjectPath(state.project.projectPath);
    state.currentChain = clampChain(state.currentChain, getChainCount());
    pickInitialPad();
    resetSelectedEditors();
    renderAll();
    await clearAudioClipDraftRecord(state.project.projectPath);
    setStatus("Projeto carregado com sucesso.", "success");
    return true;
  } catch (error) {
    if (options.fromRemembered) {
      clearRememberedProjectPath();
      refs.projectPath.value = "";
      renderAll();
      setStatus("O ultimo projeto salvo nao foi encontrado. Escolha outro projeto.", "error");
      return false;
    }
    setStatus(error.message || "Falha ao carregar o projeto.", "error");
    return false;
  }
}

async function createProject() {
  let chosenPath = refs.projectPath.value.trim();
  if (!chosenPath) {
    const picked = await chooseFolderInto(refs.projectPath);
    if (!picked) {
      setStatus("Escolha uma pasta para criar o projeto em branco.", "error");
      return;
    }
    chosenPath = refs.projectPath.value.trim();
  }
  const inferredName = chosenPath.split(/[\\/]/).filter(Boolean).pop() || "Novo UniPack";
  const payload = {
    projectPath: chosenPath,
    folderName: "",
    title: inferredName,
    producerName: "",
    buttonX: 8,
    buttonY: 8,
    chain: 8,
  };

  if (!payload.projectPath) {
    setStatus("Informe a pasta onde o novo projeto sera criado.", "error");
    return;
  }

  setStatus("Criando projeto...");
  try {
    const response = await fetch("/api/project/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const project = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(project.error || "Falha ao criar o projeto.");
    }

    state.project = normalizeProject(project);
    syncAudioLibraryFromProject(state.project);
    state.audioLibraryPickerOpen = false;
    refs.toggleAudioLibrary.textContent = "Biblioteca";
    resetAudioClipEditor();
    refs.projectPath.value = state.project.projectPath;
    rememberProjectPath(state.project.projectPath);
    state.currentChain = 1;
    pickInitialPad();
    resetSelectedEditors();
    renderAll();
    setStatus("Projeto criado com sucesso.", "success");
  } catch (error) {
    setStatus(error.message || "Falha ao criar o projeto.", "error");
  }
}

async function saveProject(options = {}) {
  if (!state.project) {
    const error = new Error("Nenhum projeto carregado para salvar.");
    if (!options.quiet) {
      setStatus(error.message, "error");
    }
    if (options.rethrow) {
      throw error;
    }
    return false;
  }
  if (isCloudProject()) {
    return saveCurrentProjectOnline(options);
  }
  if (!options.quiet) {
    setStatus("Salvando projeto...");
  }
  try {
    const preservedPadKey = state.selectedPadKey;
    const preservedSoundIndex = state.selectedSoundIndex;
    const preservedLedIndex = state.selectedLedIndex;
    const response = await fetch("/api/project/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.project),
    });
    const project = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(project.error || "Falha ao salvar o projeto.");
    }

    state.project = normalizeProject(project);
    syncAudioLibraryFromProject(state.project);
    rememberProjectPath(state.project.projectPath);
    state.currentChain = clampChain(state.currentChain, getChainCount());
    state.selectedPadKey = preservedPadKey;
    if (state.selectedPadKey && !state.project.pads[state.selectedPadKey]) {
      state.selectedPadKey = null;
      pickInitialPad();
    }
    state.selectedSoundIndex = preservedSoundIndex;
    state.selectedLedIndex = preservedLedIndex;
    renderAll();
    if (!options.quiet) {
      setStatus("Projeto salvo com sucesso.", "success");
    }
    return true;
  } catch (error) {
    if (!options.quiet) {
      setStatus(error.message || "Falha ao salvar o projeto.", "error");
    }
    if (options.rethrow) {
      throw error;
    }
    return false;
  }
}

async function exportProjectZip() {
  if (!state.project) {
    setStatus("Nenhum projeto carregado para exportar.", "error");
    return false;
  }
  if (isCloudProject()) {
    setStatus("Exportacao .zip ainda funciona apenas para projetos locais.", "error");
    return false;
  }

  setStatus("Salvando e exportando projeto...");
  try {
    await saveProject({ quiet: true, rethrow: true });
    const response = await fetch("/api/project/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectPath: state.project.projectPath,
        fileName: state.project.info?.title || projectFolderName(state.project.projectPath) || "UniPack",
      }),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(payload.error || "Falha ao exportar o projeto.");
    }
    if (payload.cancelled) {
      setStatus("Exportacao cancelada.", "");
      return false;
    }
    setStatus(`Projeto exportado em ${payload.exportPath}.`, "success");
    return true;
  } catch (error) {
    setStatus(error.message || "Falha ao exportar o projeto.", "error");
    return false;
  }
}

async function chooseFolderInto(input) {
  try {
    const initial = input.value.trim() || refs.projectPath.value.trim();
    const response = await fetch(`/api/folder/pick${initial ? `?initial=${encodeURIComponent(initial)}` : ""}`);
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(payload.error || "Nao foi possivel abrir o seletor de pasta.");
    }
    if (payload.cancelled || !payload.path) {
      return false;
    }
    input.value = payload.path;
    return true;
  } catch (error) {
    setStatus(error.message || "Falha ao escolher a pasta.", "error");
    return false;
  }
}

async function readJsonResponse(response) {
  const rawText = await response.text();
  try {
    return JSON.parse(rawText);
  } catch (error) {
    const isHtml = rawText.trim().startsWith("<!DOCTYPE") || rawText.trim().startsWith("<html");
    if (isHtml) {
      throw new Error("O servidor respondeu HTML em vez de JSON. Reinicie o `python3 server.py` e tente novamente.");
    }
    throw new Error(rawText.trim() || "Resposta invalida do servidor.");
  }
}

function normalizeProject(project) {
  if (!project || typeof project !== "object") {
    throw new Error("Resposta de projeto invalida.");
  }
  const normalized = structuredClone(project);
  normalized.info ||= {};
  normalized.infoExtra ||= [];
  normalized.pads ||= {};
  normalized.autoPlay ||= [];
  normalized.sounds ||= [];

  if (!normalized.info.buttonX) normalized.info.buttonX = "8";
  if (!normalized.info.buttonY) normalized.info.buttonY = "8";
  if (!normalized.info.chain) normalized.info.chain = "8";
  if (!normalized.info.squareButton) normalized.info.squareButton = "true";

  Object.values(normalized.pads).forEach((pad) => {
    pad.sounds ||= [];
    pad.ledAnimations ||= [];
    pad.sounds.forEach((sound) => {
      if (sound.loop === undefined || sound.loop === null || sound.loop === "") {
        sound.loop = 1;
      }
    });
    pad.ledAnimations.forEach((animation) => {
      animation.loop ||= 1;
      animation.events ||= [];
    });
  });

  return normalized;
}

function renderAll() {
  renderSessionLayout();
  renderHeaderBits();
  renderCloudProjectsPanel();
  renderProjectPanelVisibility();
  renderViewNavigation();
  renderStats();
  renderInfo();
  renderChainTabs();
  renderSoundLibrary();
  renderGrid();
  renderSelectedPadEditor();
  renderAudioLibraryPanel();
  renderAudioClipEditorPanel();
  renderLedStudioPanel();
  renderLedLibraryPanel();
}

function renderSessionLayout() {
  const hasUser = Boolean(state.authUser);
  const hasProject = Boolean(state.project);

  refs.appShell?.classList.toggle("is-auth-landing", !hasUser);
  refs.appShell?.classList.toggle("is-dashboard-mode", hasUser && !hasProject);
  refs.appShell?.classList.toggle("is-editor-session", hasUser && hasProject);

  if (refs.projectToolbarShell) {
    refs.projectToolbarShell.hidden = !hasProject;
    refs.projectToolbarShell.style.display = hasProject ? "grid" : "none";
  }
  if (refs.viewNavbar) {
    refs.viewNavbar.hidden = !hasProject;
    refs.viewNavbar.style.display = hasProject ? "" : "none";
  }
}

function renderViewNavigation() {
  if (!state.authUser || !state.project) {
    stopLedPreview("studio");
    stopLedPreview("pad");
    refs.mainViewShell.hidden = true;
    refs.mainViewShell.style.display = "none";
    refs.clipEditorPanel.hidden = true;
    refs.clipEditorPanel.style.display = "none";
    refs.ledStudioPanel.hidden = true;
    refs.ledStudioPanel.style.display = "none";
    refs.ledLibraryPanel.hidden = true;
    refs.ledLibraryPanel.style.display = "none";
    refs.viewMainTab.classList.remove("is-active");
    refs.viewAudioTab.classList.remove("is-active");
    refs.viewLedTab.classList.remove("is-active");
    refs.viewLibraryTab.classList.remove("is-active");
    return;
  }
  const isEditor = state.currentView === "editor";
  const isAudio = state.currentView === "audio";
  const isLed = state.currentView === "led";
  const isLibrary = state.currentView === "library";
  if (!isLed) {
    stopLedPreview("studio");
  }
  refs.mainViewShell.hidden = !isEditor;
  refs.mainViewShell.style.display = isEditor ? "" : "none";
  if (refs.audioSidebar) {
    refs.audioSidebar.hidden = isEditor;
  }
  refs.mainWorkspace.classList.toggle("is-editor-only", isEditor);
  refs.clipEditorPanel.hidden = !isAudio;
  refs.clipEditorPanel.style.display = isAudio ? "grid" : "none";
  refs.ledStudioPanel.hidden = !isLed;
  refs.ledStudioPanel.style.display = isLed ? "grid" : "none";
  refs.ledLibraryPanel.hidden = !isLibrary;
  refs.ledLibraryPanel.style.display = isLibrary ? "grid" : "none";
  refs.viewMainTab.classList.toggle("is-active", isEditor);
  refs.viewAudioTab.classList.toggle("is-active", isAudio);
  refs.viewLedTab.classList.toggle("is-active", isLed);
  refs.viewLibraryTab.classList.toggle("is-active", isLibrary);
}

function renderHeaderBits() {
  if (!state.project) {
    refs.projectTitlePill.textContent = "Nenhum projeto";
    refs.soundCountPill.textContent = "";
    refs.soundCountPill.hidden = true;
    refs.saveProject.disabled = true;
    refs.exportProject.disabled = true;
    refs.toggleProjectPanel.disabled = true;
    refs.projectPath.value = "";
    if (refs.cloudProjectName) {
      refs.cloudProjectName.value = "";
    }
    return;
  }
  refs.soundCountPill.hidden = false;
  refs.saveProject.disabled = false;
  refs.exportProject.disabled = isCloudProject();
  refs.toggleProjectPanel.disabled = false;
  refs.projectTitlePill.textContent = state.project.info.title || "Sem titulo";
  refs.soundCountPill.textContent = `${state.project.sounds.length} arquivos`;
  if (refs.cloudProjectName && isCloudProject()) {
    refs.cloudProjectName.value = state.project.projectName || state.project.info.title || "";
  }
  if (!isCloudProject()) {
    refs.projectPath.value = state.project.projectPath || "";
  }
}

function renderProjectPanelVisibility() {
  refs.projectPanel.hidden = !state.projectPanelOpen;
  refs.toggleProjectPanel.textContent = state.projectPanelOpen ? "Esconder projeto" : "Mostrar projeto";
}

function renderStats() {
  if (!state.project) {
    refs.stats.replaceChildren(createEmptyState("Carregue um projeto para ver os dados do pack."));
    return;
  }
  const stats = computeStats();
  refs.stats.replaceChildren(
    createStat(stats.buttonX * stats.buttonY, "pads por chain"),
    createStat(stats.chain, "chains"),
    createStat(stats.soundRows, "linhas em keySound"),
    createStat(stats.ledAnimations, "animacoes de LED"),
    createStat(stats.mappedPads, "pads mapeados")
  );
}

function renderInfo() {
  if (!state.project) {
    refs.infoFields.replaceChildren();
    refs.extraInfo.replaceChildren(createEmptyState("Carregue um projeto para editar o arquivo Info."));
    return;
  }

  refs.infoFields.replaceChildren(
    ...infoFieldConfig.map((field) => {
      if (field.type === "boolean") {
        return createBooleanField(field.label, state.project.info[field.key], (value) => {
          state.project.info[field.key] = value;
        });
      }
      return createInputField(field.label, state.project.info[field.key] ?? "", field.type, (value) => {
        state.project.info[field.key] = value;
        if (["buttonX", "buttonY", "chain", "title"].includes(field.key)) {
          state.currentChain = clampChain(state.currentChain, getChainCount());
          pickInitialPad();
          renderHeaderBits();
          renderStats();
          renderChainTabs();
          renderGrid();
          renderSelectedPadEditor();
        }
      });
    })
  );

  refs.extraInfo.replaceChildren(
    ...(state.project.infoExtra.length
      ? state.project.infoExtra.map((entry, index) => {
          const row = el("div", { className: "extra-row stack" });
          row.append(
            createInputField("Chave extra", entry.key, "text", (value) => {
              entry.key = value;
            }),
            createInputField("Valor", entry.value, "text", (value) => {
              entry.value = value;
            }),
            createMiniButton("Remover", () => {
              state.project.infoExtra.splice(index, 1);
              renderInfo();
            })
          );
          return row;
        })
      : [createEmptyState("Nenhuma chave extra no arquivo Info.")])
  );
}

function renderChainTabs() {
  if (!refs.chainTabs) {
    return;
  }
  if (!state.project) {
    refs.chainTabs.replaceChildren();
    return;
  }
  const chainCount = getChainCount();
  refs.chainTabs.replaceChildren(
    ...Array.from({ length: chainCount }, (_, index) => {
      const chain = index + 1;
      const button = createMiniButton(`Chain ${chain}`, () => selectChain(chain));
      button.classList.add("chain-tab");
      if (chain === state.currentChain) {
        button.classList.add("is-active");
      }
      return button;
    })
  );
}

function renderSoundLibrary() {
  if (!state.project) {
    refs.soundOptions.replaceChildren();
    refs.soundLibrary.replaceChildren(createEmptyState("Carregue um projeto para ver os audios da pasta Sounds/."));
    return;
  }
  refs.soundOptions.replaceChildren(
    ...state.project.sounds.map((sound) => el("option", { value: sound.path }))
  );

  refs.soundLibrary.replaceChildren(
    ...(state.project.sounds.length
      ? state.project.sounds.map((sound) =>
          el(
            "div",
            { className: "sound-item" },
            el("strong", { textContent: sound.name }),
            el("small", { textContent: sound.path })
          )
        )
      : [createEmptyState("Nenhum arquivo encontrado em Sounds/.")])
  );
}

function renderGrid() {
  if (!state.project) {
    refs.padGrid.style.setProperty("--grid-columns", 9);
    refs.padGrid.replaceChildren();
    return;
  }

  const buttonX = getButtonX();
  const buttonY = getButtonY();
  const chainCount = getChainCount();
  refs.padGrid.style.setProperty("--grid-columns", buttonX + 1);

  const buttons = [];
  for (let x = 1; x <= buttonX; x += 1) {
    const chainButtonNumber = x;
    for (let y = 1; y <= buttonY; y += 1) {
      const key = padKey(state.currentChain, x, y);
      const pad = state.project.pads[key];
      const button = el("button", { className: "pad-button", type: "button" });
      if (pad?.sounds?.length) button.classList.add("has-sound");
      if (pad?.ledAnimations?.length) button.classList.add("has-led");
      if (state.selectedPadKey === key) button.classList.add("is-selected");
      button.addEventListener("click", () => {
        state.selectedPadKey = key;
        resetSelectedEditors();
        renderGrid();
        renderSelectedPadEditor();
        previewSelectedPadMedia();
      });

      const soundsCount = pad?.sounds?.length || 0;
      const ledsCount = pad?.ledAnimations?.length || 0;
      button.append(
        el("strong", { textContent: `${x},${y}` }),
        el(
          "div",
          { className: "pad-meta" },
          el("span", { textContent: `${soundsCount} som` }),
          el("span", { textContent: `${ledsCount} led` })
        )
      );
      buttons.push(button);
    }
    buttons.push(createChainLaunchButton(chainButtonNumber, chainCount));
  }

  refs.padGrid.replaceChildren(...buttons);
}

function renderSelectedPadEditor() {
  if (!state.project) {
    refs.selectedPadBadge.textContent = "Sem projeto";
    if (refs.ledPrevAnimation) refs.ledPrevAnimation.disabled = true;
    if (refs.ledNextAnimation) refs.ledNextAnimation.disabled = true;
    refs.toggleAudioLibrary.disabled = true;
    refs.toggleAudioLibrary.textContent = "Biblioteca";
    refs.soundEditor.replaceChildren(createEmptyState("Carregue ou crie um projeto para editar os pads."));
    refs.ledEditor.replaceChildren(createProjectStartPanel());
    renderAudioLibraryPanel();
    renderAudioClipEditorPanel();
    renderLedStudioPanel();
    renderLedLibraryPanel();
    return;
  }

  const pad = getSelectedPad();
  if (!pad) {
    refs.selectedPadBadge.textContent = "Sem pad";
    if (refs.ledPrevAnimation) refs.ledPrevAnimation.disabled = true;
    if (refs.ledNextAnimation) refs.ledNextAnimation.disabled = true;
    refs.toggleAudioLibrary.disabled = true;
    refs.toggleAudioLibrary.textContent = "Biblioteca";
    refs.soundEditor.replaceChildren(createEmptyState("Nenhum pad selecionado."));
    refs.ledEditor.replaceChildren(createEmptyState("Nenhum pad selecionado."));
    renderAudioLibraryPanel();
    renderAudioClipEditorPanel();
    renderLedStudioPanel();
    renderLedLibraryPanel();
    return;
  }

  clampPadSelection(pad);
  refs.selectedPadBadge.textContent = `Chain ${pad.chain} · Pad ${pad.x},${pad.y}`;
  refs.toggleAudioLibrary.disabled = false;

  renderSoundEditor(pad);
  renderLedEditor(pad);
  renderAudioLibraryPanel();
  renderAudioClipEditorPanel();
  renderLedStudioPanel();
  renderLedLibraryPanel();
}

function selectChain(chain) {
  const targetChain = clampChain(chain, getChainCount());
  const currentPad = getSelectedPad();
  state.currentChain = targetChain;
  if (currentPad) {
    state.selectedPadKey = padKey(targetChain, currentPad.x, currentPad.y);
  } else {
    state.selectedPadKey = padKey(targetChain, 1, getButtonY());
  }
  resetSelectedEditors();
  renderHeaderBits();
  renderChainTabs();
  renderGrid();
  renderSelectedPadEditor();
  previewSelectedPadMedia();
}

function createChainLaunchButton(chain, chainCount) {
  const summary = summarizeChain(chain);
  const isAvailable = chain <= chainCount;
  const button = el("button", { className: "pad-button chain-launch-button", type: "button" });
  if (!isAvailable) {
    button.classList.add("is-disabled");
    button.disabled = true;
  } else {
    if (chain === state.currentChain) {
      button.classList.add("is-selected");
    }
    button.addEventListener("click", () => selectChain(chain));
  }

  button.append(
    el("span", { className: "chain-play-icon", "aria-hidden": "true" }),
    el(
      "span",
      { className: "chain-index-badge", textContent: `${chain}` }
    )
  );
  return button;
}

function summarizeChain(chain) {
  const summary = { sounds: 0, leds: 0, mappedPads: 0, color: "" };
  if (!state.project) return summary;

  Object.values(state.project.pads || {}).forEach((pad) => {
    if (pad.chain !== chain) return;
    const soundCount = pad.sounds?.length || 0;
    const ledCount = pad.ledAnimations?.length || 0;
    if (soundCount > 0 || ledCount > 0) {
      summary.mappedPads += 1;
    }
    summary.sounds += soundCount;
    summary.leds += ledCount;
    if (!summary.color && ledCount > 0) {
      const animation = (pad.ledAnimations || []).find((entry) => entry);
      if (animation) {
        summary.color = normalizeColor(animation.previewColor || inferAnimationColor(animation));
      }
    }
  });

  return summary;
}

function applyLaunchButtonColor(button, color) {
  const normalized = normalizeColor(color);
  button.style.background = `linear-gradient(160deg, ${normalized}, rgba(9, 20, 28, 0.92))`;
  button.style.boxShadow = `inset 0 0 0 1px rgba(255, 255, 255, 0.08), 0 0 18px ${normalized}`;
}

function renderSoundEditor(pad) {
  const sections = [createAudioImportPanel(pad)];
  if (state.audioLibraryPickerOpen) {
    sections.push(createAudioLibraryChooser(pad));
  }

  if (!pad.sounds.length) {
    sections.push(createEmptyState("Este pad ainda nao tem audio. Use o importador acima ou clique em 'Novo slot'."));
    refs.soundEditor.replaceChildren(...sections);
    return;
  }

  const index = state.selectedSoundIndex;
  const sound = pad.sounds[index];
  const focus = el("div", { className: "editor-focus stack" });
  focus.append(
    createFocusHeader(
      `Audio ${index + 1}`,
      `${pad.sounds.length} slot(s) neste pad`,
      [
        createMiniButton("Anterior", () => {
          state.selectedSoundIndex = Math.max(0, index - 1);
          renderSoundEditor(pad);
        }),
        createMiniButton("Proximo", () => {
          state.selectedSoundIndex = Math.min(pad.sounds.length - 1, index + 1);
          renderSoundEditor(pad);
        }),
      ]
    ),
    el(
      "div",
      { className: "editor-preview stack" },
      createInputField(
        "Arquivo em Sounds/",
        sound.soundFile ?? "",
        "text",
        (value) => {
          sound.soundFile = value;
        },
        { list: "sound-options" }
      ),
      el(
        "div",
        { className: "row-grid cols-2" },
        createInputField("Loop", sound.loop ?? 1, "number", (value) => {
          sound.loop = parseIntSafe(value, 1);
        }),
        createInputField("Wormhole", sound.wormhole ?? "", "number", (value) => {
          sound.wormhole = value === "" ? null : parseIntSafe(value, null);
        })
      ),
      el(
        "div",
        { className: "inline-actions" },
        createMiniButton("Tocar", () => previewSound(sound.soundFile)),
        createMiniButton("Salvar na biblioteca", () => {
          saveSoundToLibrary(sound.soundFile);
          renderSoundEditor(pad);
        }),
        createMiniButton("Duplicar", () => {
          pad.sounds.splice(index + 1, 0, structuredClone(sound));
          state.selectedSoundIndex = index + 1;
          renderSoundEditor(pad);
          renderGrid();
          renderStats();
        }),
        createMiniButton("Mover esquerda", () => {
          moveItem(pad.sounds, index, -1);
          state.selectedSoundIndex = Math.max(0, index - 1);
          renderSoundEditor(pad);
          renderGrid();
        }),
        createMiniButton("Mover direita", () => {
          moveItem(pad.sounds, index, 1);
          state.selectedSoundIndex = Math.min(pad.sounds.length - 1, index + 1);
          renderSoundEditor(pad);
          renderGrid();
        }),
        createMiniButton("Remover", () => {
          pad.sounds.splice(index, 1);
          clampPadSelection(pad);
          renderSelectedPadEditor();
          renderGrid();
          renderStats();
        })
      )
    )
  );

  sections.push(focus);
  refs.soundEditor.replaceChildren(...sections);
}

function createAudioLibraryChooser(pad) {
  const items = state.audioLibrary.length
    ? state.audioLibrary.map((entry) => createAudioLibraryCard(entry, pad))
    : [createEmptyState("Nenhum corte salvo ainda. Ao criar ou salvar um audio, ele aparece aqui para reutilizar em outros pads.")];

  return el(
    "div",
    { className: "editor-focus stack" },
    createFocusHeader("Biblioteca de audio", "Reaproveite cortes ja salvos neste projeto."),
    el("div", { className: "led-library-grid" }, ...items)
  );
}

function createAudioLibraryCard(entry, pad) {
  const applyButton = createMiniButton(
    pad ? `Usar no slot ${state.selectedSoundIndex + 1}` : "Selecione um pad",
    () => {
      if (pad) {
        applyLibrarySoundToPad(entry, pad);
      }
    }
  );
  applyButton.disabled = !pad;

  return el(
    "div",
    { className: "library-card stack" },
    el(
      "div",
      { className: "library-card-head" },
      el("strong", { textContent: entry.name || fileStem(entry.soundFile) }),
      el("span", { className: "pill", textContent: fileExtension(entry.soundFile) || "wav" })
    ),
    el("span", { className: "muted", textContent: entry.soundFile }),
    el(
      "div",
      { className: "compact-actions" },
      createMiniButton("Ouvir", () => previewSound(entry.soundFile)),
      applyButton,
      createMiniButton("Apagar", () => {
        deleteSoundFromLibrary(entry.id);
        if (pad) {
          renderSoundEditor(pad);
        }
      })
    )
  );
}

function renderAudioLibraryPanel() {
  if (!refs.audioLibraryPanel) return;
  refs.audioLibraryPanel.replaceChildren(...buildAudioLibraryWorkspaceNodes());
}

function renderLedEditor(pad) {
  stopLedPreview();
  refs.ledEditor.replaceChildren(...buildLedEditorSections(pad));
  renderLedStudioPanel();
}

function buildLedEditorSections(pad) {
  const sections = [];
  if (refs.ledPrevAnimation) {
    refs.ledPrevAnimation.disabled = !pad.ledAnimations.length || state.selectedLedIndex <= 0;
  }
  if (refs.ledNextAnimation) {
    refs.ledNextAnimation.disabled =
      !pad.ledAnimations.length || state.selectedLedIndex >= Math.max(0, pad.ledAnimations.length - 1);
  }
  if (state.ledLibraryPickerOpen) {
    sections.push(createLedLibraryChooser(pad));
  }
  if (!pad.ledAnimations.length) {
    sections.push(
      el(
        "div",
        { className: "editor-focus stack" },
        createEditorMediaTabPanel(pad, null, 100),
        createEmptyState("Este pad ainda nao tem animacao RGB. Clique em 'Adicionar animacao' para criar uma ou usar a biblioteca.")
      )
    );
    return sections;
  }

  const index = state.selectedLedIndex;
  const animation = pad.ledAnimations[index];
  ensureLedAnimationUi(animation, pad);
  const focus = el("div", { className: "editor-focus stack" });
  const isPreviewSubview = state.editorMediaSubview === "preview";
  const controls = el(
    "div",
    { className: "led-controls stack" },
    el(
      "div",
      { className: "row-grid cols-2" },
      createSpeedField(animation, pad),
      createPreviewRateField(getPadPreviewKey(pad, index), getPreviewRatePercent(getPadPreviewKey(pad, index)), {
        label: "Preview",
        helper: "100% original, maior fica mais lento",
        onApply: (value) => {
          state.previewSpeedOverrides[getPadPreviewKey(pad, index)] = value;
          renderLedEditor(pad);
        },
      })
    ),
    el(
      "div",
      { className: "row-grid cols-2" },
      createInputField("Loop", animation.loop ?? 1, "number", (value) => {
        animation.loop = parseIntSafe(value, 1);
      })
    ),
    el(
      "div",
      { className: "compact-actions" },
      createMiniButton("Atualizar", () => {
        const presetName = animation.presetName || "pulse";
        animation.presetName = presetName === "custom" ? "pulse" : presetName;
        regenerateLedAnimation(animation, pad);
        renderLedEditor(pad);
        renderGrid();
      }),
      createMiniButton("Duplicar", () => {
        pad.ledAnimations.splice(index + 1, 0, structuredClone(animation));
        state.selectedLedIndex = index + 1;
        renderLedEditor(pad);
        renderGrid();
        renderStats();
      }),
      createMiniButton("Salvar na biblioteca", () => {
        saveAnimationToLibrary(animation, pad);
      }),
      createMiniButton("Remover", () => {
        pad.ledAnimations.splice(index, 1);
        clampPadSelection(pad);
        renderSelectedPadEditor();
        renderGrid();
        renderStats();
      })
    )
  );

  focus.append(
    el(
      "div",
      { className: "led-compact-layout" },
      createEditorMediaTabPanel(pad, animation, getPreviewRatePercent(getPadPreviewKey(pad, index))),
      ...(isPreviewSubview ? [controls] : [])
    )
  );

  sections.push(focus);
  return sections;
}

function renderLedStudioPanel() {
  if (!refs.ledStudioContent) return;
  stopLedPreview("studio");
  if (!state.project) {
    refs.ledStudioContent.replaceChildren(createEmptyState("Carregue um projeto para criar a animacao de LED."));
    return;
  }

  const pad = getSelectedPad();
  if (!pad) {
    refs.ledStudioContent.replaceChildren(
      createEmptyState("Selecione um pad na aba Editor para montar a animacao dele aqui.")
    );
    return;
  }

  ensureLedStudioDraftForPad(pad);
  const studio = state.ledStudioEditor;
  const frame = getCurrentLedStudioFrame();
  const launchpad = createLaunchpadPreviewGrid("is-studio", 30);
  launchpad.classList.add("led-studio-launchpad");
  bindLedStudioLaunchpad(launchpad);

  if (studio.isPlaying) {
    const animation = buildAnimationFromLedStudio(studio);
    startLedPreview(launchpad, animation, studio.selectedColor, {
      loop: true,
      group: "studio",
    });
  } else {
    paintLedStudioFrame(launchpad, frame);
  }

  refs.ledStudioContent.replaceChildren(
    el(
      "div",
      { className: "editor-focus stack led-studio-shell" },
      createLedStudioHeader(pad, studio),
      createLedStudioControlGrid(pad, studio),
      el(
        "div",
        { className: "editor-preview stack led-studio-preview-wrap" },
        el("span", {
          className: "muted led-studio-helper",
          textContent: "Clique em um pad do launchpad para ligar ou desligar no frame atual.",
        }),
        launchpad
      ),
      createLedStudioFrameNavigator(studio),
      createLedStudioFrameStrip(studio)
    )
  );

  window.requestAnimationFrame(() => {
    syncLedStudioActiveFramePosition();
  });
}

function syncLedStudioActiveFramePosition() {
  const carousel = refs.ledStudioContent?.querySelector(".led-studio-frame-carousel");
  const activeCard = refs.ledStudioContent?.querySelector(".led-frame-card.is-active");
  if (!carousel || !activeCard) return;
  const targetLeft = activeCard.offsetLeft - carousel.clientWidth / 2 + activeCard.clientWidth / 2;
  carousel.scrollLeft = Math.max(0, targetLeft);
}

function renderLedLibraryPanel() {
  if (!refs.ledLibraryContent) return;
  if (refs.ledLibraryPadPill) refs.ledLibraryPadPill.textContent = "";
  const isCommunity = state.ledLibraryPanelSubview === "community";
  const entries = getLedLibraryPanelEntries();
  const cards = entries.length
    ? entries.map((entry) => createLedLibraryCard(entry, null))
    : [createEmptyState(getLedLibraryPanelEmptyMessage())];

  refs.ledLibraryContent.replaceChildren(
    el(
      "div",
      { className: "editor-focus stack" },
      createFocusHeader(
        "Biblioteca de animacoes",
        isCommunity
          ? "Animacoes publicadas pela comunidade para usar nos seus projetos."
          : "Animacoes locais salvas no seu navegador para reaproveitar depois.",
        isCommunity && hasSupabaseConfig()
          ? [
              createMiniButton(state.ledLibrarySyncing ? "Sincronizando..." : "Atualizar online", () => {
                void refreshRemoteLedLibrary();
              }),
            ]
          : []
      ),
      el(
        "div",
        { className: "mini-tabs led-library-navbar" },
        createMiniTabButton("Animacoes locais", !isCommunity, () => {
          state.ledLibraryPanelSubview = "local";
          renderLedLibraryPanel();
        }),
        createMiniTabButton("Comunidade", isCommunity, () => {
          state.ledLibraryPanelSubview = "community";
          renderLedLibraryPanel();
        })
      ),
      isCommunity ? createLedCommunityToolbar() : null,
      createLedLibraryPanelMeta(isCommunity, entries.length),
      state.ledLibrarySyncError && isCommunity
        ? el("span", { className: "muted", textContent: `Biblioteca online: ${state.ledLibrarySyncError}` })
        : null,
      el("div", { className: "led-library-grid" }, ...cards)
    )
  );
}

function createEmptyLedStudioFrame(duration = 90) {
  return {
    id: createLibraryEntryId(),
    duration: Math.max(1, parseIntSafe(duration, 90)),
    cells: {},
  };
}

function ensureLedStudioDraftForPad(pad) {
  const targetIndex = resolveLedStudioAnimationIndex(pad);
  if (state.ledStudioEditor.padKey === pad.key && state.ledStudioEditor.animationIndex === targetIndex) {
    if (!state.ledStudioEditor.frames.length) {
      state.ledStudioEditor.frames = [createEmptyLedStudioFrame()];
      state.ledStudioEditor.currentFrameIndex = 0;
    }
    state.ledStudioEditor.currentFrameIndex = clampIndex(
      state.ledStudioEditor.currentFrameIndex,
      state.ledStudioEditor.frames.length
    );
    return;
  }

  const sourceAnimation = pad.ledAnimations[targetIndex] || null;
  const frames = sourceAnimation ? buildLedStudioFramesFromAnimation(sourceAnimation) : [createEmptyLedStudioFrame()];
  state.ledStudioEditor = {
    padKey: pad.key,
    animationIndex: targetIndex,
    currentFrameIndex: 0,
    frames,
    selectedColor: sourceAnimation?.previewColor || inferAnimationColor(sourceAnimation || { events: [] }) || "#8453FD",
    loop: sourceAnimation?.loop ?? 1,
    isPlaying: false,
  };
}

function resolveLedStudioAnimationIndex(pad) {
  if (!pad?.ledAnimations?.length) return pad?.ledAnimations?.length || 0;
  return clampIndex(state.selectedLedIndex, pad.ledAnimations.length);
}

function buildLedStudioFramesFromAnimation(animation) {
  const active = new Map();
  const frames = [];

  (animation.events || []).forEach((event) => {
    if (event.type === "on" && isNumericCoord(event.x) && isNumericCoord(event.y)) {
      active.set(`${Number(event.x)}:${Number(event.y)}`, normalizeColor(resolveLedEventColor(event)));
      return;
    }
    if (event.type === "off" && isNumericCoord(event.x) && isNumericCoord(event.y)) {
      active.delete(`${Number(event.x)}:${Number(event.y)}`);
      return;
    }
    if (event.type === "delay") {
      frames.push({
        id: createLibraryEntryId(),
        duration: Math.max(1, Number(event.ms) || 90),
        cells: Object.fromEntries(active),
      });
    }
  });

  return frames.length ? frames : [createEmptyLedStudioFrame(inferAnimationSpeed(animation))];
}

function buildAnimationFromLedStudio(studio) {
  const frames = Array.isArray(studio.frames) && studio.frames.length ? studio.frames : [createEmptyLedStudioFrame()];
  const events = [];
  let previous = {};

  frames.forEach((frame) => {
    const next = frame.cells || {};
    Object.keys(previous).forEach((key) => {
      if (key in next) return;
      const [x, y] = key.split(":").map(Number);
      events.push({ type: "off", x, y });
    });

    Object.entries(next).forEach(([key, color]) => {
      if (previous[key] === color) return;
      const [x, y] = key.split(":").map(Number);
      events.push({
        type: "on",
        x: String(x),
        y,
        mode: "hex",
        color: sanitizeHex(color),
        velocity: null,
      });
    });

    events.push({ type: "delay", ms: Math.max(1, parseIntSafe(frame.duration, 90)) });
    previous = { ...next };
  });

  return {
    loop: Math.max(1, parseIntSafe(studio.loop, 1)),
    suffix: "",
    presetName: "custom",
    previewColor: normalizeColor(studio.selectedColor || inferAnimationColor({ events })),
    presetSpeed: inferAnimationSpeed({ events }),
    events,
  };
}

function resolveLedEventColor(event) {
  if (event.mode === "hex" && event.color) {
    return `#${sanitizeHex(event.color)}`;
  }
  if (event.mode === "auto") {
    return velocityToHexColor(event.velocity, "#8453FD");
  }
  return "#8453FD";
}

function getCurrentLedStudioFrame() {
  const frames = state.ledStudioEditor.frames || [];
  if (!frames.length) {
    state.ledStudioEditor.frames = [createEmptyLedStudioFrame()];
    state.ledStudioEditor.currentFrameIndex = 0;
  }
  return state.ledStudioEditor.frames[clampIndex(state.ledStudioEditor.currentFrameIndex, state.ledStudioEditor.frames.length)];
}

function createLedStudioHeader(pad, studio) {
  const animationLabel =
    studio.animationIndex < (pad.ledAnimations?.length || 0)
      ? `Animacao ${studio.animationIndex + 1}`
      : "Nova animacao";
  return el(
    "div",
    { className: "led-studio-topbar" },
    el(
      "div",
      { className: "led-studio-meta" },
      el("span", { className: "pill", textContent: `Pad ${pad.chain}:${pad.x}:${pad.y}` }),
      el("span", { className: "pill", textContent: animationLabel })
    ),
    el(
      "div",
      { className: "compact-actions led-studio-actions" },
      createMiniButton(studio.isPlaying ? "Parar teste" : "Testar animacao", () => {
        state.ledStudioEditor.isPlaying = !state.ledStudioEditor.isPlaying;
        renderLedStudioPanel();
      }),
      createMiniButton("Nova animacao", () => {
        startNewLedStudioAnimation(pad);
      }),
      createMiniButton("Aplicar no pad", async () => {
        await applyLedStudioToPad(pad);
      }),
      createMiniButton("Salvar na biblioteca", () => {
        saveAnimationToLibrary(buildAnimationFromLedStudio(state.ledStudioEditor), pad);
      })
    )
  );
}

function createLedStudioControlGrid(_pad, studio) {
  const frame = getCurrentLedStudioFrame();
  const colorInput = el("input", {
    type: "color",
    value: normalizeColor(studio.selectedColor || "#8453FD"),
  });
  colorInput.addEventListener("input", () => {
    state.ledStudioEditor.selectedColor = normalizeColor(colorInput.value);
  });

  const durationInput = el("input", {
    type: "number",
    min: "1",
    max: "5000",
    step: "1",
    value: String(Math.max(1, parseIntSafe(frame.duration, 90))),
  });
  durationInput.addEventListener("input", () => {
    frame.duration = Math.max(1, parseIntSafe(durationInput.value, frame.duration || 90));
    if (state.ledStudioEditor.isPlaying) renderLedStudioPanel();
  });

  const loopInput = el("input", {
    type: "number",
    min: "1",
    max: "99",
    step: "1",
    value: String(Math.max(1, parseIntSafe(studio.loop, 1))),
  });
  loopInput.addEventListener("input", () => {
    state.ledStudioEditor.loop = Math.max(1, parseIntSafe(loopInput.value, 1));
  });

  return el(
    "div",
    { className: "row-grid cols-4 led-studio-control-grid" },
    el(
      "label",
      { className: "field" },
      el("span", { textContent: "Cor do frame" }),
      colorInput,
      el("span", { className: "field-helper", textContent: "A mesma cor vale para os pads que voce clicar." })
    ),
    el(
      "label",
      { className: "field" },
      el("span", { textContent: "Duracao do frame (ms)" }),
      durationInput,
      el("span", { className: "field-helper", textContent: "Controla quanto tempo este quadro fica aceso." })
    ),
    el(
      "label",
      { className: "field" },
      el("span", { textContent: "Loop da animacao" }),
      loopInput,
      el("span", { className: "field-helper", textContent: "Quantidade de repeticoes quando o arquivo tocar." })
    ),
    el(
      "div",
      { className: "field led-studio-inline-tools" },
      el("span", { textContent: "Ferramentas" }),
      el(
        "div",
        { className: "compact-actions led-studio-inline-actions" },
        createMiniButton("Limpar frame", () => {
          frame.cells = {};
          renderLedStudioPanel();
        }),
        createMiniButton("Todos off", () => {
          state.ledStudioEditor.frames = state.ledStudioEditor.frames.map((item) => ({ ...item, cells: {} }));
          state.ledStudioEditor.isPlaying = false;
          renderLedStudioPanel();
        })
      ),
      el("span", {
        className: "field-helper",
        textContent: "Clique no mesmo pad duas vezes para apagar so aquele ponto.",
      })
    )
  );
}

function bindLedStudioLaunchpad(launchpad) {
  launchpad.querySelectorAll(".launchpad-cell").forEach((cell) => {
    const coord = cell.getAttribute("data-pad");
    cell.addEventListener("click", () => {
      toggleLedStudioCell(coord);
    });
  });
}

function toggleLedStudioCell(coordKey) {
  const frame = getCurrentLedStudioFrame();
  const nextColor = normalizeColor(state.ledStudioEditor.selectedColor || "#8453FD");
  if (frame.cells[coordKey] === nextColor) {
    delete frame.cells[coordKey];
  } else {
    frame.cells[coordKey] = nextColor;
  }
  renderLedStudioPanel();
}

function paintLedStudioFrame(launchpad, frame) {
  const active = new Map(Object.entries(frame?.cells || {}));
  applyPreviewFrame(
    new Map([...launchpad.querySelectorAll(".launchpad-cell")].map((cell) => [cell.getAttribute("data-pad"), cell])),
    { active, duration: Math.max(1, parseIntSafe(frame?.duration, 90)) }
  );
}

function createLedStudioFrameNavigator(studio) {
  const currentLabel = `Frame ${studio.currentFrameIndex + 1} de ${studio.frames.length}`;
  return el(
    "div",
    { className: "led-studio-frame-toolbar" },
    el("span", { className: "pill", textContent: currentLabel }),
    el(
      "div",
      { className: "compact-actions led-studio-frame-actions" },
      createMiniButton("Anterior", () => {
        state.ledStudioEditor.currentFrameIndex = Math.max(0, state.ledStudioEditor.currentFrameIndex - 1);
        state.ledStudioEditor.isPlaying = false;
        renderLedStudioPanel();
      }),
      createMiniButton("Proximo", () => {
        state.ledStudioEditor.currentFrameIndex = Math.min(
          state.ledStudioEditor.frames.length - 1,
          state.ledStudioEditor.currentFrameIndex + 1
        );
        state.ledStudioEditor.isPlaying = false;
        renderLedStudioPanel();
      }),
      createMiniButton("Adicionar frame", () => {
        insertLedStudioFrameAfterCurrent(false);
      }),
      createMiniButton("Duplicar frame", () => {
        insertLedStudioFrameAfterCurrent(true);
      }),
      createMiniButton("Remover frame", () => {
        removeCurrentLedStudioFrame();
      })
    )
  );
}

function createLedStudioFrameStrip(studio) {
  const strip = el("div", { className: "led-studio-frame-strip" });
  studio.frames.forEach((frame, index) => {
    const litPads = Object.keys(frame.cells || {}).length;
    const preview = createLaunchpadPreviewGrid("is-mini led-frame-mini-preview", 10);
    paintLedStudioFrame(preview, frame);
    const button = el(
      "button",
      {
        type: "button",
        className: `led-frame-card${index === studio.currentFrameIndex ? " is-active" : ""}`,
        "data-frame-index": String(index),
      },
      preview,
      el("strong", { textContent: `Frame ${index + 1}` }),
      el("span", { textContent: `${Math.max(1, parseIntSafe(frame.duration, 90))} ms` }),
      el("small", { textContent: `${litPads} pad(s) aceso(s)` })
    );
    button.addEventListener("click", () => {
      state.ledStudioEditor.currentFrameIndex = index;
      state.ledStudioEditor.isPlaying = false;
      renderLedStudioPanel();
    });
    strip.append(button);
  });
  return el("div", { className: "led-studio-frame-carousel" }, strip);
}

function insertLedStudioFrameAfterCurrent(duplicateCurrent) {
  const current = getCurrentLedStudioFrame();
  const nextFrame = duplicateCurrent
    ? {
        id: createLibraryEntryId(),
        duration: Math.max(1, parseIntSafe(current.duration, 90)),
        cells: { ...(current.cells || {}) },
      }
    : createEmptyLedStudioFrame(current.duration);
  state.ledStudioEditor.frames.splice(state.ledStudioEditor.currentFrameIndex + 1, 0, nextFrame);
  state.ledStudioEditor.currentFrameIndex += 1;
  state.ledStudioEditor.isPlaying = false;
  renderLedStudioPanel();
}

function removeCurrentLedStudioFrame() {
  if (state.ledStudioEditor.frames.length <= 1) {
    state.ledStudioEditor.frames = [createEmptyLedStudioFrame()];
    state.ledStudioEditor.currentFrameIndex = 0;
  } else {
    state.ledStudioEditor.frames.splice(state.ledStudioEditor.currentFrameIndex, 1);
    state.ledStudioEditor.currentFrameIndex = clampIndex(
      state.ledStudioEditor.currentFrameIndex,
      state.ledStudioEditor.frames.length
    );
  }
  state.ledStudioEditor.isPlaying = false;
  renderLedStudioPanel();
}

function startNewLedStudioAnimation(pad) {
  state.ledStudioEditor = {
    padKey: pad.key,
    animationIndex: pad.ledAnimations.length,
    currentFrameIndex: 0,
    frames: [createEmptyLedStudioFrame()],
    selectedColor: "#8453FD",
    loop: 1,
    isPlaying: false,
  };
  renderLedStudioPanel();
}

async function applyLedStudioToPad(pad) {
  const animation = buildAnimationFromLedStudio(state.ledStudioEditor);
  const targetIndex = Math.max(0, state.ledStudioEditor.animationIndex);
  if (targetIndex < pad.ledAnimations.length) {
    pad.ledAnimations[targetIndex] = animation;
  } else {
    pad.ledAnimations.push(animation);
  }
  state.selectedLedIndex = targetIndex;
  state.ledStudioEditor.animationIndex = targetIndex;
  renderSelectedPadEditor();
  renderGrid();
  renderStats();
  renderLedStudioPanel();
  try {
    await saveProject({ quiet: true, rethrow: true });
    setStatus(`Animacao aplicada ao pad ${pad.chain}:${pad.x}:${pad.y}.`, "success");
  } catch (error) {
    setStatus(error.message || "Falha ao salvar a animacao de LED.", "error");
  }
}

function createAudioImportPanel(pad) {
  return el(
    "div",
    { className: "editor-focus stack" },
    createFocusHeader(
      "Corte de audio",
      isCloudProject()
        ? "No projeto online, o corte ja sobe para sua conta e fica salvo dentro deste projeto."
        : "Abra o editor aqui na pagina para importar, ver as faixas e criar cortes."
    ),
    el(
      "div",
      { className: "editor-preview stack" },
      el(
        "div",
        { className: "import-meta" },
        el("strong", { textContent: `Pad ${pad.chain}:${pad.x}:${pad.y}` }),
        el("span", {
          className: "muted",
          textContent: "O corte salva em Sounds/ e entra direto neste slot do pad.",
        })
      ),
      el(
        "div",
        { className: "inline-actions" },
        createMiniButton("Abrir editor de audio", () => openAudioEditor(pad)),
        createMiniButton("Tocar slot atual", () => {
          const current = pad.sounds[state.selectedSoundIndex];
          if (current?.soundFile) {
            previewSound(current.soundFile);
          }
        })
      )
    )
  );
}

async function previewSound(soundFile) {
  if (!soundFile || !state.project?.projectPath) {
    setStatus("Nenhum audio selecionado para tocar.", "error");
    return;
  }

  try {
    const soundUrl = await resolveSoundPlaybackUrl(soundFile);
    stopAudioClipPreviewSource();
    state.audio.pause();
    state.audio.currentTime = 0;
    if (state.audioObjectUrl) {
      URL.revokeObjectURL(state.audioObjectUrl);
      state.audioObjectUrl = "";
    }

    state.audio.src = soundUrl;
    state.audio.load();
    await state.audio.play();
    setStatus(`Tocando "${soundFile}".`, "success");
  } catch (error) {
    setStatus(error.message || "Nao foi possivel tocar o audio.", "error");
  }
}

async function resolveSoundPlaybackUrl(soundFile) {
  if (!isCloudProject()) {
    return `/api/sound?path=${encodeURIComponent(state.project.projectPath)}&file=${encodeURIComponent(soundFile)}&v=${Date.now()}`;
  }
  const soundEntry = findProjectSoundEntry(soundFile);
  if (!soundEntry?.storagePath) {
    throw new Error("Este audio online ainda nao possui arquivo salvo no projeto.");
  }
  const signedUrl = await createProjectAudioSignedUrl(soundEntry.storagePath, 3600);
  if (!signedUrl) {
    throw new Error("Nao foi possivel abrir o audio salvo no projeto online.");
  }
  return signedUrl;
}

function findProjectSoundEntry(soundFile) {
  const normalizedPath = String(soundFile || "").trim();
  if (!normalizedPath) return null;
  return (state.project?.sounds || []).find((entry) => String(entry.path || "").trim() === normalizedPath) || null;
}

function previewSelectedPadMedia() {
  const pad = getSelectedPad();
  stopLedPreview("pad");

  if (!pad) {
    state.audio.pause();
    state.audio.currentTime = 0;
    return;
  }

  const animation = pad.ledAnimations[state.selectedLedIndex] || pad.ledAnimations[0];
  const launchpad = refs.ledEditor.querySelector(".led-preview-pane .launchpad-preview");
  if (animation && launchpad) {
    const previewRatePercent = getPreviewRatePercent(getPadPreviewKey(pad, state.selectedLedIndex));
    startLedPreview(
      launchpad,
      animation,
      normalizeColor(animation.previewColor || inferAnimationColor(animation)),
      {
        loop: false,
        group: "pad",
        speedMultiplier: previewRatePercent / 100,
      }
    );
  }

  const sound = pad.sounds[state.selectedSoundIndex] || pad.sounds[0];
  if (!sound?.soundFile) {
    state.audio.pause();
    state.audio.currentTime = 0;
    return;
  }

  previewSound(sound.soundFile);
}

function openAudioEditor(pad) {
  if (!state.project || !pad) return;
  const previousFile = state.audioClipEditor.sourceName;
  const previousClipName = refs.clipName.value.trim();
  const keepCurrentAudio =
    state.audioClipEditor.audioBuffer && state.audioClipEditor.projectPath === state.project.projectPath;
  const previousDraftProjectPath = state.audioClipEditor.projectPath;

  state.audioClipEditor.open = true;
  state.audioClipEditor.projectPath = state.project.projectPath;
  state.audioClipEditor.padKey = pad.key;
  state.audioClipEditor.soundIndex = state.selectedSoundIndex;
  state.audioClipEditor.suggestedName = suggestClipFileName(pad);
  state.currentView = "audio";
  refs.clipName.value = keepCurrentAudio && previousClipName ? previousClipName : state.audioClipEditor.suggestedName;
  refs.clipPadPill.textContent = `Pad ${pad.chain}:${pad.x}:${pad.y} · slot ${state.selectedSoundIndex + 1}`;
  renderViewNavigation();
  renderAudioClipEditorPanel();
  if (!keepCurrentAudio) {
    if (previousDraftProjectPath && state.audioClipEditor.sourceBlob) {
      void deleteAudioClipDraftRecord(previousDraftProjectPath);
    }
    resetAudioClipEditorMediaState();
    refs.clipFileInput.value = "";
    refs.clipName.value = state.audioClipEditor.suggestedName;
    setAudioClipStatus(previousFile ? "Escolha o audio novamente para este pad." : "Escolha um audio para comecar.", "success");
  }
  syncAudioClipInputs();
  resizeAudioClipCanvas();
  renderAudioClipEditorCanvas();
  scheduleAudioClipDraftPersist();
  refs.clipEditorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ensureAudioClipEditorTargetFromSelection() {
  if (!state.project) return false;
  const pad = getSelectedPad();
  if (!pad) return false;

  const alreadyTargeted =
    state.audioClipEditor.projectPath === state.project.projectPath &&
    state.audioClipEditor.padKey === pad.key;
  if (alreadyTargeted) {
    state.audioClipEditor.open = true;
    state.audioClipEditor.soundIndex = state.selectedSoundIndex;
    return true;
  }

  const previousFile = state.audioClipEditor.sourceName;
  const previousClipName = refs.clipName.value.trim();
  const hadAudio = Boolean(state.audioClipEditor.audioBuffer);
  state.audioClipEditor.open = true;
  state.audioClipEditor.projectPath = state.project.projectPath;
  state.audioClipEditor.padKey = pad.key;
  state.audioClipEditor.soundIndex = state.selectedSoundIndex;
  state.audioClipEditor.suggestedName = previousClipName || suggestClipFileName(pad);
  refs.clipName.value = previousClipName || state.audioClipEditor.suggestedName;
  refs.clipPadPill.textContent = `Pad ${pad.chain}:${pad.x}:${pad.y} · slot ${state.selectedSoundIndex + 1}`;
  if (hadAudio) {
    scheduleAudioClipDraftPersist(0);
  } else {
    setAudioClipStatus(previousFile ? "Audio pronto para este pad." : "Escolha um audio para comecar.", "success");
  }
  return true;
}

function createInitialAudioClipEditorState() {
  return {
    open: false,
    projectPath: "",
    padKey: "",
    soundIndex: 0,
    suggestedName: "novo_clip.wav",
    audioContext: null,
    audioBuffer: null,
    sourceName: "",
    sourceBlob: null,
    sourceMimeType: "",
    selectionStart: 0,
    selectionEnd: 0,
    dragMode: null,
    dragStartTime: 0,
    overviewAmplitudes: null,
    zoom: 1,
    stretch: 1,
    viewStartOverride: null,
    previewAudio: new Audio(),
    previewAudioUrl: "",
    previewSource: null,
    playbackStartedAt: 0,
    playbackFrom: 0,
    playbackDuration: 0,
    playheadFrame: 0,
    activePointerId: null,
    mouseDragging: false,
    dragBounds: null,
    draftPersistTimer: 0,
    baseCanvasWidth: 760,
    canvasHeight: 240,
    dpr: Math.max(1, window.devicePixelRatio || 1),
  };
}

function createInitialLedStudioEditorState() {
  return {
    padKey: "",
    animationIndex: 0,
    currentFrameIndex: 0,
    frames: [createEmptyLedStudioFrame()],
    selectedColor: "#8453FD",
    loop: 1,
    isPlaying: false,
  };
}

function renderAudioClipEditorPanel() {
  if (!refs.clipEditorPanel) return;
  const pad = getPadByKey(state.audioClipEditor.padKey);
  refs.clipPadPill.textContent =
    pad && state.audioClipEditor.open
      ? `Pad ${pad.chain}:${pad.x}:${pad.y} · slot ${state.audioClipEditor.soundIndex + 1}`
      : "Sem pad";
  refs.clipPreviewButton.disabled = !state.audioClipEditor.audioBuffer;
  refs.clipSaveButton.disabled = false;
  refs.clipContinueButton.disabled = !state.audioClipEditor.audioBuffer;
  refs.clipFullButton.disabled = !state.audioClipEditor.audioBuffer;
  refs.clipZoomFitButton.disabled = !state.audioClipEditor.audioBuffer;
  refs.clipPanLeftButton.disabled = !state.audioClipEditor.audioBuffer;
  refs.clipPanRightButton.disabled = !state.audioClipEditor.audioBuffer;
  const overlayVisible = Boolean(state.audioClipEditor.audioBuffer);
  refs.clipSelectionOverlay.hidden = !overlayVisible;
  renderAudioClipSubview();
}

function closeAudioEditor() {
  stopAudioClipPreviewSource();
  state.audioClipEditor.open = false;
  state.currentView = "editor";
  renderViewNavigation();
  renderAudioClipEditorPanel();
  scheduleAudioClipDraftPersist();
}

function resetAudioClipEditor() {
  stopAudioClipPreviewSource();
  state.audioClipEditor = createInitialAudioClipEditorState();
  state.currentView = "editor";
  if (refs.clipFileInput) refs.clipFileInput.value = "";
  if (refs.clipName) refs.clipName.value = state.audioClipEditor.suggestedName;
  if (refs.clipStartInput) refs.clipStartInput.value = "0.00";
  if (refs.clipEndInput) refs.clipEndInput.value = "0.00";
  if (refs.clipZoomInput) refs.clipZoomInput.value = "1";
  if (refs.clipStretchInput) refs.clipStretchInput.value = "1";
  setAudioClipStatus("Escolha um audio para comecar.");
  syncAudioClipInputs();
  renderViewNavigation();
  renderAudioClipEditorPanel();
  resizeAudioClipCanvas();
  renderAudioClipEditorCanvas();
}

function resetAudioClipEditorMediaState() {
  stopAudioClipPreviewSource();
  cancelAudioClipDraftPersist();
  state.audioClipEditor.audioBuffer = null;
  state.audioClipEditor.sourceName = "";
  state.audioClipEditor.sourceBlob = null;
  state.audioClipEditor.sourceMimeType = "";
  state.audioClipEditor.selectionStart = 0;
  state.audioClipEditor.selectionEnd = 0;
  state.audioClipEditor.dragMode = null;
  state.audioClipEditor.dragStartTime = 0;
  state.audioClipEditor.overviewAmplitudes = null;
  state.audioClipEditor.zoom = 1;
  state.audioClipEditor.stretch = 1;
  state.audioClipEditor.viewStartOverride = null;
  state.audioClipEditor.activePointerId = null;
  state.audioClipEditor.mouseDragging = false;
  state.audioClipEditor.dragBounds = null;
  refs.clipZoomInput.value = "1";
  refs.clipStretchInput.value = "1";
  syncAudioClipInputs();
  renderAudioClipEditorPanel();
}

function setAudioClipStatus(message, tone = "") {
  refs.clipStatus.textContent = message;
  refs.clipStatus.classList.remove("is-error", "is-success");
  if (tone === "error") refs.clipStatus.classList.add("is-error");
  if (tone === "success") refs.clipStatus.classList.add("is-success");
}

function syncAudioClipInputs() {
  refs.clipStartInput.value = formatSeconds(state.audioClipEditor.selectionStart);
  refs.clipEndInput.value = formatSeconds(state.audioClipEditor.selectionEnd);
  refs.clipSelectionLength.textContent = `${formatSeconds(audioClipSelectionDuration())} s`;
}

async function loadAudioClipFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    await hydrateAudioClipEditorFromSource(arrayBuffer, {
      sourceName: file.name,
      sourceBlob: file.slice(0, file.size, file.type || "application/octet-stream"),
      sourceMimeType: file.type || "application/octet-stream",
      suggestedName: suggestClipFileName(),
      persist: true,
    });
    refs.clipFileInput.value = "";
    setAudioClipStatus(
      `Audio carregado: ${file.name} (${formatSeconds(state.audioClipEditor.audioBuffer?.duration || 0)} s). Arraste nas faixas para escolher o corte.`,
      "success"
    );
  } catch (error) {
    setAudioClipStatus(error.message || "Nao foi possivel carregar o audio.", "error");
  }
}

async function hydrateAudioClipEditorFromSource(arrayBuffer, options = {}) {
  state.audioClipEditor.audioContext ||= new AudioContext();
  state.audioClipEditor.audioBuffer = await state.audioClipEditor.audioContext.decodeAudioData(arrayBuffer.slice(0));
  state.audioClipEditor.sourceName = String(options.sourceName || state.audioClipEditor.sourceName || "audio");
  state.audioClipEditor.sourceBlob = options.sourceBlob || state.audioClipEditor.sourceBlob || null;
  state.audioClipEditor.sourceMimeType = String(
    options.sourceMimeType || state.audioClipEditor.sourceMimeType || "application/octet-stream"
  );

  const duration = state.audioClipEditor.audioBuffer.duration;
  const audibleRegion = findAudibleRegion(state.audioClipEditor.audioBuffer);
  const fallbackStart = audibleRegion?.start ?? getDefaultAudioClipSelectionStart(duration);
  const fallbackEnd = audibleRegion?.end ?? getDefaultAudioClipSelectionEnd(duration);
  state.audioClipEditor.zoom = Math.min(32, Math.max(1, parseFloatSafe(options.zoom, getDefaultAudioClipZoom(duration))));
  state.audioClipEditor.stretch = Math.min(4, Math.max(1, parseFloatSafe(options.stretch, 1)));
  state.audioClipEditor.selectionStart = clampTime(parseFloatSafe(options.selectionStart, fallbackStart), 0, duration);
  state.audioClipEditor.selectionEnd = clampTime(
    parseFloatSafe(options.selectionEnd, fallbackEnd),
    state.audioClipEditor.selectionStart,
    duration
  );
  if (state.audioClipEditor.selectionEnd - state.audioClipEditor.selectionStart < 0.02) {
    state.audioClipEditor.selectionEnd = clampTime(
      Math.max(fallbackEnd, state.audioClipEditor.selectionStart + 0.02),
      state.audioClipEditor.selectionStart,
      duration
    );
  }
  state.audioClipEditor.viewStartOverride =
    typeof options.viewStartOverride === "number" ? options.viewStartOverride : 0;
  state.audioClipEditor.suggestedName = ensureWavFileName(options.suggestedName || suggestClipFileName());
  refs.clipZoomInput.value = String(state.audioClipEditor.zoom);
  refs.clipStretchInput.value = String(state.audioClipEditor.stretch);
  refs.clipName.value = state.audioClipEditor.suggestedName;
  buildAudioClipOverview();
  syncAudioClipInputs();
  resizeAudioClipCanvas();
  renderAudioClipEditorCanvas();
  renderAudioClipEditorPanel();
  if (options.persist !== false) {
    await persistCurrentAudioClipDraft();
  }
}

async function restoreAudioClipDraftForCurrentProject() {
  if (!state.project?.projectPath) return false;
  return clearAudioClipDraftRecord(state.project.projectPath);
}

function buildAudioClipOverview() {
  if (!state.audioClipEditor.audioBuffer) return;
  const width = 5000;
  const mono = mixAudioBufferToMono(state.audioClipEditor.audioBuffer);
  const windowSize = Math.max(64, Math.floor(mono.length / width));
  const amplitudes = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    const start = Math.floor((x / width) * mono.length);
    const end = Math.min(mono.length, start + windowSize);
    let peak = 0;
    let energy = 0;
    for (let i = start; i < end; i += 1) {
      const value = Math.abs(mono[i] || 0);
      if (value > peak) peak = value;
      energy += value;
    }
    const average = end > start ? energy / (end - start) : 0;
    amplitudes[x] = Math.min(1, peak * 0.7 + average * 1.4);
  }
  state.audioClipEditor.overviewAmplitudes = amplitudes;
}

function renderAudioClipEditorCanvas() {
  if (!clipCanvasContext || !refs.clipCanvas) return;
  const width = audioClipCurrentCanvasWidth();
  const height = state.audioClipEditor.canvasHeight;
  clipCanvasContext.clearRect(0, 0, width, height);

  if (!state.audioClipEditor.audioBuffer || !state.audioClipEditor.overviewAmplitudes) {
    clipCanvasContext.fillStyle = "#0e1a24";
    clipCanvasContext.fillRect(0, 0, width, height);
    clipCanvasContext.fillStyle = "#8ca7b7";
    clipCanvasContext.font = "20px Avenir Next, sans-serif";
    clipCanvasContext.fillText("Importe um audio para ver as faixas", 28, 42);
    refs.clipPlayheadValue.textContent = "Parado";
    refs.clipZoomValue.textContent = "Zoom 1x";
    refs.clipStretchValue.textContent = `Largura ${state.audioClipEditor.stretch.toFixed(2)}x`;
    refs.clipWindowValue.textContent = "Janela completa";
    refs.clipPanSlider.max = "0";
    refs.clipPanSlider.value = "0";
    updateAudioClipOverlay(null, width);
    return;
  }

  const view = getAudioClipViewWindow();
  drawAudioClipBands(view, width, height);

  const handles = getAudioClipHandlePositions(view, width);
  clipCanvasContext.fillStyle = "rgba(255, 209, 102, 0.16)";
  if (state.audioClipEditor.selectionEnd > view.start && state.audioClipEditor.selectionStart < view.end) {
    clipCanvasContext.fillRect(
      Math.min(handles.start.lineX, handles.end.lineX),
      0,
      Math.abs(handles.end.lineX - handles.start.lineX),
      height
    );
  }

  if (handles.start.visible) {
    drawAudioClipMarker(handles.start.lineX, "#55d6c2");
    drawAudioClipHandle(handles.start.gripX, "#55d6c2");
    drawAudioClipTimeLabel(handles.start.gripX, state.audioClipEditor.selectionStart, "#55d6c2");
  }
  if (handles.end.visible) {
    drawAudioClipMarker(handles.end.lineX, "#ff9d5c");
    drawAudioClipHandle(handles.end.gripX, "#ff9d5c");
    drawAudioClipTimeLabel(handles.end.gripX, state.audioClipEditor.selectionEnd, "#ff9d5c");
  }
  drawAudioClipPlaybackNeedle(view);
  updateAudioClipViewMeta(view);
  updateAudioClipNavigationControls(view);
  updateAudioClipOverlay(view, width);
}

function handleAudioClipPointerDown(event) {
  if (!state.audioClipEditor.audioBuffer) return;
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  state.audioClipEditor.activePointerId = event.pointerId;
  state.audioClipEditor.dragBounds = refs.clipCanvas.getBoundingClientRect();
  refs.clipSelectionOverlay.setPointerCapture?.(event.pointerId);
  document.body.style.userSelect = "none";
  const view = getAudioClipViewWindow();
  const time = audioClipXToTime(audioClipPointerX(event), view);
  const x = audioClipPointerX(event);
  const handles = getAudioClipHandlePositions(view, audioClipCurrentCanvasWidth());

  if (handles.start.visible && isWithinAudioClipHandle(x, handles.start.gripX)) {
    state.audioClipEditor.dragMode = "start";
  } else if (handles.end.visible && isWithinAudioClipHandle(x, handles.end.gripX)) {
    state.audioClipEditor.dragMode = "end";
  } else {
    state.audioClipEditor.dragMode = "new";
    state.audioClipEditor.dragStartTime = time;
    state.audioClipEditor.selectionStart = time;
    state.audioClipEditor.selectionEnd = time;
  }
  syncAudioClipInputs();
  renderAudioClipEditorCanvas();
}

function beginAudioClipHandleDrag(event, mode) {
  if (!state.audioClipEditor.audioBuffer) return;
  event.preventDefault();
  event.stopPropagation();
  state.audioClipEditor.activePointerId = event.pointerId;
  state.audioClipEditor.dragBounds = refs.clipCanvas.getBoundingClientRect();
  state.audioClipEditor.dragMode = mode;
  refs.clipSelectionOverlay.setPointerCapture?.(event.pointerId);
  document.body.style.userSelect = "none";
}

function handleAudioClipMouseDown(event) {
  if (event.button !== 0 || !state.audioClipEditor.audioBuffer) return;
  event.preventDefault();
  const view = getAudioClipViewWindow();
  const time = audioClipXToTime(audioClipPointerX(event), view);
  const x = audioClipPointerX(event);
  const handles = getAudioClipHandlePositions(view, audioClipCurrentCanvasWidth());
  state.audioClipEditor.mouseDragging = true;

  if (handles.start.visible && isWithinAudioClipHandle(x, handles.start.gripX)) {
    state.audioClipEditor.dragMode = "start";
  } else if (handles.end.visible && isWithinAudioClipHandle(x, handles.end.gripX)) {
    state.audioClipEditor.dragMode = "end";
  } else {
    state.audioClipEditor.dragMode = "new";
    state.audioClipEditor.dragStartTime = time;
    state.audioClipEditor.selectionStart = time;
    state.audioClipEditor.selectionEnd = time;
  }
  syncAudioClipInputs();
  renderAudioClipEditorCanvas();
}

function beginAudioClipHandleMouseDrag(event, mode) {
  if (event.button !== 0 || !state.audioClipEditor.audioBuffer) return;
  event.preventDefault();
  event.stopPropagation();
  state.audioClipEditor.mouseDragging = true;
  state.audioClipEditor.dragMode = mode;
  document.body.style.userSelect = "none";
}

function handleAudioClipPointerMove(event) {
  if (
    state.audioClipEditor.activePointerId !== null &&
    event.pointerId !== state.audioClipEditor.activePointerId
  ) {
    return;
  }
  if (!state.audioClipEditor.audioBuffer) return;
  if (state.audioClipEditor.dragMode && event.pointerType === "mouse" && event.buttons === 0) {
    handleAudioClipPointerUp(event);
    return;
  }
  if (!state.audioClipEditor.dragMode) {
    const view = getAudioClipViewWindow();
    const pointerX = audioClipPointerX(event);
    const handles = getAudioClipHandlePositions(view, audioClipCurrentCanvasWidth());
    refs.clipSelectionOverlay.style.cursor =
      (handles.start.visible && isWithinAudioClipHandle(pointerX, handles.start.gripX)) ||
      (handles.end.visible && isWithinAudioClipHandle(pointerX, handles.end.gripX))
        ? "ew-resize"
        : "crosshair";
    return;
  }
  event.preventDefault();
  const time = audioClipXToTime(audioClipPointerX(event), getAudioClipViewWindow());
  if (state.audioClipEditor.dragMode === "start") {
    state.audioClipEditor.selectionStart = clampTime(time, 0, state.audioClipEditor.selectionEnd);
  } else if (state.audioClipEditor.dragMode === "end") {
    state.audioClipEditor.selectionEnd = clampTime(
      time,
      state.audioClipEditor.selectionStart,
      state.audioClipEditor.audioBuffer.duration
    );
  } else {
    state.audioClipEditor.selectionStart = Math.min(state.audioClipEditor.dragStartTime, time);
    state.audioClipEditor.selectionEnd = Math.max(state.audioClipEditor.dragStartTime, time);
  }
  syncAudioClipInputs();
  renderAudioClipEditorCanvas();
}

function handleAudioClipMouseMove(event) {
  if (!state.audioClipEditor.audioBuffer || !state.audioClipEditor.mouseDragging || !state.audioClipEditor.dragMode) {
    return;
  }
  event.preventDefault();
  const time = audioClipXToTime(audioClipPointerX(event), getAudioClipViewWindow());
  if (state.audioClipEditor.dragMode === "start") {
    state.audioClipEditor.selectionStart = clampTime(time, 0, state.audioClipEditor.selectionEnd);
  } else if (state.audioClipEditor.dragMode === "end") {
    state.audioClipEditor.selectionEnd = clampTime(
      time,
      state.audioClipEditor.selectionStart,
      state.audioClipEditor.audioBuffer.duration
    );
  } else {
    state.audioClipEditor.selectionStart = Math.min(state.audioClipEditor.dragStartTime, time);
    state.audioClipEditor.selectionEnd = Math.max(state.audioClipEditor.dragStartTime, time);
  }
  syncAudioClipInputs();
  renderAudioClipEditorCanvas();
}

function handleAudioClipPointerUp(event) {
  if (
    state.audioClipEditor.activePointerId !== null &&
    event?.pointerId !== undefined &&
    event.pointerId !== state.audioClipEditor.activePointerId
  ) {
    return;
  }
  if (!state.audioClipEditor.dragMode) {
    state.audioClipEditor.activePointerId = null;
    state.audioClipEditor.dragBounds = null;
    document.body.style.userSelect = "";
    return;
  }
  state.audioClipEditor.dragMode = null;
  state.audioClipEditor.activePointerId = null;
  state.audioClipEditor.dragBounds = null;
  document.body.style.userSelect = "";
  syncAudioClipInputs();
  renderAudioClipEditorCanvas();
  scheduleAudioClipDraftPersist();
}

function handleAudioClipMouseUp() {
  if (!state.audioClipEditor.mouseDragging) return;
  state.audioClipEditor.dragMode = null;
  state.audioClipEditor.mouseDragging = false;
  document.body.style.userSelect = "";
  syncAudioClipInputs();
  renderAudioClipEditorCanvas();
  scheduleAudioClipDraftPersist();
}

async function previewAudioClipSelection() {
  if (!state.audioClipEditor.audioBuffer) return;
  const selectionDuration = audioClipSelectionDuration();
  if (selectionDuration < MIN_CLIP_DURATION_SECONDS) {
    setAudioClipStatus("O corte esta muito pequeno. Ajuste inicio e fim antes de ouvir.", "error");
    return;
  }
  try {
    stopAudioClipPreviewSource();
    state.audio.pause();
    state.audio.currentTime = 0;
    if (state.audioObjectUrl) {
      URL.revokeObjectURL(state.audioObjectUrl);
      state.audioObjectUrl = "";
    }

    state.audioClipEditor.audioContext ||= new AudioContext();
    if (state.audioClipEditor.audioContext.state === "suspended") {
      await state.audioClipEditor.audioContext.resume();
    }

    const playbackDuration = Math.max(
      MIN_CLIP_DURATION_SECONDS,
      Math.min(
        selectionDuration,
        Math.max(
          MIN_CLIP_DURATION_SECONDS,
          state.audioClipEditor.audioBuffer.duration - state.audioClipEditor.selectionStart
        )
      )
    );
    const previewSource = state.audioClipEditor.audioContext.createBufferSource();
    previewSource.buffer = state.audioClipEditor.audioBuffer;
    previewSource.connect(state.audioClipEditor.audioContext.destination);

    state.audioClipEditor.previewSource = previewSource;
    state.audioClipEditor.playbackStartedAt = state.audioClipEditor.audioContext.currentTime;
    state.audioClipEditor.playbackFrom = state.audioClipEditor.selectionStart;
    state.audioClipEditor.playbackDuration = playbackDuration;
    startAudioClipPlayheadLoop();

    previewSource.onended = () => {
      if (state.audioClipEditor.previewSource === previewSource) {
        stopAudioClipPreviewSource();
        renderAudioClipEditorCanvas();
      }
    };

    previewSource.start(0, state.audioClipEditor.selectionStart, playbackDuration);
    setAudioClipStatus("Tocando a selecao atual.", "success");
  } catch (error) {
    stopAudioClipPreviewSource();
    setAudioClipStatus(error.message || "Nao foi possivel tocar a selecao.", "error");
  }
}

async function saveAudioClipSelection() {
  const targetProjectPath = state.project?.projectPath || state.audioClipEditor.projectPath;
  if (!state.audioClipEditor.audioBuffer) {
    setAudioClipStatus("Importe um audio antes de criar o corte.", "error");
    return;
  }
  if (!targetProjectPath || !state.audioClipEditor.padKey) {
    setAudioClipStatus("Nao foi possivel identificar o pad/projeto de destino.", "error");
    return;
  }
  if (audioClipSelectionDuration() < MIN_CLIP_DURATION_SECONDS) {
    setAudioClipStatus("O corte esta muito pequeno. Ajuste inicio e fim antes de salvar.", "error");
    return;
  }

  try {
    setAudioClipStatus("Criando corte...", "success");
    const fileName = ensureWavFileName(refs.clipName.value || state.audioClipEditor.suggestedName);
    if (isCloudProject()) {
      await saveAudioClipSelectionOnline(fileName);
      await clearAudioClipDraftRecord(targetProjectPath);
      setAudioClipStatus("Corte criado, salvo no projeto online e aplicado ao pad.", "success");
      return;
    }
    const payloadBody = {
      projectPath: targetProjectPath,
      fileName,
      padKey: state.audioClipEditor.padKey,
      soundIndex: state.audioClipEditor.soundIndex,
    };

    if (state.audioClipEditor.sourceBlob) {
      payloadBody.sourceAudioBase64 = await blobToBase64(state.audioClipEditor.sourceBlob);
      payloadBody.sourceFileName = state.audioClipEditor.sourceName;
      payloadBody.sourceMimeType = state.audioClipEditor.sourceMimeType;
      payloadBody.selectionStart = state.audioClipEditor.selectionStart;
      payloadBody.selectionEnd = state.audioClipEditor.selectionEnd;
    } else {
      const clip = buildAudioClipBuffer();
      const bytes = encodeAudioBufferToWavBytes(clip);
      payloadBody.audioBase64 = await bytesToBase64(bytes);
    }

    const response = await fetch("/api/sound/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadBody),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(payload.error || "Falha ao salvar o corte");
    }

    applyImportedClipToProject(
      payload.importedFile,
      state.audioClipEditor.padKey,
      state.audioClipEditor.soundIndex,
      payload.sound
    );
    await clearAudioClipDraftRecord(targetProjectPath);
    setAudioClipStatus("Corte criado, salvo na biblioteca e aplicado ao pad.", "success");
  } catch (error) {
    setAudioClipStatus(error.message || "Falha ao criar o corte.", "error");
  }
}

async function saveAudioClipSelectionOnline(fileName) {
  if (!state.project?.projectId) {
    throw new Error("Salve ou crie o projeto online antes de adicionar cortes.");
  }
  const relativePath = buildUniqueProjectSoundPath(fileName);
  const clip = buildAudioClipBuffer();
  const bytes = encodeAudioBufferToWavBytes(clip);
  const previousProject = structuredClone(state.project);
  const previousAudioLibrary = structuredClone(state.audioLibrary);
  let uploaded = null;
  try {
    uploaded = await uploadProjectAudioClip(state.project.projectId, relativePath, bytes, "audio/wav");
    applyImportedClipToProject(
      uploaded.relativePath,
      state.audioClipEditor.padKey,
      state.audioClipEditor.soundIndex,
      {
        path: uploaded.relativePath,
        name: uploaded.relativePath.split("/").pop() || fileStem(uploaded.relativePath),
        size: bytes.byteLength,
        bucket: uploaded.bucket,
        storagePath: uploaded.storagePath,
        mimeType: "audio/wav",
      }
    );
    await saveCurrentProjectOnline({ quiet: true, rethrow: true });
  } catch (error) {
    state.project = previousProject;
    state.audioLibrary = previousAudioLibrary;
    renderAll();
    if (uploaded?.storagePath) {
      try {
        await removeProjectAudioClip(uploaded.storagePath);
      } catch (_cleanupError) {
        // keep original error
      }
    }
    throw error;
  }
}

function continueAudioClipFromSelectionEnd() {
  if (!state.audioClipEditor.audioBuffer) return;
  const duration = state.audioClipEditor.audioBuffer.duration;
  const currentLength = Math.max(MIN_CLIP_DURATION_SECONDS, audioClipSelectionDuration());
  const nextStart = clampTime(state.audioClipEditor.selectionEnd, 0, duration);
  const nextEnd = clampTime(nextStart + currentLength, nextStart, duration);

  if (nextStart >= duration) {
    setAudioClipStatus("Voce ja chegou ao fim do audio.", "error");
    return;
  }

  state.audioClipEditor.selectionStart = nextStart;
  state.audioClipEditor.selectionEnd = nextEnd;
  state.audioClipEditor.viewStartOverride = Math.max(
    0,
    nextStart - (getAudioClipViewWindow().duration - (nextEnd - nextStart)) / 2
  );
  syncAudioClipInputs();
  renderAudioClipEditorCanvas();
  scheduleAudioClipDraftPersist();
  setAudioClipStatus(`Novo corte iniciado a partir de ${formatSeconds(nextStart)} s.`, "success");
}

function applyImportedClipToProject(importedFile, targetPadKey, targetSoundIndex, soundEntry) {
  if (!state.project) return;
  upsertProjectSoundEntry(soundEntry || { path: importedFile, name: fileStem(importedFile), size: 0 });
  state.selectedPadKey = targetPadKey || state.selectedPadKey;
  const pad = getPadByKey(targetPadKey || state.selectedPadKey);
  if (!pad) return;

  const slotIndex = Math.max(0, Number(targetSoundIndex) || 0);
  while (pad.sounds.length <= slotIndex) {
    pad.sounds.push({ soundFile: "", loop: 1, wormhole: null });
  }
  pad.sounds[slotIndex].soundFile = importedFile;
  state.selectedSoundIndex = slotIndex;
  state.project.stats = buildProjectStatsSnapshot();
  saveSoundToLibrary(importedFile, {
    name: soundEntry?.name || fileStem(importedFile),
    bucket: soundEntry?.bucket,
    storagePath: soundEntry?.storagePath,
    mimeType: soundEntry?.mimeType,
    size: soundEntry?.size,
  });
  state.audioClipEditor.suggestedName = suggestClipFileName();
  refs.clipName.value = state.audioClipEditor.suggestedName;
  renderHeaderBits();
  renderStats();
  renderSoundLibrary();
  renderGrid();
  renderSelectedPadEditor();
  cancelAudioClipDraftPersist();
}

function buildAudioClipBuffer() {
  const source = state.audioClipEditor.audioBuffer;
  const sampleRate = source.sampleRate;
  const startFrame = Math.max(0, Math.floor(state.audioClipEditor.selectionStart * sampleRate));
  const endFrame = Math.max(startFrame + 1, Math.floor(state.audioClipEditor.selectionEnd * sampleRate));
  const frameCount = Math.max(1, endFrame - startFrame);
  state.audioClipEditor.audioContext ||= new AudioContext();
  const output = state.audioClipEditor.audioContext.createBuffer(source.numberOfChannels, frameCount, sampleRate);

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    // Copy samples manually for broader browser compatibility during clip export.
    const sourceSlice = source.getChannelData(channel).slice(startFrame, endFrame);
    output.getChannelData(channel).set(sourceSlice, 0);
  }
  return output;
}

function mixAudioBufferToMono(audioBuffer) {
  const mono = new Float32Array(audioBuffer.length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      mono[i] += data[i] / audioBuffer.numberOfChannels;
    }
  }
  return mono;
}

function measureAudioRangePeak(audioBuffer, startTime, endTime) {
  if (!audioBuffer) return 0;
  const sampleRate = audioBuffer.sampleRate;
  const startFrame = Math.max(0, Math.floor(startTime * sampleRate));
  const endFrame = Math.min(audioBuffer.length, Math.max(startFrame + 1, Math.ceil(endTime * sampleRate)));
  let peak = 0;
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = startFrame; i < endFrame; i += 1) {
      const value = Math.abs(data[i] || 0);
      if (value > peak) peak = value;
    }
  }
  return peak;
}

function findAudibleRegion(audioBuffer) {
  if (!audioBuffer) return null;
  const mono = mixAudioBufferToMono(audioBuffer);
  let globalPeak = 0;
  for (let i = 0; i < mono.length; i += 1) {
    const value = Math.abs(mono[i] || 0);
    if (value > globalPeak) globalPeak = value;
  }
  if (globalPeak < MIN_AUDIBLE_SAMPLE) return null;

  const threshold = Math.max(MIN_AUDIBLE_SAMPLE, globalPeak * 0.08);
  let startIndex = -1;
  let endIndex = -1;
  for (let i = 0; i < mono.length; i += 1) {
    if (Math.abs(mono[i] || 0) >= threshold) {
      startIndex = i;
      break;
    }
  }
  for (let i = mono.length - 1; i >= 0; i -= 1) {
    if (Math.abs(mono[i] || 0) >= threshold) {
      endIndex = i;
      break;
    }
  }
  if (startIndex < 0 || endIndex < startIndex) return null;

  const padFrames = Math.floor(audioBuffer.sampleRate * 0.03);
  return {
    start: Math.max(0, (startIndex - padFrames) / audioBuffer.sampleRate),
    end: Math.min(audioBuffer.duration, (endIndex + padFrames + 1) / audioBuffer.sampleRate),
  };
}

function drawAudioClipBands(view, width, height) {
  clipCanvasContext.fillStyle = "#0d1721";
  clipCanvasContext.fillRect(0, 0, width, height);

  const laneGap = 18;
  const laneHeight = height - laneGap * 2;
  const sourceStart = Math.floor(
    (view.start / state.audioClipEditor.audioBuffer.duration) * state.audioClipEditor.overviewAmplitudes.length
  );
  const sourceEnd = Math.max(
    sourceStart + 1,
    Math.floor((view.end / state.audioClipEditor.audioBuffer.duration) * state.audioClipEditor.overviewAmplitudes.length)
  );
  const visible = state.audioClipEditor.overviewAmplitudes.subarray(sourceStart, sourceEnd);
  const top = laneGap;
  const centerY = top + laneHeight / 2;

  clipCanvasContext.fillStyle = "rgba(255,255,255,0.035)";
  clipCanvasContext.fillRect(0, top, width, laneHeight);
  clipCanvasContext.strokeStyle = "rgba(255,255,255,0.08)";
  clipCanvasContext.beginPath();
  clipCanvasContext.moveTo(0, centerY);
  clipCanvasContext.lineTo(width, centerY);
  clipCanvasContext.stroke();

  clipCanvasContext.fillStyle = "rgba(85, 214, 194, 0.18)";
  clipCanvasContext.beginPath();
  for (let x = 0; x < width; x += 1) {
    const sampleIndex = Math.min(
      visible.length - 1,
      Math.floor((x / Math.max(1, width - 1)) * Math.max(0, visible.length - 1))
    );
    const amplitude = Math.pow(visible[sampleIndex] || 0, 0.82);
    const y = centerY - amplitude * (laneHeight * 0.46);
    if (x === 0) {
      clipCanvasContext.moveTo(x, y);
    } else {
      clipCanvasContext.lineTo(x, y);
    }
  }
  for (let x = width - 1; x >= 0; x -= 1) {
    const sampleIndex = Math.min(
      visible.length - 1,
      Math.floor((x / Math.max(1, width - 1)) * Math.max(0, visible.length - 1))
    );
    const amplitude = Math.pow(visible[sampleIndex] || 0, 0.82);
    const y = centerY + amplitude * (laneHeight * 0.46);
    clipCanvasContext.lineTo(x, y);
  }
  clipCanvasContext.closePath();
  clipCanvasContext.fill();

  clipCanvasContext.strokeStyle = "#55d6c2";
  clipCanvasContext.lineWidth = 1.6;
  clipCanvasContext.beginPath();
  for (let x = 0; x < width; x += 1) {
    const sampleIndex = Math.min(
      visible.length - 1,
      Math.floor((x / Math.max(1, width - 1)) * Math.max(0, visible.length - 1))
    );
    const amplitude = Math.pow(visible[sampleIndex] || 0, 0.82);
    const y = centerY - amplitude * (laneHeight * 0.46);
    if (x === 0) {
      clipCanvasContext.moveTo(x, y);
    } else {
      clipCanvasContext.lineTo(x, y);
    }
  }
  clipCanvasContext.stroke();

  clipCanvasContext.strokeStyle = "rgba(255,255,255,0.16)";
  clipCanvasContext.beginPath();
  for (let x = 0; x < width; x += 1) {
    const sampleIndex = Math.min(
      visible.length - 1,
      Math.floor((x / Math.max(1, width - 1)) * Math.max(0, visible.length - 1))
    );
    const amplitude = Math.pow(visible[sampleIndex] || 0, 0.82);
    const y = centerY + amplitude * (laneHeight * 0.46);
    if (x === 0) {
      clipCanvasContext.moveTo(x, y);
    } else {
      clipCanvasContext.lineTo(x, y);
    }
  }
  clipCanvasContext.stroke();
}

function drawAudioClipMarker(x, color) {
  clipCanvasContext.strokeStyle = color;
  clipCanvasContext.lineWidth = 3;
  clipCanvasContext.beginPath();
  clipCanvasContext.moveTo(x, 0);
  clipCanvasContext.lineTo(x, state.audioClipEditor.canvasHeight);
  clipCanvasContext.stroke();
}

function drawAudioClipHandle(x, color) {
  const gripWidth = 14;
  const gripHeight = 22;
  const gripY = 10;
  clipCanvasContext.fillStyle = color;
  clipCanvasContext.fillRect(x - gripWidth / 2, gripY, gripWidth, gripHeight);
  clipCanvasContext.fillRect(x - 1, gripY + gripHeight, 2, state.audioClipEditor.canvasHeight - gripY - gripHeight - 8);
}

function drawAudioClipPlaybackNeedle(view) {
  const time = getAudioClipPlaybackTime();
  if (time === null || time < view.start || time > view.end) {
    refs.clipPlayheadValue.textContent = state.audioClipEditor.previewSource ? "Tocando fora da janela" : "Parado";
    return;
  }

  const x = audioClipTimeToX(time, view);
  clipCanvasContext.strokeStyle = "#FFFFFF";
  clipCanvasContext.lineWidth = 2;
  clipCanvasContext.setLineDash([6, 6]);
  clipCanvasContext.beginPath();
  clipCanvasContext.moveTo(x, 0);
  clipCanvasContext.lineTo(x, state.audioClipEditor.canvasHeight);
  clipCanvasContext.stroke();
  clipCanvasContext.setLineDash([]);

  clipCanvasContext.fillStyle = "rgba(255,255,255,0.94)";
  clipCanvasContext.fillRect(Math.max(0, x - 28), state.audioClipEditor.canvasHeight - 28, 56, 20);
  clipCanvasContext.fillStyle = "#09111a";
  clipCanvasContext.font = "12px Avenir Next, sans-serif";
  clipCanvasContext.fillText(formatSeconds(time), Math.max(4, x - 22), state.audioClipEditor.canvasHeight - 14);
  refs.clipPlayheadValue.textContent = `Tocando ${formatSeconds(time)} s`;
}

function drawAudioClipTimeLabel(x, time, color) {
  const text = `${formatSeconds(time)} s`;
  const labelX = Math.min(audioClipCurrentCanvasWidth() - 96, Math.max(8, x - 28));
  clipCanvasContext.fillStyle = color;
  clipCanvasContext.fillRect(labelX, 8, 88, 24);
  clipCanvasContext.fillStyle = "#09111a";
  clipCanvasContext.font = "12px Avenir Next, sans-serif";
  clipCanvasContext.fillText(text, labelX + 8, 24);
}

function audioClipPointerX(event) {
  const rect = state.audioClipEditor.dragBounds || refs.clipCanvas.getBoundingClientRect();
  const renderWidth = Math.max(1, rect.width);
  const logicalWidth = audioClipCurrentCanvasWidth();
  return Math.max(0, Math.min(logicalWidth, ((event.clientX - rect.left) / renderWidth) * logicalWidth));
}

function audioClipTimeToX(time, view = getAudioClipViewWindow()) {
  if (!state.audioClipEditor.audioBuffer) return 0;
  return ((time - view.start) / view.duration) * audioClipCurrentCanvasWidth();
}

function audioClipXToTime(x, view = getAudioClipViewWindow()) {
  if (!state.audioClipEditor.audioBuffer) return 0;
  return clampTime(
    view.start + (x / audioClipCurrentCanvasWidth()) * view.duration,
    0,
    state.audioClipEditor.audioBuffer.duration
  );
}

function audioClipSelectionDuration() {
  if (!state.audioClipEditor.audioBuffer) return 0;
  return Math.max(0, state.audioClipEditor.selectionEnd - state.audioClipEditor.selectionStart);
}

function clampTime(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getAudioClipViewWindow() {
  if (!state.audioClipEditor.audioBuffer) {
    return { start: 0, end: 1, duration: 1 };
  }
  const total = state.audioClipEditor.audioBuffer.duration;
  const visibleDuration = total / state.audioClipEditor.zoom;
  const maxStart = Math.max(0, total - visibleDuration);
  let start;
  if (state.audioClipEditor.viewStartOverride === null) {
    const selectionMid = (state.audioClipEditor.selectionStart + state.audioClipEditor.selectionEnd) / 2;
    start = selectionMid - visibleDuration / 2;
  } else {
    start = state.audioClipEditor.viewStartOverride;
  }
  let end = start + visibleDuration;
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > total) {
    start -= end - total;
    end = total;
  }
  start = Math.min(Math.max(0, start), maxStart);
  end = Math.min(total, end);
  state.audioClipEditor.viewStartOverride = start;
  return { start, end, duration: Math.max(0.01, end - start) };
}

function zoomAudioClipToSelection() {
  if (!state.audioClipEditor.audioBuffer) return;
  const duration = Math.max(0.05, audioClipSelectionDuration());
  const targetZoom = Math.min(32, Math.max(1, state.audioClipEditor.audioBuffer.duration / (duration * 2.4)));
  state.audioClipEditor.zoom = Number(targetZoom.toFixed(0));
  refs.clipZoomInput.value = String(state.audioClipEditor.zoom);
  state.audioClipEditor.viewStartOverride = Math.max(
    0,
    (state.audioClipEditor.selectionStart + state.audioClipEditor.selectionEnd) / 2 -
      (state.audioClipEditor.audioBuffer.duration / state.audioClipEditor.zoom) / 2
  );
  renderAudioClipEditorCanvas();
}

function updateAudioClipViewMeta(view) {
  refs.clipZoomValue.textContent = `Zoom ${state.audioClipEditor.zoom}x`;
  refs.clipStretchValue.textContent = `Largura ${state.audioClipEditor.stretch.toFixed(2)}x`;
  refs.clipWindowValue.textContent = `Janela ${formatSeconds(view.start)}s - ${formatSeconds(view.end)}s`;
}

function updateAudioClipNavigationControls(view) {
  if (!state.audioClipEditor.audioBuffer) {
    refs.clipPanSlider.max = "0";
    refs.clipPanSlider.value = "0";
    refs.clipPanLeftButton.disabled = true;
    refs.clipPanRightButton.disabled = true;
    return;
  }
  const maxStart = Math.max(0, state.audioClipEditor.audioBuffer.duration - view.duration);
  refs.clipPanSlider.max = String(maxStart);
  refs.clipPanSlider.value = String(Math.max(0, Math.min(maxStart, view.start)));
  refs.clipPanLeftButton.disabled = view.start <= 0.001;
  refs.clipPanRightButton.disabled = view.start >= maxStart - 0.001;
}

function panAudioClipWindow(direction) {
  if (!state.audioClipEditor.audioBuffer) return;
  const view = getAudioClipViewWindow();
  const shift = view.duration * 0.25 * direction;
  state.audioClipEditor.viewStartOverride = Math.max(0, view.start + shift);
  renderAudioClipEditorCanvas();
}

function clampAudioClipViewAfterZoom() {
  if (!state.audioClipEditor.audioBuffer) return;
  const visibleDuration = state.audioClipEditor.audioBuffer.duration / state.audioClipEditor.zoom;
  const maxStart = Math.max(0, state.audioClipEditor.audioBuffer.duration - visibleDuration);
  if (state.audioClipEditor.viewStartOverride === null) {
    state.audioClipEditor.viewStartOverride = 0;
  }
  state.audioClipEditor.viewStartOverride = Math.min(Math.max(0, state.audioClipEditor.viewStartOverride), maxStart);
}

function startAudioClipPlayheadLoop() {
  stopAudioClipPlayheadLoop();
  const tick = () => {
    renderAudioClipEditorCanvas();
    if (state.audioClipEditor.previewSource) {
      state.audioClipEditor.playheadFrame = window.requestAnimationFrame(tick);
    }
  };
  state.audioClipEditor.playheadFrame = window.requestAnimationFrame(tick);
}

function stopAudioClipPlayheadLoop() {
  if (state.audioClipEditor.playheadFrame) {
    window.cancelAnimationFrame(state.audioClipEditor.playheadFrame);
    state.audioClipEditor.playheadFrame = 0;
  }
  refs.clipPlayheadValue.textContent = "Parado";
}

function getAudioClipPlaybackTime() {
  if (!state.audioClipEditor.previewSource) return null;
  if (window.HTMLMediaElement && state.audioClipEditor.previewSource instanceof window.HTMLMediaElement) {
    const elapsed = state.audioClipEditor.previewSource.currentTime;
    if (elapsed < 0 || elapsed > state.audioClipEditor.playbackDuration) return null;
    return state.audioClipEditor.playbackFrom + elapsed;
  }
  if (!state.audioClipEditor.audioContext) return null;
  const elapsed = state.audioClipEditor.audioContext.currentTime - state.audioClipEditor.playbackStartedAt;
  if (elapsed < 0 || elapsed > state.audioClipEditor.playbackDuration) return null;
  return state.audioClipEditor.playbackFrom + elapsed;
}

function stopAudioClipPreviewSource() {
  if (window.HTMLMediaElement && state.audioClipEditor.previewSource instanceof window.HTMLMediaElement) {
    state.audioClipEditor.previewSource.pause();
    state.audioClipEditor.previewSource.currentTime = 0;
    state.audioClipEditor.previewSource.onended = null;
    state.audioClipEditor.previewSource = null;
  } else if (state.audioClipEditor.previewSource) {
    try {
      state.audioClipEditor.previewSource.stop();
    } catch (error) {
      // ignore stop errors from already-finished nodes
    }
    state.audioClipEditor.previewSource.disconnect();
    state.audioClipEditor.previewSource = null;
  }
  if (state.audioClipEditor.previewAudioUrl) {
    URL.revokeObjectURL(state.audioClipEditor.previewAudioUrl);
    state.audioClipEditor.previewAudioUrl = "";
  }
  stopAudioClipPlayheadLoop();
}

function resizeAudioClipCanvas() {
  if (!refs.clipCanvas || !clipCanvasContext) return;
  state.audioClipEditor.baseCanvasWidth = computeAudioClipBaseWidth();
  const cssWidth = audioClipCurrentCanvasWidth();
  const cssHeight = state.audioClipEditor.canvasHeight;
  refs.clipCanvas.style.setProperty("--clip-canvas-width", `${cssWidth}px`);
  refs.clipCanvas.width = Math.round(cssWidth * state.audioClipEditor.dpr);
  refs.clipCanvas.height = Math.round(cssHeight * state.audioClipEditor.dpr);
  clipCanvasContext.setTransform(state.audioClipEditor.dpr, 0, 0, state.audioClipEditor.dpr, 0, 0);
}

function audioClipCurrentCanvasWidth() {
  return Math.round(state.audioClipEditor.baseCanvasWidth * state.audioClipEditor.stretch);
}

function computeAudioClipBaseWidth() {
  const wrapWidth = refs.clipCanvasWrap?.clientWidth || refs.clipEditorPanel?.clientWidth || 960;
  return Math.max(560, Math.min(860, wrapWidth - 18));
}

function getDefaultAudioClipZoom(duration) {
  const targetWindowSeconds = 8;
  return Math.min(32, Math.max(1, Math.ceil(duration / targetWindowSeconds)));
}

function getDefaultAudioClipSelectionStart(duration) {
  return Math.min(duration, duration > 0.35 ? 0.18 : 0);
}

function getDefaultAudioClipSelectionEnd(duration) {
  return Math.min(duration, Math.max(0.8, getDefaultAudioClipSelectionStart(duration) + 2.2));
}

function isAudioClipTimeVisible(time, view) {
  return time >= view.start && time <= view.end;
}

function clampCanvasX(value, width) {
  return Math.max(0, Math.min(width, value));
}

function getAudioClipHandlePositions(view, width) {
  const handlePadding = 10;
  const startLineX = clampCanvasX(audioClipTimeToX(state.audioClipEditor.selectionStart, view), width);
  const endLineX = clampCanvasX(audioClipTimeToX(state.audioClipEditor.selectionEnd, view), width);
  return {
    start: {
      visible: isAudioClipTimeVisible(state.audioClipEditor.selectionStart, view),
      lineX: startLineX,
      gripX: clampCanvasX(startLineX <= 0 ? handlePadding : startLineX, width),
    },
    end: {
      visible: isAudioClipTimeVisible(state.audioClipEditor.selectionEnd, view),
      lineX: endLineX,
      gripX: clampCanvasX(endLineX >= width ? width - handlePadding : endLineX, width),
    },
  };
}

function isWithinAudioClipHandle(pointerX, handleX) {
  return Math.abs(pointerX - handleX) <= 20;
}

function updateAudioClipOverlay(view, width) {
  if (!refs.clipSelectionOverlay || !refs.clipSelectionWindow) return;
  if (!view || !state.audioClipEditor.audioBuffer) {
    refs.clipSelectionOverlay.hidden = true;
    return;
  }

  refs.clipSelectionOverlay.hidden = false;
  const handles = getAudioClipHandlePositions(view, width);
  const selectionLeft = Math.min(handles.start.lineX, handles.end.lineX);
  const selectionWidth = Math.max(2, Math.abs(handles.end.lineX - handles.start.lineX));

  refs.clipSelectionWindow.style.left = `${selectionLeft}px`;
  refs.clipSelectionWindow.style.width = `${selectionWidth}px`;

  refs.clipStartHandle.hidden = !handles.start.visible;
  refs.clipEndHandle.hidden = !handles.end.visible;
  refs.clipStartHandle.style.left = `${handles.start.gripX}px`;
  refs.clipEndHandle.style.left = `${handles.end.gripX}px`;
}

function suggestAudioImportFileName(sourceName) {
  const stem = String(sourceName || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_\-]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return ensureWavFileName(stem || "novo_clip");
}

function getSelectedPad() {
  return getPadByKey(state.selectedPadKey);
}

function getPadByKey(targetPadKey) {
  if (!state.project || !targetPadKey) return null;
  if (!state.project.pads[targetPadKey]) {
    const [chain, x, y] = targetPadKey.split(":").map(Number);
    state.project.pads[targetPadKey] = {
      key: targetPadKey,
      chain,
      x,
      y,
      sounds: [],
      ledAnimations: [],
    };
  }
  return state.project.pads[targetPadKey];
}

function pickInitialPad() {
  if (!state.project) return;
  if (state.selectedPadKey && state.project.pads[state.selectedPadKey]) return;
  state.selectedPadKey = padKey(state.currentChain, 1, getButtonY());
}

function resetSelectedEditors() {
  state.selectedSoundIndex = 0;
  state.selectedLedIndex = 0;
  state.ledLibraryPickerOpen = false;
  state.audioLibraryPickerOpen = false;
  refs.toggleAudioLibrary.textContent = "Biblioteca";
}

function clampPadSelection(pad) {
  state.selectedSoundIndex = clampIndex(state.selectedSoundIndex, pad.sounds.length);
  state.selectedLedIndex = clampIndex(state.selectedLedIndex, pad.ledAnimations.length);
}

function getButtonX() {
  return Math.max(1, parseIntSafe(state.project?.info?.buttonX, 8));
}

function getButtonY() {
  return Math.max(1, parseIntSafe(state.project?.info?.buttonY, 8));
}

function getChainCount() {
  return Math.max(1, parseIntSafe(state.project?.info?.chain, 8));
}

function computeStats() {
  const pads = Object.values(state.project.pads);
  return {
    buttonX: getButtonX(),
    buttonY: getButtonY(),
    chain: getChainCount(),
    mappedPads: pads.filter((pad) => pad.sounds.length || pad.ledAnimations.length).length,
    soundRows: pads.reduce((sum, pad) => sum + pad.sounds.length, 0),
    ledAnimations: pads.reduce((sum, pad) => sum + pad.ledAnimations.length, 0),
  };
}

function buildProjectStatsSnapshot() {
  const stats = computeStats();
  return {
    ...stats,
    autoPlayRows: state.project?.autoPlay?.length || 0,
    soundFiles: state.project?.sounds?.length || 0,
  };
}

function upsertProjectSoundEntry(soundEntry) {
  if (!state.project || !soundEntry?.path) return;
  const normalized = {
    path: String(soundEntry.path),
    name: String(soundEntry.name || String(soundEntry.path).split("/").pop() || fileStem(soundEntry.path)),
    size: Number(soundEntry.size) || 0,
    bucket: String(soundEntry.bucket || ""),
    storagePath: String(soundEntry.storagePath || ""),
    mimeType: String(soundEntry.mimeType || ""),
  };
  const nextSounds = [
    normalized,
    ...(state.project.sounds || []).filter((entry) => String(entry.path || entry.name || "") !== normalized.path),
  ];
  nextSounds.sort((left, right) =>
    String(left.path || left.name || "").localeCompare(String(right.path || right.name || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );
  state.project.sounds = nextSounds;
}

function createStat(value, label) {
  return el("div", { className: "stat" }, el("strong", { textContent: String(value) }), el("span", { textContent: label }));
}

function createInputField(label, value, type, onInput, extraAttributes = {}) {
  const input = el("input", { type, value: String(value ?? ""), ...extraAttributes });
  input.addEventListener("input", () => onInput(input.value));
  return el("label", { className: "field" }, el("span", { textContent: label }), input);
}

function createColorField(label, value, onInput) {
  const input = el("input", { type: "color", value: normalizeColor(value) });
  input.addEventListener("input", () => onInput(input.value));
  return el("label", { className: "field" }, el("span", { textContent: label }), input);
}

function createBooleanField(label, value, onInput) {
  return createSelectField(
    label,
    String(value ?? ""),
    [
      ["true", "true"],
      ["false", "false"],
      ["", "vazio"],
    ],
    onInput
  );
}

function createSelectField(label, value, options, onInput) {
  const select = el("select");
  options.forEach(([optionValue, optionLabel]) => {
    const option = el("option", { value: optionValue, textContent: optionLabel });
    if (String(value) === String(optionValue)) {
      option.selected = true;
    }
    select.append(option);
  });
  select.addEventListener("change", () => onInput(select.value));
  return el("label", { className: "field" }, el("span", { textContent: label }), select);
}

function createMiniButton(label, handler) {
  const button = el("button", { className: "mini", type: "button", textContent: label });
  button.addEventListener("click", handler);
  return button;
}

function createMiniTabButton(label, active, handler) {
  const button = el("button", {
    className: `mini-tab${active ? " is-active" : ""}`,
    type: "button",
    textContent: label,
  });
  button.addEventListener("click", handler);
  return button;
}

function createFocusHeader(title, subtitle, actions = []) {
  const hasTitle = Boolean((title || "").trim() || (subtitle || "").trim());
  return el(
    "div",
    { className: `focus-header${hasTitle ? "" : " is-actions-only"}` },
    hasTitle
      ? el(
          "div",
          { className: "focus-title" },
          el("strong", { textContent: title }),
          el("span", { textContent: subtitle })
        )
      : null,
    el("div", { className: "inline-actions" }, ...actions)
  );
}

function createSpeedField(animation, pad) {
  const currentSpeed = clampAnimationSpeed(animation.presetSpeed ?? inferAnimationSpeed(animation));
  const number = el("input", {
    type: "number",
    min: "10",
    max: "1000",
    step: "1",
    value: String(currentSpeed),
  });
  const helper = el("span", {
    className: "field-helper",
    textContent: `Preview em ${currentSpeed} ms por passo`,
  });

  const apply = () => {
    const rawValue = number.value.trim();
    if (!rawValue) {
      helper.textContent = "Digite o novo tempo em ms por passo";
      return;
    }
    const nextSpeed = clampAnimationSpeed(parseIntSafe(rawValue, currentSpeed));
    number.value = String(nextSpeed);
    updateAnimationSpeed(animation, pad, nextSpeed);
    helper.textContent = `Preview em ${nextSpeed} ms por passo`;
  };

  number.addEventListener("input", () => {
    if (!number.value.trim()) {
      helper.textContent = "Digite o novo tempo em ms por passo";
      return;
    }
    helper.textContent = `Novo valor: ${number.value.trim()} ms`;
  });
  number.addEventListener("change", apply);
  number.addEventListener("blur", apply);
  number.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      apply();
    }
  });

  return el(
    "label",
    { className: "field speed-field" },
    el("span", { textContent: "Velocidade" }),
    el("div", { className: "speed-inputs speed-inputs-single" }, number),
    helper
  );
}

function createPreviewRateField(previewKey, currentPercent, options = {}) {
  const label = options.label || "Preview";
  const helperText = options.helper || "100% original";
  const input = el("input", {
    type: "number",
    min: "10",
    max: "500",
    step: "5",
    value: String(currentPercent),
  });
  const helper = el("span", {
    className: "field-helper",
    textContent: `${helperText} · atual ${currentPercent}%`,
  });

  const apply = () => {
    const rawValue = input.value.trim();
    if (!rawValue) {
      helper.textContent = `${helperText} · digite um percentual`;
      return;
    }
    const nextPercent = clampPreviewRatePercent(parseIntSafe(rawValue, currentPercent));
    input.value = String(nextPercent);
    helper.textContent = `${helperText} · atual ${nextPercent}%`;
    if (typeof options.onApply === "function") {
      options.onApply(nextPercent, previewKey);
    }
  };

  input.addEventListener("input", () => {
    if (!input.value.trim()) {
      helper.textContent = `${helperText} · digite um percentual`;
      return;
    }
    helper.textContent = `${helperText} · novo ${input.value.trim()}%`;
  });
  input.addEventListener("change", apply);
  input.addEventListener("blur", apply);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      apply();
    }
  });

  return el(
    "label",
    { className: "field speed-field" },
    el("span", { textContent: `${label} (%)` }),
    el("div", { className: "speed-inputs speed-inputs-single" }, input),
    helper
  );
}

function createLedPreview(animation, previewRatePercent = 100) {
  const preview = el("div", { className: "editor-preview led-preview-pane stack" });
  preview.append(...createLedPreviewContent(animation, previewRatePercent));
  return preview;
}

function createEditorMediaTabPanel(pad, animation, previewRatePercent = 100) {
  const isPreview = state.editorMediaSubview === "preview";
  const isAudioLibrary = state.editorMediaSubview === "library";
  const isAnimationLibrary = state.editorMediaSubview === "animation-library";
  const wrapper = el("div", { className: "editor-preview led-preview-pane stack editor-media-panel" });
  const tabs = el(
    "div",
    { className: "mini-tabs led-preview-tabs" },
    createMiniTabButton("Preview", isPreview, () => {
      state.editorMediaSubview = "preview";
      renderLedEditor(pad);
    }),
    createMiniTabButton("Biblioteca de audio", isAudioLibrary, () => {
      state.editorMediaSubview = "library";
      renderLedEditor(pad);
    }),
    createMiniTabButton("Biblioteca de animacao", isAnimationLibrary, () => {
      state.editorMediaSubview = "animation-library";
      state.editorAnimationLibraryPage = 0;
      renderLedEditor(pad);
    })
  );

  wrapper.append(tabs);
  if (isAudioLibrary) {
    wrapper.append(
      el(
        "div",
        { className: "editor-media-library stack" },
        ...buildAudioLibraryWorkspaceNodes({
          title: "Biblioteca de audio",
          subtitle: "Escolha um corte e aplique no slot atual deste pad.",
          pad,
        })
      )
    );
    return wrapper;
  }

  if (isAnimationLibrary) {
    wrapper.append(
      el(
        "div",
        { className: "editor-media-library stack" },
        ...buildLedLibraryWorkspaceNodes({
          title: "Biblioteca de animacoes",
          subtitle: "Escolha uma animacao pronta para aplicar neste pad.",
          pad,
          compact: true,
        })
      )
    );
    return wrapper;
  }

  if (!animation) {
    wrapper.append(createEmptyState("Nenhuma animacao selecionada para mostrar no launchpad."));
    return wrapper;
  }

  wrapper.append(...createLedPreviewContent(animation, previewRatePercent));
  return wrapper;
}

function createLedPreviewContent(animation, previewRatePercent = 100) {
  const color = normalizeColor(animation.previewColor || inferAnimationColor(animation));
  const speedText = `Velocidade do preview: ${clampAnimationSpeed(animation.presetSpeed ?? inferAnimationSpeed(animation))} ms por passo.`;
  const rateText = `Escala visual: ${previewRatePercent}% do tempo original.`;
  const launchpad = createLaunchpadPreviewGrid("", 28);
  return [
    el(
      "div",
      { className: "preview-topline" },
      el("strong", { textContent: "Preview no launchpad" }),
      el(
        "div",
        { className: "preview-meta-chips" },
        el("span", { className: "pill", textContent: `${clampAnimationSpeed(animation.presetSpeed ?? inferAnimationSpeed(animation))} ms` }),
        el("span", { className: "color-chip", style: `background:${color};` })
      )
    ),
    el("span", { className: "muted", textContent: speedText }),
    el("span", { className: "muted", textContent: rateText }),
    launchpad,
  ];
}

function createLedLibraryChooser(pad) {
  const libraryItems = state.ledLibrary.length
    ? state.ledLibrary.map((entry) => createLedLibraryCard(entry, pad))
    : [createEmptyState(getLedLibraryEmptyMessage())];

  return el(
    "div",
    { className: "editor-focus stack" },
    createFocusHeader(
      "Biblioteca de animacoes",
      "Escolha uma animacao pronta para adicionar neste pad.",
      [
        createMiniButton("Criar do zero", () => {
          pad.ledAnimations.push(createPresetAnimation(pad, "pulse", "#55D6C2", 90));
          state.selectedLedIndex = pad.ledAnimations.length - 1;
          state.ledLibraryPickerOpen = false;
          renderSelectedPadEditor();
          renderGrid();
          renderStats();
        }),
        createMiniButton("Fechar", () => {
          state.ledLibraryPickerOpen = false;
          renderLedEditor(pad);
        }),
      ]
    ),
    el("div", { className: "led-library-grid" }, ...libraryItems)
  );
}

function createLedLibraryWorkspace(pad) {
  return el(
    "div",
    { className: "editor-focus stack" },
    ...buildLedLibraryWorkspaceNodes({ pad })
  );
}

function buildLedLibraryWorkspaceNodes(options = {}) {
  const title = options.title || "Biblioteca de animacoes";
  const subtitle = options.subtitle || "Animacoes prontas para reutilizar em outros pads e projetos.";
  const pad = options.pad ?? getSelectedPad();
  const compact = Boolean(options.compact);
  if (!state.project) {
    return [
      createFocusHeader(title, "Carregue um projeto para reutilizar animacoes."),
      createEmptyState("Nenhum projeto carregado."),
    ];
  }

  const targetText = pad
    ? `Aplicando em Chain ${pad.chain} · Pad ${pad.x},${pad.y}.`
    : "Selecione um pad na aba Editor ou LED para aplicar uma animacao.";
  const allEntries = state.ledLibrary;
  const compactPageSize = 4;
  const maxPage = compact ? Math.max(0, Math.ceil(allEntries.length / compactPageSize) - 1) : 0;
  if (compact) {
    state.editorAnimationLibraryPage = Math.min(state.editorAnimationLibraryPage, maxPage);
  }
  const compactStart = compact ? state.editorAnimationLibraryPage * compactPageSize : 0;
  const visibleEntries = compact ? allEntries.slice(compactStart, compactStart + compactPageSize) : allEntries;
  const libraryItems = visibleEntries.length
    ? visibleEntries.map((entry) => createLedLibraryCard(entry, pad, { compact }))
    : [createEmptyState(getLedLibraryEmptyMessage())];
  const headerActions = compact
    ? createCompactLedLibraryHeaderActions(maxPage, pad, compactPageSize)
    : createLedLibraryHeaderActions();

  if (compact) {
    return [
      el(
        "div",
        { className: "compact-library-topbar" },
        el(
          "div",
          { className: "compact-library-title" },
          el("strong", { textContent: "Animacoes" }),
          el("span", { className: "muted", textContent: `${state.ledLibrary.length} opcoes para este pad` })
        ),
        el("div", { className: "inline-actions compact-library-actions" }, ...headerActions)
      ),
      state.ledLibrarySyncError
        ? el("span", { className: "muted compact-library-status", textContent: "Biblioteca online indisponivel no momento." })
        : null,
      el("div", { className: "led-library-grid is-compact" }, ...libraryItems)
    ];
  }

  return [
    createFocusHeader(title, subtitle, headerActions),
    el(
      "div",
      { className: `audio-library-meta${compact ? " is-compact" : ""}` },
      el("span", { className: "pill", textContent: `${state.ledLibrary.length} animacao(oes)` }),
      el("span", { className: "pill", textContent: `${state.localLedLibrary.length} local(is)` }),
      el("span", { className: "pill", textContent: `${state.remoteLedLibrary.length} online` }),
      el("span", { className: "muted", textContent: targetText })
    ),
    state.ledLibrarySyncError
      ? el("span", { className: "muted", textContent: `Biblioteca online: ${state.ledLibrarySyncError}` })
      : null,
    el("div", { className: `led-library-grid${compact ? " is-compact" : ""}` }, ...libraryItems)
  ];
}

function createLedLibraryCard(entry, pad, options = {}) {
  const compact = Boolean(options.compact);
  const animation = buildAnimationFromLibraryEntry(entry);
  const isRemoteOwner = entry.source === "remote" && entry.authorId && entry.authorId === state.supabaseUserId;
  ensureLedAnimationUi(animation, pad || createVirtualPadForPreview());
  const previewColor = normalizeColor(entry.previewColor || animation.previewColor || inferAnimationColor(animation));
  const previewRatePercent = getPreviewRatePercent(`library:${entry.id}`, entry.previewRatePercent);
  const preview = createLaunchpadPreviewGrid("is-mini", compact ? 16 : 22);
  startLedPreview(preview, animation, previewColor, {
    loop: true,
    group: "library",
    speedMultiplier: previewRatePercent / 100,
  });

  return el(
    "div",
    { className: `library-card stack${compact ? " is-compact" : ""}` },
    el(
      "div",
      { className: "library-card-head" },
      el("strong", { textContent: entry.name || "Animacao sem nome" }),
      el(
        "div",
        { className: "mini-tabs library-card-pills" },
        el("span", { className: "pill", textContent: labelForPreset(entry.presetName || "custom") }),
        el("span", { className: `pill${entry.source === "remote" ? " pill-remote" : ""}`, textContent: entry.source === "remote" ? "Online" : "Local" })
      )
    ),
    el("span", {
      className: "muted",
      textContent: compact ? buildCompactLedLibraryMetaText(entry, animation) : buildLedLibraryMetaText(entry, animation, previewRatePercent),
    }),
    compact
      ? null
      : createPreviewRateField(`library:${entry.id}`, previewRatePercent, {
          label: "Preview",
          helper: "100% original, maior fica mais lento",
          onApply: (value) => {
            entry.previewRatePercent = value;
            if (entry.source !== "remote") {
              updateLocalLibraryEntry(entry);
              persistLedLibrary();
            }
            if (pad) {
              renderLedEditor(pad);
            } else {
              renderLedLibraryPanel();
            }
          },
        }),
    preview,
    el(
      "div",
      { className: "compact-actions" },
      pad
        ? createMiniButton("Adicionar ao pad", async () => {
            await applyLibraryAnimationToPad(entry, pad);
          })
        : createMiniButton("Selecionar pad", () => {
            state.currentView = "editor";
            renderViewNavigation();
          }),
      entry.source === "remote"
        ? createMiniButton("Salvar local", () => {
            saveRemoteAnimationToLocalLibrary(entry);
            if (pad) {
              renderLedEditor(pad);
            } else {
              renderLedLibraryPanel();
            }
          })
        : createMiniButton("Publicar online", async () => {
            await publishLibraryAnimationEntry(entry, pad);
          }),
      entry.source === "remote" && !isRemoteOwner
        ? null
        : createMiniButton(entry.source === "remote" ? "Apagar online" : "Apagar", async () => {
            await deleteAnimationFromLibrary(entry, pad);
          })
    )
  );
}

function createPresetAnimation(pad, presetName, color, speed) {
  return {
    loop: 1,
    suffix: "",
    presetName,
    previewColor: normalizeColor(color),
    presetSpeed: speed,
    events: buildPresetEvents(pad, presetName, normalizeColor(color), speed),
  };
}

function ensureLedAnimationUi(animation, pad) {
  if (!animation.previewColor) {
    animation.previewColor = normalizeColor(inferAnimationColor(animation));
  }
  if (!animation.presetSpeed) {
    animation.presetSpeed = inferAnimationSpeed(animation);
  }
  if (!animation.presetName) {
    animation.presetName = "custom";
  }
  animation.loop ||= 1;
  animation.events ||= [];
  if (!animation.events.length && animation.presetName !== "custom") {
    regenerateLedAnimation(animation, pad);
  }
}

function createVirtualPadForPreview() {
  return {
    key: "preview",
    chain: 1,
    x: 1,
    y: 1,
    sounds: [],
    ledAnimations: [],
  };
}

function updateAnimationSpeed(animation, pad, nextSpeed) {
  const speed = clampAnimationSpeed(nextSpeed);
  const currentSpeed = clampAnimationSpeed(inferAnimationSpeed(animation));
  animation.presetSpeed = speed;

  if ((animation.presetName || "custom") !== "custom") {
    regenerateLedAnimation(animation, pad);
  } else {
    scaleAnimationDelays(animation, speed, currentSpeed);
  }

  renderLedEditor(pad);
  renderGrid();
}

function regenerateLedAnimation(animation, pad) {
  const presetName = animation.presetName || "pulse";
  const color = normalizeColor(animation.previewColor || "#55D6C2");
  const speed = clampAnimationSpeed(animation.presetSpeed);
  animation.previewColor = color;
  animation.presetSpeed = speed;
  animation.events = buildPresetEvents(pad, presetName, color, speed);
}

function buildPresetEvents(pad, presetName, color, speed) {
  const hex = sanitizeHex(color);
  const x = pad.x;
  const y = pad.y;
  const delays = [];
  const events = [];
  const center = [{ x, y }];
  const orthogonal = neighborsOrthogonal(x, y);
  const diagonal = neighborsDiagonal(x, y);

  const pushFrame = (coords, delayMs = speed) => {
    coords.forEach((coord) => {
      events.push({ type: "on", x: String(coord.x), y: coord.y, mode: "hex", color: hex, velocity: null });
    });
    events.push({ type: "delay", ms: delayMs });
  };
  const pushOff = (coords) => {
    coords.forEach((coord) => {
      events.push({ type: "off", x: String(coord.x), y: coord.y });
    });
  };

  switch (presetName) {
    case "single":
      pushFrame(center, speed * 2);
      pushOff(center);
      break;
    case "blink":
      pushFrame(center, speed);
      pushOff(center);
      events.push({ type: "delay", ms: speed });
      pushFrame(center, speed);
      pushOff(center);
      break;
    case "pulse":
      pushFrame(center, speed);
      pushFrame(orthogonal, speed);
      pushOff(center.concat(orthogonal));
      break;
    case "ripple":
      pushFrame(center, speed);
      pushFrame(orthogonal, speed);
      pushFrame(diagonal, speed);
      pushOff(center.concat(orthogonal).concat(diagonal));
      break;
    case "cross":
      pushFrame(center, speed);
      pushFrame(lineRow(y), speed);
      pushFrame(lineColumn(x), speed);
      pushOff(uniqueCoords(center.concat(lineRow(y)).concat(lineColumn(x))));
      break;
    case "sweep-x":
      lineRow(y).forEach((coord) => pushFrame([coord], Math.max(35, Math.floor(speed * 0.8))));
      pushOff(lineRow(y));
      break;
    case "sweep-y":
      lineColumn(x).forEach((coord) => pushFrame([coord], Math.max(35, Math.floor(speed * 0.8))));
      pushOff(lineColumn(x));
      break;
    default:
      return structuredClone(pad.ledAnimations?.[state.selectedLedIndex]?.events || []);
  }

  return events;

  function neighborsOrthogonal(cx, cy) {
    return uniqueCoords(
      [
        { x: cx - 1, y: cy },
        { x: cx + 1, y: cy },
        { x: cx, y: cy - 1 },
        { x: cx, y: cy + 1 },
      ].filter(isValidCoord)
    );
  }

  function neighborsDiagonal(cx, cy) {
    return uniqueCoords(
      [
        { x: cx - 1, y: cy - 1 },
        { x: cx + 1, y: cy - 1 },
        { x: cx - 1, y: cy + 1 },
        { x: cx + 1, y: cy + 1 },
      ].filter(isValidCoord)
    );
  }

  function lineRow(row) {
    return Array.from({ length: getButtonX() }, (_, index) => ({ x: index + 1, y: row })).filter(isValidCoord);
  }

  function lineColumn(column) {
    return Array.from({ length: getButtonY() }, (_, index) => ({ x: column, y: index + 1 })).filter(isValidCoord);
  }

  function isValidCoord(coord) {
    return coord.x >= 1 && coord.x <= getButtonX() && coord.y >= 1 && coord.y <= getButtonY();
  }
}

function uniqueCoords(coords) {
  const map = new Map();
  coords.forEach((coord) => map.set(`${coord.x}:${coord.y}`, coord));
  return [...map.values()];
}

function inferAnimationColor(animation) {
  const firstOn = (animation.events || []).find((event) => event.type === "on");
  if (firstOn) {
    if (firstOn.mode === "hex" && firstOn.color) {
      return normalizeColor(`#${firstOn.color}`);
    }
    if (firstOn.mode === "auto") {
      return velocityToHexColor(firstOn.velocity, "#55D6C2");
    }
  }
  return "#55D6C2";
}

function inferAnimationSpeed(animation) {
  const firstDelay = (animation.events || []).find((event) => event.type === "delay" && Number(event.ms) > 0);
  return firstDelay ? clampAnimationSpeed(Number(firstDelay.ms)) : 90;
}

function clampAnimationSpeed(value) {
  return Math.min(1000, Math.max(10, parseIntSafe(value, 90)));
}

function clampPreviewRatePercent(value) {
  return Math.min(500, Math.max(10, parseIntSafe(value, 100)));
}

function getPadPreviewKey(pad, index) {
  return `pad:${pad.key}:${index}`;
}

function getPreviewRatePercent(previewKey, fallback = 100) {
  return clampPreviewRatePercent(state.previewSpeedOverrides[previewKey] ?? fallback ?? 100);
}

function scaleAnimationDelays(animation, nextSpeed, previousSpeed) {
  const base = Math.max(1, Number(previousSpeed) || inferAnimationSpeed(animation) || 90);
  const ratio = nextSpeed / base;
  let changed = false;
  animation.events = (animation.events || []).map((event) => {
    if (event.type !== "delay") {
      return event;
    }
    changed = true;
    return {
      ...event,
      ms: Math.max(1, Math.round((Number(event.ms) || 0) * ratio)),
    };
  });
  if (!changed) {
    animation.events = [...(animation.events || []), { type: "delay", ms: nextSpeed }];
  }
}

function labelForPreset(presetName) {
  return LED_PRESETS.find(([value]) => value === presetName)?.[1] || "Custom";
}

function normalizeColor(color) {
  const cleaned = sanitizeHex(String(color || "").replace("#", ""));
  return `#${(cleaned || "55D6C2").padEnd(6, "0").slice(0, 6)}`;
}

function createLaunchpadPreviewGrid(extraClassName = "", cellSize = 22) {
  const wrapper = el("div", {
    className: `launchpad-preview ${extraClassName}`.trim(),
    style: `grid-template-columns: repeat(${getButtonX()}, minmax(${cellSize}px, 1fr));`,
  });
  for (let x = 1; x <= getButtonX(); x += 1) {
    for (let y = 1; y <= getButtonY(); y += 1) {
      wrapper.append(el("div", { className: "launchpad-cell", "data-pad": `${x}:${y}` }));
    }
  }
  return wrapper;
}

function startLedPreview(container, animation, fallbackColor, options = {}) {
  const loop = options.loop !== false;
  const group = options.group || "general";
  const speedMultiplier = Math.max(0.1, Number(options.speedMultiplier) || 1);
  const cells = new Map(
    [...container.querySelectorAll(".launchpad-cell")].map((cell) => [cell.getAttribute("data-pad"), cell])
  );
  const frames = buildPreviewFrames(animation, fallbackColor, speedMultiplier);
  if (!frames.length) return;

  const controller = { timer: 0, cancelled: false, group };
  state.ledPreviewTimers.push(controller);
  let frameIndex = 0;
  const runFrame = () => {
    if (controller.cancelled) return;
    applyPreviewFrame(cells, frames[frameIndex]);
    const duration = frames[frameIndex].duration;
    if (!loop && frameIndex >= frames.length - 1) {
      controller.timer = window.setTimeout(() => {
        controller.cancelled = true;
      }, duration);
      return;
    }
    frameIndex = (frameIndex + 1) % frames.length;
    controller.timer = window.setTimeout(runFrame, duration);
  };

  runFrame();
}

function stopLedPreview(group = "all") {
  state.ledPreviewTimers.forEach((controller) => {
    if (group !== "all" && controller.group !== group) {
      return;
    }
    controller.cancelled = true;
    if (controller.timer) {
      window.clearTimeout(controller.timer);
    }
  });
  state.ledPreviewTimers = state.ledPreviewTimers.filter((controller) => !controller.cancelled);
}

function buildPreviewFrames(animation, fallbackColor, speedMultiplier = 1) {
  const active = new Map();
  const frames = [];

  (animation.events || []).forEach((event) => {
    if (event.type === "on" && isNumericCoord(event.x) && isNumericCoord(event.y)) {
      active.set(
        `${Number(event.x)}:${Number(event.y)}`,
        eventToCssColor(event, fallbackColor)
      );
    } else if (event.type === "off" && isNumericCoord(event.x) && isNumericCoord(event.y)) {
      active.delete(`${Number(event.x)}:${Number(event.y)}`);
    } else if (event.type === "delay") {
      frames.push({
        active: new Map(active),
        duration: Math.max(1, Math.round((Number(event.ms) || 90) * speedMultiplier)),
      });
    }
  });

  if (!frames.length) {
    frames.push({ active: new Map(active), duration: 240 });
  }

  return frames;
}

function applyPreviewFrame(cells, frame) {
  cells.forEach((cell) => {
    cell.style.background = "rgba(255,255,255,0.05)";
    cell.style.boxShadow = "none";
  });
  frame.active.forEach((color, key) => {
    const cell = cells.get(key);
    if (!cell) return;
    cell.style.background = color;
    cell.style.boxShadow = `0 0 14px ${color}`;
  });
}

function isNumericCoord(value) {
  return Number.isFinite(Number(value));
}

function eventToCssColor(event, fallbackColor = "#55D6C2") {
  if (event.mode === "hex" && event.color) {
    return normalizeColor(`#${event.color}`);
  }
  if (event.mode === "auto") {
    return velocityToCssColor(event.velocity, fallbackColor);
  }
  return normalizeColor(fallbackColor);
}

function velocityToCssColor(velocity, fallbackColor = "#55D6C2") {
  const index = Number(velocity);
  if (!Number.isFinite(index) || index < 0 || index >= LAUNCHPAD_ARGB.length) {
    return normalizeColor(fallbackColor);
  }
  return argbToCssColor(LAUNCHPAD_ARGB[index]);
}

function velocityToHexColor(velocity, fallbackColor = "#55D6C2") {
  const index = Number(velocity);
  if (!Number.isFinite(index) || index < 0 || index >= LAUNCHPAD_ARGB.length) {
    return normalizeColor(fallbackColor);
  }
  return argbToHexColor(LAUNCHPAD_ARGB[index]);
}

function argbToCssColor(argbValue) {
  const normalized = Number(argbValue) >>> 0;
  const alpha = ((normalized >> 24) & 255) / 255;
  const red = (normalized >> 16) & 255;
  const green = (normalized >> 8) & 255;
  const blue = normalized & 255;
  if (alpha >= 0.999) {
    return `rgb(${red}, ${green}, ${blue})`;
  }
  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
}

function argbToHexColor(argbValue) {
  const normalized = Number(argbValue) >>> 0;
  const red = (normalized >> 16) & 255;
  const green = (normalized >> 8) & 255;
  const blue = normalized & 255;
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function buildOriginalColorDescription(animation) {
  const onEvents = (animation.events || []).filter((event) => event.type === "on");
  if (!onEvents.length) {
    return "Preview do arquivo atual sem LEDs ligados detectados.";
  }

  const sample = onEvents.slice(0, 4).map((event) => {
    if (event.mode === "hex" && event.color) {
      return normalizeColor(`#${event.color}`);
    }
    if (event.mode === "auto") {
      return `velocity ${event.velocity} -> ${velocityToCssColor(event.velocity)}`;
    }
    return null;
  }).filter(Boolean);

  if (!sample.length) {
    return "Preview do arquivo atual com as cores originais do projeto.";
  }

  return `Preview do arquivo atual com as cores originais: ${sample.join(" | ")}`;
}

function createEmptyState(message) {
  return el("div", { className: "empty-state", textContent: message });
}

function createProjectStartPanel() {
  const actions = [
    createMiniButton("Escolher pasta", async () => {
      await chooseFolderInto(refs.projectPath);
    }),
    createMiniButton("Criar projeto em branco", async () => {
      await createProject();
    }),
    createMiniButton("Carregar projeto existente", async () => {
      const picked = await chooseFolderInto(refs.projectPath);
      if (picked) {
        await loadProject();
      }
    }),
  ];

  if (state.authUser && hasSupabaseConfig()) {
    actions.unshift(
      createMiniButton("Criar online", async () => {
        await createCloudProjectFromUi();
      })
    );
  }

  return el(
    "div",
    { className: "editor-focus stack" },
    createFocusHeader("Comece do zero", "Crie um projeto em branco e monte tudo do seu jeito."),
    el("span", {
      className: "muted",
      textContent: "Basta escolher a pasta onde o pack sera salvo. O editor cria a estrutura base automaticamente.",
    }),
    el("div", { className: "compact-actions" }, ...actions)
  );
}

function buildAudioLibraryWorkspaceNodes(options = {}) {
  const title = options.title || "Biblioteca de audio";
  const subtitle = options.subtitle || "Cortes salvos para reaproveitar em qualquer pad.";
  const pad = options.pad ?? getSelectedPad();
  if (!state.project) {
    return [
      createFocusHeader(title, "Carregue um projeto para reutilizar cortes."),
      createEmptyState("Nenhum projeto carregado."),
    ];
  }

  const targetText = pad
    ? `Aplicando em Chain ${pad.chain} · Pad ${pad.x},${pad.y} · slot ${state.selectedSoundIndex + 1}.`
    : "Selecione um pad para aplicar um corte salvo.";
  const items = state.audioLibrary.length
    ? state.audioLibrary.map((entry) => createAudioLibraryCard(entry, pad))
    : [createEmptyState("Nenhum corte salvo ainda. Quando voce criar um corte, ele aparece aqui para reutilizar.")];

  return [
    createFocusHeader(title, subtitle),
    el(
      "div",
      { className: "audio-library-meta" },
      el("span", { className: "pill", textContent: `${state.audioLibrary.length} corte(s)` }),
      el("span", { className: "muted", textContent: targetText })
    ),
    el("div", { className: "audio-library-list" }, ...items),
  ];
}

function renderAudioClipSubview() {
  const isLibrary = state.audioClipSubview === "library";
  const audioTargetPad = getPadByKey(state.audioClipEditor.padKey) || getSelectedPad();
  refs.clipViewPreviewTab?.classList.toggle("is-active", !isLibrary);
  refs.clipViewLibraryTab?.classList.toggle("is-active", isLibrary);
  if (refs.clipEditorPreviewView) {
    refs.clipEditorPreviewView.hidden = isLibrary;
    refs.clipEditorPreviewView.style.display = isLibrary ? "none" : "";
  }
  if (refs.clipLibraryView) {
    refs.clipLibraryView.hidden = !isLibrary;
    refs.clipLibraryView.style.display = isLibrary ? "" : "none";
    if (isLibrary) {
      refs.clipLibraryView.replaceChildren(
        el(
          "div",
          { className: "editor-focus stack" },
          ...buildAudioLibraryWorkspaceNodes({
            title: "Biblioteca de audio",
            subtitle: "Alterne rapido entre o preview do corte e os audios salvos.",
            pad: audioTargetPad,
          })
        )
      );
    } else {
      refs.clipLibraryView.replaceChildren();
    }
  }
}

function moveItem(list, index, direction) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= list.length) return;
  [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
}

function clampIndex(index, length) {
  if (length <= 0) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

function clampChain(value, maxChain) {
  return Math.min(Math.max(value || 1, 1), maxChain || 1);
}

function parseIntSafe(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function suggestClipFileName(pad) {
  return ensureWavFileName(getNextSequentialSoundBaseName());
}

function buildUniqueProjectSoundPath(fileName) {
  const desired = ensureWavFileName(fileName || suggestClipFileName());
  const existing = new Set((state.project?.sounds || []).map((entry) => String(entry.path || "").trim().toLowerCase()));
  if (!existing.has(desired.toLowerCase())) {
    return desired;
  }

  const extensionMatch = desired.match(/(\.[^.]+)$/);
  const extension = extensionMatch ? extensionMatch[1] : ".wav";
  const baseName = desired.slice(0, -extension.length);
  let counter = 1;
  while (true) {
    const candidate = `${baseName}_${String(counter).padStart(2, "0")}${extension}`;
    if (!existing.has(candidate.toLowerCase())) {
      return candidate;
    }
    counter += 1;
  }
}

function getNextSequentialSoundBaseName() {
  const names = [
    ...(state.project?.sounds || []).map((sound) => sound.path || sound.name || ""),
    ...state.audioLibrary.map((entry) => entry.soundFile || ""),
  ];
  let maxValue = 0;
  let width = 2;

  names.forEach((path) => {
    const fileName = String(path || "").split("/").pop() || "";
    const match = fileName.match(/^(\d+)\.wav$/i);
    if (!match) return;
    const numericValue = Number.parseInt(match[1], 10);
    if (Number.isNaN(numericValue)) return;
    maxValue = Math.max(maxValue, numericValue);
    width = Math.max(width, match[1].length);
  });

  return String(maxValue + 1).padStart(width, "0");
}

function audioLibraryStorageKey(projectPath) {
  return `${AUDIO_LIBRARY_KEY}:${projectPath || "default"}`;
}

function loadAudioLibrary(projectPath) {
  try {
    const raw = window.localStorage.getItem(audioLibraryStorageKey(projectPath));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeAudioLibraryEntry).filter(Boolean);
  } catch (error) {
    return [];
  }
}

function persistAudioLibrary() {
  if (!state.project?.projectPath) return;
  try {
    window.localStorage.setItem(audioLibraryStorageKey(state.project.projectPath), JSON.stringify(state.audioLibrary));
  } catch (error) {
    setStatus("Nao foi possivel salvar a biblioteca de audio.", "error");
  }
}

function normalizeAudioLibraryEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const soundFile = String(entry.soundFile || "").trim();
  if (!soundFile) return null;
  return {
    id: String(entry.id || createLibraryEntryId()),
    name: String(entry.name || fileStem(soundFile)),
    soundFile,
    bucket: String(entry.bucket || ""),
    storagePath: String(entry.storagePath || ""),
    mimeType: String(entry.mimeType || ""),
    size: Number(entry.size) || 0,
  };
}

function saveSoundToLibrary(soundFile, options = {}) {
  if (!state.project?.projectPath || !soundFile) return;
  const normalized = normalizeAudioLibraryEntry({
    id: createLibraryEntryId(),
    name: options.name || fileStem(soundFile),
    soundFile,
    bucket: options.bucket,
    storagePath: options.storagePath,
    mimeType: options.mimeType,
    size: options.size,
  });
  if (!normalized) return;

  state.audioLibrary = [normalized, ...state.audioLibrary.filter((entry) => entry.soundFile !== normalized.soundFile)];
  persistAudioLibrary();
  renderAudioLibraryPanel();
  renderAudioClipEditorPanel();
  setStatus(`Audio "${normalized.name}" salvo na biblioteca.`, "success");
}

function deleteSoundFromLibrary(entryId) {
  state.audioLibrary = state.audioLibrary.filter((entry) => entry.id !== entryId);
  persistAudioLibrary();
  renderAudioLibraryPanel();
  renderAudioClipEditorPanel();
  setStatus("Audio removido da biblioteca.", "success");
}

async function applyLibrarySoundToPad(entry, pad) {
  if (!pad.sounds.length) {
    pad.sounds.push({ soundFile: "", loop: 1, wormhole: null });
    state.selectedSoundIndex = 0;
  }
  const index = clampIndex(state.selectedSoundIndex, pad.sounds.length);
  pad.sounds[index].soundFile = entry.soundFile;
  upsertProjectSoundEntry({
    path: entry.soundFile,
    name: entry.name,
    size: entry.size,
    bucket: entry.bucket,
    storagePath: entry.storagePath,
    mimeType: entry.mimeType,
  });
  renderSoundEditor(pad);
  renderGrid();
  renderStats();
  previewSound(entry.soundFile);
  renderAudioClipEditorPanel();
  try {
    await saveProject({ quiet: true, rethrow: true });
    setStatus(`Audio "${entry.name}" aplicado ao pad.`, "success");
  } catch (error) {
    setStatus(error.message || "Falha ao aplicar o audio ao pad.", "error");
  }
}

function syncAudioLibraryFromProject(project = state.project) {
  if (!project) {
    state.audioLibrary = [];
    return;
  }
  const storedEntries = loadAudioLibrary(project.projectPath);
  if (!isCloudProject(project)) {
    state.audioLibrary = storedEntries;
    return;
  }

  const projectEntries = (project.sounds || [])
    .map((entry) =>
      normalizeAudioLibraryEntry({
        id: String(entry.storagePath || entry.path || createLibraryEntryId()),
        name: entry.name || fileStem(entry.path),
        soundFile: entry.path,
        bucket: entry.bucket,
        storagePath: entry.storagePath,
        mimeType: entry.mimeType,
        size: entry.size,
      })
    )
    .filter(Boolean);

  const merged = [...projectEntries];
  storedEntries.forEach((entry) => {
    if (merged.some((item) => item.soundFile === entry.soundFile)) return;
    merged.push(entry);
  });
  state.audioLibrary = merged;
}

function fileStem(path) {
  return String(path || "").split("/").pop()?.replace(/\.[^.]+$/, "") || "audio";
}

function fileExtension(path) {
  const match = String(path || "").split("/").pop()?.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : "";
}

function loadLedLibrary() {
  try {
    const raw = window.localStorage.getItem(LED_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeLedLibraryEntry).filter(Boolean);
  } catch (error) {
    return [];
  }
}

function persistLedLibrary() {
  try {
    window.localStorage.setItem(LED_LIBRARY_KEY, JSON.stringify(state.localLedLibrary));
  } catch (error) {
    setStatus("Nao foi possivel salvar a biblioteca local de animacoes.", "error");
  }
}

function normalizeLedLibraryEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    id: String(entry.id || createLibraryEntryId()),
    name: String(entry.name || "Animacao salva"),
    presetName: entry.presetName || "custom",
    previewColor: normalizeColor(entry.previewColor || inferAnimationColor(entry)),
    presetSpeed: clampAnimationSpeed(parseIntSafe(entry.presetSpeed, inferAnimationSpeed(entry))),
    loop: parseIntSafe(entry.loop, 1) || 1,
    suffix: entry.suffix || "",
    originX: parseIntSafe(entry.originX, 1) || 1,
    originY: parseIntSafe(entry.originY, 1) || 1,
    previewRatePercent: clampPreviewRatePercent(parseIntSafe(entry.previewRatePercent, 100)),
    source: entry.source === "remote" ? "remote" : "local",
    authorId: String(entry.authorId || ""),
    authorName: String(entry.authorName || ""),
    createdAt: String(entry.createdAt || ""),
    ratingAvg: Number(entry.ratingAvg ?? entry.rating ?? 0) || 0,
    downloadCount: parseIntSafe(entry.downloadCount ?? entry.downloads ?? 0, 0) || 0,
    isPublished: Boolean(entry.isPublished || entry.source === "remote"),
    events: Array.isArray(entry.events) ? structuredClone(entry.events) : [],
  };
}

function saveAnimationToLibrary(animation, pad) {
  const suggestedName = buildLibraryAnimationName(animation, pad);
  const name = window.prompt("Nome da animacao para salvar na biblioteca:", suggestedName);
  if (!name || !name.trim()) return;

  const entry = normalizeLedLibraryEntry({
    id: createLibraryEntryId(),
    name: name.trim(),
    presetName: animation.presetName || "custom",
    previewColor: animation.previewColor || inferAnimationColor(animation),
    presetSpeed: animation.presetSpeed || inferAnimationSpeed(animation),
    loop: animation.loop ?? 1,
    suffix: animation.suffix || "",
    originX: pad.x,
    originY: pad.y,
    previewRatePercent: 100,
    source: "local",
    events: animation.events || [],
  });

  state.localLedLibrary.unshift(entry);
  syncLedLibraryState();
  persistLedLibrary();
  setStatus(`Animacao "${entry.name}" salva na biblioteca local.`, "success");
  renderLedEditor(pad);
}

async function deleteAnimationFromLibrary(entry, pad = null) {
  try {
    if (entry.source === "remote") {
      await deletePublishedAnimation(entry.id);
      await refreshRemoteLedLibrary({ quiet: true });
      setStatus("Animacao online removida da biblioteca.", "success");
    } else {
      state.localLedLibrary = state.localLedLibrary.filter((item) => item.id !== entry.id);
      syncLedLibraryState();
      persistLedLibrary();
      setStatus("Animacao removida da biblioteca local.", "success");
    }
    rerenderLedLibrarySurfaces(pad);
  } catch (error) {
    setStatus(error.message || "Falha ao remover a animacao da biblioteca.", "error");
  }
}

function createLibraryEntryId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `anim_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function buildLibraryAnimationName(animation, pad) {
  return `${labelForPreset(animation.presetName || "custom")} ${pad.x}x${pad.y}`.trim();
}

async function applyLibraryAnimationToPad(entry, pad) {
  const nextAnimation = buildAnimationFromLibraryEntry(entry);
  if (pad.ledAnimations.length) {
    const message = [
      `O pad ${pad.chain}:${pad.x}:${pad.y} ja possui ${pad.ledAnimations.length} animacao(oes).`,
      `Deseja substituir pela animacao "${entry.name || "selecionada"}"?`,
    ].join("\n");
    const confirmed = window.confirm(message);
    if (!confirmed) {
      setStatus("Substituicao cancelada.", "");
      return;
    }
    pad.ledAnimations = [nextAnimation];
    state.selectedLedIndex = 0;
  } else {
    pad.ledAnimations = [nextAnimation];
    state.selectedLedIndex = 0;
  }
  state.ledLibraryPickerOpen = false;
  renderSelectedPadEditor();
  renderGrid();
  renderStats();
  try {
    await saveProject({ quiet: true, rethrow: true });
    setStatus(`Animacao "${entry.name || "selecionada"}" aplicada ao pad e salva no projeto.`, "success");
  } catch (error) {
    setStatus(error.message || "Falha ao salvar a animacao no projeto.", "error");
  }
}

async function initializeSupabaseLedLibrary() {
  if (!hasSupabaseConfig()) {
    state.ledLibrarySyncError = "Supabase nao configurado.";
    syncLedLibraryState();
    renderLedLibraryPanel();
    return;
  }
  state.ledLibrarySyncError = "";
  state.ledLibrarySyncing = true;
  try {
    await hydrateSupabaseUser();
    await refreshRemoteLedLibrary({ quiet: true });
  } catch (error) {
    state.ledLibrarySyncError = error.message || "Falha ao carregar a biblioteca online.";
    renderLedLibraryPanel();
  } finally {
    state.ledLibrarySyncing = false;
  }
}

async function hydrateSupabaseUser() {
  try {
    const user = await getCurrentUser();
    state.authUser = user;
    state.supabaseUserId = String(user?.id || "");
    renderAuthPanel();
  } catch (error) {
    state.authUser = null;
    state.supabaseUserId = "";
    renderAuthPanel();
    throw error;
  }
}

async function refreshRemoteLedLibrary(options = {}) {
  if (!hasSupabaseConfig()) return [];
  const rows = await fetchPublicAnimations();
  state.remoteLedLibrary = rows.map(mapRemoteLedLibraryEntry).filter(Boolean);
  state.ledLibrarySyncError = "";
  syncLedLibraryState();
  rerenderLedLibrarySurfaces();
  if (!options.quiet) {
    setStatus("Biblioteca online atualizada.", "success");
  }
  return state.remoteLedLibrary;
}

function mapRemoteLedLibraryEntry(row) {
  return normalizeLedLibraryEntry({
    id: row.id,
    name: row.name,
    presetName: row.preset_name,
    previewColor: row.preview_color,
    presetSpeed: row.preset_speed,
    loop: row.loop,
    suffix: row.suffix,
    originX: row.origin_x,
    originY: row.origin_y,
    previewRatePercent: row.preview_rate_percent,
    authorId: row.author_id,
    authorName: row.author_name,
    createdAt: row.created_at,
    ratingAvg: row.rating_avg ?? row.rating ?? 0,
    downloadCount: row.download_count ?? row.downloads ?? 0,
    isPublished: row.is_public,
    source: "remote",
    events: row.events,
  });
}

function syncLedLibraryState() {
  state.ledLibrary = [...state.localLedLibrary, ...state.remoteLedLibrary];
}

function rerenderLedLibrarySurfaces(pad = null) {
  const selectedPad = pad || getSelectedPad();
  if (selectedPad) {
    renderLedEditor(selectedPad);
  } else {
    renderLedLibraryPanel();
  }
  renderLedLibraryPanel();
}

function updateLocalLibraryEntry(entry) {
  const index = state.localLedLibrary.findIndex((item) => item.id === entry.id);
  if (index === -1) return;
  state.localLedLibrary[index] = normalizeLedLibraryEntry(entry);
  syncLedLibraryState();
}

function saveRemoteAnimationToLocalLibrary(entry) {
  const cloned = normalizeLedLibraryEntry({
    ...entry,
    id: createLibraryEntryId(),
    source: "local",
    isPublished: false,
  });
  state.localLedLibrary = [cloned, ...state.localLedLibrary.filter((item) => item.name !== cloned.name || item.id !== cloned.id)];
  syncLedLibraryState();
  persistLedLibrary();
  setStatus(`Animacao "${cloned.name}" salva localmente.`, "success");
}

async function publishLibraryAnimationEntry(entry, pad) {
  if (!hasSupabaseConfig()) {
    setStatus("Preencha o Supabase para publicar animacoes online.", "error");
    return;
  }
  try {
    setStatus(`Publicando "${entry.name}" na biblioteca online...`);
    await publishAnimation(entry);
    await hydrateSupabaseUser();
    await refreshRemoteLedLibrary({ quiet: true });
    setStatus(`Animacao "${entry.name}" publicada online.`, "success");
    rerenderLedLibrarySurfaces(pad);
  } catch (error) {
    setStatus(error.message || "Falha ao publicar a animacao online.", "error");
  }
}

function createLedLibraryHeaderActions() {
  if (!hasSupabaseConfig()) return [];
  return [
    createMiniButton(state.ledLibrarySyncing ? "Sincronizando..." : "Atualizar online", () => {
      void refreshRemoteLedLibrary();
    }),
  ];
}

function createCompactLedLibraryHeaderActions(maxPage, pad) {
  const actions = [];
  const totalPages = Math.max(1, maxPage + 1);
  const currentPage = Math.min(totalPages, state.editorAnimationLibraryPage + 1);
  if (hasSupabaseConfig() && state.remoteLedLibrary.length) {
    actions.push(createMiniButton("Atualizar", () => {
      void refreshRemoteLedLibrary({ quiet: false });
    }));
  }
  actions.push(el("span", { className: "pill pill-compact", textContent: `${currentPage}/${totalPages}` }));
  actions.push(
    createMiniButton("←", () => {
      state.editorAnimationLibraryPage = Math.max(0, state.editorAnimationLibraryPage - 1);
      if (pad) {
        renderLedEditor(pad);
      } else {
        renderLedLibraryPanel();
      }
    }),
    createMiniButton("→", () => {
      state.editorAnimationLibraryPage = Math.min(maxPage, state.editorAnimationLibraryPage + 1);
      if (pad) {
        renderLedEditor(pad);
      } else {
        renderLedLibraryPanel();
      }
    })
  );
  return actions;
}

function getLedLibraryEmptyMessage() {
  if (state.ledLibrarySyncing) {
    return "Carregando biblioteca online...";
  }
  if (hasSupabaseConfig()) {
    return "Nenhuma animacao encontrada. Salve algo localmente ou publique novas animacoes online.";
  }
  return "Nenhuma animacao salva ainda. Salve uma animacao para reaproveitar aqui.";
}

function buildLedLibraryMetaText(entry, animation, previewRatePercent) {
  const parts = [
    formatLibraryOrigin(entry),
    `velocidade ${entry.presetSpeed || inferAnimationSpeed(animation)} ms`,
    `preview ${previewRatePercent}%`,
  ];
  if (entry.source === "remote" && entry.authorName) {
    parts.push(`por ${entry.authorName}`);
  }
  if (entry.source === "remote") {
    parts.push(`${formatRatingValue(entry.ratingAvg)} nota`);
    parts.push(`${entry.downloadCount || 0} downloads`);
  }
  return parts.join(" · ");
}

function buildCompactLedLibraryMetaText(entry, animation) {
  const parts = [
    entry.source === "remote" ? "Online" : "Local",
    `${entry.presetSpeed || inferAnimationSpeed(animation)} ms`,
  ];
  if (entry.source === "remote" && entry.authorName) {
    parts.push(entry.authorName);
  }
  return parts.join(" · ");
}

function getLedLibraryPanelEntries() {
  if (state.ledLibraryPanelSubview === "community") {
    return sortCommunityLedLibraryEntries(state.remoteLedLibrary);
  }
  return [...state.localLedLibrary];
}

function getLedLibraryPanelEmptyMessage() {
  if (state.ledLibraryPanelSubview === "community") {
    if (state.ledLibrarySyncing) {
      return "Carregando animacoes da comunidade...";
    }
    if (!hasSupabaseConfig()) {
      return "Configure o Supabase para ver as animacoes da comunidade.";
    }
    return "Nenhuma animacao da comunidade encontrada ainda.";
  }
  return "Nenhuma animacao local salva ainda.";
}

function createLedCommunityToolbar() {
  const sortField = createSelectField(
    "Ordenar por",
    state.ledCommunitySort,
    [
      ["rating_desc", "Melhor avaliadas"],
      ["downloads_desc", "Mais baixadas"],
      ["rating_asc", "Pior avaliadas"],
      ["downloads_asc", "Menos baixadas"],
      ["newest", "Mais recentes"],
    ],
    (value) => {
      state.ledCommunitySort = value;
      renderLedLibraryPanel();
    }
  );
  return el("div", { className: "led-library-toolbar" }, sortField);
}

function createLedLibraryPanelMeta(isCommunity, visibleCount) {
  return el(
    "div",
    { className: "audio-library-meta" },
    el("span", { className: "pill", textContent: isCommunity ? `${state.remoteLedLibrary.length} online` : `${state.localLedLibrary.length} local(is)` }),
    el("span", { className: "pill", textContent: `${visibleCount} exibida(s)` }),
    el(
      "span",
      { className: "muted", textContent: isCommunity ? "Escolha uma animacao da comunidade para aplicar ou salvar localmente." : "Suas animacoes locais ficam guardadas aqui para reutilizar." }
    )
  );
}

function sortCommunityLedLibraryEntries(entries) {
  const sorted = [...entries];
  sorted.sort((left, right) => {
    switch (state.ledCommunitySort) {
      case "downloads_desc":
        return (right.downloadCount || 0) - (left.downloadCount || 0);
      case "downloads_asc":
        return (left.downloadCount || 0) - (right.downloadCount || 0);
      case "rating_asc":
        return (left.ratingAvg || 0) - (right.ratingAvg || 0);
      case "newest":
        return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
      case "rating_desc":
      default:
        return (right.ratingAvg || 0) - (left.ratingAvg || 0);
    }
  });
  return sorted;
}

function formatRatingValue(value) {
  const numeric = Number(value) || 0;
  return numeric.toFixed(1);
}

function renderCloudProjectsPanel() {
  if (!refs.cloudProjectShell || !refs.cloudProjectStatus || !refs.cloudProjectList) return;

  const configured = hasSupabaseConfig();
  const signedIn = Boolean(state.authUser);
  const visible = configured && signedIn;
  refs.cloudProjectShell.hidden = !visible;
  refs.cloudProjectShell.style.display = visible ? "" : "none";
  if (!visible) {
    refs.cloudProjectList.replaceChildren();
    return;
  }

  const displayName = getAuthDisplayName(state.authUser);
  if (refs.cloudProjectTitle) {
    refs.cloudProjectTitle.textContent = `Meus projetos`;
  }
  if (refs.cloudProjectSubtitle) {
    refs.cloudProjectSubtitle.textContent = state.project
      ? `${displayName}, voce continua logado. Abra outro projeto ou siga editando o atual.`
      : `${displayName}, escolha um projeto para abrir ou crie um novo para comecar.`;
  }

  if (refs.cloudProjectName) {
    const currentName = refs.cloudProjectName.value.trim();
    if (!currentName || isCloudProject()) {
      refs.cloudProjectName.value = state.project?.projectName || state.project?.info?.title || "";
    }
  }

  if (refs.cloudProjectCreate) refs.cloudProjectCreate.disabled = !signedIn;
  if (refs.cloudProjectSave) refs.cloudProjectSave.disabled = !signedIn || !isCloudProject();
  if (refs.cloudProjectRefresh) refs.cloudProjectRefresh.disabled = !signedIn || state.cloudProjectsLoading;

  const statusMessage = state.cloudProjectsLoading
    ? "Carregando seus projetos online..."
    : state.cloudProjectsError
      ? state.cloudProjectsError
      : isCloudProject()
        ? `Projeto online atual: ${state.project.projectName || state.project.info.title || "Sem nome"}.`
        : "Crie um projeto online novo ou abra um que ja esta salvo na sua conta.";
  refs.cloudProjectStatus.textContent = statusMessage;
  refs.cloudProjectStatus.classList.remove("is-error", "is-success");
  if (state.cloudProjectsError) {
    refs.cloudProjectStatus.classList.add("is-error");
  } else if (signedIn && !state.cloudProjectsLoading) {
    refs.cloudProjectStatus.classList.add("is-success");
  }

  if (!state.cloudProjects.length) {
    refs.cloudProjectList.replaceChildren(
      createEmptyState("Nenhum projeto online ainda. Crie o primeiro usando o campo acima.")
    );
    return;
  }

  refs.cloudProjectList.replaceChildren(...state.cloudProjects.map((record) => createCloudProjectCard(record)));
}

function createCloudProjectCard(record) {
  const isCurrent = state.project?.projectId === record.id;
  const card = el("article", {
    className: `cloud-project-card${isCurrent ? " is-current" : ""}`,
  });
  card.append(
    el(
      "div",
      { className: "cloud-project-card-head" },
      el("strong", { textContent: record.name || "Projeto sem nome" }),
      isCurrent ? el("span", { className: "pill pill-compact", textContent: "Aberto" }) : null
    ),
    el(
      "div",
      { className: "cloud-project-card-meta" },
      el("span", { textContent: `Atualizado ${formatDateTime(record.updated_at || record.created_at)}` }),
      el("span", { textContent: `${countMappedPadsInCloudRecord(record)} pad(s) usado(s)` })
    ),
    el(
      "div",
      { className: "compact-actions" },
      createMiniButton(isCurrent ? "Reabrir" : "Abrir", () => {
        openCloudProjectRecord(record);
      }),
      createMiniButton("Excluir", async () => {
        await deleteCloudProjectFromUi(record.id);
      })
    )
  );
  return card;
}

async function refreshCloudProjects(options = {}) {
  if (!hasSupabaseConfig()) {
    state.cloudProjects = [];
    state.cloudProjectsError = "Supabase nao configurado.";
    renderCloudProjectsPanel();
    return [];
  }
  if (!state.authUser) {
    state.cloudProjects = [];
    state.cloudProjectsLoading = false;
    state.cloudProjectsError = "";
    renderCloudProjectsPanel();
    return [];
  }

  state.cloudProjectsLoading = true;
  state.cloudProjectsError = "";
  renderCloudProjectsPanel();

  try {
    state.cloudProjects = await fetchOwnProjects();
    state.cloudProjectsError = "";
    renderCloudProjectsPanel();
    if (options.restoreRemembered !== false) {
      maybeRestoreRememberedCloudProject();
    }
    if (!options.quiet) {
      setStatus("Projetos online atualizados.", "success");
    }
    return state.cloudProjects;
  } catch (error) {
    state.cloudProjects = [];
    state.cloudProjectsError = error.message || "Falha ao carregar projetos online.";
    renderCloudProjectsPanel();
    if (!options.quiet) {
      setStatus(state.cloudProjectsError, "error");
    }
    return [];
  } finally {
    state.cloudProjectsLoading = false;
    renderCloudProjectsPanel();
  }
}

async function createCloudProjectFromUi() {
  if (!hasSupabaseConfig()) {
    setStatus("Configure o Supabase antes de criar projetos online.", "error");
    return false;
  }
  if (!state.authUser) {
    setStatus("Entre com sua conta para criar um projeto online.", "error");
    return false;
  }

  const name = String(refs.cloudProjectName?.value || "").trim() || "Novo UniPack";
  const blankProject = buildBlankCloudProject(name);
  try {
    setStatus("Criando projeto online...");
    const record = await createCloudProjectRecord(name, buildCloudProjectData(blankProject));
    state.cloudProjects = [record, ...state.cloudProjects.filter((entry) => entry.id !== record.id)];
    openCloudProjectRecord(record);
    renderCloudProjectsPanel();
    setStatus(`Projeto online "${record.name}" criado com sucesso.`, "success");
    return true;
  } catch (error) {
    setStatus(error.message || "Falha ao criar o projeto online.", "error");
    return false;
  }
}

async function saveCurrentProjectOnline(options = {}) {
  if (!state.project) {
    const error = new Error("Nenhum projeto carregado para salvar.");
    if (!options.quiet) {
      setStatus(error.message, "error");
    }
    if (options.rethrow) throw error;
    return false;
  }
  if (!hasSupabaseConfig()) {
    const error = new Error("Supabase nao configurado para salvar projetos online.");
    if (!options.quiet) {
      setStatus(error.message, "error");
    }
    if (options.rethrow) throw error;
    return false;
  }
  if (!state.authUser) {
    const error = new Error("Entre com sua conta para salvar projetos online.");
    if (!options.quiet) {
      setStatus(error.message, "error");
    }
    if (options.rethrow) throw error;
    return false;
  }

  const desiredName = String(refs.cloudProjectName?.value || state.project.projectName || state.project.info.title || "")
    .trim() || "Novo UniPack";
  state.project.projectName = desiredName;
  if (!String(state.project.info?.title || "").trim()) {
    state.project.info.title = desiredName;
  }

  try {
    if (!options.quiet) {
      setStatus("Salvando projeto online...");
    }
    const payload = buildCloudProjectData(state.project);
    const record = state.project.projectId
      ? await updateCloudProjectRecord(state.project.projectId, desiredName, payload)
      : await createCloudProjectRecord(desiredName, payload);
    const normalizedProject = normalizeCloudProjectRecord(record);
    const preservedPadKey = state.selectedPadKey;
    const preservedSoundIndex = state.selectedSoundIndex;
    const preservedLedIndex = state.selectedLedIndex;
    state.project = normalizedProject;
    syncAudioLibraryFromProject(state.project);
    rememberProjectPath(state.project.projectPath);
    state.currentChain = clampChain(state.currentChain, getChainCount());
    state.selectedPadKey = preservedPadKey;
    if (state.selectedPadKey && !state.project.pads[state.selectedPadKey]) {
      state.selectedPadKey = null;
      pickInitialPad();
    }
    state.selectedSoundIndex = preservedSoundIndex;
    state.selectedLedIndex = preservedLedIndex;
    state.cloudProjects = [record, ...state.cloudProjects.filter((entry) => entry.id !== record.id)];
    renderAll();
    if (!options.quiet) {
      setStatus(`Projeto online "${desiredName}" salvo com sucesso.`, "success");
    }
    return true;
  } catch (error) {
    if (!options.quiet) {
      setStatus(error.message || "Falha ao salvar projeto online.", "error");
    }
    if (options.rethrow) throw error;
    return false;
  }
}

function openCloudProjectRecord(record) {
  state.project = normalizeCloudProjectRecord(record);
  syncAudioLibraryFromProject(state.project);
  state.audioLibraryPickerOpen = false;
  state.ledLibraryPickerOpen = false;
  refs.projectPath.value = "";
  rememberProjectPath(state.project.projectPath);
  resetAudioClipEditor();
  state.currentChain = clampChain(1, getChainCount());
  pickInitialPad();
  resetSelectedEditors();
  renderAll();
  setStatus(`Projeto online "${record.name}" carregado.`, "success");
}

async function deleteCloudProjectFromUi(projectId) {
  const record = state.cloudProjects.find((entry) => entry.id === projectId);
  if (!record) return;
  const confirmed = window.confirm(`Deseja excluir o projeto online "${record.name}"?`);
  if (!confirmed) return;

  try {
    await deleteCloudProjectRecord(projectId);
    state.cloudProjects = state.cloudProjects.filter((entry) => entry.id !== projectId);
    if (state.project?.projectId === projectId) {
      state.project = null;
      state.audioLibrary = [];
      refs.projectPath.value = "";
      clearRememberedProjectPath();
      resetAudioClipEditor();
      renderAll();
    } else {
      renderCloudProjectsPanel();
    }
    setStatus(`Projeto online "${record.name}" removido.`, "success");
  } catch (error) {
    setStatus(error.message || "Falha ao remover o projeto online.", "error");
  }
}

function buildBlankCloudProject(name) {
  const projectName = String(name || "").trim() || "Novo UniPack";
  return normalizeProject({
    storageMode: "cloud",
    projectId: "",
    projectPath: "",
    projectName,
    info: {
      title: projectName,
      producerName: "",
      buttonX: "8",
      buttonY: "8",
      chain: "8",
      squareButton: "true",
      landscape: "false",
      website: "",
    },
    infoExtra: [],
    pads: {},
    sounds: [],
    autoPlay: [],
  });
}

function buildCloudProjectData(project) {
  return {
    storageMode: "cloud",
    info: structuredClone(project.info || {}),
    infoExtra: structuredClone(project.infoExtra || []),
    pads: structuredClone(project.pads || {}),
    sounds: structuredClone(project.sounds || []),
    autoPlay: structuredClone(project.autoPlay || []),
  };
}

function normalizeCloudProjectRecord(record) {
  const normalized = normalizeProject(record?.project_data || {});
  normalized.storageMode = "cloud";
  normalized.projectId = String(record?.id || "");
  normalized.projectName = String(record?.name || normalized.info?.title || "Novo UniPack");
  normalized.projectPath = `cloud:${normalized.projectId}`;
  if (!String(normalized.info?.title || "").trim()) {
    normalized.info.title = normalized.projectName;
  }
  return normalized;
}

function maybeRestoreRememberedCloudProject() {
  const remembered = loadRememberedProjectPath();
  if (!remembered.startsWith("cloud:")) return;
  const projectId = remembered.slice("cloud:".length).trim();
  if (!projectId) return;
  if (state.project?.projectId === projectId) return;
  const rememberedRecord = state.cloudProjects.find((entry) => entry.id === projectId);
  if (rememberedRecord) {
    openCloudProjectRecord(rememberedRecord);
    return;
  }
  clearRememberedProjectPath();
}

function countMappedPadsInCloudRecord(record) {
  const pads = Object.values(record?.project_data?.pads || {});
  return pads.filter((pad) => (pad?.sounds?.length || 0) > 0 || (pad?.ledAnimations?.length || 0) > 0).length;
}

function isCloudProject(project = state.project) {
  return Boolean(project && (project.storageMode === "cloud" || String(project.projectPath || "").startsWith("cloud:")));
}

function formatDateTime(value) {
  if (!value) return "agora";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "agora";
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function initializeAuth() {
  if (!hasSupabaseConfig()) {
    renderAuthPanel("Preencha o Supabase para ativar login com email e senha.");
    renderCloudProjectsPanel();
    return;
  }
  try {
    const session = await getCurrentSession();
    state.authUser = session?.user || (await getCurrentUser());
    state.supabaseUserId = String(state.authUser?.id || "");
    renderAuthPanel();
    renderCloudProjectsPanel();
    if (state.authUser) {
      await refreshCloudProjects({ quiet: true });
    }
    onAuthStateChange((_event, sessionData) => {
      state.authUser = sessionData?.user || null;
      state.supabaseUserId = String(state.authUser?.id || "");
      renderAuthPanel();
      state.cloudProjectsError = "";
      if (!state.authUser) {
        state.cloudProjects = [];
        if (isCloudProject()) {
          state.project = null;
          state.audioLibrary = [];
          refs.projectPath.value = "";
          clearRememberedProjectPath();
          resetAudioClipEditor();
          renderAll();
        } else {
          renderCloudProjectsPanel();
        }
      } else {
        void refreshCloudProjects({ quiet: true });
      }
      renderLedLibraryPanel();
    });
  } catch (error) {
    state.authUser = null;
    state.supabaseUserId = "";
    renderAuthPanel(error.message || "Falha ao iniciar o login.");
    renderCloudProjectsPanel();
  }
}

function renderAuthPanel(message = "") {
  const hasUser = Boolean(state.authUser);
  renderSessionLayout();
  refs.authSigninTab?.classList.toggle("is-active", state.authMode === "signin");
  refs.authSignupTab?.classList.toggle("is-active", state.authMode === "signup");
  if (refs.authTabs) {
    refs.authTabs.hidden = hasUser;
    refs.authTabs.style.display = hasUser ? "none" : "";
  }
  if (refs.authGuestPanel) {
    refs.authGuestPanel.hidden = hasUser;
  }
  if (refs.authUserPanel) {
    refs.authUserPanel.hidden = !hasUser;
  }
  if (refs.authSubmit) {
    refs.authSubmit.textContent = state.authMode === "signup" ? "Criar conta" : "Entrar";
  }
  if (refs.authStatus) {
    refs.authStatus.textContent = message || (
      state.authMode === "signup"
        ? "Crie sua conta com email e senha. Voce vai receber um email para confirmar."
        : "Use email e senha para entrar no site."
    );
  }
  if (refs.authUserName) {
    refs.authUserName.textContent = hasUser ? getAuthDisplayName(state.authUser) : "Usuario";
  }
  if (refs.authUserEmail) {
    refs.authUserEmail.textContent = state.authUser?.email || "Sem sessao";
  }
  if (refs.authUserMeta) {
    refs.authUserMeta.textContent = hasUser
      ? getAuthUserMetaText(state.authUser)
      : "Entre para salvar seus projetos e publicar animacoes.";
  }
}

function getAuthDisplayName(user) {
  const rawName =
    String(user?.user_metadata?.name || user?.user_metadata?.full_name || user?.user_metadata?.display_name || "").trim();
  if (rawName) {
    return rawName;
  }
  const email = String(user?.email || "").trim();
  const localPart = email.split("@")[0] || "Usuario";
  const cleaned = localPart.replace(/[._-]+/g, " ").trim();
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Usuario";
}

function getAuthUserMetaText(user) {
  const isConfirmed = Boolean(user?.email_confirmed_at || user?.confirmed_at);
  if (!isConfirmed) {
    return "Conta criada. Confirme seu email para ativar totalmente o acesso.";
  }
  return "Email confirmado. Sua conta esta pronta para salvar projetos e publicar animacoes.";
}

async function handleAuthSubmit() {
  if (!hasSupabaseConfig()) {
    renderAuthPanel("Configure o Supabase antes de ativar o login.");
    return;
  }
  const email = String(refs.authEmail?.value || "").trim();
  const password = String(refs.authPassword?.value || "");
  if (!email || !password) {
    renderAuthPanel("Preencha email e senha.");
    return;
  }

  try {
    if (state.authMode === "signup") {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      await signUpWithEmail(email, password, redirectTo);
      refs.authPassword.value = "";
      renderAuthPanel("Conta criada. Verifique seu email e clique no link de confirmacao.");
      setStatus("Conta criada. Um email de confirmacao foi enviado.", "success");
      return;
    }

    await signInWithEmail(email, password);
    refs.authPassword.value = "";
    await hydrateSupabaseUser();
    renderAuthPanel("Login realizado com sucesso.");
    setStatus("Login realizado com sucesso.", "success");
  } catch (error) {
    renderAuthPanel(error.message || "Falha ao autenticar.");
    setStatus(error.message || "Falha ao autenticar.", "error");
  }
}

async function handleAuthSignOut() {
  try {
    await signOutCurrentUser();
    state.authUser = null;
    state.supabaseUserId = "";
    state.cloudProjects = [];
    state.cloudProjectsLoading = false;
    state.cloudProjectsError = "";
    if (isCloudProject()) {
      state.project = null;
      state.audioLibrary = [];
      refs.projectPath.value = "";
      clearRememberedProjectPath();
      resetAudioClipEditor();
      renderAll();
    }
    renderAuthPanel("Sessao encerrada.");
    renderCloudProjectsPanel();
    setStatus("Sessao encerrada.", "success");
  } catch (error) {
    renderAuthPanel(error.message || "Falha ao sair.");
    setStatus(error.message || "Falha ao sair.", "error");
  }
}

function loadRememberedProjectPath() {
  try {
    return String(window.localStorage.getItem(LAST_PROJECT_PATH_KEY) || "").trim();
  } catch (error) {
    return "";
  }
}

function rememberProjectPath(projectPath) {
  const normalizedPath = String(projectPath || "").trim();
  if (!normalizedPath) return;
  try {
    window.localStorage.setItem(LAST_PROJECT_PATH_KEY, normalizedPath);
  } catch (error) {
    // ignore localStorage persistence failures
  }
}

function clearRememberedProjectPath() {
  try {
    window.localStorage.removeItem(LAST_PROJECT_PATH_KEY);
  } catch (error) {
    // ignore localStorage cleanup failures
  }
}

function projectFolderName(projectPath) {
  return String(projectPath || "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop()
    ?.trim();
}

function scheduleAudioClipDraftPersist(_delay = 180) {
  cancelAudioClipDraftPersist();
}

function cancelAudioClipDraftPersist() {
  if (!state.audioClipEditor.draftPersistTimer) return;
  window.clearTimeout(state.audioClipEditor.draftPersistTimer);
  state.audioClipEditor.draftPersistTimer = 0;
}

async function persistCurrentAudioClipDraft() {
  return false;
}

async function clearAudioClipDraftRecord(projectPath) {
  try {
    return await deleteAudioClipDraftRecord(projectPath);
  } catch (error) {
    return false;
  }
}

function openAudioClipDraftDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      resolve(null);
      return;
    }
    const request = window.indexedDB.open(AUDIO_CLIP_DRAFT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(AUDIO_CLIP_DRAFT_STORE_NAME)) {
        database.createObjectStore(AUDIO_CLIP_DRAFT_STORE_NAME, { keyPath: "projectPath" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Nao foi possivel abrir o banco local de rascunhos."));
  });
}

async function saveAudioClipDraftRecord(record) {
  const database = await openAudioClipDraftDatabase();
  if (!database) return false;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(AUDIO_CLIP_DRAFT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(AUDIO_CLIP_DRAFT_STORE_NAME);
    store.put(record);
    transaction.oncomplete = () => {
      database.close();
      resolve(true);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Falha ao salvar o rascunho de audio."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error("Falha ao salvar o rascunho de audio."));
    };
  });
}

async function loadAudioClipDraftRecord(projectPath) {
  const normalizedPath = String(projectPath || "").trim();
  if (!normalizedPath) return null;
  const database = await openAudioClipDraftDatabase();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(AUDIO_CLIP_DRAFT_STORE_NAME, "readonly");
    const store = transaction.objectStore(AUDIO_CLIP_DRAFT_STORE_NAME);
    const request = store.get(normalizedPath);
    request.onsuccess = () => {
      const record = request.result;
      database.close();
      resolve(record || null);
    };
    request.onerror = () => {
      database.close();
      reject(request.error || new Error("Falha ao ler o rascunho de audio."));
    };
  });
}

async function deleteAudioClipDraftRecord(projectPath) {
  const normalizedPath = String(projectPath || "").trim();
  if (!normalizedPath) return false;
  const database = await openAudioClipDraftDatabase();
  if (!database) return false;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(AUDIO_CLIP_DRAFT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(AUDIO_CLIP_DRAFT_STORE_NAME);
    store.delete(normalizedPath);
    transaction.oncomplete = () => {
      database.close();
      resolve(true);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Falha ao limpar o rascunho de audio."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error("Falha ao limpar o rascunho de audio."));
    };
  });
}

function buildAnimationFromLibraryEntry(entry) {
  const normalizedEntry = normalizeLedLibraryEntry(entry);
  if (!normalizedEntry) {
    return {
      loop: 1,
      suffix: "",
      presetName: "custom",
      previewColor: "#55D6C2",
      presetSpeed: 90,
      events: [],
    };
  }

  return {
    loop: normalizedEntry.loop,
    suffix: normalizedEntry.suffix,
    presetName: normalizedEntry.presetName || "custom",
    previewColor: normalizedEntry.previewColor,
    presetSpeed: normalizedEntry.presetSpeed,
    events: structuredClone(normalizedEntry.events),
  };
}

function formatLibraryOrigin(entry) {
  return `${labelForPreset(entry.presetName || "custom")} · origem ${entry.originX}:${entry.originY}`;
}

function formatSeconds(value) {
  const numeric = Number(value || 0);
  return numeric < 1 ? numeric.toFixed(3) : numeric.toFixed(2);
}

function parseFloatSafe(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function ensureWavFileName(fileName) {
  const cleaned = String(fileName || "")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/[^a-z0-9_\-\.]+/gi, "_"))
    .join("/");
  const finalName = cleaned || "novo_clip";
  return /\.wav$/i.test(finalName) ? finalName : `${finalName}.wav`;
}

function encodeAudioBufferToWavBytes(audioBuffer) {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numberOfChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples * blockAlign);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples * blockAlign, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples * blockAlign, true);

  let offset = 44;
  for (let i = 0; i < samples; i += 1) {
    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      const sample = audioBuffer.getChannelData(channel)[i];
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

async function bytesToBase64(bytes) {
  const dataUrl = await blobToDataUrl(new Blob([bytes], { type: "application/octet-stream" }));
  return String(dataUrl).split(",", 2)[1] || "";
}

async function blobToBase64(blob) {
  const dataUrl = await blobToDataUrl(blob);
  return String(dataUrl).split(",", 2)[1] || "";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Falha ao converter o audio."));
    reader.readAsDataURL(blob);
  });
}

function sanitizeHex(value) {
  return String(value || "")
    .replace(/[^0-9a-f]/gi, "")
    .toUpperCase()
    .slice(0, 6);
}

function setStatus(message, tone = "") {
  refs.status.textContent = message;
  refs.status.classList.remove("is-error", "is-success");
  if (tone === "error") refs.status.classList.add("is-error");
  if (tone === "success") refs.status.classList.add("is-success");
}

function padKey(chain, x, y) {
  return `${chain}:${x}:${y}`;
}

function el(tagName, props = {}, ...children) {
  const element = document.createElement(tagName);
  Object.entries(props).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (key === "className") {
      element.className = value;
      return;
    }
    if (key === "textContent") {
      element.textContent = value;
      return;
    }
    element.setAttribute(key, value);
  });
  children.flat().filter(Boolean).forEach((child) => element.append(child));
  return element;
}
