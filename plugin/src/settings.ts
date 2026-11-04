export interface DFMOrganizerRule {
    tag: string;
    folder: string;
}

export interface DFMArvoreProgressaoSettings {
    autoReavaliar: boolean;
    autoCriarTarefas: boolean;
    notificarDesbloqueio: boolean;
}

export interface DFMPluginSettings {
    /**
     * Os dados da gamificação, arquivada em 29/10/2026: ninguém mais lê nem grava, e o campo
     * fica para o salvamento não os perder (`ARQUIVO_GAMIFICACAO.md`). O mesmo vale para o
     * `habitLedger`, o razão dos pontos dos hábitos manuais.
     */
    gamification: any;
    folderInbox: string;
    folderReview: string;
    folderCrise: string;
    folderCompra: string;
    folderProtocols: string;
    excludedFolders: string[];
    /**
     * As regras do organizador que a pessoa salvou (as de antes ficam lidas). As das áreas não moram
     * mais aqui: são derivadas de `definicoes.areas` (`regrasDoOrganizador`, `src/definicoes.ts`).
     */
    organizerRules: DFMOrganizerRule[];
    habitLedger: any;
    recentFiles: string[];
    maxRecentFiles: number;
    canvasFormatOnModify: boolean;
    canvasSyncOnModify: boolean;
    canvasNoteRelationsEnabled: boolean;
    canvasDeletePromptsEnabled: boolean;
    arvoreProgressao: DFMArvoreProgressaoSettings;
    /** Ressincroniza a zona "Execução" do canvas do projeto quando uma tarefa dele muda. */
    projectCanvasAutoSync: boolean;
    /** Layout do painel do Mission Control (páginas e cartões); `null` = padrão. */
    boardPanelLayout: unknown;
    /**
     * O bloco das definições do sistema, como está no salvamento (B1; o esquema em
     * `config-padrao/definicoes.padrao.json`). O leitor geral é `lerDefinicoes` (`src/definicoes.ts`), que dá
     * os padrões quando ele falta; a tabela dos papéis de protocolo é lida por `ProtocolManager.idDoPapel`.
     * Sem o campo (o salvamento de hoje), valem os de partida, e nada muda.
     */
    definicoes?: { protocolos_por_papel?: Record<string, string | null> } & Record<string, unknown>;
}

export const DEFAULT_SETTINGS: DFMPluginSettings = {
    projectCanvasAutoSync: true,
    boardPanelLayout: null,
    gamification: {},
    folderInbox: "300 - RUNTIME/001 - INBOX",
    // A pasta da revisão: a da revisão da semana. Código e configuração gravada concordam.
    folderReview: "400 - MEMORY/200 - WEEKLY",
    folderCrise: "400 - MEMORY/100 - DAILY/Protocolo Crise",
    folderCompra: "400 - MEMORY/400 - QUARTERLY/Compras",
    folderProtocols: "200 - FUNCTIONS/Protocolos",
    excludedFolders: ["000 - KERNEL", "200 - FUNCTIONS", "300 - RUNTIME"],
    organizerRules: [],
    habitLedger: {},
    recentFiles: [],
    maxRecentFiles: 30,
    canvasFormatOnModify: true,
    canvasSyncOnModify: true,
    canvasNoteRelationsEnabled: true,
    canvasDeletePromptsEnabled: true,
    arvoreProgressao: {
        autoReavaliar: true,
        autoCriarTarefas: true,
        notificarDesbloqueio: true
    }
};
