/**
 * As notas candidatas de um passo `suggest_note`: as que o seletor oferece antes da busca e
 * da ordem, fora do modal.
 *
 * Por quê: o P11 da Missão (arquitetura de 27/10, §5.3, 2): o seletor de notas do modal
 * (`NoteSuggester`) e a gaveta do formulário filtram as candidatas pela mesma função. Antes a
 * filtragem morava no próprio modal (`getCandidateFiles`), presa a ele.
 *
 * Módulo puro: quem lê o frontmatter é quem chama.
 */

/** Um filtro de propriedade do passo (`criteria.property`, já com os marcadores resolvidos). */
export interface NotePropertyFilter {
    key: string;
    value?: any;
    negate?: boolean;
}

/** O que filtra as candidatas: o que o seletor recebe do passo. */
export interface FiltroDasCandidatas<F> {
    /** A árvore do agora: os caminhos que cabem agora (só eles entram). `null` = sem a árvore. */
    agora: { has(path: string): boolean } | null;
    /** Os hábitos da árvore do agora: entram no fim, fora da pasta e do filtro de propriedades. */
    habitoDoAgora: (file: F) => boolean;
    /** Sem as notas de arquivo (`/archive/`, `/arquivo/`, `archived: true`, `status: archived`). */
    excludeArchive: boolean;
    /** A pasta do passo (o prefixo do caminho); vazia = todas. */
    folderFilter: string;
    /** Qualquer nota (a pasta não filtra). */
    allowAnyNote: boolean;
    /** Os filtros de propriedade, todos juntos (E). */
    propertyFilter: NotePropertyFilter | NotePropertyFilter[] | null;
}

/** O que faz: a nota casa com um filtro de propriedade (valor ausente = só a chave; lista = qualquer um). */
function casaPropriedade(props: Record<string, any>, { key, value, negate }: NotePropertyFilter): boolean {
    let matches;
    if (value === undefined || value === null) {
        matches = props[key] !== undefined;
    } else if (Array.isArray(value)) {
        matches = Array.isArray(props[key])
            ? props[key].some((item: any) => value.includes(item))
            : value.includes(props[key]);
    } else if (Array.isArray(props[key])) {
        matches = props[key].includes(value);
    } else {
        matches = props[key] === value;
    }
    return negate ? !matches : matches;
}

/**
 * O que faz: as notas candidatas de um passo, na ordem em que chegaram: só as da árvore do
 * agora (quando há), sem as de arquivo, só as da pasta (salvo `allowAnyNote`) e só as que casam
 * com todos os filtros de propriedade; os hábitos da árvore do agora vêm no fim, sem os filtros
 * (a árvore já os filtrou).
 * Por quê: §5.3, 2, a mesma filtragem no modal e na gaveta; o hábito mora no tracker, fora da
 * pasta do passo (o 🔁 em treino, 2.29).
 * Entra → sai: as notas (com `path`), o filtro e a leitura do frontmatter de uma nota (`null`
 * ou `undefined` = sem frontmatter) → as candidatas (a lista de entrada não muda).
 * Erro e ataque: nota sem frontmatter não é de arquivo pelo campo e casa só com o filtro
 * `negate`; caminho com "Archive" no meio de um nome (`/archive/` exige a barra dos dois lados).
 * Prova: tests/engine/noteCandidates.test.ts, tests/ui/nowSuggester.test.ts e
 * tests/engine/protocolGolden.test.ts (as candidatas do seletor em 14 rodadas reais).
 */
export function notasCandidatas<F extends { path: string }>(
    files: readonly F[],
    filtro: FiltroDasCandidatas<F>,
    frontmatterOf: (file: F) => Record<string, any> | null | undefined,
): F[] {
    let out: F[] = [...files];
    // Árvore do agora: só o que cabe agora (o filtro já foi feito pelos pesos).
    if (filtro.agora) out = out.filter(file => filtro.agora!.has(file.path));
    const habits = filtro.agora ? out.filter(file => filtro.habitoDoAgora(file)) : [];
    if (habits.length) out = out.filter(file => !filtro.habitoDoAgora(file));
    if (filtro.excludeArchive) {
        out = out.filter(file => {
            const pathLower = file.path.toLowerCase();
            if (pathLower.includes("/archive/") ||
                pathLower.includes("/arquivo/") ||
                pathLower.startsWith("archive/") ||
                pathLower.startsWith("arquivo/")) {
                return false;
            }
            const fm = frontmatterOf(file);
            if (fm && (fm.archived === true || fm.status === "archived")) return false;
            return true;
        });
    }
    if (filtro.folderFilter && !filtro.allowAnyNote) {
        out = out.filter(file => file.path.startsWith(filtro.folderFilter));
    }
    if (filtro.propertyFilter) {
        const filters = Array.isArray(filtro.propertyFilter) ? filtro.propertyFilter : [filtro.propertyFilter];
        out = out.filter(file => {
            const props = frontmatterOf(file) || {};
            return filters.every(f => casaPropriedade(props, f));
        });
    }
    return habits.length ? [...out, ...habits] : out;
}
