/**
 * As portas das ferramentas antigas que a Missão substitui (aposentadas em 02/11/2026, removidas do código
 * em 03/11/2026).
 *
 * Por quê: a regra de cada ferramenta antiga (Arquitetura e Roteiro do Sistema DFM, §6, item 1): ela sai
 * quando a Missão cobre o uso, com a porta trocada; e o código aposentado saiu em 03/11/2026, quando a
 * remoção já estava decidida. A porta é o comando: o id fica (um botão numa nota, um
 * atalho, o menu de um canvas que o chame continua valendo), e ela abre a Missão ou o painel, que abre na
 * página Missão. Cada uma repetiria um comando da Missão que já está na paleta ("DFM: Abrir a Missão",
 * "Mission Control: abrir painel"); por isso nenhuma aparece na paleta.
 *
 * Fase 2 (os canvas da semana e do trimestre, a Matriz e a Linha do Tempo, aposentados em 02/11/2026
 * por falta de uso): as portas desses abrem a Missão na escala
 * certa, a semana ou o trimestre, como o "Abrir a Missão nesta semana ou trimestre". Com a Week ou a
 * nota do trimestre aberta (o botão 🔄 da nota do trimestre roda com ela ativa), o período é o dela;
 * senão, o de hoje (`periodoDaPorta`).
 *
 * A coluna `antes` diz o que cada porta abria, com a linha do inventário
 * (305 - P&D/INVENTARIO_Aposentadoria_Sistema_Antigo_2026-11-02.md); esse código não existe mais.
 *
 * Prova: tests/ui/portasAposentadas.test.ts.
 */

import { currentQuarter, isoWeekOf, quarterOfWeek } from '../engine/calendario';
import { portaDoPeriodo, type PortaDoPeriodo } from '../missao/estadoTela';

/**
 * Para onde a porta leva: a aba da Missão, o painel (que abre na página Missão), ou a Missão na
 * semana ou no trimestre.
 */
export type DestinoDaPorta = 'missao' | 'painel' | 'semana' | 'trimestre';

/** Uma porta aposentada: o id de sempre, o nome com o lugar novo, o destino e o que ela abria. */
export interface PortaAposentada {
    id: string;
    /** O nome: aparece nas configurações de atalhos (a paleta não mostra a porta). */
    nome: string;
    destino: DestinoDaPorta;
    /** A ferramenta que a porta abria, com a linha do inventário. */
    antes: string;
}

/** As cinco portas do (a) do inventário de 02/11 (fase 1) e as oito da família da semana e do trimestre (fase 2). */
export const PORTAS_APOSENTADAS: readonly PortaAposentada[] = [
    {
        id: 'open-dfm-dashboard',
        nome: 'Abrir DFM Control Center (aposentado: abre a Missão)',
        destino: 'missao',
        antes: 'o DFM Control Center de seis abas (ui/views/dashboardView.ts; inventário 1.1)',
    },
    {
        id: 'dfm-update-dashboard',
        nome: 'Atualizar Dashboard de Projetos (aposentado: abre a Missão)',
        destino: 'missao',
        antes: 'a nota Dashboard Projetos gravada pelo engine/projectDashboard.ts (inventário 1.2)',
    },
    {
        id: 'open-mission-control',
        nome: 'Abrir DFM Mission Control, painéis antigos (aposentado: abre o painel)',
        destino: 'painel',
        antes: 'a vista antiga do Mission Control (ui/views/missionControlView.ts; inventário 2.1)',
    },
    {
        id: 'dfm-console-diagnostico',
        nome: 'Diagnóstico do Mission Control (aposentado: abre o painel)',
        destino: 'painel',
        antes: 'o relatório do que a vista antiga desenhou (missionControlView.gerarDiagnostico; inventário 2.2)',
    },
    {
        id: 'dfm-board-open',
        nome: 'Mission Control: abrir quadro (aposentado: abre o painel)',
        destino: 'painel',
        antes: 'o quadro em canvas Mission Control.canvas (board/boardLayout.ts, openBoard; inventário 3.1)',
    },
    {
        id: 'dfm-week-canvas-open-current',
        nome: 'Semana: abrir canvas da semana atual (aposentado: abre a semana na Missão)',
        destino: 'semana',
        antes: 'o canvas da semana, criado e sincronizado (temporal/weekCanvasManager.ts; inventário 4.1)',
    },
    {
        id: 'dfm-week-canvas-open-focus',
        nome: 'Semana: abrir canvas da semana em foco (aposentado: abre a semana na Missão)',
        destino: 'semana',
        antes: 'o canvas da semana em foco do trimestre (temporal/weekCanvasManager.ts; inventário 4.1)',
    },
    {
        id: 'dfm-week-canvas-sync',
        nome: 'Semana: sincronizar o canvas da semana ativo (aposentado: abre a semana na Missão)',
        destino: 'semana',
        antes: 'a sincronização do canvas da semana aberto (temporal/weekCanvasManager.ts; inventário 4.1)',
    },
    {
        id: 'dfm-week-focus-open',
        nome: 'Semana: abrir semana em foco, no canvas do trimestre (aposentado: abre a semana na Missão)',
        destino: 'semana',
        antes: 'a zona da semana em foco no canvas do trimestre (temporal/quarterCanvasManager.ts; inventário 4.2)',
    },
    {
        id: 'dfm-quarter-canvas-open',
        nome: 'Trimestre: abrir canvas do trimestre atual (aposentado: abre o trimestre na Missão)',
        destino: 'trimestre',
        antes: 'o canvas do trimestre, criado e sincronizado (temporal/quarterCanvasManager.ts; inventário 4.2)',
    },
    {
        id: 'dfm-sync-quarterly-canvas',
        nome: 'Sincronizar Canvas Trimestral (aposentado: abre o trimestre na Missão)',
        destino: 'trimestre',
        antes: 'o botão 🔄 da nota do trimestre, que criava e sincronizava o canvas dele (temporal/quarterCanvasManager.ts; inventário 4.2)',
    },
    {
        id: 'open-action-matrix',
        nome: 'Abrir Matriz DFM de Ação (aposentado: abre a semana na Missão)',
        destino: 'semana',
        antes: 'a vista TaskNotes/Views/matriz-dfm.base, urgência × impacto de todas as tarefas (inventário 4.9; a ordem pelo peso a substitui)',
    },
    {
        id: 'open-planning-timeline',
        nome: 'Abrir Linha do Tempo DFM (aposentado: abre o trimestre na Missão)',
        destino: 'trimestre',
        antes: 'a vista TaskNotes/Views/linha-do-tempo-dfm.base, as tarefas no tempo (inventário 4.9; as semanas do trimestre a substituem)',
    },
];

/**
 * O que faz: o período em que a porta da semana ou do trimestre abre a Missão: o da nota aberta,
 * quando é a Week ou a nota do trimestre (a Week aberta leva ao trimestre da quinta-feira dela, numa
 * porta do trimestre); senão, a semana ou o trimestre de hoje.
 * Por quê: o botão de uma nota (o 🔄 da nota do trimestre) roda com a nota ativa e pedia aquele
 * período; o atalho e o menu de outro lugar pedem o de agora.
 * Entra → sai: a escala, o nome da nota ativa (sem `.md`, ou nada) e o dia de hoje → a porta do período.
 * Erro e ataque: nota que não é de período, ou nenhuma, dá o período de hoje; a nota do trimestre numa
 * porta da semana dá a semana de hoje (o trimestre não diz qual semana).
 * Prova: tests/ui/portasAposentadas.test.ts ("o período da porta").
 */
export function periodoDaPorta(escala: 'semana' | 'trimestre', notaAtiva: string | null | undefined, hoje: string): PortaDoPeriodo {
    const daNota = portaDoPeriodo(notaAtiva);
    if (daNota?.escala === escala) return daNota;
    if (escala === 'trimestre') {
        const doTrimestre = daNota?.escala === 'semana' ? portaDoPeriodo(quarterOfWeek(daNota.foco)) : null;
        return doTrimestre ?? (portaDoPeriodo(currentQuarter(hoje)) as PortaDoPeriodo);
    }
    return portaDoPeriodo(isoWeekOf(hoje)) as PortaDoPeriodo;
}

/** O comando que o plugin registra para uma porta (a forma do `addCommand` do Obsidian). */
export interface ComandoDaPorta {
    id: string;
    name: string;
    checkCallback: (checking: boolean) => boolean;
}

/**
 * O que faz: o comando de uma porta aposentada: fora da paleta (o `checkCallback` responde
 * `false` quando a paleta pergunta), e, chamado pelo id (um botão, um atalho), abre o destino.
 * Por quê: o id fica pelos botões e atalhos, e a paleta não mostra duas portas para o mesmo lugar.
 * Entra → sai: a porta, os que abrem cada destino e o aviso → o comando.
 * Erro e ataque: o destino que falha ao abrir vira aviso com o motivo, nunca exceção solta.
 * Prova: tests/ui/portasAposentadas.test.ts.
 */
export function comandoDaPorta(
    porta: PortaAposentada,
    abrir: Readonly<Record<DestinoDaPorta, () => Promise<void>>>,
    avisar: (mensagem: string) => void,
): ComandoDaPorta {
    return {
        id: porta.id,
        name: porta.nome,
        checkCallback: (checking: boolean) => {
            if (checking) return false;
            void abrir[porta.destino]().catch((e: unknown) => avisar(`Não abriu: ${(e as Error)?.message ?? e}`));
            return true;
        },
    };
}
