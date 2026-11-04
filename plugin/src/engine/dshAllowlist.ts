/**
 * Protocolos que o agente DSH pode conduzir.
 *
 * Mora num módulo-folha de propósito. Quando a lista vivia em
 * `dshOperatorCore.ts`, o agregador (`missionControl.ts`) precisava importá-la
 * de lá — e o core importa o agregador para projetar o snapshot. Isso fechava
 * um ciclo de importação de **valores**: `missionControl → dshOperatorCore →
 * missionControl`. Ciclo assim não quebra sempre; quebra conforme a ordem de
 * carga, e o sintoma é um símbolo `undefined` no meio de uma função que
 * "sempre funcionou".
 *
 * Já aconteceu uma vez nesta base com `missionControl ↔ missionPlan`. A lista
 * não depende de nada, então não há motivo para ela carregar esse risco: é dado
 * de configuração, e dado de configuração pertence a uma folha.
 *
 * A lista é de papéis (`papeisDeProtocolo.ts`, outra folha): nenhum id de protocolo mora aqui.
 * Os ids vêm da tabela vigente (`ProtocolManager.tabelaDosPapeis`, pelas definições lidas), então
 * o cofre que traz os protocolos dos papéis (o módulo do cofre) tem a mesma lista de sempre, e o
 * pacote aberto, só os do ciclo que existirem.
 */
import type { Papel, TabelaDosPapeis } from './papeisDeProtocolo';

/** Os papéis que o agente DSH pode conduzir. */
export const PAPEIS_DA_PONTE: readonly Papel[] = Object.freeze([
    'perguntar_a_situacao',
    'menu_operacional',
    'menu_dos_ciclos',
    'menu_da_captura',
    'abrir_dia',
    'planejar_dia',
    'planejar_semana',
    'fechar_dia',
    'revisar_semana',
    'revisar_trimestre',
    'micro_revisao',
    'desbloquear',
    'coragem',
    'vitoria',
    'sessao_de_foco',
    'criar_smart',
    'nova_tarefa_do_projeto',
] as const);

/**
 * O que faz: os ids de protocolo que o agente DSH pode conduzir: os dos papéis da ponte, pela tabela dada.
 * Por quê: a ponte confere o id que o agente pede contra esta lista; pelo papel, ela acompanha os
 * protocolos que o cofre tem, sem nenhum id escrito no código.
 * Entra → sai: a tabela vigente (ausente = nenhuma) → o conjunto dos ids (papel desligado não entra).
 * Erro e ataque: sem tabela, a lista é vazia (nada se abre pela ponte); o conjunto é novo a cada chamada.
 * Prova: tests/engine/papeisDeProtocolo.test.ts ("a lista da ponte do agente").
 */
export function protocolosDaPonte(tabela: TabelaDosPapeis | null | undefined): ReadonlySet<string> {
    const ids = new Set<string>();
    if (!tabela) return ids;
    for (const papel of PAPEIS_DA_PONTE) {
        const id = tabela[papel];
        if (id) ids.add(id);
    }
    return ids;
}
