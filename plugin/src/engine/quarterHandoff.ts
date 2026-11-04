/**
 * A passagem de um trimestre ao seguinte (proposta de 27/10/2026, 4.4): qual é o
 * trimestre anterior, onde está a revisão dele, que campos dela valem e o texto da
 * Herança que o 🧭 mostra antes de perguntar.
 *
 * A revisão trimestral guarda as respostas num lugar só, a nota dela
 * (`type: quarterly_review`, `quarter: AAAA-Qn`). A nota do trimestre recebe só
 * `status: closed`; o cartão do Mission Control e a Herança leem a revisão.
 *
 * Módulo puro: quem lê o vault é o chamador (o motor, o Mission Control).
 */
import { linkName } from './decisionWeights';
import { ehTrimestre, partesDoTrimestre } from './periodo';


/** Os campos que a revisão grava e o trimestre seguinte lê. */
export const REVIEW_FIELDS = ['licao', 'ajuste_minimo', 'palavra_resumo', 'rating'] as const;

/**
 * O que faz: o trimestre `delta` trimestres depois de `id` (`-1` = o anterior).
 * Entra → sai: `AAAA-Qn` e um inteiro → `AAAA-Qn`; id inválido → `null`.
 * Prova: tests/engine/trimestrePadrao.test.ts ("shiftQuarter").
 */
export function shiftQuarter(id: string, delta: number): string | null {
    const p = partesDoTrimestre(id);
    if (!p || !Number.isInteger(delta)) return null;
    const index = p.ano * 4 + p.trimestre - 1 + delta;
    return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
}

export interface ReviewCandidate {
    path: string;
    basename: string;
    frontmatter: Record<string, unknown> | null | undefined;
}

/**
 * O que faz: a nota de revisão do trimestre `quarter` entre as candidatas: a de
 * `type: quarterly_review` com `quarter` igual; sem ela, a chamada `<quarter> - Review`.
 * Duas que casam: a de `400 - MEMORY/400 - QUARTERLY` primeiro, depois o menor caminho
 * (o resultado não oscila).
 * Por quê: o cartão do trimestre e a Herança leem a mesma revisão.
 * Entra → sai: candidatas e `AAAA-Qn` → a candidata ou `null`.
 * Prova: tests/engine/trimestrePadrao.test.ts ("quarterReviewOf").
 */
export function quarterReviewOf(candidates: readonly ReviewCandidate[], quarter: string): ReviewCandidate | null {
    if (!ehTrimestre(quarter)) return null;
    const byType = (c: ReviewCandidate) => String(c.frontmatter?.type ?? '') === 'quarterly_review' && String(c.frontmatter?.quarter ?? '') === quarter;
    const byName = (c: ReviewCandidate) => c.basename === `${quarter} - Review`;
    const rank = (c: ReviewCandidate) => (c.path.startsWith('400 - MEMORY/400 - QUARTERLY/') ? 0 : 1);
    for (const test of [byType, byName]) {
        const hits = (candidates || []).filter(test).sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
        if (hits.length) return hits[0];
    }
    return null;
}

/**
 * O que faz: o frontmatter do trimestre com os campos da revisão por cima
 * (`REVIEW_FIELDS`): a revisão vale; sem ela (ou campo vazio nela), fica o que a nota
 * do trimestre tem (os trimestres fechados antes de 27/10 copiavam os campos).
 * Entra → sai: dois frontmatters → um novo objeto (a entrada não muda).
 * Prova: tests/engine/trimestrePadrao.test.ts ("withReviewFields").
 */
export function withReviewFields(
    quarterFm: Record<string, unknown> | null | undefined,
    reviewFm: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...(quarterFm && typeof quarterFm === 'object' ? quarterFm : {}) };
    for (const key of REVIEW_FIELDS) {
        const value = reviewFm?.[key];
        if (value === undefined || value === null || String(value).trim() === '') continue;
        out[key] = value;
    }
    return out;
}

const text = (value: unknown) => (value === undefined || value === null ? '' : String(value).trim());
const foldName = (name: string) => String(name ?? '').normalize('NFC').toLowerCase();

/**
 * O que faz: os projetos que o trimestre anterior passa ao seguinte: a lista de foco dele,
 * sem os que a revisão dele cortou (`projetos_cortes`) e só os que ainda estão ativos.
 * Por quê: a nota do trimestre é a dona do foco (Passo 0 da Missão, 0c, 27/10/2026); o
 * `quarter` do projeto se aposentou, e o corte fica registrado na revisão, não no projeto.
 * Entra → sai: os nomes da lista de foco, os nomes cortados e o teste de projeto ativo →
 * os nomes que ficam, na ordem da lista e sem repetir (a entrada não muda).
 * Erro e ataque: nome com alias ou caixa diferente casa pelo nome dobrado (`[[X|y]]` = X);
 * lista vazia → `[]`.
 * Prova: tests/engine/trimestrePadrao.test.ts ("herancaDoFoco").
 */
export function herancaDoFoco(input: {
    foco: readonly string[];
    cortes: readonly string[];
    ativo: (name: string) => boolean;
}): string[] {
    const cortados = new Set((input.cortes || []).map(name => foldName(linkName(name))));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of input.foco || []) {
        const name = linkName(raw);
        const key = foldName(name);
        if (!name || seen.has(key) || cortados.has(key) || !input.ativo(name)) continue;
        seen.add(key);
        out.push(name);
    }
    return out;
}

/**
 * O que faz: o texto da Herança que o 🧭 mostra antes da primeira pergunta: a lição,
 * o ajuste mínimo e a palavra da revisão do trimestre anterior, e os projetos do foco
 * dele que seguem (`herancaDoFoco`).
 * Por quê: "a revisão de um ciclo é a primeira tela do planejamento do seguinte"
 * (proposta de 27/10, 2.5). Ausência é dita em palavras, sem cobrança.
 * Entra → sai: o trimestre anterior, o frontmatter da revisão (ou `null`) e os nomes
 * dos projetos → linhas de texto.
 * Prova: tests/engine/trimestrePadrao.test.ts ("herancaText").
 */
export function herancaText(input: {
    anterior: string;
    review: Record<string, unknown> | null | undefined;
    reviewName?: string | null;
    carregando: readonly string[];
}): string {
    const lines: string[] = [];
    if (input.review) {
        const licao = text(input.review.licao);
        const ajuste = text(input.review.ajuste_minimo);
        const palavra = text(input.review.palavra_resumo);
        lines.push(`Da revisão do ${input.anterior}${input.reviewName ? ` ([[${input.reviewName}]])` : ''}:`);
        lines.push(`💡 Lição: ${licao || 'em branco'}`);
        lines.push(`👣 Ajuste mínimo: ${ajuste || 'em branco'}`);
        lines.push(`🔑 Palavra: ${palavra || 'em branco'}`);
    } else {
        lines.push(`O ${input.anterior} não tem revisão registrada: não há lição nem ajuste para trazer.`);
    }
    const nomes = [...new Set((input.carregando || []).map(name => linkName(name)).filter(Boolean))];
    lines.push(nomes.length
        ? `🚀 Do foco do ${input.anterior}, ainda ativos e sem corte na revisão: ${nomes.map(n => `[[${n}]]`).join(', ')}. Os que entrarem na Temporada ou nos auxiliares ficam no foco do trimestre novo.`
        : `🚀 Nenhum projeto ativo ficou do foco do ${input.anterior}.`);
    return lines.join('\n');
}

/** A pasta que a "🗂️ Memória deste trimestre" da nota lista (`quarter = this.quarter`). */
export const QUARTER_MEMORY_FOLDER = '400 - MEMORY/400 - QUARTERLY/';

/**
 * O que faz: o texto novo da nota do trimestre com o link da nota que um protocolo criou,
 * ou `null` quando não há o que escrever: o link já está no texto; a nota mora em
 * `400 - MEMORY/400 - QUARTERLY` (a consulta da Memória já a lista pelo `quarter`, que o
 * motor grava); ou a seção pedida (`quarterNoteSection` do protocolo; até 29/10 era o
 * `dailyNoteSection`, que servia à Day, à Week e ao trimestre) não existe na nota.
 * Por quê: o motor anexava no fim da nota a seção `### 🦁 Objetivos do Trimestre`, que o
 * modelo não tem (mapa de 27/10, achado 22). Seção que o modelo não tem não nasce.
 * Entra → sai: o texto da nota, o nome e o caminho da nota criada e a seção → texto ou `null`.
 * Prova: tests/engine/trimestrePadrao.test.ts ("quarterLogContent").
 */
export function quarterLogContent(input: { content: string; created: string; createdPath?: string | null; section?: string | null }): string | null {
    const content = String(input.content ?? '');
    const created = String(input.created ?? '').replace(/\.md$/, '');
    if (!created || content.includes(created)) return null;
    if (String(input.createdPath ?? '').startsWith(QUARTER_MEMORY_FOLDER)) return null;
    const section = String(input.section ?? '').trim();
    if (!section) return null;
    const lines = content.split('\n');
    const at = lines.findIndex(line => line.trim() === section);
    if (at < 0) return null;
    lines.splice(at + 1, 0, `- [[${created}]]`);
    return lines.join('\n');
}
