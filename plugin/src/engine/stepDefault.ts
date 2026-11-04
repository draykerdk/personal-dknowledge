/**
 * A resposta com que um passo abre (`defaultFrom`) e a lista que um passo grava
 * (`comoLista`), fora do Obsidian.
 *
 * Por quê: rodar o 🧭 de novo numa nota de trimestre que já existe serve para responder
 * só o que é novo (proposta de 27/10/2026, 5): cada campo abre com o que já está na nota,
 * e Enter mantém. O 🌳 abre o Bloco Sagrado com o da semana ou, sem ele, o padrão do
 * trimestre (4.2, passo 13).
 *
 * Módulo puro: quem lê o frontmatter é o motor.
 */
import { linkName } from './decisionWeights';

export type StepKind = 'text' | 'textarea' | 'multiselect' | 'multiselect_note' | string;

/**
 * Uma fonte de `defaultFrom`: o campo de uma nota, um valor fixo (`valor`) ou uma sugestão
 * declarada (`sugestao`: o nome de uma fonte da lista fechada de `sugestoesDoPasso.ts`, P12a).
 */
export interface DefaultSource {
    path?: string;
    field?: string;
    index?: number;
    valor?: string;
    sugestao?: string;
    origem?: string;
}

/** A sugestão declarada que o motor resolveu para o passo: o valor (na forma da resposta) e o porquê. */
export type ResolvedorDeSugestao = (nome: string) => { valor: string; porque: string } | null;

/** O que faz: a lista de fontes de um passo (`defaultFrom` objeto ou lista); lixo sai. */
export function defaultSourcesOf(step: any): DefaultSource[] {
    const raw = step?.defaultFrom;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return list.filter((item: any) => item && typeof item === 'object'
        && ((typeof item.field === 'string' && item.field) || typeof item.valor === 'string'
            || (typeof item.sugestao === 'string' && item.sugestao)));
}

/** O que faz: o passo declara alguma sugestão (`defaultFrom` com `sugestao`). */
export function declaraSugestao(step: any): boolean {
    return defaultSourcesOf(step).some(source => typeof source.sugestao === 'string' && source.sugestao);
}

const isEmpty = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
    || (Array.isArray(value) && value.length === 0);

/** O que faz: lista um valor (item solto, lista, lista do Dataview) sem vazios. */
function itemsOf(value: unknown): unknown[] {
    if (isEmpty(value)) return [];
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.filter(item => !isEmpty(item));
    if (typeof (value as any)?.[Symbol.iterator] === 'function') return Array.from(value as any).filter(item => !isEmpty(item));
    return [value];
}

/**
 * O que faz: o valor de um campo do frontmatter como a resposta que o passo mostraria:
 * texto como está; `index` pega um item da lista (os objetivos 1 a 3); `textarea`
 * une a lista por linha (as habilidades); `multiselect_note` dá `[[A]], [[B]]`, só com
 * as opções que o passo oferece; `multiselect` dá `A, B`, também só com as opções.
 * Por quê: o modal de seleção reabre marcado pelo texto "A, B" e devolve tudo o que
 * estava marcado; uma marca sem opção visível sairia gravada sem o operador ver.
 * Entra → sai: o valor, o tipo do passo, o índice e as opções (quando há) → texto, ou
 * `''` quando não há o que mostrar.
 * Erro e ataque: objeto que não é lista nem link → `''`; índice fora da lista → `''`.
 * Prova: tests/engine/trimestrePadrao.test.ts ("answerFromField").
 */
export function answerFromField(raw: unknown, kind: StepKind, options: { index?: number; choices?: readonly string[] | null } = {}): string {
    let value: unknown = raw;
    if (typeof options.index === 'number') {
        const items = Array.isArray(raw) ? raw : itemsOf(raw);
        value = items[options.index];
    }
    if (isEmpty(value)) return '';
    const choices = Array.isArray(options.choices) ? options.choices : null;
    if (kind === 'multiselect_note') {
        const links = itemsOf(value).flatMap(item => {
            const inner = typeof item === 'string' ? [...item.matchAll(/\[\[[^\[\]]+\]\]/g)].map(m => m[0]) : [];
            return inner.length > 1 ? inner : [item];
        }).map(item => linkName(item)).filter(Boolean).map(name => `[[${name}]]`);
        const kept = [...new Set(links)].filter(link => !choices || choices.includes(link));
        return kept.join(', ');
    }
    if (kind === 'multiselect') {
        const parts = itemsOf(value).flatMap(item => typeof item === 'string' ? item.split(',') : [String(item)])
            .map(part => part.trim()).filter(Boolean);
        const kept = [...new Set(parts)].filter(part => !choices || choices.includes(part));
        return kept.join(', ');
    }
    if (kind === 'suggest' || kind === 'select') {
        // A escolha só vale se é uma opção do passo (a mesma, sem prefixo).
        const texto = typeof value === 'object' ? '' : String(value).trim();
        return !choices || choices.includes(texto) ? texto : '';
    }
    if (kind === 'textarea') {
        return itemsOf(value).map(item => (typeof item === 'object' ? '' : String(item).trim())).filter(Boolean).join('\n');
    }
    if (Array.isArray(value)) return value.map(item => (typeof item === 'object' ? '' : String(item).trim())).filter(Boolean).join(' · ');
    return typeof value === 'object' ? '' : String(value).trim();
}

/**
 * O que faz: a primeira fonte de `defaultFrom` que dá uma resposta: o campo da nota
 * (`frontmatterOf(path)`, o caminho já renderizado), o `valor` fixo ou a sugestão declarada
 * (`sugestao`, pelo resolvedor do motor; o porquê é o da sugestão), na ordem da lista.
 * Entra → sai: as fontes, a leitura do frontmatter, o tipo do passo, as opções e o resolvedor
 * das sugestões (sem ele, a sugestão não vale) → `{ value, origem }` ou `null`.
 * Erro e ataque: a sugestão passa pelo mesmo `answerFromField` (só com as opções do passo).
 * Prova: tests/engine/trimestrePadrao.test.ts ("firstDefault") e tests/engine/sugestoesDoPasso.test.ts.
 */
export function firstDefault(
    sources: readonly DefaultSource[],
    frontmatterOf: (path: string) => Record<string, unknown> | null | undefined,
    kind: StepKind,
    choices?: readonly string[] | null,
    sugestaoDe?: ResolvedorDeSugestao | null,
): { value: string; origem: string } | null {
    for (const source of sources || []) {
        let value = '';
        let origem = String(source.origem || 'o que já está na nota');
        if (typeof source.field === 'string' && source.field && typeof source.path === 'string' && source.path) {
            const fm = frontmatterOf(source.path);
            if (!fm) continue;
            value = answerFromField(fm[source.field], kind, { index: source.index, choices });
        } else if (typeof source.valor === 'string') {
            value = answerFromField(source.valor, kind, { choices });
        } else if (typeof source.sugestao === 'string' && source.sugestao && sugestaoDe) {
            const sugestao = sugestaoDe(source.sugestao);
            if (!sugestao) continue;
            value = answerFromField(sugestao.valor, kind, { choices });
            origem = source.origem ? String(source.origem) : sugestao.porque;
        }
        if (value) return { value, origem };
    }
    return null;
}

/** De onde veio a resposta com que um passo abre: a anterior da rodada, o formulário, a nota, todas as opções, ou nada. */
export type FonteDaAbertura = 'anterior' | 'formulario' | 'defaultFrom' | 'todas' | '';

/** A resposta com que um passo abre, com o porquê (`origem`, em palavras) e a fonte. */
export interface Abertura { value: any; origem: string; kind: string; fonte: FonteDaAbertura }

/** O porquê da abertura que vem do formulário (`_valoresIniciais`). */
export const ORIGEM_DO_FORMULARIO = 'o que já estava no formulário';

/**
 * O que faz: as fontes de `defaultFrom` de um passo com o caminho pronto: o `path` dela, senão a
 * nota do protocolo (`defaultFromNote`), cada um pelos marcadores da rodada (`render`).
 * Entra → sai: o passo, a nota do protocolo e o renderizador → as fontes (caminho vazio = sem nota).
 * Prova: tests/engine/trimestrePadrao.test.ts ("abre com o que está na nota").
 */
export function fontesDaAbertura(step: any, defaultFromNote: unknown, render: (path: string) => string): DefaultSource[] {
    return defaultSourcesOf(step).map(source => {
        const path = typeof source.path === 'string' && source.path ? source.path : (typeof defaultFromNote === 'string' ? defaultFromNote : '');
        return { ...source, path: path ? render(path) : '' };
    });
}

/**
 * O que faz: a resposta com que o passo abre: a anterior desta rodada (Voltar), senão a do
 * formulário (`_valoresIniciais`, só com as opções que o passo oferece), senão a primeira
 * fonte de `defaultFrom` que tem valor (o campo da nota, o valor fixo ou a sugestão declarada,
 * pelo `sugestaoDe`), senão, num `multiselect_note` com `preselectAll: true`, todas as opções
 * marcadas.
 * Por quê: o 🧭 rodado de novo abre cada campo com o que já está na nota (proposta de 27/10,
 * 4.2 e 5); o "Abrir o protocolo completo" do Novo abre cada passo com o que estava no
 * formulário, e Enter mantém (arquitetura da Missão, §5.3, 5, e §5.6). Uma função só para o
 * laço do motor e para o formulário.
 * Entra → sai: o passo, a resposta anterior, o valor do formulário, as fontes (preguiçosas: só
 * lidas sem as duas primeiras), a leitura do frontmatter e as opções → a abertura.
 * Erro e ataque: nota ausente, campo vazio ou fonte malformada → a próxima fonte; o valor do
 * formulário vazio, ou só com marcas sem opção visível, não abre nada (`answerFromField`).
 * Prova: tests/engine/trimestrePadrao.test.ts e tests/engine/protocolForm.test.ts ("_valoresIniciais").
 */
export function aberturaDoPasso(
    step: any,
    previousValue: unknown,
    doFormulario: unknown,
    fontes: () => readonly DefaultSource[],
    frontmatterOf: (path: string) => Record<string, unknown> | null | undefined,
    options: readonly string[] | null,
    sugestaoDe?: ResolvedorDeSugestao | null,
): Abertura {
    const kind = step?.type;
    if (previousValue !== undefined && previousValue !== null) return { value: previousValue, origem: '', kind, fonte: 'anterior' };
    if (doFormulario !== undefined && doFormulario !== null) {
        const value = answerFromField(doFormulario, kind, { choices: options });
        if (value) return { value, origem: ORIGEM_DO_FORMULARIO, kind, fonte: 'formulario' };
    }
    const sources = fontes();
    const found = sources.length ? firstDefault(sources, frontmatterOf, kind, options, sugestaoDe) : null;
    if (found) return { value: found.value, origem: found.origem, kind, fonte: 'defaultFrom' };
    if (kind === 'multiselect_note' && step.preselectAll === true && Array.isArray(options) && options.length) {
        return { value: options.join(', '), origem: '', kind, fonte: 'todas' };
    }
    return { value: undefined, origem: '', kind, fonte: '' };
}

/**
 * O que faz: a resposta de um passo `comoLista` como lista: `multiselect` separa as
 * opções marcadas ("A, B" → ["A", "B"]); `textarea` e `text` separam por linha, sem
 * marcador de lista ("- ", "• ", "1. ") e sem linha vazia. "Nenhum" e vazio → `[]`.
 * Por quê: as habilidades e os 2 números do trimestre são listas no frontmatter; o
 * Norte lê `join(...)` e a Week lê os itens (proposta de 27/10, 4.5).
 * Prova: tests/engine/trimestrePadrao.test.ts ("listFromAnswer").
 */
export function listFromAnswer(raw: unknown, kind: StepKind): string[] {
    const value = raw === undefined || raw === null ? '' : String(raw);
    if (!value.trim() || value.trim() === 'Nenhum') return [];
    const parts = kind === 'multiselect'
        ? value.split(',')
        : value.split(/\r?\n/).map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''));
    const out: string[] = [];
    for (const part of parts.map(p => p.trim()).filter(Boolean)) if (!out.includes(part)) out.push(part);
    return out;
}

/**
 * O que faz: quantas escolhas uma resposta de seleção tem (links `[[…]]` no
 * `multiselect_note`; opções separadas por vírgula no `multiselect`).
 * Por quê: `maxSelect` (no máximo três centrais, no máximo dois números).
 * Prova: tests/engine/trimestrePadrao.test.ts ("selectionCount").
 */
export function selectionCount(raw: unknown, kind: StepKind): number {
    const value = raw === undefined || raw === null ? '' : String(raw);
    if (!value.trim() || value.trim() === 'Nenhum') return 0;
    if (kind === 'multiselect_note') return new Set([...value.matchAll(/\[\[[^\[\]]+\]\]/g)].map(m => m[0])).size;
    return listFromAnswer(value, 'multiselect').length;
}
