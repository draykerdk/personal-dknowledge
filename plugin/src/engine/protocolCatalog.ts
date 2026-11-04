/**
 * O catálogo de protocolos como o painel "Protocolos" do Mission Control o lê.
 *
 * O snapshot do Mission Control guarda aqui o que o registro de protocolos sabe (as
 * definições carregadas, o arquivo de cada uma, o que não carregou) e o uso das
 * ferramentas nas Days dos últimos 30 dias, contado pela mesma regra do 🧭
 * (`usoDatas`, `protocolRank.ts`). Quem lê o vault é o `MissionControl`; quem calcula as
 * contagens, a árvore dos routers e os avisos é `board/protocolModel.ts` e
 * `board/routerTreeModel.ts`.
 *
 * Módulo puro: sem Obsidian, sem DOM. Prova: tests/board/protocolModel.test.ts.
 */
import { usoDatas, type DayRead } from './protocolRank';
import type { DomainChoice } from './domainModel';
import { DIA } from './dia';

/** A janela mais longa do painel, em dias (hoje incluído). A de 14 é a do 🧭. */
export const USO_JANELA_LONGA = 30;

export interface ProtocolDefinitionEntry {
    id: string;
    /** O arquivo JSON no vault; `null` quando o registro não sabe (registro antigo). */
    path: string | null;
    /** A definição como o motor a carregou (passos comuns já expandidos). Só leitura. */
    def: any;
}

export interface ProtocolCatalogInput {
    today: string;
    defs: ProtocolDefinitionEntry[];
    /** Os arquivos que não viraram protocolo na carga (JSON inválido, id repetido). */
    failures: Array<{ path: string; error: string }>;
    /**
     * As datas de uso de cada protocolo nos últimos 30 dias (uma por uso). `null` quando
     * nenhuma Day da janela pôde ser lida: ausência de leitura, não zero.
     */
    usage: Record<string, string[]> | null;
    /** Quantas Days da janela foram lidas. */
    daysRead: number;
    /** A janela de 30 dias lida (`desde` e `ate`, `AAAA-MM-DD`). */
    window: { desde: string; ate: string };
    /** O modelo e os pontos do domínio `protocolos`, para ordenar as paradas como o 🧭. `null` sem modelo. */
    rank: { modelo: DomainChoice; tabela: Record<string, any>; niveis?: Record<string, string>; graus?: Record<string, number> } | null;
    /** Exceções declaradas de cobertura do 🧭 (id → motivo), as do juiz. */
    coverageExceptions: Record<string, string>;
    /** O primeiro menu (o papel `perguntar_a_situacao` da tabela vigente); ausente ou `null` = nenhum. */
    central?: string | null;
}

/**
 * O que faz: as datas de uso de cada protocolo nas Days dadas, pela regra do 🧭.
 * Por quê: o painel conta as ferramentas do mesmo jeito que o 🧭 as ordena; uma conta
 * paralela discordaria dele.
 * Entra → sai: definições, Days lidas e quem acha a definição de um id → { id: datas }.
 * Erro e ataque: definição sem id fica de fora; alias conta o uso do destino (`usoDatas`).
 * Prova: tests/board/protocolModel.test.ts ("uso pelas Days").
 */
export function usageByProtocol(defs: ProtocolDefinitionEntry[], days: DayRead[], resolveDef: (id: string) => any): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const entry of defs || []) {
        if (!entry?.id) continue;
        out[entry.id] = usoDatas(entry.def, days, resolveDef);
    }
    return out;
}

/** O que faz: `AAAA-MM-DD` menos `dias - 1` dias: o início de uma janela que termina em `hoje`. */
export function windowStart(hoje: string, dias: number): string {
    const base = new Date(`${hoje}T12:00:00Z`);
    if (!DIA.test(String(hoje)) || Number.isNaN(base.getTime())) return '';
    return new Date(base.getTime() - (Math.max(1, dias) - 1) * 86_400_000).toISOString().slice(0, 10);
}
