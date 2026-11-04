/**
 * O adaptador fino da Missão no plugin: o mesmo componente na página do Mission Control
 * e na aba própria (o canvas é o P14).
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §3.3): "os três lugares diferem só
 * num adaptador fino". Aqui fica o que é do Obsidian: o modelo pelo leitor do cofre
 * (`board.missao`, sem o snapshot), o ramo pelo arquivo, "Abrir no TaskNotes" pelo
 * editor do TaskNotes (`MissionBoard.openTask`), o tamanho pela própria vista (um
 * `ResizeObserver` no contêiner, que acompanha as barras laterais) e a versão nova do
 * cofre, que chega pelo aviso do leitor.
 *
 * Grava (P6) na página e na aba, no computador: as gravações são as do quadro
 * (`gravarDoQuadro`); no celular, nada (§9.1). O canvas (P14) não usa este adaptador.
 *
 * Nenhum método se chama open, close, load ou unload (R9).
 */
import { getLinkpath, TFile, TFolder, type App, type WorkspaceLeaf } from 'obsidian';
import { nomesDoLinkDoCache, type LigacoesDaNota } from '../conexoes';
import type { MissionBoard } from '../../board/boardPlugin';
import { filtrosPadrao } from '../filtros';
import { caminhoDoRamo, idAtualDoRamo, lerRamoPrincipal, RAMO_DE_PARTIDA, PASTA_DOS_RAMOS, type RamoPrincipal } from '../ramoPrincipal';
import { montarMissao, type AdaptadorDaMissao, type EstadoDaMissao, type GravarDaMissao, type RamoParaEscolher, type MissaoMontada } from '../view/componente';
import { canvasWritesAllowed } from '../../canvas/managedZone';
import { protocoloDaGaveta, tituloCurtoDoMotor } from './motor';
import { TASK_CONTEXTS } from '../../engine/taskContexts';
import type { OpcaoDoCampo, Vocabularios } from '../../engine/fieldModel';
import { RESOURCES_FOLDER } from '../../engine/inboxRules';
import { resourceTypeFolders } from './pastas';
import { ligarDicas, marcarDica } from '../../ui/dica';
import { hojeLocal } from './relogio';
import { rodadasNaNota } from '../protocolosDoNo';
import type { LidoDosProtocolos, ReputacaoDoNo } from '../tipos';
import { DIA } from '../formatos';
import { destinosDasParadas, esperarProtocolos, PROTOCOLOS_DOMINIO, type DayRead } from '../../engine/protocolRank';

export interface MissaoNoLugar {
    api: MissaoMontada;
    destruir(): void;
}

export interface OpcoesDoLugar {
    lugar: 'pagina' | 'aba';
    /**
     * O ramo do lugar (o bloco do canvas o escolhe, P14; a página e a aba usam o de partida, e
     * a escolhida no ⋯ vai no estado, P10b).
     */
    ramoPrincipal?: string;
    estado?: Partial<EstadoDaMissao>;
    abrirEmOutraAba?: (estado: EstadoDaMissao) => void;
    aoMudar?: (estado: EstadoDaMissao) => void;
}

/**
 * O que faz: lê o ramo do cofre (`200 - FUNCTIONS/Config/ramos/<id>.json`); o id antigo de um ramo renomeado (o
 * `antes` dele, 03/11: o Roteiros virou Criação) lê o ramo de agora.
 * Erro e ataque: arquivo que falta (e que nenhum ramo teve como id) ou não passa na forma vira erro com o
 * motivo (o componente mostra o aviso); nada é gravado.
 */
export async function lerRamoDoCofre(app: App, id: string = RAMO_DE_PARTIDA): Promise<RamoPrincipal> {
    let texto: string;
    try { texto = await app.vault.adapter.read(caminhoDoRamo(id)); } catch (e) {
        const atual = idAtualDoRamo(id, await ramosDoCofre(app));
        if (!atual || atual === id) throw e;
        texto = await app.vault.adapter.read(caminhoDoRamo(atual));
    }
    const raw = JSON.parse(texto);
    const { ramoPrincipal, problemas } = lerRamoPrincipal(raw);
    if (!ramoPrincipal) throw new Error(`o ramo ${id} não se lê: ${problemas.join('; ')}`);
    if (problemas.length) console.warn(`DFM Missão: o ramo ${id} tem problemas`, problemas);
    return ramoPrincipal;
}

/**
 * O que faz: os ramos da pasta (`Config/ramos/*.json`) que se leem, com o título de cada uma,
 * para a escolha do ⋯ (P10b).
 * Erro e ataque: o arquivo que não se lê fica de fora (com o motivo no console); a ordem é a do
 * nome, com a de partida primeiro.
 */
export async function ramosDoCofre(app: App): Promise<RamoParaEscolher[]> {
    const pasta = app.vault.getAbstractFileByPath(PASTA_DOS_RAMOS);
    const arquivos = pasta instanceof TFolder ? pasta.children.filter((f): f is TFile => f instanceof TFile && f.extension === 'json') : [];
    const out: RamoParaEscolher[] = [];
    for (const f of arquivos) {
        try {
            const { ramoPrincipal } = lerRamoPrincipal(JSON.parse(await app.vault.adapter.read(f.path)));
            if (ramoPrincipal) out.push({ id: f.basename, titulo: ramoPrincipal.titulo, ...(ramoPrincipal.descricao ? { descricao: ramoPrincipal.descricao } : {}), ...(ramoPrincipal.antes.length ? { antes: ramoPrincipal.antes } : {}) });
        } catch (e) { console.warn(`DFM Missão: o ramo ${f.path} não se lê`, e); }
    }
    return out.sort((a, b) => (a.id === RAMO_DE_PARTIDA ? -1 : b.id === RAMO_DE_PARTIDA ? 1 : a.id.localeCompare(b.id)));
}

const ROTULO_PRIORIDADE: Readonly<Record<string, string>> = {
    None: 'Nenhuma',
    Low: 'Baixa',
    Normal: 'Normal',
    High: 'Alta',
};

/**
 * O que faz: os vocabulários do catálogo do TaskNotes (o status e a prioridade, com os
 * rótulos dele) e os contextos do sistema.
 * Por quê: "a prioridade aparece e se edita pelo rótulo, não pelo valor cru" (P6); o
 * catálogo é o mesmo que o DSH confere (`dshOperatorCore.ts`, `assertCatalogValue`).
 * Erro e ataque: sem o TaskNotes, as listas ficam vazias e o campo não oferece opção.
 */
export function vocabulariosDoTaskNotes(app: App): Vocabularios {
    const tn: any = (app as any).plugins?.plugins?.tasknotes;
    const api = tn?.api;
    const ler = (nome: 'statuses' | 'priorities', chave: 'customStatuses' | 'customPriorities'): OpcaoDoCampo[] => {
        let lista: any[] = [];
        try { lista = api?.catalog?.[nome]?.() ?? []; } catch { lista = []; }
        if (!Array.isArray(lista) || !lista.length) lista = Array.isArray(tn?.settings?.[chave]) ? tn.settings[chave] : [];
        return lista.map(o => {
            const valor = String(o?.value ?? o?.id ?? '');
            const bruto = String(o?.label ?? o?.value ?? '');
            const rotulo = nome === 'priorities' ? (ROTULO_PRIORIDADE[bruto] ?? bruto) : bruto;
            return { valor, rotulo };
        }).filter(o => o.valor);
    };
    return {
        status: ler('statuses', 'customStatuses'),
        prioridade: ler('priorities', 'customPriorities'),
        contextos: TASK_CONTEXTS.map(c => ({ valor: c, rotulo: c })),
    };
}

/**
 * O que faz: as gravações que a Missão usa neste lugar: as do quadro (`board.gravacoes`, pela
 * tabela das setas e pela pilha única do Desfazer), mais o catálogo e o nome do arquivo.
 * No celular (`canvasWritesAllowed`) não há gravação: a Missão fica só leitura (§9.1).
 */
export function gravarDoQuadro(board: MissionBoard, app: App): GravarDaMissao | undefined {
    if (!canvasWritesAllowed()) return undefined;
    const g = board.gravacoes;
    const tn = () => (app as any).plugins?.plugins?.tasknotes?.settings ?? null;
    return {
        mover: (c, d, avisar) => g.mover(c, d, avisar),
        status: (c, st, avisar, rotulo) => g.status(c, st, avisar, rotulo),
        concluir: (c, avisar) => g.concluir(c, avisar),
        novaData: (c, data, aberto, algumDia, avisar) => g.novaData(c, data, aberto, algumDia, avisar),
        campo: (c, nome, valor, rotulo, avisar, mostrado) => g.campo(c, nome, valor, rotulo, avisar, mostrado),
        fazerAgora: (c, motivos) => g.fazerAgora(c, motivos),
        // Os botões do ciclo: o mesmo caminho do painel (`boardPanel`, o ▶️ e o 🌳 da navegação).
        protocolo: (id, variaveis) => void board.runProtocol(id, variaveis),
        // A gaveta do ciclo (P12b): o protocolo do botão pelo motor (o apelido resolvido, as datas explícitas).
        ciclo: { abrir: (id, datas, doBotao) => protocoloDaGaveta(id, datas, doBotao, x => board.motorDoProtocolo(x), tituloCurtoDoMotor) },
        habito: (c, dia, avisar) => board.marcarHabito(c, dia, avisar),
        // A mesma captura da Captura rápida do Mission Control (`capturarNaCaixa`).
        capturar: texto => board.capturar(texto),
        criar: (id, que) => board.criarDoNo(id, que),
        // O Novo (P8): a tarefa pelo TaskNotes (com a herança e o Desfazer); os outros tipos pelo `protocolo`.
        novo: {
            tarefa: (valores, smart, avisar) => board.novo.tarefa(valores, smart, avisar),
            noTaskNotes: (valores, smart, avisar) => board.novo.noTaskNotes(valores, smart, avisar),
            nota: (pedido, avisar) => board.novo.nota(pedido, avisar),
            // A casa no módulo (02/11): as subpastas que a pasta do módulo já tem (o `NN - Funções/`).
            subpastas: pasta => { const f = app.vault.getAbstractFileByPath(pasta); return f instanceof TFolder ? f.children.filter(c => c instanceof TFolder).map(c => c.name) : []; },
            passos: id => board.passosDoProtocolo(id),
        },
        // O registro do dia (P9): os campos de uma nota numa gravação e o "＋ O que fiz"; a nota nova do
        // "＋ Adicionar" de um campo, pelo protocolo dono, que volta quando ele termina.
        campos: (c, patch, rotulo, avisar) => g.campos(c, patch, rotulo, avisar),
        registrarFeito: registro => board.registrarFeito(registro),
        notaNova: (pedido, criada) => board.notaNova(pedido, criada),
        // A checklist da nota (29/10): só a linha do item, pela pilha única do Desfazer.
        checklist: (c, gesto, avisar) => g.checklist(c, gesto, avisar),
        // O menu de status (02/11): o arquivo do TaskNotes e a lixeira do Obsidian, pela pilha única do Desfazer.
        arquivar: (c, sim, avisar, titulo) => g.arquivar(c, sim, avisar, titulo),
        arquivada: c => board.tarefaArquivada(c),
        excluir: (c, avisar, titulo) => g.excluir(c, avisar, titulo),
        desfazer: avisar => g.desfazer(avisar),
        vocabularios: () => vocabulariosDoTaskNotes(app),
        // O TaskNotes guarda o título no nome do arquivo: trocar o título é renomear, e é dele.
        get nomeDoArquivo() { return tn()?.storeTitleInFilename === false ? null : String(tn()?.fieldMapping?.title ?? 'title'); },
        existe: nome => !!app.metadataCache.getFirstLinkpathDest(nome, ''),
        // As propostas do agente (02/11/2026): o aceite grava pelas setas ou pelo Novo, com o Desfazer.
        propostas: {
            aceitar: (id, avisar) => board.propostas.aceitar(id, avisar),
            recusar: (id, avisar) => board.propostas.recusar(id, avisar),
        },
        triagem: {
            caixa: (c, destino, pasta, avisar) => board.triagem.caixa(c, destino, pasta, avisar),
            ideia: (c, destino, smart, avisar) => board.triagem.ideia(c, destino, smart, avisar),
            arquivarRascunho: (c, avisar) => board.triagem.arquivarRascunho(c, avisar),
            retomarRascunho: (c, avisar) => board.triagem.retomarRascunho(c, avisar),
            // A escolha da pasta: a de um projeto (os da mesa) ou um tipo de Recursos que já existe.
            escolherPasta: async (destino, projetos) => {
                if (destino === 'resources') {
                    const tipos = resourceTypeFolders(app);
                    const t = await board.pick(tipos, x => x, `Tipo de recurso (${RESOURCES_FOLDER})`);
                    return t ? `${RESOURCES_FOLDER}/${t}` : null;
                }
                const p = await board.pick([...projetos], x => `${x.nome} · ${x.pasta}`, 'A pasta de qual projeto?');
                return p ? p.pasta : null;
            },
        },
    };
}

/**
 * O que faz: as ligações de uma nota no cofre, pelo cache de metadados: os links do frontmatter
 * (pela chave de cima: `projects.0` → `projects`) e os do texto, cada um com a nota que acha; e as
 * notas que apontam para ela (`resolvedLinks`), com o `type` de cada uma.
 * Por quê: P10c, as conexões do painel nas duas direções; o cache já tem tudo, nada se lê do disco.
 * Erro e ataque: a nota que não existe dá `null`; o link que não acha nota fica com o caminho `null`;
 * a nota que se aponta não conta como quem aponta.
 */
export function ligacoesNoCache(app: App, caminho: string): LigacoesDaNota | null {
    const file = app.vault.getAbstractFileByPath(caminho);
    if (!(file instanceof TFile)) return null;
    const cache = app.metadataCache.getFileCache(file);
    const acha = (link: string) => app.metadataCache.getFirstLinkpathDest(getLinkpath(link), caminho)?.path ?? null;
    const saem: LigacoesDaNota['saem'] = [
        // A propriedade com vários links num texto só ("[[A]], [[B]]", como o multiselect grava) vem do cache
        // como um link quebrado ("A]], [[B"); cada link é um nome, pela leitura única dos campos de links (02/11).
        ...(cache?.frontmatterLinks ?? []).flatMap(l => nomesDoLinkDoCache(l).map(nome => ({ chave: String(l.key ?? '').split('.')[0] || null, nome, caminho: acha(nome) }))),
        ...(cache?.links ?? []).map(l => ({ chave: null, nome: l.link, caminho: acha(l.link) })),
    ];
    const entram: LigacoesDaNota['entram'] = [];
    const resolvidos = app.metadataCache.resolvedLinks ?? {};
    for (const origem of Object.keys(resolvidos)) {
        if (origem === caminho || !resolvidos[origem]?.[caminho]) continue;
        const f = app.vault.getAbstractFileByPath(origem);
        const type = f instanceof TFile ? app.metadataCache.getFileCache(f)?.frontmatter?.type : null;
        entram.push({ caminho: origem, type: typeof type === 'string' && type.trim() ? type.trim() : null });
    }
    return { saem, entram };
}

/**
 * O que faz: o que a seção Protocolos de um nó lê (a peça 2b, 30/10): as Days que ligam a nota (pelo cache
 * de metadados) e as rodadas nelas (`rodadasNaNota`, pela regra do uso recente), os campos de cada
 * protocolo para os pesos (`nucleo.camposDosProtocolos`) e o modelo `protocolos` com os pontos
 * (`nucleo.loadDomain`), o mesmo dos routers.
 * Erro e ataque: sem o núcleo ou o gerente, os campos e a escolha ficam vazios (a ordem é a da declaração);
 * a Day que não se lê fica de fora; só lê.
 */
export async function protocolosNoCofre(app: App, caminho: string, hoje: string): Promise<LidoDosProtocolos> {
    const plugin: any = (app as any).plugins?.plugins?.['dfm-system'];
    const manager = plugin?.manager;
    const nucleo = plugin?.nucleo;
    // Logo depois de recarregar o plugin, os protocolos ainda não foram lidos: sem esperar, tudo vinha vazio e ficava guardado (02/11).
    await esperarProtocolos(manager);
    const defs: Array<{ id: string; def: unknown }> = manager?.protocols instanceof Map
        ? [...manager.protocols.entries()].map(([id, p]: [string, any]) => ({ id: String(p?.def?.id ?? id), def: p?.def })).filter(d => d.def)
        : [];
    const defOf = (id: string) => manager?.get?.(id)?.def ?? null;
    const file = app.vault.getAbstractFileByPath(caminho);
    const dias: DayRead[] = [];
    const resolvidos = app.metadataCache.resolvedLinks ?? {};
    for (const origem of Object.keys(resolvidos)) {
        if (!resolvidos[origem]?.[caminho]) continue;
        const f = app.vault.getAbstractFileByPath(origem);
        if (!(f instanceof TFile) || !DIA.test(f.basename) || f.parent?.name !== 'Day') continue;
        try { dias.push({ date: f.basename, text: await app.vault.cachedRead(f), campos: {} }); } catch (e) { /* a Day que não se lê fica de fora */ }
    }
    const rodaram = file instanceof TFile ? rodadasNaNota(dias, file.basename, defs, defOf) : {};
    let campos: Record<string, Record<string, unknown>> = {};
    let escolha: LidoDosProtocolos['escolha'] = null;
    try { if (nucleo?.camposDosProtocolos) campos = await nucleo.camposDosProtocolos(defs.map(d => d.id), defOf, hoje); } catch (e) { campos = {}; }
    try {
        const load = nucleo?.loadDomain ? await nucleo.loadDomain(PROTOCOLOS_DOMINIO) : null;
        if (load?.modelo?.escolher) escolha = { modelo: load.modelo.escolher, tabela: load.tabela ?? {} };
    } catch (e) { escolha = null; }
    // O nível da reputação de cada protocolo, citado no porquê; o grau dele desempata a ordem (02/11).
    let niveis: Record<string, string> = {};
    let graus: Record<string, number> = {};
    try { if (nucleo?.niveisDaReputacao) niveis = (await nucleo.niveisDaReputacao(defs.map(d => d.id), hoje)) || {}; } catch (e) { niveis = {}; }
    try { if (nucleo?.grausDaReputacao) graus = (await nucleo.grausDaReputacao(defs.map(d => d.id), hoje)) || {}; } catch (e) { graus = {}; }
    // As paradas do 🧭 com os destinos de cada uma: as situações do nó (o P13) só sobem o que a parada oferece.
    const destinos = destinosDasParadas(defs);
    return { campos, rodaram, escolha, niveis, graus, destinos };
}

/**
 * O que faz: a linha "Reputação" do painel do nó de uma nota (o acabamento, 30/10), pelo núcleo
 * (`nucleo.reputacaoDaNota`): o nível e o porquê, quando a nota é uma função com reputação.
 * Erro e ataque: sem o núcleo, ou a leitura que falha, `null` (o painel não mostra a linha); só lê.
 */
export async function reputacaoNoCofre(app: App, caminho: string, hoje: string): Promise<ReputacaoDoNo | null> {
    const nucleo = (app as any).plugins?.plugins?.['dfm-system']?.nucleo;
    if (!nucleo?.reputacaoDaNota) return null;
    try {
        const r = await nucleo.reputacaoDaNota(caminho, hoje);
        return r && typeof r.nivel === 'string' && typeof r.porque === 'string' ? { funcao: String(r.funcao ?? ''), nivel: r.nivel, porque: r.porque } : null;
    } catch (e) { return null; }
}

/** O tipo da vista de grafo do Obsidian (o plugin principal "graph"). */
export const VISTA_DO_GRAFO = 'graph';

/** O que abre o grafo ao lado da Missão: `abrir()` dá `false` sem o grafo; `destruir()` solta o que ficou ouvindo. */
export interface AbridorDoGrafo { abrir(): boolean; destruir(): void }

/**
 * O que faz: abre a vista de grafo do Obsidian numa aba nova, ao lado da Missão, sem trocar a aba
 * dela; quando a aba do grafo fecha, o foco volta à aba da Missão (que ficou no Sistema). Um grafo
 * aberto por aqui que ainda está aberto é mostrado de novo, em vez de abrir outro.
 * Por quê: o último nível da expansão da pinça é o grafo do Obsidian (30/10/2026); e, na última tela, a
 * pinça não dava o zoom de volta: no grafo, a pinça é do grafo, então a
 * volta é fechar a aba (⌘W), e a Missão continua ali. O comando `graph:open` abre na aba que o
 * Obsidian escolher (pode ser a da Missão), por isso a folha nova vem antes e recebe a vista.
 * Entra → sai: o app e o contêiner da Missão → `{ abrir, destruir }`; `abrir()` dá `true` quando
 * abriu ou mostrou o grafo, `false` com o plugin desligado.
 * Erro e ataque: a API interna que muda de forma dá `false` (o aviso diz onde ligar), nunca lança;
 * a vista que não abre fecha a folha nova; a Missão que já saiu do workspace não recebe o foco;
 * `destruir()` solta a escuta do layout.
 * Prova: tests/missao/lugar.test.ts ("o grafo ao lado").
 */
export function abridorDoGrafo(app: App, container: HTMLElement): AbridorDoGrafo {
    let grafo: WorkspaceLeaf | null = null;
    let missao: WorkspaceLeaf | null = null;
    let escuta: ReturnType<App['workspace']['on']> | null = null;
    const folhas = (): WorkspaceLeaf[] => { const out: WorkspaceLeaf[] = []; app.workspace.iterateAllLeaves(l => { out.push(l); }); return out; };
    const daMissao = (): WorkspaceLeaf | null => folhas().find(l => !!l.view?.containerEl?.contains?.(container)) ?? null;
    const soltar = () => { if (escuta) app.workspace.offref(escuta); escuta = null; };
    /** O grafo fechou: o foco volta à Missão, se ela ainda está no workspace. */
    const aoMudarOLayout = () => {
        if (!grafo || folhas().includes(grafo)) return;
        grafo = null;
        soltar();
        if (missao && folhas().includes(missao)) app.workspace.setActiveLeaf(missao, { focus: true });
    };
    return {
        abrir: () => {
            try {
                const plugin = (app as any).internalPlugins?.getPluginById?.(VISTA_DO_GRAFO);
                if (!plugin?.enabled) return false;
                missao = daMissao() ?? missao;
                if (grafo && folhas().includes(grafo)) { app.workspace.setActiveLeaf(grafo, { focus: true }); return true; }
                // A aba nova nasce no grupo da Missão: ela fica ativa antes, sem tirar o foco.
                if (missao) app.workspace.setActiveLeaf(missao, { focus: false });
                const nova = app.workspace.getLeaf('tab');
                if (!nova || nova === missao) return false;
                grafo = nova;
                void Promise.resolve(nova.setViewState({ type: VISTA_DO_GRAFO, active: true })).catch(() => { if (grafo === nova) grafo = null; nova.detach(); });
                if (!escuta) escuta = app.workspace.on('layout-change', aoMudarOLayout);
                return true;
            } catch (e) {
                return false;
            }
        },
        destruir: soltar,
    };
}

/**
 * O que faz: monta a Missão num contêiner do Obsidian e liga o tamanho e as versões.
 * Entra → sai: o quadro, o contêiner e as opções do lugar → { api, destruir }.
 */
export function montarNoLugar(board: MissionBoard, app: App, container: HTMLElement, opcoes: OpcoesDoLugar): MissaoNoLugar {
    const grafo = abridorDoGrafo(app, container);
    const adaptador: AdaptadorDaMissao = {
        raiz: container,
        lugar: opcoes.lugar,
        modelo: ramoPrincipal => board.missao.modelo(filtrosPadrao(opcoes.lugar), {}, ramoPrincipal ?? null),
        ramoPrincipal: id => lerRamoDoCofre(app, id || opcoes.ramoPrincipal || RAMO_DE_PARTIDA),
        ramosPrincipais: () => ramosDoCofre(app),
        abrirTarefa: path => void board.openTask(path),
        abrirNota: path => void app.workspace.openLinkText(path, '', 'tab'),
        camposDaNota: path => {
            const file = app.vault.getAbstractFileByPath(path);
            return (file instanceof TFile && app.metadataCache.getFileCache(file)?.frontmatter) || null;
        },
        // As conexões do painel do nó (P10c): o que a nota aponta e quem a aponta, pelo cache de metadados.
        ligacoesDaNota: path => ligacoesNoCache(app, path),
        // A seção Protocolos do painel (a peça 2b): as rodadas na nota e os pesos, só lidos.
        protocolosDaNota: path => protocolosNoCofre(app, path, hojeLocal()),
        // A linha "Reputação" do painel (o acabamento, 30/10): o nível e o porquê, pelo núcleo, só lidos.
        reputacaoDaNota: path => reputacaoNoCofre(app, path, hojeLocal()),
        // A checklist da tarefa (29/10): o texto da nota, só lido, pelo cache do cofre.
        textoDaNota: async path => { const f = app.vault.getAbstractFileByPath(path); return f instanceof TFile ? app.vault.cachedRead(f) : null; },
        resolverLink: (nome, de) => app.metadataCache.getFirstLinkpathDest(getLinkpath(nome), de)?.path ?? null,
        abrirEmOutraAba: opcoes.abrirEmOutraAba,
        // O último nível da expansão (30/10): a vista de grafo do próprio Obsidian, numa aba ao lado da Missão.
        abrirGrafo: () => grafo.abrir(),
        // A linha do ECH de um trimestre, pelo núcleo do plugin (só lê), para o nível Sistema.
        echDoPeriodo: async periodo => {
            const nucleo = (app as any).plugins?.plugins?.['dfm-system']?.nucleo;
            const lido = nucleo?.ech ? await nucleo.ech(periodo) : null;
            return lido && typeof lido.texto === 'string' ? lido.texto : null;
        },
        nomeDoProtocolo: id => board.nomeDoProtocolo(id),
        // D1 do mapa da v0: o botão só com protocolo; o papel pela tabela vigente do gerente.
        protocoloDoPapel: papel => board.idDoPapel(papel),
        protocoloExiste: id => board.motorDoProtocolo(id) !== null,
        aoMudar: opcoes.aoMudar,
        gravar: gravarDoQuadro(board, app),
        // Só no celular de verdade não há gravações (`canvasWritesAllowed`, pelo Platform.isMobile).
        somenteLeitura: canvasWritesAllowed() ? undefined : 'No celular é só para ver; as ações ficam no computador',
        vocabularios: () => vocabulariosDoTaskNotes(app),
    };
    const api = montarMissao(adaptador, { hoje: hojeLocal, estado: opcoes.estado, dicas: { marcar: (el, texto, o) => { marcarDica(el, texto, o); }, ligar: ligarDicas } });
    // Um quadro de animação, ou um temporizador quando a janela está em segundo plano
    // (aí o Obsidian não roda quadros, e o tamanho mudaria sem o desenho acompanhar).
    let quadro: number | null = null;
    let reserva: number | null = null;
    let tardio: number | null = null;
    const agora = () => {
        if (quadro !== null) window.cancelAnimationFrame(quadro);
        if (reserva !== null) window.clearTimeout(reserva);
        quadro = reserva = null;
        api.redimensionar();
    };
    const agendar = () => {
        if (quadro !== null) window.cancelAnimationFrame(quadro);
        if (reserva !== null) window.clearTimeout(reserva);
        if (tardio !== null) window.clearTimeout(tardio);
        quadro = window.requestAnimationFrame(agora);
        reserva = window.setTimeout(agora, 120);
        // A barra lateral abre e fecha com animação: mede de novo quando ela termina.
        tardio = window.setTimeout(() => { tardio = null; api.redimensionar(); }, 450);
    };
    const medir = new ResizeObserver(agendar);
    medir.observe(container);
    // O `resize` do workspace (abrir e fechar as barras laterais, dividir a vista) também
    // mede: com a janela em segundo plano, o ResizeObserver só avisa na próxima pintura.
    const refResize = app.workspace.on('resize', agendar);
    const desassinar = board.missao.assinar(() => void api.atualizar());
    // O nome dos protocolos (o botão do vazio de uma coluna, o passo de um sinal) só se lê depois da carga deles:
    // a Missão aberta logo depois de recarregar o plugin se redesenha quando ela termina (03/11; antes, o botão
    // mostrava o id até a primeira interação).
    let vivo = true;
    void (app as any).plugins?.plugins?.['dfm-system']?.manager?.carregado?.then?.(() => { if (vivo) void api.atualizar(); });
    return {
        api,
        destruir: () => {
            vivo = false;
            app.workspace.offref(refResize);
            grafo.destruir();
            medir.disconnect();
            if (quadro !== null) window.cancelAnimationFrame(quadro);
            if (reserva !== null) window.clearTimeout(reserva);
            if (tardio !== null) window.clearTimeout(tardio);
            desassinar();
            api.destruir();
        },
    };
}
