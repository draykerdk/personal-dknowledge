/**
 * A triagem da Missão: a prateleira do que ainda não tem lugar e as teclas que dão a
 * intenção de cada gesto, uma tarefa por vez.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, 8.6) e o plano (3d.1). A
 * prateleira, nesta ordem: vencidas; SMART sem ação aberta; sem data; sem projeto; sem
 * "onde"; sem estimativa; Caixa de entrada; rascunhos parados; Lista de Espera e ideias
 * sem destino. Um item
 * aparece uma vez, com as outras faltas como marcas. Os grupos das tarefas são os tipos
 * de `sinais.ts`: a triagem e a marca no nó leem a mesma conta.
 *
 * Módulo puro: só a intenção; quem grava (pela tabela das setas) é o P6/P7.
 * Prova: tests/missao/triagem.test.ts.
 */
import { fold } from '../project/projectCanvasModel';
import type { NotaComCampos } from './entrada';
import type { TabelaDosPapeis } from '../engine/papeisDeProtocolo';
import { diaNoInicio, partesDoDia } from './formatos';
import type { GrupoDaTriagem, ItemDaTriagem, MissaoIndice, Prateleira, Sinal, TipoDeSinal } from './tipos';
import { MARCA_DA_TRIAGEM, addDays, addWeeks, chaveDeHoje } from './tempo';

/** Os grupos da prateleira, na ordem do 8.6, com o rótulo. */
/**
 * O `tipo`, quando vem, limita o grupo a um tipo de nó: a SMART que ficou de uma semana que passou
 * tem o grupo dela (02/11/2026), onde ele dá a semana (S, P); a ação que ficou de antes já está na
 * linha de hoje, ao lado, e não vem para a triagem por isso.
 */
export const GRUPOS: ReadonlyArray<{ id: GrupoDaTriagem; rotulo: string; sinal?: TipoDeSinal; tipo?: 'acao' | 'smart'; marca?: string }> = [
    // O que o agente do sistema propõe vem primeiro: espera só o sim ou o não dele (02/11/2026).
    { id: 'propostas', rotulo: 'Propostas' },
    // A tarefa em estado de entrada (a marca `triagem` do modelo; o `inbox`), 02/11 (D1): o primeiro lugar dela.
    { id: 'entrada', rotulo: 'Entrada', marca: MARCA_DA_TRIAGEM }, // as do agente e as da Árvore de Progressão (02/11)
    { id: 'vencidas', rotulo: 'Vencidas', sinal: 'prazo-vencido' },
    { id: 'smart-de-antes', rotulo: 'SMART de semanas passadas', sinal: 'ficou-de-antes', tipo: 'smart' },
    { id: 'smart-sem-acao', rotulo: 'SMART sem ação aberta', sinal: 'smart-sem-acao' },
    { id: 'sem-data', rotulo: 'Sem data', sinal: 'sem-data' },
    { id: 'sem-projeto', rotulo: 'Sem projeto', sinal: 'sem-projeto' },
    { id: 'sem-onde', rotulo: 'Sem "onde"', sinal: 'sem-onde' },
    { id: 'sem-estimativa', rotulo: 'Sem estimativa', sinal: 'sem-estimativa' },
    { id: 'caixa-de-entrada', rotulo: 'Caixa de entrada' },
    { id: 'rascunhos', rotulo: 'Rascunhos parados' },
    { id: 'ideias', rotulo: 'Lista de Espera e ideias sem destino' },
];

/** O tipo que o motor grava no rascunho de protocolo (`draftFrontmatter`, jsonProtocol.ts). */
export const TIPO_DO_RASCUNHO = 'rascunho_protocolo';
/** O rascunho entra na triagem depois de tantos dias parado (proposta de organização de 27/10, item 5). */
export const DIAS_DO_RASCUNHO = 7;
/** Onde o rascunho arquivado vai morar. */
export const PASTA_DOS_RASCUNHOS = '900 - ARCHIVE/Rascunhos';

const diaUTC = (d: string): number | null => {
    const p = partesDoDia(diaNoInicio(String(d ?? '').trim()));
    return p ? Date.UTC(p.ano, p.mes - 1, p.dia) : null;
};

/**
 * O que faz: há quantos dias o rascunho de protocolo está parado, se passou de
 * `DIAS_DO_RASCUNHO`; `null` se não é rascunho (`type: rascunho_protocolo`), se ainda está
 * no prazo ou se não tem data. A data é a `data` do cabeçalho; sem ela, a do nome
 * ("AAAA-MM-DD HH-mm - … - RASCUNHO").
 * Por quê: os rascunhos dos protocolos se acumulavam sem que nada os mostrasse (o mais
 * velho, de 10/07); a triagem mostra os parados para ele retomar ou arquivar, e nada é
 * arquivado sem ele (proposta de organização de 27/10, item 5).
 * Prova: tests/missao/triagem.test.ts ("os rascunhos").
 */
export function diasDoRascunho(nota: NotaComCampos, hoje: string): number | null {
    if (String(nota.campos?.type ?? '').trim() !== TIPO_DO_RASCUNHO) return null;
    const campo = nota.campos?.data;
    const data = diaUTC(campo instanceof Date ? campo.toISOString() : String(campo ?? '')) ?? diaUTC(nota.nome);
    const agora = diaUTC(hoje);
    if (data === null || agora === null) return null;
    const dias = Math.round((agora - data) / 86_400_000);
    return dias > DIAS_DO_RASCUNHO ? dias : null;
}

/**
 * O que faz: as duas saídas de um rascunho parado: retomar (o ▶️ Continuar dele) ou
 * arquivar (a nota vai para `900 - ARCHIVE/Rascunhos/`, pelo Obsidian, que atualiza os
 * links). Só a intenção: quem grava é a tela da triagem (P7).
 * Prova: tests/missao/triagem.test.ts ("os rascunhos").
 */
export function acoesDoRascunho(item: Pick<ItemDaTriagem, 'caminho'>): IntencaoDaTriagem[] {
    const nome = String(item.caminho ?? '').split('/').pop() ?? '';
    return [
        { tipo: 'rascunho-retomar' },
        { tipo: 'rascunho-arquivar', destino: `${PASTA_DOS_RASCUNHOS}/${nome}` },
    ];
}

/** O `type` da nota de ideia. */
export const TIPO_DA_IDEIA = 'idea';

/**
 * O que faz: os tipos de nota que a casa das ideias lê como ideia: o `idea` e o das notas do
 * registro do conceito (o papel `registrar_conceito`, quando o cofre o tem).
 * Por quê: o Caderno do trimestre conta as duas; o tipo do conceito é o id do protocolo dele, que
 * é do cofre e vem pela tabela dos papéis.
 * Entra → sai: a tabela vigente dos papéis → a lista dos tipos (sem repetição).
 * Erro e ataque: papel desligado (`null`) deixa só o `idea`.
 * Prova: tests/missao/triagem.test.ts ("os tipos da ideia").
 */
export function tiposDaIdeia(tabela: Pick<TabelaDosPapeis, 'registrar_conceito'>): string[] {
    const conceito = tabela.registrar_conceito;
    return conceito && conceito !== TIPO_DA_IDEIA ? [TIPO_DA_IDEIA, conceito] : [TIPO_DA_IDEIA];
}

/**
 * O que faz: o grupo de uma ideia na triagem: `lista-de-espera` (o `destino` diz "Lista
 * de Espera"), `sem-destino` (em `500 - RESOURCES/Ideias`, `type: idea`, sem `destino`) ou
 * `null` (já tem destino, fica fora da prateleira). A nota chega da casa das ideias já pelo
 * tipo (`tiposDaIdeia`, na leitura da Missão); a Lista de Espera não confere o tipo de novo.
 * Por quê: as mesmas consultas do Caderno do trimestre (2026-Q4, "Ideias grandes demais
 * para a semana" e "Ideias sem destino").
 * Prova: tests/missao/triagem.test.ts ("as ideias").
 */
export function grupoDaIdeia(nota: NotaComCampos): 'lista-de-espera' | 'sem-destino' | null {
    const type = String(nota.campos?.type ?? '').trim();
    const destino = nota.campos?.destino;
    const destinoText = (Array.isArray(destino) ? destino.join(' ') : String(destino ?? '')).trim();
    if (type && destinoText && destinoText.includes('Lista de Espera')) return 'lista-de-espera';
    if (type === TIPO_DA_IDEIA && !destinoText && nota.caminho.startsWith('500 - RESOURCES/Ideias/')) return 'sem-destino';
    return null;
}

/**
 * O que faz: a prateleira da triagem: as tarefas pelos sinais (cada uma no primeiro grupo
 * que vale, as outras faltas como marcas), a Caixa de entrada, os rascunhos parados há mais
 * de 7 dias e as ideias. O rascunho nunca conta como captura da Caixa de entrada, mesmo
 * no prazo: ele tem o grupo dele. Dentro de cada
 * grupo, pela tabela de pesos quando vem (`pontos`, do maior para o menor); sem ela, pelo
 * prazo, pelo dia e pelo título; os rascunhos, do mais parado ao menos.
 * Entra → sai: o índice, os sinais, as notas da Caixa de entrada, as ideias, os pontos,
 * os rascunhos e hoje → `Prateleira`.
 * Erro e ataque: tarefa sem nenhum sinal de triagem fica fora; nota repetida entra uma vez.
 * Prova: tests/missao/triagem.test.ts ("a prateleira").
 */
export function prateleira(
    indice: MissaoIndice,
    lista: readonly Sinal[],
    caixa: readonly NotaComCampos[],
    ideias: readonly NotaComCampos[],
    pontos: ReadonlyMap<string, number> | null = null,
    rascunhos: readonly NotaComCampos[] = [],
    hoje = '',
): Prateleira {
    const porAlvo = new Map<string, Set<TipoDeSinal>>();
    for (const s of lista) porAlvo.set(s.alvo, (porAlvo.get(s.alvo) ?? new Set()).add(s.tipo));
    const itens: ItemDaTriagem[] = [];
    for (const t of indice.vivas) {
        const tipos = porAlvo.get(t.id) ?? new Set<TipoDeSinal>();
        const naEntrada = t.aberta && t.estado?.marca === MARCA_DA_TRIAGEM;
        const vale = GRUPOS.filter(g => (g.marca ? naEntrada && g.marca === t.estado?.marca : !!g.sinal && tipos.has(g.sinal) && (!g.tipo || g.tipo === t.tipo)));
        const grupo = vale[0];
        if (!grupo) continue;
        const marcas = vale.slice(1).map(g => g.sinal).filter((s): s is TipoDeSinal => !!s);
        itens.push({ id: t.id, tipo: t.tipo, titulo: t.titulo, caminho: t.caminho, grupo: grupo.id, marcas });
    }
    const seen = new Set<string>();
    const dosRascunhos = new Set(rascunhos.filter(n => String(n.campos?.type ?? '').trim() === TIPO_DO_RASCUNHO).map(n => n.caminho));
    for (const n of caixa) {
        if (dosRascunhos.has(n.caminho)) continue;
        if (seen.has(n.caminho)) continue;
        seen.add(n.caminho);
        itens.push({ id: `n:${n.caminho}`, tipo: 'nota', titulo: n.nome, caminho: n.caminho, grupo: 'caixa-de-entrada', marcas: [] });
    }
    for (const n of rascunhos) {
        const dias = diasDoRascunho(n, hoje);
        if (dias === null || seen.has(n.caminho)) continue;
        seen.add(n.caminho);
        itens.push({ id: `n:${n.caminho}`, tipo: 'rascunho', titulo: n.nome, caminho: n.caminho, grupo: 'rascunhos', marcas: [], protocolo: String(n.campos?.protocolo ?? '').trim() || undefined, dias });
    }
    for (const n of ideias) {
        const g = grupoDaIdeia(n);
        if (!g || seen.has(n.caminho)) continue;
        seen.add(n.caminho);
        itens.push({ id: `n:${n.caminho}`, tipo: 'ideia', titulo: n.nome, caminho: n.caminho, grupo: 'ideias', marcas: [], destino: g === 'lista-de-espera' ? 'Lista de Espera' : 'sem destino' });
    }
    const record = (id: string) => indice.porId.get(id)?.record;
    const sortKey = (i: ItemDaTriagem) => {
        const r = record(i.id);
        return `${r?.due || '9999'}|${indice.porId.get(i.id)?.colocacao.dia || '9999'}|${fold(i.titulo)}`;
    };
    const order = (a: ItemDaTriagem, b: ItemDaTriagem) => {
        if (a.grupo === 'rascunhos' && b.grupo === 'rascunhos') return (b.dias ?? 0) - (a.dias ?? 0) || a.caminho.localeCompare(b.caminho);
        if (pontos) { const d = (pontos.get(b.caminho) ?? -Infinity) - (pontos.get(a.caminho) ?? -Infinity); if (d && Number.isFinite(d)) return d; }
        return sortKey(a).localeCompare(sortKey(b));
    };
    const grupos = GRUPOS.map(g => ({ id: g.id, rotulo: g.rotulo, itens: itens.filter(i => i.grupo === g.id).sort(order) }));
    return { grupos, total: itens.length };
}

/**
 * O que faz: a prateleira com as propostas do agente no grupo delas (o primeiro), e o total refeito.
 * Por quê: a proposta do Dk pessoal (02/11/2026): o que o agente propõe espera na triagem o sim de quem usa.
 * Erro e ataque: item de outro grupo não entra; a mesma proposta duas vezes entra uma vez; a prateleira
 * dada não muda (sai outra).
 * Prova: tests/missao/triagem.test.ts ("as propostas do agente").
 */
export function comPropostas(p: Prateleira, propostas: readonly ItemDaTriagem[]): Prateleira {
    const vistos = new Set<string>();
    const itens = propostas.filter(i => i.grupo === 'propostas' && !vistos.has(i.id) && !!vistos.add(i.id));
    if (!itens.length) return p;
    const grupos = p.grupos.map(g => (g.id === 'propostas' ? { ...g, itens: [...g.itens, ...itens] } : g));
    return { grupos, total: grupos.reduce((n, g) => n + g.itens.length, 0) };
}

/** Os destinos de uma ideia na triagem (o 🗂️ protocolo do destino da ideia, pré-respondido). */
export type DestinoDaIdeia = 'smart' | 'Lista de Espera' | 'Caixa de Areia' | 'Fica de fora';
/** Os destinos de uma nota da Caixa de entrada (os da triagem antiga, `panelInbox.ts`, mais "Virar tarefa"). */
export type DestinoDaCaixa = 'project' | 'resources' | 'history' | 'sidequest' | 'tarefa';

export type IntencaoDaTriagem =
    | { tipo: 'agendar'; dia: string }
    | { tipo: 'semana'; semana: string }
    | { tipo: 'escolher-dia' }
    /**
     * O pai do item (02/11, um jeito por função): o "＋ Adicionar" do campo do pai, o mesmo do painel, com as
     * notas da espécie do nó que a tecla pede (o projeto, ou a SMART; `especieDoNo`).
     */
    | { tipo: 'escolher-pai'; especie: string }
    | { tipo: 'escolher-onde' } | { tipo: 'estimar' }
    | { tipo: 'status'; status: 'someday' | 'cancelled' }
    | { tipo: 'ideia-destino'; destino: DestinoDaIdeia }
    | { tipo: 'caixa-destino'; destino: DestinoDaCaixa }
    | { tipo: 'rascunho-retomar' } | { tipo: 'rascunho-arquivar'; destino: string }
    | { tipo: 'proposta'; decisao: 'aceitar' | 'recusar' }
    | { tipo: 'abrir' } | { tipo: 'pular' } | { tipo: 'voltar' } | { tipo: 'desfazer' };

/**
 * Uma tecla da triagem: a letra (como a legenda a mostra), o que diz e a intenção que dá.
 * A intenção que depende de hoje (o dia, a semana) vem por função.
 */
export interface TeclaDaTriagem {
    tecla: string;
    rotulo: string;
    /**
     * O sentido da tecla, o mesmo em todo tipo de item (revisão de 29/10): X é sempre "sai"
     * (cancelar, arquivar, Histórico, fica de fora), L é sempre "depois" (algum dia, Lista de
     * Espera, Side Quest), A é só "amanhã". Um teste confere que nenhuma letra muda de sentido.
     */
    sentido: SentidoDaTecla;
    intencao: (hoje: string, item: Pick<ItemDaTriagem, 'caminho'>) => IntencaoDaTriagem;
}

export type SentidoDaTecla =
    | 'hoje' | 'amanha' | 'esta-semana' | 'proxima-semana' | 'escolher-dia' | 'projeto' | 'smart' | 'onde' | 'estimativa'
    | 'depois' | 'sai' | 'areia' | 'recursos' | 'tarefa' | 'retomar' | 'aceitar';

const T = (tecla: string, rotulo: string, sentido: SentidoDaTecla, intencao: TeclaDaTriagem['intencao']): TeclaDaTriagem => ({ tecla, rotulo, sentido, intencao });
const semanaDe = (hoje: string) => chaveDeHoje('semana', hoje);
const TECLA_DIA = {
    h: T('H', 'hoje', 'hoje', hoje => ({ tipo: 'agendar', dia: hoje })),
    a: T('A', 'amanhã', 'amanha', hoje => ({ tipo: 'agendar', dia: addDays(hoje, 1) })),
    s: T('S', 'esta semana', 'esta-semana', hoje => ({ tipo: 'semana', semana: semanaDe(hoje) })),
    p: T('P', 'próxima semana', 'proxima-semana', hoje => ({ tipo: 'semana', semana: addWeeks(semanaDe(hoje), 1) })),
    d: T('D', 'escolher o dia', 'escolher-dia', () => ({ tipo: 'escolher-dia' })),
    j: T('J', 'projeto…', 'projeto', () => ({ tipo: 'escolher-pai', especie: 'projeto' })),
    m: T('M', 'SMART…', 'smart', () => ({ tipo: 'escolher-pai', especie: 'smart' })),
    o: T('O', 'onde', 'onde', () => ({ tipo: 'escolher-onde' })),
    e: T('E', 'estimativa', 'estimativa', () => ({ tipo: 'estimar' })),
    l: T('L', 'algum dia', 'depois', () => ({ tipo: 'status', status: 'someday' })),
    x: T('X', 'cancelar', 'sai', () => ({ tipo: 'status', status: 'cancelled' })),
};

/** As teclas da ideia: cada uma leva ao 🗂️ destino da ideia, pré-respondido (o papel `destino_da_ideia`). */
const TECLAS_DO_DESTINO_DA_IDEIA: readonly TeclaDaTriagem[] = [
    T('M', 'peça de uma SMART', 'smart', () => ({ tipo: 'ideia-destino', destino: 'smart' })),
    T('L', 'Lista de Espera', 'depois', () => ({ tipo: 'ideia-destino', destino: 'Lista de Espera' })),
    T('C', 'Caixa de Areia', 'areia', () => ({ tipo: 'ideia-destino', destino: 'Caixa de Areia' })),
    T('X', 'fica de fora', 'sai', () => ({ tipo: 'ideia-destino', destino: 'Fica de fora' })),
];

/**
 * As teclas de cada tipo de item, na ordem da legenda (8.6: "na triagem as teclas mudam, e
 * a legenda diz quais"). A SMART não tem dia, mãe, "onde" nem estimativa (convencoes.md:
 * ela é da semana); a ideia vai pelo 🗂️; a nota da Caixa, pelos destinos da triagem antiga;
 * o rascunho parado, retomar ou arquivar.
 */
export const TECLAS_POR_TIPO: Readonly<Record<ItemDaTriagem['tipo'], readonly TeclaDaTriagem[]>> = {
    acao: [TECLA_DIA.h, TECLA_DIA.a, TECLA_DIA.s, TECLA_DIA.p, TECLA_DIA.d, TECLA_DIA.j, TECLA_DIA.m, TECLA_DIA.o, TECLA_DIA.e, TECLA_DIA.l, TECLA_DIA.x],
    smart: [TECLA_DIA.s, TECLA_DIA.p, TECLA_DIA.j, TECLA_DIA.l, TECLA_DIA.x],
    ideia: TECLAS_DO_DESTINO_DA_IDEIA,
    nota: [
        T('J', 'pasta de um projeto…', 'projeto', () => ({ tipo: 'caixa-destino', destino: 'project' })),
        T('R', 'Recursos…', 'recursos', () => ({ tipo: 'caixa-destino', destino: 'resources' })),
        T('X', 'Histórico (900 - ARCHIVE)', 'sai', () => ({ tipo: 'caixa-destino', destino: 'history' })),
        T('L', 'Side Quest (tarefa algum dia)', 'depois', () => ({ tipo: 'caixa-destino', destino: 'sidequest' })),
        T('T', 'virar tarefa', 'tarefa', () => ({ tipo: 'caixa-destino', destino: 'tarefa' })),
    ],
    rascunho: [
        T('V', 'retomar', 'retomar', (_h, item) => acoesDoRascunho(item)[0]),
        T('X', 'arquivar', 'sai', (_h, item) => acoesDoRascunho(item)[1]),
    ],
    // A proposta do agente: Y aceita (a gravação das setas, com o Desfazer); X recusa (sai).
    proposta: [
        T('Y', 'aceitar', 'aceitar', () => ({ tipo: 'proposta', decisao: 'aceitar' })),
        T('X', 'recusar', 'sai', () => ({ tipo: 'proposta', decisao: 'recusar' })),
    ],
};

/** As teclas de andar e de desfazer, iguais para todo item. */
export const TECLAS_DE_ANDAR: ReadonlyArray<[string, string]> = [
    ['Enter', 'abre no painel'], ['→', 'pula'], ['←', 'volta'], ['⌘Z', 'desfaz'], ['Esc', 'fecha a triagem'],
];

/** As teclas do rascunho parado, para a legenda (a triagem troca as teclas pelo tipo do item). */
export const TECLAS_DO_RASCUNHO: ReadonlyArray<[string, string]> = [
    ...TECLAS_POR_TIPO.rascunho.map(t => [t.tecla, t.rotulo] as [string, string]), ['Enter', 'abre no painel'], ['→', 'pula'],
];

/** As teclas da triagem e o que dizem, para a legenda (as da ação). */
export const TECLAS_DA_TRIAGEM: ReadonlyArray<[string, string]> = [
    ...TECLAS_POR_TIPO.acao.map(t => [t.tecla, t.rotulo] as [string, string]),
    ['Enter', 'abre no painel'], ['→', 'pula'], ['⌘Z', 'desfaz'],
];

/**
 * O que faz: as teclas que valem para um tipo de item: as da tabela (`TECLAS_POR_TIPO`), menos as
 * que levam ao 🗂️ destino da ideia quando o cofre não tem o protocolo dele.
 * Por quê: D1 do mapa da v0: o que leva a um protocolo ausente não é oferecido (sem aviso); a
 * legenda, os botões e o teclado leem esta mesma lista.
 * Entra → sai: o tipo e se o destino da ideia tem protocolo (sem dizer, tem) → as teclas, na ordem.
 * Prova: tests/missao/triagem.test.ts ("sem o protocolo do destino da ideia").
 */
export function teclasDoTipo(tipo: ItemDaTriagem['tipo'], comDestinoDaIdeia = true): readonly TeclaDaTriagem[] {
    const todas = TECLAS_POR_TIPO[tipo] ?? [];
    return comDestinoDaIdeia ? todas : todas.filter(t => !TECLAS_DO_DESTINO_DA_IDEIA.includes(t));
}

/** O que faz: a legenda de um item: as teclas que valem para o tipo dele (`teclasDoTipo`), depois as de andar. */
export function teclasDoItem(item: Pick<ItemDaTriagem, 'tipo'>, comDestinoDaIdeia = true): Array<[string, string]> {
    return [...teclasDoTipo(item.tipo, comDestinoDaIdeia).map(t => [t.tecla, t.rotulo] as [string, string]), ...TECLAS_DE_ANDAR];
}

/**
 * O que faz: a intenção de uma tecla na triagem, para o item à vista, pelas teclas que valem
 * para o tipo dele (`teclasDoTipo`); Enter abre, → pula, ← volta, ⌘Z desfaz. Tecla que não
 * vale para o item → `null`.
 * Entra → sai: a tecla (como o evento a dá: `h`, `Enter`, `ArrowRight`), o item, hoje, se há
 * ⌘/Ctrl e se o destino da ideia tem protocolo → intenção.
 * Prova: tests/missao/triagem.test.ts ("as teclas").
 */
export function intencaoDaTecla(tecla: string, item: Pick<ItemDaTriagem, 'tipo'> & Partial<Pick<ItemDaTriagem, 'caminho'>>, hoje: string, comando = false, comDestinoDaIdeia = true): IntencaoDaTriagem | null {
    const k = String(tecla ?? '').length === 1 ? String(tecla).toLowerCase() : String(tecla ?? '');
    if (comando && k === 'z') return { tipo: 'desfazer' };
    if (comando) return null;
    if (k === 'Enter') return { tipo: 'abrir' };
    if (k === 'ArrowRight') return { tipo: 'pular' };
    if (k === 'ArrowLeft') return { tipo: 'voltar' };
    const t = teclasDoTipo(item.tipo, comDestinoDaIdeia).find(x => x.tecla.toLowerCase() === k);
    return t ? t.intencao(hoje, { caminho: item.caminho ?? '' }) : null;
}
