/**
 * A Temporada do trimestre: os projetos centrais, lidos da nota do trimestre.
 *
 * Desde o replanejamento de 25/10/2026, `temporada` é uma LISTA (por exemplo, dois
 * projetos centrais). Os outros projetos são auxiliares e se ligam a
 * uma central pelo campo `projects` da própria nota do projeto (um auxiliar liga a uma
 * central; outro pode ligar às duas).
 * A nota de trimestre antiga, sem `temporada`, usa `departamentos_foco` (um trimestre pode
 * abrir com um departamento como Temporada).
 *
 * Módulo puro: quem lê o frontmatter é o chamador (o painel, a árvore do agora).
 */
import { linkName, listOf } from './decisionWeights';

/**
 * O que faz: os nomes das notas de um campo de links, sem vazios nem repetidos.
 * O texto com vários links (`"[[A]], [[B]]"`, como o multiselect grava) dá um nome por link.
 */
export function linkNames(value: unknown): string[] {
    const out: string[] = [];
    for (const item of listOf(value)) {
        const links = typeof item === 'string' ? [...item.matchAll(/\[\[[^\[\]]+\]\]/g)].map(m => m[0]) : [];
        for (const one of links.length > 1 ? links : [item]) {
            const name = linkName(one);
            if (name && !out.includes(name)) out.push(name);
        }
    }
    return out;
}

/**
 * O que faz: os nomes dos projetos centrais do trimestre.
 * Por quê: o painel, a árvore do agora (o peso `temporada`) e o canvas leem a mesma
 * Temporada; uma regra só evita que um leia a lista e outro o campo antigo.
 * Entra → sai: o frontmatter da nota do trimestre → nomes, na ordem da nota. A
 * `temporada` preenchida vale; vazia (`[]`, o modelo novo antes de ser preenchido) ou
 * ausente cai em `departamentos_foco`.
 * Erro e ataque: link com rótulo (`[[X|y]]`), caminho (`[[pasta/X.md]]`), Link do
 * Dataview e texto puro dão o mesmo nome; `null` e lixo dão `[]`.
 * Prova: tests/engine/temporada.test.ts.
 */
export function temporadaFrom(frontmatter: Record<string, unknown> | null | undefined): string[] {
    const fm = frontmatter && typeof frontmatter === 'object' ? frontmatter : {};
    const central = linkNames(fm.temporada);
    return central.length ? central : linkNames(fm.departamentos_foco);
}

/**
 * O que faz: a lista de foco do trimestre, uma só para todos os leitores: as centrais
 * (`temporadaFrom`) e, depois delas, o `projetos_foco` da nota, sem repetir. Sem
 * `projetos_foco`, a lista é a Temporada (e, sem ela, `departamentos_foco`).
 * Por quê: até 27/10 havia quatro regras para o foco do trimestre (o `quarter` do
 * projeto, `projetos_foco`, `foco_12_semanas` e a `temporada`), e um projeto
 * aparecia no 🌳 sem estar no foco (proposta de 27/10, 4.3). O 🧭 grava
 * `projetos_foco` = centrais + auxiliares confirmados; o 🌳, o painel, o Mission Control
 * e os canvas leem esta função. Desde o Passo 0 da Missão (0c, 27/10) a nota do trimestre
 * é a única dona do foco: o `quarter` e o `foco_12_semanas` do projeto se aposentaram.
 * Entra → sai: o frontmatter da nota do trimestre → nomes, centrais primeiro. Nota sem
 * nenhum dos três campos → `[]`: o trimestre ainda não tem foco (não há regra antiga).
 * Erro e ataque: os mesmos de `linkNames` (rótulo, caminho, Link do Dataview, texto);
 * `null` → `[]`.
 * Prova: tests/engine/trimestrePadrao.test.ts ("um foco só: focoDoTrimestre").
 */
export function focoDoTrimestre(frontmatter: Record<string, unknown> | null | undefined): string[] {
    const fm = frontmatter && typeof frontmatter === 'object' ? frontmatter : {};
    const out: string[] = [];
    const seen = new Set<string>();
    for (const name of [...temporadaFrom(fm), ...linkNames(fm.projetos_foco)]) {
        const key = name.normalize('NFC').toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    return out;
}
