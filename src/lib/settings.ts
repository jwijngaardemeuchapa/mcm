export type PortariaRule = {
  id: string;
  empresa: string;
  horasAntes: number;
};

export type UmblerSettings = {
  bearerToken: string;
  fromPhone: string;
  organizationId: string;
  templateId: string;
  cancelTemplateId: string;
  taskCancelTemplateId: string;
  fupBotId: string;
  fupBotTriggerName: string;
  fupBotD1Id: string;
  fupBotD1TriggerName: string;
  bidBotId: string;
  bidBotTriggerName: string;
  webhookPort: number;
};

export type SonsSettings = {
  intro: boolean;        // áudio do vídeo de abertura
  alertas: boolean;      // bipe de chapa sem confirmação
  confirmacoes: boolean; // chime ao validar/concluir tarefa
  turno: boolean;        // som ao copiar troca de turno
};

export type AppSettings = {
  fillRateWarningThreshold: number;
  defaultDashboardView: "detailed" | "panorama" | "timeline";
  approachingAlertEnabled: boolean;
  soundAlertEnabled: boolean;
  sons: SonsSettings;
  portariaRules: PortariaRule[];
  priorityPanelEnabled: boolean;
  priorityPanelHideMonitorar: boolean;
  agendaSortBy: "prazo" | "importancia";
  umblerSettings: UmblerSettings;
  operadorNome: string;
  umblerNoResponseMinutes: number;
  fupElapsedAlertMinutes: number;
  customMsgTemplates: string[];
  fupAgendarMinAntes: number;
};

const STORAGE_KEY = "fup_settings";

export const SETTING_DEFAULTS: AppSettings = {
  fillRateWarningThreshold: 95,
  defaultDashboardView: "detailed",
  approachingAlertEnabled: true,
  soundAlertEnabled: false,
  sons: { intro: true, alertas: false, confirmacoes: true, turno: true },
  portariaRules: [],
  priorityPanelEnabled: true,
  priorityPanelHideMonitorar: false,
  agendaSortBy: "prazo",
  umblerSettings: { bearerToken: "", fromPhone: "", organizationId: "", templateId: "", cancelTemplateId: "", taskCancelTemplateId: "", fupBotId: "", fupBotTriggerName: "", fupBotD1Id: "", fupBotD1TriggerName: "", bidBotId: "", bidBotTriggerName: "", webhookPort: 9988 },
  operadorNome: "",
  umblerNoResponseMinutes: 30,
  fupElapsedAlertMinutes: 30,
  customMsgTemplates: [
    "Já chegou ao local da tarefa?",
    "Obrigado pela confirmação, qualquer problema me avise aqui",
  ],
  fupAgendarMinAntes: 0,
};

export function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...SETTING_DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      ...SETTING_DEFAULTS,
      ...parsed,
      sons: {
        ...SETTING_DEFAULTS.sons,
        ...(parsed.sons ?? {}),
      },
      umblerSettings: {
        ...SETTING_DEFAULTS.umblerSettings,
        ...(parsed.umblerSettings ?? {}),
      },
    };
  } catch {
    return { ...SETTING_DEFAULTS };
  }
}

export function writeSettings(patch: Partial<AppSettings>): AppSettings {
  const current = readSettings();
  const next = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
  return next;
}
