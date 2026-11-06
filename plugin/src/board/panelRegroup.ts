/**
 * Os dois ajudantes do layout do Mission Control que vêm com a triagem (P7), os dois só no
 * clique do operador: "Recolher o que a Missão já mostra" e as páginas em cinco.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §7) faz de recolher os 15 cartões um
 * botão, com a lista e o Desfazer, oferecido depois do P7, e o clique fica com quem usa: os
 * cartões continuam no catálogo e nada sai sozinho. As cinco páginas foram aprovadas em
 * 29/10/2026, no lugar das seis da proposta de 27/10 (§2 itens 3 a 5), que não chegou a ser
 * aplicada: algumas funções do painel ficaram sem uso (o menu de Hoje; o Mapa repetia o que a
 * Missão já faz), e as outras servem a gerenciamento, monitoramento de detalhes e análise.
 * Missão · Projetos · Análise ·
 * Protocolos · Sistema; o menu de Hoje, o Mapa e a Captura do Início vão para o catálogo; dentro
 * de cada página, a ordem do padrão de uso, Olhada → Plano → Durante → Fechar.
 *
 * "Ir para o catálogo" é sair do layout: o catálogo (`boardPanel.openCatalog`) oferece todo
 * widget e toda visão que não está na página, e o cartão volta por ele.
 *
 * Módulo puro: recebe o layout e devolve o layout novo e a lista do que muda, sem gravar
 * nada (quem grava é a vista, no clique, com o Desfazer da pilha única).
 * Prova: tests/board/panelRegroup.test.ts.
 */
import { BOARD_CATALOG } from './boardSpec';
import { LEGACY_PANELS, MISSAO_PAGE_ID, PROTOCOLS_PAGE_ID, type CardSource, type PanelCard, type PanelLayoutState, type PanelPage } from './panelLayout';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** A chave de um cartão pela fonte: `p:<visão>` ou `w:<tipo>` (a lista de vencidas é `w:tarefas:vencidas`). */
export function chaveDoCartao(source: CardSource): string {
    if (source.kind === 'painel') return `p:${source.id}`;
    const spec = source.spec as { kind: string; filtro?: string };
    return spec.kind === 'tarefas' && spec.filtro ? `w:tarefas:${spec.filtro}` : `w:${spec.kind}`;
}

/* ------------------------------------------------------- Recolher (§7) */

/** Os 15 cartões que a Missão absorve (§7), com o que ela mostra no lugar deles. */
export const ABSORVIDOS: ReadonlyArray<{ chave: string; rotulo: string; naMissao: string; aviso?: string }> = [
    { chave: 'w:agora', rotulo: 'Agora (widget)', naMissao: 'a linha de hoje, com o "Por que agora" de cada tarefa e o "Onde estou"' },
    { chave: 'w:semana', rotulo: 'Semana (widget)', naMissao: 'a escala da semana' },
    { chave: 'w:tarefas:vencidas', rotulo: 'Vencidas (widget)', naMissao: 'os sinais e a triagem' },
    { chave: 'p:intent', rotulo: 'Agora (intenção)', naMissao: 'o "Por que agora" de cada tarefa, pela tabela única', aviso: 'depende da migração dos pesos antigos do missionIntent, que é sua' },
    { chave: 'p:drift', rotulo: 'Intenção e comportamento', naMissao: 'os sinais (§8.8)', aviso: 'depende da migração dos pesos antigos do missionIntent, que é sua' },
    { chave: 'p:day', rotulo: 'Dia (comando do dia)', naMissao: 'o centro do dia: a carga contra o Bloco Sagrado e os botões ▶️ abrir o dia e 🌙 fechar o dia' },
    { chave: 'p:planPressure', rotulo: 'Pressão do plano', naMissao: 'o centro do dia e os sinais' },
    { chave: 'p:pressure', rotulo: 'Pressão', naMissao: 'o centro do dia e os sinais' },
    { chave: 'p:inbox', rotulo: 'Inbox', naMissao: 'a triagem (§8.6)' },
    { chave: 'p:triage', rotulo: 'Triagem da inbox', naMissao: 'a triagem (§8.6)' },
    { chave: 'p:plan', rotulo: 'Plano da semana', naMissao: 'a escala da semana' },
    { chave: 'p:timeline', rotulo: 'Linha do tempo', naMissao: 'as escalas da semana e do trimestre' },
    { chave: 'p:radar', rotulo: 'Radar do trimestre', naMissao: 'a escala do trimestre' },
    { chave: 'p:week', rotulo: 'Semana (ciclo)', naMissao: 'a semana no centro e no painel do nó, com 🌳 planejar e 📅 revisar' },
    { chave: 'p:quarter', rotulo: 'Trimestre (ciclo)', naMissao: 'o trimestre no centro e no painel do nó, com 🧭 planejar e 🔄 revisar' },
];

/** Um cartão do layout que a Missão já mostra: onde está e o que ela mostra no lugar. */
export interface CartaoParaRecolher { id: string; pagina: string; rotulo: string; naMissao: string; aviso?: string }

/**
 * O que faz: os cartões do layout que estão entre os 15 do §7, onde quer que estejam (pela
 * fonte, não pelo id: o cartão posto de novo pelo catálogo também conta), na ordem das páginas.
 */
export function cartoesParaRecolher(layout: PanelLayoutState): CartaoParaRecolher[] {
    const out: CartaoParaRecolher[] = [];
    for (const page of layout.pages) for (const card of page.cards) {
        const a = ABSORVIDOS.find(x => x.chave === chaveDoCartao(card.source));
        if (a) out.push({ id: card.id, pagina: page.label, rotulo: a.rotulo, naMissao: a.naMissao, ...(a.aviso ? { aviso: a.aviso } : {}) });
    }
    return out;
}

/**
 * O que faz: o layout sem os cartões escolhidos (os da lista que o operador deixou marcados);
 * as páginas ficam, mesmo vazias (apagar página é gesto dele).
 * Erro e ataque: id que não é da lista do §7 não sai (a função não recolhe cartão de outro
 * tipo); sem nada escolhido, o mesmo layout.
 */
export function recolher(layout: PanelLayoutState, ids: readonly string[]): PanelLayoutState {
    const permitidos = new Set(cartoesParaRecolher(layout).map(c => c.id).filter(id => ids.includes(id)));
    if (!permitidos.size) return layout;
    const next = clone(layout);
    for (const page of next.pages) page.cards = page.cards.filter(c => !permitidos.has(c.id));
    return next;
}

/* ------------------------------------------------------- as cinco páginas (29/10) */

export type FaseDeUso = 'olhada' | 'plano' | 'durante' | 'fechar';
export const FASES: readonly FaseDeUso[] = ['olhada', 'plano', 'durante', 'fechar'];

/** As cinco páginas, na ordem, com o nome e o ícone de quando ainda não existem. */
export const CINCO_PAGINAS: ReadonlyArray<{ id: string; label: string; icon: string }> = [
    { id: MISSAO_PAGE_ID, label: 'Missão', icon: 'compass' },
    { id: 'projetos', label: 'Projetos', icon: 'folder-kanban' },
    { id: 'analise', label: 'Análise', icon: 'bar-chart-3' },
    { id: PROTOCOLS_PAGE_ID, label: 'Protocolos', icon: 'workflow' },
    { id: 'sistema', label: 'Sistema', icon: 'cpu' },
];

/**
 * As páginas que o agrupamento conhece: as 11 do layout de 27/10 (as de partida e as semeadas),
 * a Mesa e a Análise. As que o operador criou ficam como estão.
 */
export const PAGINAS_CONHECIDAS: readonly string[] = [
    MISSAO_PAGE_ID, 'inicio', 'hoje', 'plano', 'rotinas', 'executar', PROTOCOLS_PAGE_ID, 'mapa', 'projetos', 'ferramentas', 'sistema', 'mesa', 'analise',
];

/** Os cartões que vão para o catálogo no agrupamento (29/10), com o porquê de cada um. */
export const PARA_O_CATALOGO: ReadonlyArray<{ chave: string; porque: string }> = [
    { chave: 'p:noteFactory', porque: 'o menu de Hoje já não faz sentido' },
    { chave: 'p:mapModes', porque: 'o Mapa tentava ser o que a Missão já é' },
    { chave: 'p:missionGraph', porque: 'o Mapa tentava ser o que a Missão já é' },
    { chave: 'p:map', porque: 'o Mapa tentava ser o que a Missão já é' },
    { chave: 'p:capture', porque: 'a Missão já tem a 💡 Captura' },
];

/** A página de cada cartão no agrupamento (o que a tabela não conhece fica na página dele, se é uma das cinco, ou vai para a Análise). */
const PAGINA: Readonly<Record<string, string>> = {
    'w:projetos': 'projetos', 'w:projeto': 'projetos', 'p:portfolioBoard': 'projetos', 'p:kanban': 'projetos', 'p:portfolioActions': 'projetos',
    'p:portfolioCompliance': 'projetos', 'p:projects': 'projetos', 'p:trees': 'projetos', 'p:areas': 'projetos',
    'p:matrix': 'analise', 'w:matriz': 'analise', 'p:funnel': 'analise', 'p:waiting': 'analise', 'w:numeros': 'analise', 'p:habits': 'analise', 'w:habitos': 'analise',
    'w:protocolos-saude': PROTOCOLS_PAGE_ID, 'w:protocolos-catalogo': PROTOCOLS_PAGE_ID, 'w:protocolos-mapa': PROTOCOLS_PAGE_ID, 'w:protocolos-uso': PROTOCOLS_PAGE_ID,
    'w:protocolos-versoes': PROTOCOLS_PAGE_ID, 'w:protocolos-avisos': PROTOCOLS_PAGE_ID, 'w:protocolos-ferramentas': PROTOCOLS_PAGE_ID, 'p:protocols': PROTOCOLS_PAGE_ID,
    'p:operatorCard': 'sistema', 'p:bench': 'sistema', 'p:integrity': 'sistema', 'p:canvasTools': 'sistema', 'p:canvases': 'sistema',
};

/**
 * A fase de uso de cada cartão (Olhada: ver; Plano: decidir; Durante: fazer e registrar;
 * Fechar: revisar), pelo padrão de uso de 27/10. Sem entrada: o widget é olhada, a visão é durante.
 */
export const FASE_DO_CARTAO: Readonly<Record<string, FaseDeUso>> = {
    'w:numeros': 'olhada', 'p:funnel': 'olhada', 'w:agora': 'olhada', 'w:semana': 'olhada', 'p:intent': 'olhada', 'p:drift': 'olhada',
    'p:pressure': 'olhada', 'p:planPressure': 'olhada', 'p:radar': 'olhada', 'p:timeline': 'olhada', 'w:projetos': 'olhada', 'w:projeto': 'olhada',
    'p:portfolioBoard': 'olhada', 'p:trees': 'olhada', 'p:areas': 'olhada', 'w:habitos': 'olhada', 'p:missionGraph': 'olhada', 'p:map': 'olhada',
    'p:canvases': 'olhada', 'w:protocolos-saude': 'olhada', 'w:protocolos-avisos': 'olhada', 'w:protocolos-mapa': 'olhada',
    'w:matriz': 'plano', 'p:matrix': 'plano', 'p:plan': 'plano', 'p:week': 'plano', 'p:quarter': 'plano', 'p:portfolioActions': 'plano',
    'p:capture': 'durante', 'p:noteFactory': 'durante', 'p:waiting': 'durante', 'p:inbox': 'durante', 'p:triage': 'durante', 'p:day': 'durante',
    'p:kanban': 'durante', 'p:habits': 'durante', 'p:canvasTools': 'durante', 'w:protocolos-catalogo': 'durante', 'w:protocolos-ferramentas': 'durante',
    'p:operatorCard': 'durante', 'p:protocols': 'durante',
    'p:portfolioCompliance': 'fechar', 'p:integrity': 'fechar', 'w:protocolos-uso': 'fechar', 'w:protocolos-versoes': 'fechar',
};

/** O que faz: a fase de um cartão (a tabela, ou a regra de quando falta). */
export function faseDoCartao(card: Pick<PanelCard, 'source'>): FaseDeUso {
    const k = chaveDoCartao(card.source);
    const base = k.startsWith('w:tarefas') ? 'w:tarefas' : k;
    return FASE_DO_CARTAO[k] ?? FASE_DO_CARTAO[base] ?? (card.source.kind === 'widget' ? 'olhada' : 'durante');
}

/** O que faz: o nome do cartão como o catálogo o diz (o título dele, se tem; a lista de tarefas com o filtro). */
export function rotuloDoCartao(c: Pick<PanelCard, 'source'>): string {
    if (c.source.kind === 'painel') return LEGACY_PANELS[c.source.id]?.label ?? c.source.id;
    const spec = c.source.spec as { kind: string; titulo?: string; filtro?: string };
    if (spec.titulo) return spec.titulo;
    const nome = BOARD_CATALOG.find(e => e.kind === spec.kind)?.label ?? spec.kind;
    return spec.filtro ? `${nome} · ${spec.filtro}` : nome;
}

/** O que muda numa página do agrupamento: o nome e os cartões, na ordem nova. */
export interface PaginaDoAgrupamento { id: string; label: string; cartoes: Array<{ id: string; rotulo: string; fase: FaseDeUso; de: string }> }

export interface Agrupamento {
    layout: PanelLayoutState;
    /** As cinco páginas (e as do operador, que ficam), como vão ficar. */
    paginas: PaginaDoAgrupamento[];
    /** Os cartões que vão para o catálogo, com o porquê. */
    catalogo: Array<{ id: string; rotulo: string; de: string; porque: string }>;
    /** Os cartões que entram (nenhum, nas cinco: a forma fica para o caso de um agrupamento que troque cartão). */
    entram: string[];
    /** As páginas que deixam de existir (os cartões foram para as cinco ou para o catálogo). */
    saem: string[];
    /** Nada a mudar: o layout já está nas cinco. */
    igual: boolean;
}

/**
 * O que faz: o agrupamento das páginas em cinco (29/10), sem gravar: cada cartão vai para a
 * página dele (a tabela `PAGINA`); o menu de Hoje, o Mapa e a Captura do Início vão para o
 * catálogo, e os 15 que a Missão já mostra (§7), se ainda estão no layout, também, com o que ela
 * mostra no lugar; o que a tabela não conhece fica na página dele, se é uma das cinco, ou vai
 * para a Análise (o "gerenciamento a mais"); dentro de cada página, Olhada → Plano → Durante →
 * Fechar, e na mesma fase a ordem de antes. As páginas que o operador criou ficam, depois das cinco.
 * Entra → sai: o layout → `Agrupamento` (o layout novo e a lista para conferir).
 * Erro e ataque: rodar de novo sobre o resultado não muda nada (`igual`); a Missão continua
 * a primeira e a tela; a largura e a altura de cada cartão ficam; nenhum cartão novo nasce.
 */
export function agruparEmCinco(layout: PanelLayoutState): Agrupamento {
    const antes = clone(layout);
    const rotulo = rotuloDoCartao;
    const conhecidas = new Set(PAGINAS_CONHECIDAS);
    const cinco = new Set(CINCO_PAGINAS.map(p => p.id));
    const destino = new Map<string, Array<{ card: PanelCard; ordem: number; de: string }>>(CINCO_PAGINAS.map(p => [p.id, []]));
    const catalogo: Agrupamento['catalogo'] = [];
    let ordem = 0;
    for (const page of antes.pages) {
        if (!conhecidas.has(page.id) || page.tela) continue;
        for (const card of page.cards) {
            const k = chaveDoCartao(card.source);
            const sai = PARA_O_CATALOGO.find(x => x.chave === k);
            const absorvido = ABSORVIDOS.find(x => x.chave === k);
            if (sai || absorvido) {
                catalogo.push({ id: card.id, rotulo: rotulo(card), de: page.label, porque: sai?.porque ?? `a Missão já mostra: ${absorvido!.naMissao}` });
                continue;
            }
            const alvo = PAGINA[k] ?? (cinco.has(page.id) ? page.id : 'analise');
            destino.get(alvo)!.push({ card, ordem: ordem++, de: page.label });
        }
    }
    const fase = (c: PanelCard) => FASES.indexOf(faseDoCartao(c));
    const pages: PanelPage[] = [];
    const paginas: PaginaDoAgrupamento[] = [];
    for (const meta of CINCO_PAGINAS) {
        const existente = antes.pages.find(p => p.id === meta.id);
        if (meta.id === MISSAO_PAGE_ID) {
            pages.push(existente ?? { id: meta.id, label: meta.label, icon: meta.icon, tela: 'missao', cards: [] });
            paginas.push({ id: meta.id, label: existente?.label ?? meta.label, cartoes: [] });
            continue;
        }
        const itens = destino.get(meta.id)!.sort((a, b) => fase(a.card) - fase(b.card) || a.ordem - b.ordem);
        const label = existente?.label ?? meta.label;
        pages.push({ id: meta.id, label, icon: existente?.icon ?? meta.icon, cards: itens.map(x => x.card) });
        paginas.push({ id: meta.id, label, cartoes: itens.map(x => ({ id: x.card.id, rotulo: rotulo(x.card), fase: faseDoCartao(x.card), de: x.de })) });
    }
    for (const page of antes.pages) {
        if (conhecidas.has(page.id)) continue;
        pages.push(page);
        paginas.push({ id: page.id, label: page.label, cartoes: page.cards.map(c => ({ id: c.id, rotulo: rotulo(c), fase: faseDoCartao(c), de: page.label })) });
    }
    const saem = antes.pages.filter(p => conhecidas.has(p.id) && !cinco.has(p.id)).map(p => p.label);
    const activePage = pages.some(p => p.id === antes.activePage) ? antes.activePage : pages[0].id;
    const next: PanelLayoutState = { ...antes, pages, activePage };
    const igual = JSON.stringify(next.pages) === JSON.stringify(layout.pages);
    return { layout: igual ? layout : next, paginas, catalogo, entram: [], saem, igual };
}
