/**
 * A nota de uma área, fora do Obsidian (módulo puro): `100 - AREAS/<0n - Nome>/000 - INDEX/README.md`,
 * marcada com `type: area`.
 *
 * Por quê: havia três marcadores diferentes para dizer o que é uma área, e um trecho do
 * motor de canvas esperava `000 - INDEX/000 - INDEX.md`, um arquivo que nunca existiu
 * (proposta de organização de 27/10/2026, item 10, aprovada). Fica um só: o README do
 * `000 - INDEX` com `type: area`, o mesmo que a Missão já lê (`missaoService.lerPortfolio`)
 * e que a trava do Cold Storage reconhece (`metadataWatcher.isPermanentFront`).
 *
 * Prova: tests/engine/areaIndex.test.ts.
 */
import { STAGE } from './missionPortfolio';

export const AREAS_ROOT = '100 - AREAS';
export const AREA_INDEX_FOLDER = '000 - INDEX';
export const AREA_INDEX_NOTE = 'README.md';
export const AREA_TYPE = 'area';

/**
 * O que faz: o caminho da nota de uma área pela pasta dela (`01 - Uma área`).
 * Entra → sai: o nome da pasta da área → `100 - AREAS/<pasta>/000 - INDEX/README.md`.
 */
export function areaIndexPath(areaFolder: string): string {
    return `${AREAS_ROOT}/${areaFolder}/${AREA_INDEX_FOLDER}/${AREA_INDEX_NOTE}`;
}

/**
 * O que faz: a pasta da área de um caminho de dentro de `100 - AREAS` (`01 - Uma área`);
 * `null` fora dele.
 */
export function areaFolderOf(path: string): string | null {
    const parts = String(path ?? '').split('/');
    return parts[0] === AREAS_ROOT && parts.length > 2 ? parts[1] : null;
}

/** O que faz: diz se o `type` do frontmatter marca uma área (`area`, também com acento). */
export function isAreaType(type: unknown): boolean {
    const t = String(type ?? '').toLowerCase().trim();
    return t === AREA_TYPE || t === 'área';
}

/**
 * O que faz: o link para gravar no campo `Area` de uma nota. A nota da área se chama
 * README, e `[[README]]` resolve para qualquer um dos READMEs do cofre: ela vai pelo
 * caminho, com o nome da área como rótulo (`[[100 - AREAS/01 - Uma área/000 - INDEX/README|Uma área]]`).
 * As outras notas vão pelo nome, como sempre.
 * Entra → sai: `{ basename, path }` → o link.
 */
export function areaLink(file: { basename: string; path: string }): string {
    const folder = areaFolderOf(file.path);
    if (String(file.basename).toLowerCase() !== 'readme' || !folder || String(file.path) !== areaIndexPath(folder)) {
        return `[[${file.basename}]]`;
    }
    const name = folder.replace(/^\d+\s*-\s*/, '').trim();
    return `[[${String(file.path).replace(/\.md$/, '')}|${name}]]`;
}

/** A coluna do kanban de projeto que diz "feito"; a coluna é a dona do estágio. */
export const DONE_COLUMN: string = STAGE.done;

/**
 * O que faz: o destino que o Cold Storage sugere para uma pasta de projeto com
 * `status: done`: a coluna `5 - Done` da área (a coluna é a dona do estágio); fora das
 * colunas (um departamento, uma pasta solta da área), o `300 - ARCHIVES` da área.
 * `null` quando a pasta já está em `5 - Done` (nada a sugerir) ou fora de `100 - AREAS`.
 * Por quê: a sugestão apontava `900 - ARCHIVE/Projetos Finalizados`, pasta que não
 * existe (proposta de organização de 27/10/2026, item 11).
 * Entra → sai: o caminho da pasta do projeto → o caminho sugerido, ou `null`.
 */
export function coldStorageDestination(projectFolderPath: string): string | null {
    const parts = String(projectFolderPath ?? '').replace(/\/+$/, '').split('/');
    if (parts[0] !== AREAS_ROOT || parts.length < 3) return null;
    const area = parts[1];
    const name = parts[parts.length - 1];
    if (parts[2] === '100 - PROJECTS' && parts.length === 5) {
        return parts[3] === DONE_COLUMN ? null : `${AREAS_ROOT}/${area}/100 - PROJECTS/${DONE_COLUMN}/${name}`;
    }
    return `${AREAS_ROOT}/${area}/300 - ARCHIVES/${name}`;
}
