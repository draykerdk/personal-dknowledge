/**
 * Fachada contratual e reexportadora do contexto fractal.
 *
 * Decompõe a lógica em 3 módulos especializados:
 * - canvasFractalModel: modelo de dados, contratos, constantes e geometria.
 * - canvasFractalNodesPlan: planejamento de nós de contexto.
 * - canvasFractalHeaderPlan: planejamento do cabeçalho com gramática fractal estendida.
 */

export {
    FRACTAL_CONTEXT_LIMIT,
    FRACTAL_CONTEXT_CRITERION,
    FRACTAL_HEADER_MARKER,
    FRACTAL_HEADER_LABEL,
    FRACTAL_HEADER_COLOR,
    FRACTAL_HEADER_WIDTH,
    FRACTAL_HEADER_NODE_HEIGHT,
    FRACTAL_HEADER_GAP,
    FRACTAL_CONTEXT_NODE_SIZE,
    FRACTAL_HEADER_SKIP,
    canvasDrawingOf,
    fractalHeaderIdFor,
    fractalHeaderTrail,
    fractalHeaderTitle,
    fractalHeaderNodeCount,
    fractalHeaderBlockHeight,
    fractalHeaderTitleIdFor,
    fractalHeaderNodeIds,
    fractalRoleLabel,
    nomeDeProjeto,
} from './canvasengine/canvasFractalModel';

export type {
    FractalContextDrawing,
    FractalContextRole,
    FractalContextNode,
    FractalContextSkip,
    FractalContextPlan,
    FractalContextRequest,
    FractalHeaderDirection,
    FractalHeaderLink,
    FractalHeaderBlock,
    FractalHeaderRequest,
    FractalHeaderGeometry,
} from './canvasengine/canvasFractalModel';

export {
    vazio,
    findEntry,
    areaOfCanvas,
    normalizeLimit,
    projetosDaArea,
    planFractalContext,
} from './canvasengine/canvasFractalNodesPlan';

export {
    tarefasDoProjeto,
    planFractalHeader,
    renderFractalHeaderNodes,
    fractalNavigationDirection,
    planSystemAreaLinks,
    planTaskProjectReturn,
} from './canvasengine/canvasFractalHeaderPlan';
