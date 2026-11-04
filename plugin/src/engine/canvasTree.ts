/**
 * Navegador da árvore de canvas — o núcleo do controle da missão.
 *
 * O vault **já é** uma árvore de canvas: 63 arquivos, 40 nós apontando para
 * outros canvases, `Dk-Fleet-Commander.canvas` na raiz do `000 - COCKPIT`
 * dirigindo as 4 áreas, e cada área abrindo os seus projetos. O que faltava era
 * uma superfície que **navegasse** essa árvore em vez de mostrar uma folha
 * isolada num seletor.
 *
 * Este módulo é puro: recebe o texto de um `.canvas` e devolve, além do grafo,
 * a **trilha** (pai, filho) que permite descer e voltar. Nenhum estado vive aqui.
 */

/** Bloco de código que o autor escreveu dentro de um nó de texto. */
export interface CanvasBlock {
    /** `dfm` = botão declarativo; `dataviewjs`/`dataview` = painel consultável. */
    language: 'dfm' | 'dataviewjs' | 'dataview' | 'other';
    /** Corpo do bloco, sem as cercas. */
    source: string;
    /** Rótulo humano quando o bloco declara um (`button:`/`titulo:`). */
    label: string | null;
    /** Identificador declarado (`id:`), usado para despachar a ação. */
    id: string | null;
}

/** Bloco `dfm` já interpretado como botão — o autor pediu uma ação. */
export interface CanvasButton {
    id: string;
    label: string;
    /** Ação declarada no bloco, quando existe (`action:`/`command:`). */
    action: string | null;
    /** Mensagem de confirmação declarada. */
    confirm: string | null;
    nodeId: string;
}

/** Extrai os blocos cercados de um texto de nó. */
export function extractBlocks(text: string): CanvasBlock[] {
    const blocks: CanvasBlock[] = [];
    const pattern = /```([a-zA-Z-]+)\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(String(text ?? ''))) !== null) {
        const raw = match[1].toLowerCase();
        const language: CanvasBlock['language'] =
            raw === 'dfm' ? 'dfm'
            : raw === 'dataviewjs' ? 'dataviewjs'
            : raw === 'dataview' ? 'dataview'
            : 'other';
        const source = match[2];
        blocks.push({
            language,
            source,
            label: readField(source, 'button') ?? readField(source, 'titulo') ?? readField(source, 'title'),
            id: readField(source, 'id'),
        });
    }
    return blocks;
}

/** Lê `chave: valor` de um bloco declarativo. A primeira ocorrência vence. */
function readField(source: string, key: string): string | null {
    const match = String(source ?? '').match(new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, 'mi'));
    return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
}

/**
 * Interpreta os blocos `dfm` de um nó como botões.
 *
 * O autor já escreveu `button:` e `id:` dentro do canvas. Ignorar isso e inventar
 * botões próprios seria substituir a intenção dele pela nossa — então só
 * materializamos o que está declarado, e o que não declara `button:` vira painel.
 */
export function extractButtons(text: string, nodeId: string): CanvasButton[] {
    return extractBlocks(text)
        .filter(block => block.language === 'dfm' && block.label)
        .map(block => ({
            id: block.id ?? block.label!,
            label: block.label!,
            action: readField(block.source, 'action') ?? readField(block.source, 'command') ?? readField(block.source, 'protocol'),
            confirm: readField(block.source, 'confirm') ?? readField(block.source, 'confirmar'),
            nodeId,
        }));
}

/** Remove os blocos cercados: sobra o que o autor escreveu como explicação. */
export function stripBlocks(text: string): string {
    return String(text ?? '')
        .replace(/```[a-zA-Z-]*\n[\s\S]*?```/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Raiz sugerida: o cockpit da frota quando existe, senão o primeiro panorama. */
export const COCKPIT_PATH = '300 - RUNTIME/000 - COCKPIT/Dk-Fleet-Commander.canvas';
export const COCKPIT_DIR = '300 - RUNTIME/000 - COCKPIT/';
