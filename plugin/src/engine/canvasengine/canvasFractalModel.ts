/**
 * Modelo de dados, contratos, constantes e geometria do contexto fractal.
 *
 * Suporta a gramática fractal completa:
 * - 'subir': ascensão hierárquica (Projeto -> Área; Área -> Sistema).
 * - 'descer': descida hierárquica (Sistema -> Áreas; Área -> Projetos; Projeto -> Tarefas).
 * - 'lateral': navegação entre pares/irmãos na mesma área.
 * - 'retorno': retorno ao projeto dono a partir de tarefas ou vistas subordinadas.
 */

import type { CanvasIndexEntry, MissionCanvasIndex } from '../missionCanvasIndex';
import type { FractalReading, FractalScale } from '../missionFractal';
import { CANVAS_FILE_NODE_HEIGHT, CANVAS_FILE_NODE_WIDTH, railNodeIdFor } from './canvasSplice';

export const FRACTAL_CONTEXT_LIMIT = 5;

export const FRACTAL_CONTEXT_CRITERION =
    'projetos da mesma área, do mais recente ao mais antigo (mtime decrescente; '
    + 'empate pelo caminho em ordem crescente; mtime ausente vai por último), '
    + `no máximo ${FRACTAL_CONTEXT_LIMIT} por geração — o que passar do teto é contado e declarado, nunca cortado em silêncio.`;

export const FRACTAL_HEADER_MARKER = 'dfm-fractal-header';
export const FRACTAL_HEADER_LABEL = '🧭 Cabeçalho fractal';
export const FRACTAL_HEADER_COLOR = '6';
export const FRACTAL_HEADER_WIDTH = 400;
export const FRACTAL_HEADER_NODE_HEIGHT = 150;
export const FRACTAL_HEADER_GAP = 24;

export const FRACTAL_CONTEXT_NODE_SIZE = { width: CANVAS_FILE_NODE_WIDTH, height: CANVAS_FILE_NODE_HEIGHT };

export interface FractalContextDrawing {
    files: string[];
    ids: string[];
    headerIds?: string[];
    headerFiles?: string[];
}

export function canvasDrawingOf(parsed: any): FractalContextDrawing {
    const files: string[] = [];
    const ids: string[] = [];
    const headerIds: string[] = [];
    const headerFiles: string[] = [];
    for (const node of Array.isArray(parsed?.nodes) ? parsed.nodes : []) {
        if (!node || typeof node !== 'object') continue;
        const id = String(node.id ?? '').trim();
        const marcado = node.mode === FRACTAL_HEADER_MARKER;
        if (id) {
            ids.push(id);
            if (marcado) headerIds.push(id);
        }
        if (node.type !== 'file') continue;
        const file = String(node.file ?? '').trim();
        if (!file) continue;
        files.push(file);
        if (marcado) headerFiles.push(file);
    }
    return { files, ids, headerIds, headerFiles };
}

export type FractalContextRole = 'sistema' | 'area-cockpit' | 'projeto-da-area' | 'projeto-irmao';

export interface FractalContextNode {
    role: FractalContextRole;
    filePath: string;
    label: string;
    nodeId: string;
    reason: string;
}

export interface FractalContextSkip {
    path: string;
    reason: string;
}

export interface FractalContextPlan {
    kind: 'plan' | 'skip';
    scale: FractalScale;
    nodes: FractalContextNode[];
    already: string[];
    skipped: FractalContextSkip[];
    truncated: number;
    criterion: string;
    reason: string;
}

export interface FractalContextRequest {
    canvasPath: string;
    scale: FractalScale;
    index: MissionCanvasIndex;
    drawing?: FractalContextDrawing | null;
    limit?: number;
    exists?: ((path: string) => boolean) | null;
}

export const FRACTAL_HEADER_SKIP: Record<'sistema' | 'tarefas' | 'indefinida', string> = {
    sistema: 'Este é o canvas do sistema: ele é o topo da árvore e não tem contexto acima dele para puxar — nem cabeçalho de escala, porque não há escala acima daqui. Nada foi escrito.',
    tarefas: 'Escala de tarefas: um canvas nesta faixa mora dentro de um projeto e não é topo de nada — o contexto dele é o próprio projeto, que já o contém, e um cabeçalho ali só repetiria a trilha do projeto. Nada foi escrito.',
    indefinida: 'Escala indefinida: sem saber de que nível este canvas é, qualquer nó seria contexto inventado — e o cabeçalho declara justamente a escala que a leitura não achou. Nada foi escrito.',
};

export type FractalHeaderDirection = 'subir' | 'descer' | 'lateral' | 'retorno';

export interface FractalHeaderLink {
    direction: FractalHeaderDirection;
    filePath: string;
    label: string;
    nodeId: string;
    role: FractalContextRole | 'tarefas';
    reason: string;
}

export interface FractalHeaderBlock {
    headerId: string;
    scale: FractalScale;
    label: string;
    trail: string[];
    title: string;
    links: FractalHeaderLink[];
    skipped: FractalContextSkip[];
    reason: string;
}

export interface FractalHeaderRequest {
    canvasPath: string;
    reading: FractalReading;
    index: MissionCanvasIndex;
    drawing?: FractalContextDrawing | null;
    tasks?: ReadonlyArray<{ path: string; project?: string | null; projects?: ReadonlyArray<string> | null; due?: string | null }> | null;
    limit?: number;
    exists?: ((path: string) => boolean) | null;
    taskProject?: string | null;
}

export interface FractalHeaderGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function fractalHeaderIdFor(canvasPath: string, taken: ReadonlyArray<string> = []): string {
    return railNodeIdFor(`${String(canvasPath ?? '').trim()}#${FRACTAL_HEADER_MARKER}`, taken);
}

export function fractalHeaderTrail(reading: FractalReading): string {
    return ['sistema', ...(reading?.trail ?? [])].join(' → ');
}

export function fractalHeaderTitle(reading: FractalReading): string {
    return `## 🧭 Cabeçalho fractal
**Escala:** ${reading?.label ?? ''} · **Trilha:** ${fractalHeaderTrail(reading)}
${reading?.reason ?? ''}`;
}

export function fractalHeaderNodeCount(block: FractalHeaderBlock): number {
    return 2 + (block?.links?.length ?? 0);
}

export function fractalHeaderBlockHeight(block: FractalHeaderBlock): number {
    const nos = fractalHeaderNodeCount(block);
    return nos * FRACTAL_HEADER_NODE_HEIGHT + (nos - 1) * FRACTAL_HEADER_GAP;
}

export function fractalHeaderTitleIdFor(headerId: string): string {
    return railNodeIdFor(`${FRACTAL_HEADER_MARKER}:titulo:${headerId}`);
}

export function fractalHeaderNodeIds(block: FractalHeaderBlock): string[] {
    return [block.headerId, fractalHeaderTitleIdFor(block.headerId), ...block.links.map(link => link.nodeId)];
}

export function fractalRoleLabel(role: FractalContextRole): string {
    switch (role) {
        case 'sistema': return 'sistema';
        case 'area-cockpit': return 'cockpit da área';
        case 'projeto-da-area': return 'projeto da área';
        case 'projeto-irmao': return 'projeto irmão';
        default: return String(role);
    }
}

export function caminhoDeProjeto(raw: unknown): string {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === null) return '';
    const clean = String(value).replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
    return clean.replace(/\.md$/, '').replace(/\.canvas$/, '');
}

export function nomeDeProjeto(raw: unknown): string {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === null) return '';
    const str = String(value).replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
    if (str.includes('|')) return str.split('|')[1].trim();
    const clean = str.split('|')[0].trim().replace(/\.md$/, '').replace(/\.canvas$/, '');
    const parts = clean.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? clean;
}
