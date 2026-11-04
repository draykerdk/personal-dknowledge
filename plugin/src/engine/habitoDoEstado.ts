/**
 * O hábito que o trabalho marca pelo estado de uma nota (03/11/2026, o fluxo da ideia ao vídeo): o roteiro que
 * entra em gravado, editado, no ar ou revisado marca o 🎥 Gravar 1 conteúdo naquele dia.
 *
 * Por quê: o hábito de criar conteúdo é a base da divulgação, e o trabalho que já passou de estado não precisa ser
 * marcado de novo à mão. O estado que marca mora no modelo do tipo (o `habito` da linha da tabela de estados,
 * `Config/dominios/<tipo>.json`); a marca passa pelo caminho de sempre do motor (`HabitLog.recordDailyHabitEntry`,
 * um por dia), o mesmo do Pomodoro, do Comando do Dia e do 📖 Pelo diário. Marcar atrasado é o uso normal, e o dia
 * sem marca não é falta: aqui só se diz quando a passagem marca.
 *
 * Módulo puro: sem Obsidian. Prova: tests/engine/habitoDoEstado.test.ts.
 */
/** O que a regra lê de um modelo de tipo (`DomainModel`, sem importar o módulo dos modelos, que é da mesma camada). */
export interface ModeloComEstados {
    candidatos: { pasta: string; type?: string | null };
    estados: ReadonlyArray<{ valor: string; habito?: string }>;
    /** Os formatos do tipo (03/11, o ramo Criação): o formato com `habitos: false` não marca. */
    formatos?: { campo: string; valores: ReadonlyArray<{ valor: string; habitos?: boolean }> };
}

/** A regra de um tipo: onde as notas dele moram, o `type` e o hábito de cada valor do status que marca. */
export interface RegraDoHabito {
    type: string;
    pasta: string;
    /** Valor do `status` (aparado, sem maiúscula) → a nota do hábito. */
    habitos: Record<string, string>;
    /** O campo do formato e os formatos em que o hábito não marca (03/11: o artigo não grava vídeo); sem ela, todos marcam. */
    semHabito?: { campo: string; valores: string[] };
}

const chave = (v: unknown) => String(v ?? '').trim().toLowerCase();

/**
 * O que faz: as regras dos tipos cujos estados marcam um hábito.
 * Entra → sai: os modelos lidos → uma regra por modelo que tem algum estado com `habito`.
 * Erro e ataque: o modelo sem `type` ou sem casa, e o que nenhum estado declara hábito, ficam de fora.
 */
export function regrasDosHabitos(modelos: readonly ModeloComEstados[]): RegraDoHabito[] {
    const out: RegraDoHabito[] = [];
    for (const m of modelos) {
        const type = String(m?.candidatos?.type ?? '').trim();
        const pasta = String(m?.candidatos?.pasta ?? '').trim().replace(/\/+$/, '');
        if (!type || !pasta) continue;
        const habitos: Record<string, string> = {};
        for (const st of m.estados ?? []) if (st.habito) habitos[chave(st.valor)] = st.habito;
        const sem = (m.formatos?.valores ?? []).filter(f => f.habitos === false).map(f => chave(f.valor));
        if (Object.keys(habitos).length) out.push({ type, pasta, habitos, ...(m.formatos && sem.length ? { semHabito: { campo: m.formatos.campo, valores: sem } } : {}) });
    }
    return out;
}

/**
 * O que faz: a regra de uma nota pelo caminho e pelo `type` (a nota dentro da casa do modelo).
 * Erro e ataque: o caminho fora da casa, ou o `type` de outro, não tem regra (`null`).
 */
export function regraDaNota(regras: readonly RegraDoHabito[], caminho: string, type: unknown): RegraDoHabito | null {
    const t = String(type ?? '').trim();
    if (!t) return null;
    return regras.find(r => r.type === t && String(caminho ?? '').startsWith(`${r.pasta}/`)) ?? null;
}

/**
 * O que faz: diz se o hábito dos estados vale para a nota pelo formato dela: o formato que a regra tira (`semHabito`)
 * não marca; sem formato, ou sem a lista, marca como sempre.
 * Por quê: 03/11, o ramo Criação: o 🎥 Gravar 1 conteúdo é do vídeo; o artigo, o carrossel ou o e-mail no ar não o marcam.
 * Entra → sai: a regra e o frontmatter → marca ou não.
 * Erro e ataque: o formato com espaços ou maiúsculas casa igual; a lista de um item vale pelo item.
 */
export function habitoValeNoFormato(regra: RegraDoHabito | null, campos: Record<string, unknown> | null | undefined): boolean {
    if (!regra?.semHabito) return true;
    const cru = campos?.[regra.semHabito.campo];
    return !regra.semHabito.valores.includes(chave(Array.isArray(cru) ? cru[0] : cru));
}

/**
 * O que faz: o hábito que a passagem de um status a outro marca: o do status novo, quando ele declara um e o de
 * antes não declara o mesmo; senão, nenhum.
 * Por quê: entrar em gravado marca o dia; ir de gravado a editado, no ar ou revisado é o mesmo vídeo, e não marca
 * de novo. A nota nova (sem status de antes, `null`) que já nasce num estado que marca conta como entrada: o roteiro
 * registrado já gravado (a bancada de vídeo) marca o dia do registro.
 * Entra → sai: a regra do tipo, o status de antes (ou `null`) e o de agora → a nota do hábito, ou `null`.
 * Erro e ataque: status vazio ou desconhecido não marca; o mesmo status dos dois lados não marca; voltar de
 * gravado a roteiro não desmarca nada (a marca é do dia que aconteceu).
 */
export function habitoDaPassagem(regra: RegraDoHabito | null, antes: unknown, depois: unknown): string | null {
    if (!regra) return null;
    const novo = regra.habitos[chave(depois)];
    if (!novo) return null;
    const velho = antes === null || antes === undefined ? null : regra.habitos[chave(antes)] ?? null;
    return velho === novo ? null : novo;
}
