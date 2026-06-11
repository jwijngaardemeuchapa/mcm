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
  bidTemplateId: string;
  bidBotId: string;
  bidBotTriggerName: string;
  webhookPort: number;
};

export type AppSettings = {
  fillRateWarningThreshold: number;
  defaultDashboardView: "detailed" | "panorama" | "timeline";
  approachingAlertEnabled: boolean;
  soundAlertEnabled: boolean;
  portariaRules: PortariaRule[];
  priorityPanelEnabled: boolean;
  priorityPanelHideMonitorar: boolean;
  agendaSortBy: "prazo" | "importancia";
  umblerSettings: UmblerSettings;
  operadorNome: string;
  umblerNoResponseMinutes: number;
  fupElapsedAlertMinutes: number;
};

const STORAGE_KEY = "fup_settings";

export const SETTING_DEFAULTS: AppSettings = {
  fillRateWarningThreshold: 95,
  defaultDashboardView: "detailed",
  approachingAlertEnabled: true,
  soundAlertEnabled: false,
  portariaRules: [],
  priorityPanelEnabled: true,
  priorityPanelHideMonitorar: false,
  agendaSortBy: "prazo",
  umblerSettings: { bearerToken: "", fromPhone: "", organizationId: "", templateId: "", cancelTemplateId: "", taskCancelTemplateId: "", bidTemplateId: "aH6pLxMKil-bY_UP", bidBotId: "", bidBotTriggerName: "", webhookPort: 9988 },
  operadorNome: "",
  umblerNoResponseMinutes: 30,
  fupElapsedAlertMinutes: 30,
};

export function readSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...SETTING_DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      ...SETTING_DEFAULTS,
      ...parsed,
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
