/**
 * As regras puras da triagem da Inbox: as pastas dos destinos, o filtro do que é captura,
 * as pastas mortas e o frontmatter do Side Quest. Saíram de `panelInbox.ts` (que as
 * reexporta) para a triagem da Missão usar sem o Obsidian (`missao/triagemWrites.ts`), e
 * em 02/11/2026 mudaram de `ui/mission/` para o motor (`fn.caixa`): a triagem da Missão e
 * o ECH as leem, e o painel antigo que as hospedava se aposenta (inventário de 02/11, 2.12).
 *
 * Módulo puro. Prova: tests/ui/missionInboxContract.test.ts.
 */
/** Os recursos: o destino escolhe um tipo que já existe aqui (Livros, Artigos, Notas Salvas…). */
export const RESOURCES_FOLDER = '500 - RESOURCES';
export const HISTORY_FOLDER = '900 - ARCHIVE';
/** O Side Quest vira TaskNote: mora onde o TaskNotes guarda as tarefas. */
export const TASKNOTES_FOLDER = 'TaskNotes/Tasks';
export const SIDEQUEST_TAG = 'sidequest';
export const TASK_TAG = 'task';
/** O estado do Side Quest: "algum dia" (`someday`, o catálogo do TaskNotes). */
export const SIDEQUEST_STATUS = 'someday';
/** Os estados vivos do TaskNotes que o Side Quest não rebaixa para "algum dia". */
const LIVE_STATUSES = new Set(['next-action', 'in-progress', 'waiting-on', 'someday']);
/**
 * Pastas de arquiteturas antigas que não existem mais e não podem renascer por um
 * `ensureFolder` (a primeira nota movida criaria uma árvore fantasma).
 */
export const DEAD_FOLDERS: readonly string[] = [
    '500 - RESOURCES/Biblioteca', '500 - RESOURCES/Knowledge', '900 - HISTORICO', '900 - ARCHIVE/Projetos Finalizados',
];
/** Notas do sistema que moram na caixa por desenho e não são captura. */
export const SYSTEM_NOTES: readonly string[] = ['AGENTS', 'Arquivamento sugerido'];
export const DEFAULT_INBOX_FOLDER = '300 - RUNTIME/001 - INBOX';

/** Caminho dentro de uma pasta; pasta vazia = raiz do vault. */
export function targetPathFor(folder: string, fileName: string): string {
    return folder ? `${folder}/${fileName}` : fileName;
}

/**
 * Índice não é captura. `Index_Inbox.md` está na pasta do Inbox por desenho, não
 * por descuido — movê-lo tiraria o índice do lugar.
 *
 * A régua é a do legado (`dashboardView.ts:961`): a substring `index`, sem
 * acento e sem lista de sinônimos. `Índice` é outra palavra e não é filtrada de
 * propósito: adivinhar variações esconderia nota do operador sem aviso.
 */
export function isIndexNote(basename: string): boolean {
    return String(basename ?? '').toLowerCase().includes('index');
}

/**
 * O que faz: diz se a nota é uma captura para a triagem: não é índice, não é nota do
 * sistema (`AGENTS.md`, a fila "Arquivamento sugerido" do Cold Storage) e não é rascunho
 * de protocolo ("… - RASCUNHO", que tem o grupo próprio na triagem da Missão).
 * Prova: tests/ui/missionInboxContract.test.ts ("filtro da triagem").
 */
export function isTriageCapture(basename: string): boolean {
    const name = String(basename ?? '').trim();
    if (!name || isIndexNote(name)) return false;
    if (SYSTEM_NOTES.some(n => n.toLowerCase() === name.toLowerCase())) return false;
    return !/ - RASCUNHO$/.test(name);
}

/**
 * O que faz: diz se a pasta é (ou fica dentro de) uma pasta morta (`DEAD_FOLDERS`).
 * Prova: tests/ui/missionInboxContract.test.ts ("pastas mortas").
 */
export function isDeadFolder(folder: string): boolean {
    const path = String(folder ?? '').replace(/\/+$/, '');
    return DEAD_FOLDERS.some(dead => path === dead || path.startsWith(`${dead}/`));
}

/**
 * O que faz: os tipos de recurso que já existem: as subpastas diretas de
 * `500 - RESOURCES`, em ordem, sem as ocultas e sem as mortas.
 * Entra → sai: os nomes das subpastas → os nomes, ordenados.
 */
export function resourceTypes(folderNames: readonly string[]): string[] {
    return [...new Set(folderNames.map(n => String(n ?? '').trim()))]
        .filter(n => n && !n.startsWith('.') && !isDeadFolder(`${RESOURCES_FOLDER}/${n}`))
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * A triagem: `.md` dentro da pasta do Inbox, índices fora.
 *
 * O escopo é `startsWith` da pasta, o mesmo de `panelExecution.renderInbox`: se
 * um listasse só o nível de cima e o outro a subárvore, os dois números da mesma
 * aba discordariam no dia em que houvesse uma subpasta.
 */
export function triageCandidates<T extends { path: string; extension: string; basename: string }>(
    files: readonly T[],
    folder: string,
): T[] {
    const prefix = String(folder ?? '').replace(/\/+$/, '');
    // Sem pasta configurada, `startsWith('')` casaria o vault inteiro: melhor não
    // listar nada do que oferecer para mover o que não é triagem.
    if (!prefix) return [];
    return files.filter(file => file.extension === 'md'
        && file.path.startsWith(`${prefix}/`)
        && isTriageCapture(file.basename));
}

/** Normaliza `tags` para lista: string solta e escalar viram array, sem perder o que havia. */
export function normalizeTags(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.map(tag => String(tag).trim()).filter(Boolean);
    if (typeof raw === 'string') return raw.split(',').map(tag => tag.trim()).filter(Boolean);
    if (raw === null || raw === undefined) return [];
    return [String(raw).trim()].filter(Boolean);
}

export interface SideQuestPatch {
    tags: string[];
    /** `someday`, salvo quando a nota já está num estado vivo do TaskNotes. */
    status?: string;
    /** `task`, só quando a nota ainda não declara tipo. */
    type?: string;
    /** O dia de hoje, só quando a nota ainda não tem `dateCreated`. */
    dateCreated?: string;
}

/**
 * O que o Side Quest acrescenta ao frontmatter, sem escrever nada: a nota vira uma
 * TaskNote "algum dia".
 *
 * As tags `task` (a marca que o TaskNotes lê) e `sidequest` entram na lista existente
 * (nunca substituindo o que já estava). O `status` vira `someday` quando a nota não
 * declara um, declara `inbox` ou um valor fora do catálogo; um estado vivo
 * (`next-action`, `in-progress`, `waiting-on`) fica: rebaixar uma tarefa em execução
 * seria uma perda silenciosa de estado. `type: task` e o `dateCreated` de hoje entram só
 * quando faltam.
 */
export function sideQuestFrontMatter(frontmatter: Record<string, unknown> | null | undefined, today = ''): SideQuestPatch {
    const current = (frontmatter ?? {}) as Record<string, unknown>;
    const tags = normalizeTags(current.tags);
    if (!tags.some(tag => tag.toLowerCase() === TASK_TAG)) tags.push(TASK_TAG);
    if (!tags.some(tag => tag.toLowerCase() === SIDEQUEST_TAG)) tags.push(SIDEQUEST_TAG);
    const patch: SideQuestPatch = { tags };
    const status = typeof current.status === 'string' ? current.status.trim() : '';
    if (!LIVE_STATUSES.has(status)) patch.status = SIDEQUEST_STATUS;
    if (typeof current.type !== 'string' || current.type.trim() === '') patch.type = 'task';
    if (today && !current.dateCreated) patch.dateCreated = today;
    return patch;
}


/** O estado da captura que vira tarefa ("Virar tarefa", a triagem da Missão): a próxima. */
export const CAPTURE_TASK_STATUS = 'next-action';

/**
 * O que faz: o que "Virar tarefa" acrescenta ao frontmatter de uma captura: a nota vira uma
 * TaskNote aberta (a próxima), como o Side Quest, sem a marca `sidequest` e sem o "algum
 * dia". Um estado vivo que a nota já tem fica; `type: task` e o `dateCreated` de hoje
 * entram só quando faltam.
 * Por quê: a arquitetura da página Missão (27/10/2026, 8.6): a nota da Caixa de entrada vai
 * para os destinos da triagem antiga "ou Virar tarefa"; daí ela entra na prateleira como
 * tarefa sem data, e a triagem segue com ela.
 * Prova: tests/ui/missionInboxContract.test.ts ("virar tarefa").
 */
export function captureTaskFrontMatter(frontmatter: Record<string, unknown> | null | undefined, today = ''): SideQuestPatch {
    const current = (frontmatter ?? {}) as Record<string, unknown>;
    const tags = normalizeTags(current.tags);
    if (!tags.some(tag => tag.toLowerCase() === TASK_TAG)) tags.push(TASK_TAG);
    const patch: SideQuestPatch = { tags };
    const status = typeof current.status === 'string' ? current.status.trim() : '';
    if (!LIVE_STATUSES.has(status) || status === SIDEQUEST_STATUS) patch.status = CAPTURE_TASK_STATUS;
    if (typeof current.type !== 'string' || current.type.trim() === '') patch.type = 'task';
    if (today && !current.dateCreated) patch.dateCreated = today;
    return patch;
}
