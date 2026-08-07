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
  captacaoTemplateId: string;
  fupBotId: string;
  fupBotTriggerName: string;
  fupBotD1Id: string;
  fupBotD1TriggerName: string;
  bidBotId: string;
  bidBotTriggerName: string;
  bidBotD1Id: string;
  bidBotD1TriggerName: string;
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
  firestoreEnabled: boolean;
  carteiraGruposAtivos: string[];
  metabaseTarefasCardId?: number;
  metabaseTarefas30hCardId?: number;
  metabaseCarteiraCardId?: number;
  metabaseEnderecosCardId?: number;
  metabaseTarefaEnderecosCardId?: number;
  metabaseChapas15dCardId?: number;
  metabaseLeadsRegiaoCardId?: number;
  metabaseRegistroCardId: number;
  // Question separada, filtrada por alterações do dia (não a base inteira) —
  // pega bloqueio/desbloqueio no mesmo dia, sem esperar o próximo sync 2x/
  // semana do cadastro geral completo. Ver sincronizarBloqueiosHoje.
  metabaseBloqueiosHojeCardId: number;
  autoCancelFupEnabled: boolean;
  autoCancelFupMinutes: number;
  fupAutoDispatchBloqueioHoras: number;
  fupEsquecerConfirmacaoHoras: number;
  saacApiUrl?: string;
  saacApiKey?: string;
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
  umblerSettings: { bearerToken: "", fromPhone: "+55109997435351", organizationId: "Z6tcYuFXi6pOKFCf", templateId: "", cancelTemplateId: "aN0wfU8RFjQx8lKo", taskCancelTemplateId: "aJOP1sA_R8oNdffY", captacaoTemplateId: "amijY_1q6IzzA09Q", fupBotId: "", fupBotTriggerName: "", fupBotD1Id: "", fupBotD1TriggerName: "", bidBotId: "", bidBotTriggerName: "", bidBotD1Id: "", bidBotD1TriggerName: "", webhookPort: 9988 },
  operadorNome: "",
  umblerNoResponseMinutes: 30,
  fupElapsedAlertMinutes: 30,
  customMsgTemplates: [
    "Já chegou ao local da tarefa?",
    "Obrigado pela confirmação, qualquer problema me avise aqui",
  ],
  fupAgendarMinAntes: 0,
  firestoreEnabled: true,
  carteiraGruposAtivos: [],
  metabaseRegistroCardId: 1296,
  metabaseBloqueiosHojeCardId: 1558,
  autoCancelFupEnabled: false,
  autoCancelFupMinutes: 60,
  fupAutoDispatchBloqueioHoras: 4,
  fupEsquecerConfirmacaoHoras: 6,
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
      umblerSettings: (() => {
        const merged = { ...SETTING_DEFAULTS.umblerSettings, ...(parsed.umblerSettings ?? {}) };
        const d = SETTING_DEFAULTS.umblerSettings;
        // ID antigo do template de Captação (404 "channel mismatch" — sempre
        // errado, nunca funcionou). Como o campo já pode ter sido persistido
        // no localStorage por qualquer edição anterior em Integrações, só
        // trocar o valor em SETTING_DEFAULTS não basta (merge abaixo prioriza
        // o valor salvo) — corrige explicitamente esse valor legado uma vez.
        const ID_CAPTACAO_ANTIGO = "agd7fmoTaSCc75vA";
        const captacaoTemplateId = (!merged.captacaoTemplateId || merged.captacaoTemplateId === ID_CAPTACAO_ANTIGO)
          ? d.captacaoTemplateId
          : merged.captacaoTemplateId;
        return {
          ...merged,
          fromPhone: merged.fromPhone || d.fromPhone,
          organizationId: merged.organizationId || d.organizationId,
          cancelTemplateId: merged.cancelTemplateId || d.cancelTemplateId,
          taskCancelTemplateId: merged.taskCancelTemplateId || d.taskCancelTemplateId,
          captacaoTemplateId,
        };
      })(),
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
