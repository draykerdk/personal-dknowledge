/**
 * Onde fica o canvas de um projeto (ou departamento): uma regra só, para o
 * gerente do canvas de projeto, o índice de canvas do painel, a Árvore e a nota
 * do trimestre (correção L9 do plano do canvas de 13/10/2026; decisão 5a,
 * 14/10/2026).
 *
 * - O caminho de sempre é `<pasta do projeto>/<Nome>.canvas`.
 * - Projeto que fica num repositório git aninhado (submódulo do `.gitmodules`,
 *   ou pasta com `.git` própria) não recebe canvas dentro do repositório: o
 *   arquivo sujaria o repositório de outra pessoa ou de outro site (um site, um
 *   portfólio, o projeto de outra pessoa). O canvas dele fica na área:
 *   `100 - AREAS/<área>/Canvases/<Nome>.canvas`.
 *
 * Quem não sabe quais pastas são repositório (o índice do painel, que só lê o
 * quadro) reconhece o canvas por qualquer um dos dois caminhos
 * (`projectCanvasCandidates`): os dois são do mesmo projeto.
 *
 * Erro e ataque: pasta fora de `100 - AREAS/` não tem área, e o caminho fica o
 * de sempre (quem grava confere `insideNestedRepo` e recusa); nome com barra não
 * vira subpasta, porque o nome é o último trecho da pasta. Prova:
 * `tests/project/projectCanvasPath.test.ts`.
 *
 * Módulo puro: sem Obsidian.
 */

export const AREAS_ROOT = '100 - AREAS';
/** Pasta dos canvas de projeto que moram fora da pasta do projeto, dentro da área. */
export const AREA_CANVAS_DIR = 'Canvases';

export interface CanvasOwner {
    name: string;
    /** Pasta do projeto ou do departamento. */
    path: string;
}

const clean = (path: string) => String(path ?? '').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/{2,}/g, '/');

/** `100 - AREAS/03 - Uma área/200 - DEPARTMENTS/Um departamento` → `100 - AREAS/03 - Uma área`. */
export function areaRootOf(path: string): string | null {
    const parts = clean(path).split('/');
    return parts[0] === AREAS_ROOT && parts.length >= 3 ? `${parts[0]}/${parts[1]}` : null;
}

/** O caminho de sempre: `<pasta>/<Nome>.canvas`. */
export function conventionalCanvasPath(owner: CanvasOwner): string {
    return `${clean(owner.path)}/${owner.name}.canvas`;
}

/** O caminho na área (`100 - AREAS/<área>/Canvases/<Nome>.canvas`), ou `null` fora de uma área. */
export function areaCanvasPath(owner: CanvasOwner): string | null {
    const area = areaRootOf(owner.path);
    return area ? `${area}/${AREA_CANVAS_DIR}/${owner.name}.canvas` : null;
}

/** O caminho fica dentro de algum repositório git aninhado da lista? */
export function insideNestedRepo(path: string, roots: Iterable<string>): boolean {
    const target = clean(path);
    for (const raw of roots) {
        const root = clean(raw);
        if (!root) continue;
        if (target === root || target.startsWith(`${root}/`)) return true;
    }
    return false;
}

/**
 * O canvas do projeto: o de sempre, ou o da área quando a pasta do projeto fica
 * num repositório aninhado. `nestedRoots` são as raízes desses repositórios.
 */
export function projectCanvasPath(owner: CanvasOwner, nestedRoots: Iterable<string>): string {
    const conventional = conventionalCanvasPath(owner);
    if (!insideNestedRepo(conventional, nestedRoots)) return conventional;
    return areaCanvasPath(owner) ?? conventional;
}

/** Os dois caminhos em que o canvas de um projeto pode estar, para quem não sabe quais pastas são repositório. */
export function projectCanvasCandidates(owner: CanvasOwner): string[] {
    const area = areaCanvasPath(owner);
    const conventional = conventionalCanvasPath(owner);
    return area && area !== conventional ? [conventional, area] : [conventional];
}

/** Este `.canvas` é do projeto (por qualquer um dos dois caminhos)? */
export function isProjectCanvasPath(path: string, owner: CanvasOwner): boolean {
    const target = clean(path);
    return projectCanvasCandidates(owner).includes(target);
}
