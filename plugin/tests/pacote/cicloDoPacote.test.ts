/**
 * Os três protocolos do ciclo do pacote (🌳 planejar a semana, 📅 revisar a semana, 🧭 planejar
 * o trimestre), a carga do de inicialização (a rodada dele está em `inicializacaoDoPacote.test.ts`)
 * e o ramo Criação com o modelo da peça, lidos e rodados pelo próprio plugin.
 *
 * Por quê: os protocolos, o ramo e o modelo do pacote são escritos no repositório
 * (`cofre-modelo/`), e não saem do cofre de origem; esta prova é deles. Ela confere que:
 * - o gerente de protocolos (`ProtocolManager`) carrega os três sem falha e que o papel de cada
 *   um, pelas definições de partida (`config-padrao/definicoes.padrao.json`), acha o protocolo;
 * - uma rodada de cada um, com respostas fixas, grava os campos que as notas-modelo do pacote
 *   leem, na nota da semana, na revisão e na nota do trimestre de um cofre de exemplo;
 * - o ramo e o modelo de tipo passam pelos leitores do plugin (`lerRamoPrincipal`,
 *   `parseDomainModel`) sem problema, com as mesmas colunas, estados e formatos do cofre de
 *   origem quando ele está ao lado.
 *
 * Onde roda: no pacote, com o plugin inteiro em `plugin/` e `cofre-modelo/` ao lado (a pasta
 * `pacote` dos testes). Sem `cofre-modelo/` ao lado, o arquivo inteiro fica de fora.
 *
 * O cofre falso é o do `cofre-exemplo/` (uma pessoa inventada), mais uma SMART sem semana, uma
 * tarefa dela e um valor das relações; o relógio fica parado na sexta-feira 2026-03-06.
 */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import * as momentNs from 'moment';

vi.mock('obsidian', () => import('../fixtures/obsidianFalso'));

import { TFile } from 'obsidian';
import { JSONProtocol, ProtocolManager } from '../../src/engine/jsonProtocol';
import { parseDomainModel } from '../../src/engine/domainModel';
import { lerRamoPrincipal } from '../../src/missao/ramoPrincipal';
import { NowTreeService } from '../../src/engine/nowTreeService';
import { DEFAULT_SETTINGS } from '../../src/settings';

const moment: any = (momentNs as any).default ?? momentNs;
const RAIZ = join(__dirname, '..', '..', '..');
const MODELO = join(RAIZ, 'cofre-modelo');
const EXEMPLO = join(RAIZ, 'cofre-exemplo');
const PADRAO = join(RAIZ, 'config-padrao', 'definicoes.padrao.json');
const PROTOCOLOS = '200 - FUNCTIONS/Protocolos';
const DO_CICLO = ['planejamento_semanal', 'review_semanal', 'planejamento_trimestral', 'inicializacao'];
// os outros protocolos do pacote: a conferência da pesquisa e os três gestos do módulo de aprendizado
const IDS = [...DO_CICLO, 'conferir_pesquisa', 'ingles_de_hoje', 'frase_nova', 'construir_ideia'];
const noPacote = existsSync(join(MODELO, PROTOCOLOS));

/* ------------------------------------------------------------------ o frontmatter */

function valorYaml(bruto: string): unknown {
    const v = bruto.trim();
    if (v === '') return null;
    if (v === 'true' || v === 'false') return v === 'true';
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if (v.startsWith('"') && v.endsWith('"')) { try { return JSON.parse(v); } catch { return v.slice(1, -1); } }
    if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
    if (v.startsWith('[') && v.endsWith(']')) { try { return JSON.parse(v); } catch { return v.slice(1, -1).split(',').map(s => valorYaml(s)).filter(s => s !== null); } }
    return v;
}

/** O frontmatter de um texto: escalares e listas (em bloco e em linha), o bastante para o motor. */
function lerFrontmatter(texto: string): Record<string, unknown> | null {
    const m = String(texto ?? '').match(/^---\n([\s\S]*?)\n---/);
    if (!m) return null;
    const fm: Record<string, unknown> = {};
    let ultima = '';
    for (const linha of m[1].split('\n')) {
        const item = linha.match(/^\s+-\s*(.*)$/);
        if (item && ultima) {
            const lista = Array.isArray(fm[ultima]) ? fm[ultima] as unknown[] : [];
            const v = valorYaml(item[1]);
            if (v !== null) lista.push(v);
            fm[ultima] = lista;
            continue;
        }
        const kv = linha.match(/^([^\s:#][^:]*):(?:\s(.*))?$/);
        if (!kv) continue;
        ultima = kv[1].trim();
        fm[ultima] = valorYaml(kv[2] ?? '');
    }
    return fm;
}

const escalar = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'string' ? JSON.stringify(v) : String(v));
function comFrontmatter(texto: string, fm: Record<string, unknown>): string {
    const linhas: string[] = [];
    for (const [k, v] of Object.entries(fm)) {
        if (Array.isArray(v)) { linhas.push(`${k}:`); for (const item of v) linhas.push(`  - ${escalar(item)}`); }
        else linhas.push(`${k}: ${escalar(v)}`.replace(/ $/, ''));
    }
    return `---\n${linhas.join('\n')}\n---\n${String(texto ?? '').replace(/^---\n[\s\S]*?\n---\n?/, '')}`;
}

/* ------------------------------------------------------------------ o cofre falso */

function arquivosDe(pasta: string): Record<string, string> {
    const out: Record<string, string> = {};
    const andar = (dir: string) => {
        for (const nome of readdirSync(dir)) {
            const p = join(dir, nome);
            if (statSync(p).isDirectory()) andar(p);
            else if (/\.(md|json)$/.test(nome)) out[relative(pasta, p).split(sep).join('/')] = readFileSync(p, 'utf8');
        }
    };
    andar(pasta);
    return out;
}

const nota = (fm: string[], titulo: string) => ['---', ...fm, '---', `# ${titulo}`, ''].join('\n');

/** O cofre de partida: o esqueleto, o exemplo e as notas a mais desta prova. */
function cofreDeExemplo(): Record<string, string> {
    return {
        ...arquivosDe(MODELO),
        ...arquivosDe(EXEMPLO),
        'TaskNotes/Tasks/Montar a página de contato.md': nota(['type: tarefa_smart', 'title: Montar a página de contato', 'status: next-action', 'impacto: 6', 'projects:', '  - "[[Portfólio novo]]"'], 'Montar a página de contato'),
        'TaskNotes/Tasks/Escrever o texto da página de contato.md': nota(['type: task', 'title: Escrever o texto da página de contato', 'status: next-action', 'projects:', '  - "[[Montar a página de contato]]"'], 'Escrever o texto da página de contato'),
        '400 - MEMORY/Valores/Gentileza.md': nota(['type: valor', 'ordem: 2', 'grupo: relacional'], 'Gentileza'),
    };
}

interface Rodada {
    id: string;
    respostas: Record<string, string | string[]>;
    iniciais?: Record<string, unknown>;
    ativa?: string;
    cofre?: Record<string, string>;
}

/**
 * O que faz: roda o protocolo do pacote de verdade (`JSONProtocol.run`) num cofre em memória,
 * com as respostas por id do passo, e devolve os arquivos do fim e as perguntas feitas.
 * Só o cofre, os modais e os serviços do plugin são falsos.
 */
async function rodar(r: Rodada): Promise<{ arquivos: Map<string, string>; perguntas: string[]; avisos: string[] }> {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'], now: new Date(2026, 2, 6, 10, 0, 0) });
    (globalThis as any).window = { moment };
    const def = JSON.parse(readFileSync(join(MODELO, PROTOCOLOS, `${r.id}.json`), 'utf8'));
    const textos = new Map<string, string>(Object.entries({ ...cofreDeExemplo(), ...(r.cofre ?? {}) }));
    const pastas = new Set<string>();
    const arquivos = new Map<string, any>();
    const perguntas: string[] = [];
    const avisos: string[] = [];
    let mtime = 1;
    const novo = (path: string) => {
        const name = path.split('/').pop()!;
        const dot = name.lastIndexOf('.');
        const parentPath = path.split('/').slice(0, -1).join('/');
        const f = Object.assign(new (TFile as any)(), {
            path, name, basename: dot > 0 ? name.slice(0, dot) : name, extension: dot > 0 ? name.slice(dot + 1) : '',
            parent: { path: parentPath, name: parentPath.split('/').pop() ?? '' }, stat: { mtime: mtime++ * 1000, ctime: 0, size: 0 },
        });
        arquivos.set(path, f);
        for (let d = parentPath; d; d = d.split('/').slice(0, -1).join('/')) pastas.add(d);
        return f;
    };
    for (const p of textos.keys()) novo(p);
    const app: any = {
        vault: {
            getAbstractFileByPath: (p: string) => arquivos.get(p) ?? (pastas.has(p) ? { path: p, name: p.split('/').pop(), children: [] } : null),
            getMarkdownFiles: () => [...arquivos.values()].filter(f => f.extension === 'md').sort((a, b) => (a.path < b.path ? -1 : 1)),
            getFiles: () => [...arquivos.values()],
            read: async (f: any) => textos.get(f.path) ?? '',
            cachedRead: async (f: any) => textos.get(f.path) ?? '',
            create: async (p: string, c: string) => { if (arquivos.has(p)) throw new Error('File already exists.'); textos.set(p, c); return novo(p); },
            modify: async (f: any, c: string) => { textos.set(f.path, c); },
            createFolder: async (p: string) => { pastas.add(p); },
            adapter: {
                read: async (p: string) => { if (textos.has(p)) return textos.get(p)!; throw new Error(`sem arquivo: ${p}`); },
                exists: async (p: string) => textos.has(p) || pastas.has(p),
            },
        },
        metadataCache: {
            getFileCache: (f: any) => (f?.path && textos.has(f.path) ? { frontmatter: lerFrontmatter(textos.get(f.path)!) ?? undefined, tags: [] } : null),
            getFirstLinkpathDest: (n: string) => [...arquivos.values()].find(f => f.basename === String(n).split('|')[0].replace(/\.md$/, '')) ?? null,
        },
        fileManager: {
            processFrontMatter: async (f: any, fn: (fm: any) => void) => {
                if (f.path.startsWith('200 - FUNCTIONS/Models/')) throw new Error('o modelo não se grava');
                const fm: any = lerFrontmatter(textos.get(f.path) ?? '') ?? {};
                fn(fm);
                textos.set(f.path, comFrontmatter(textos.get(f.path) ?? '', fm));
            },
        },
        workspace: {
            getActiveFile: () => (r.ativa ? arquivos.get(r.ativa) ?? null : null),
            getLeaf: () => ({ openFile: async () => undefined }),
            trigger: () => undefined,
        },
    };
    const plugin: any = {
        app,
        settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
        manager: { get: () => null },
        habitLog: { logHabit: async () => undefined },
        createDailyNote: async () => null,
        logToDailyTimeline: async () => undefined,
        updateDailyCommandFields: async () => true,
        nucleo: {
            parDaSemana: async (semana: string) => ({ padrao: { valor: 'Curiosidade', relacao: 'Gentileza' }, daNota: {}, semana }),
            loadDomain: async () => ({ modelo: null, problemas: [] }),
            camposDosProtocolos: async () => ({}),
            contextOf: () => ({}),
        },
    };
    plugin.nowTree = new NowTreeService(plugin);
    const protocolo: any = new JSONProtocol(plugin, def);
    const passos: any[] = def.steps;
    const passoDe = (texto: string) => passos.filter(s => typeof s.prompt === 'string' && String(texto ?? '').startsWith(s.prompt))
        .sort((a, b) => b.prompt.length - a.prompt.length)[0]?.id ?? null;
    const resposta = (texto: string) => { const id = passoDe(texto); perguntas.push(id ?? texto); return id ? r.respostas[id] : undefined; };
    const opcao = (opcoes: string[], v: string) => opcoes.find(o => o === v) ?? opcoes.find(o => o.includes(v)) ?? v;
    protocolo.prompt = async (texto: string, _p: string, _b = false, inicial?: string) => {
        const v = resposta(texto);
        return { status: 'submit', value: typeof v === 'string' ? v : (inicial ?? '') };
    };
    protocolo.promptTextarea = protocolo.prompt;
    protocolo.suggest = async (opcoes: any[], texto: string, _b = false, _i?: string, _n?: any, padrao?: string) => {
        const v = resposta(texto);
        return { status: 'submit', value: typeof v === 'string' ? opcao(opcoes, v) : (padrao ?? opcoes[0]) };
    };
    protocolo.multiSelect = async (opcoes: any[], texto: string, _b = false, inicial?: string) => {
        const v = resposta(texto);
        const marcadas = Array.isArray(v) ? v.map(x => opcao(opcoes, x)) : null;
        return { status: 'submit', value: marcadas ? (marcadas.join(', ') || 'Nenhum') : (inicial || 'Nenhum') };
    };
    // O seletor de notas de verdade (`NoteSuggester`): escolhe a nota pelo nome dado, ou pula.
    (globalThis as any).__abrirSeletor = (modal: any) => {
        const v = resposta(modal.stepPrompt);
        const lista = modal.getSuggestions('');
        const escolha = typeof v === 'string'
            ? lista.find((s: any) => s?.basename === v) ?? null
            : lista.find((s: any) => s?.isSkip) ?? null;
        if (escolha) modal.onChooseSuggestion(escolha, {} as any);
        else modal.onClose();
    };
    (globalThis as any).__aviso = (t: string) => avisos.push(t);
    (globalThis as any).__abrirModal = () => undefined;
    try {
        await protocolo.run(r.iniciais ?? {});
        vi.runAllTimers();
    } finally {
        vi.useRealTimers();
        delete (globalThis as any).__abrirSeletor;
        delete (globalThis as any).__aviso;
        delete (globalThis as any).__abrirModal;
    }
    return { arquivos: textos, perguntas, avisos };
}

const fm = (arquivos: Map<string, string>, p: string) => lerFrontmatter(arquivos.get(p) ?? '') ?? {};
const WEEK = '300 - RUNTIME/302 - Daymiss/Week';

afterEach(() => vi.useRealTimers());

/* ------------------------------------------------------------------ a carga */

describe.skipIf(!noPacote)('os protocolos do ciclo do pacote', () => {
    it('o gerente de protocolos carrega todos, sem falha, e cada papel do ciclo e a inicialização acham o seu', async () => {
        const pasta = { path: PROTOCOLOS, name: 'Protocolos', children: [] as any[] };
        const textos = new Map<string, string>();
        for (const nome of readdirSync(join(MODELO, PROTOCOLOS)).filter(n => n.endsWith('.json'))) {
            const path = `${PROTOCOLOS}/${nome}`;
            textos.set(path, readFileSync(join(MODELO, PROTOCOLOS, nome), 'utf8'));
            pasta.children.push({ path, name: nome, extension: 'json' });
        }
        const definicoes = JSON.parse(readFileSync(PADRAO, 'utf8'));
        const plugin: any = {
            app: { vault: { getAbstractFileByPath: (p: string) => (p === PROTOCOLOS ? pasta : null), read: async (f: any) => textos.get(f.path) ?? '' } },
            settings: { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), definicoes },
        };
        const manager = new ProtocolManager(plugin);
        await manager.loadProtocols();
        expect(manager.failures).toEqual([]);
        expect([...manager.protocols.keys()].sort()).toEqual([...IDS].sort());
        expect(manager.idDoPapel('planejar_semana' as any)).toBe('planejamento_semanal');
        expect(manager.idDoPapel('revisar_semana' as any)).toBe('review_semanal');
        expect(manager.idDoPapel('planejar_trimestre' as any)).toBe('planejamento_trimestral');
        expect(manager.idDoPapel('inicializar' as any)).toBe('inicializacao');
        // O papel sem protocolo no pacote some (o botão não aparece).
        expect(manager.idDoPapel('revisar_trimestre' as any)).toBeNull();
    });

    it('cada passo tem id único, pergunta e um tipo que o motor conhece', () => {
        const TIPOS = new Set(['text', 'textarea', 'select', 'suggest', 'multiselect', 'suggest_note', 'multiselect_note']);
        for (const id of IDS) {
            const def = JSON.parse(readFileSync(join(MODELO, PROTOCOLOS, `${id}.json`), 'utf8'));
            const ids = def.steps.map((s: any) => s.id);
            expect(new Set(ids).size, id).toBe(ids.length);
            for (const s of def.steps) {
                expect(TIPOS.has(s.type), `${id}.${s.id}`).toBe(true);
                expect(String(s.prompt ?? '').trim(), `${id}.${s.id}`).not.toBe('');
            }
        }
    });
});

/* ------------------------------------------------------------------ as rodadas */

describe.skipIf(!noPacote)('uma rodada de cada protocolo grava os campos que as notas-modelo leem', () => {
    it('🌳 cria a semana que vem pelo modelo, com a direção, o par de valores e o que fica de fora, e põe a semana na SMART e na tarefa', async () => {
        const revisao = '400 - MEMORY/200 - WEEKLY/2026-W10 - Review.md';
        const { arquivos } = await rodar({
            id: 'planejamento_semanal',
            cofre: { [revisao]: nota(['type: review_weekly', 'week: 2026-W10', 'ajuste_minimo: "Começar a semana pela página de contato"'], 'Revisão') },
            respostas: {
                valor_semana: 'Curiosidade',
                valor_relacao: 'Gentileza',
                smart_semana: ['Montar a página de contato'],
                tarefas_semana: ['Escrever o texto da página de contato'],
                lista_nao: 'Nenhuma encomenda nova até sexta',
            },
        });
        const semana = fm(arquivos, `${WEEK}/2026-W11.md`);
        expect(semana.type).toBe('weekly_note');
        expect(semana.week).toBe('2026-W11');
        expect(semana.quarter).toBe('2026-Q1');
        expect(semana.status).toBe('open');
        // Sem resposta própria, a direção abre com o ajuste da revisão da semana que passou.
        expect(semana.direcao).toBe('Começar a semana pela página de contato');
        expect(semana.valor_semana).toBe('[[Curiosidade]]');
        expect(semana.valor_relacao).toBe('[[Gentileza]]');
        expect(semana.lista_nao).toBe('Nenhuma encomenda nova até sexta');
        // O corpo é o da nota-modelo do pacote (o botão do 📅 no fechamento).
        expect(arquivos.get(`${WEEK}/2026-W11.md`)).toContain('id: review_semanal');
        expect(fm(arquivos, 'TaskNotes/Tasks/Montar a página de contato.md').week).toBe('2026-W11');
        expect(fm(arquivos, 'TaskNotes/Tasks/Escrever o texto da página de contato.md').week).toBe('2026-W11');
        // A SMART que já é de outra semana não muda.
        expect(fm(arquivos, 'TaskNotes/Tasks/Correr 3 km sem parar.md').week).toBe('2026-W10');
    });

    it('🌳 rodado de novo numa semana que já existe só atualiza as propriedades', async () => {
        const antes = cofreDeExemplo()[`${WEEK}/2026-W10.md`];
        const { arquivos } = await rodar({
            id: 'planejamento_semanal',
            iniciais: { _target_week_pin: '2026-W10' },
            respostas: { direcao: 'Mostrar antes de estar pronto', valor_semana: 'Curiosidade', lista_nao: 'Nada de página nova' },
        });
        const depois = arquivos.get(`${WEEK}/2026-W10.md`)!;
        const semana = lerFrontmatter(depois)!;
        expect(semana.direcao).toBe('Mostrar antes de estar pronto');
        expect(semana.lista_nao).toBe('Nada de página nova');
        // O valor das relações pulado diz o que aconteceu, e não o texto genérico do seletor.
        expect(semana.valor_relacao).toBe('nenhum nesta semana');
        // O que o 🌳 não pergunta fica como estava.
        expect(semana.foco).toBe('Pôr as três primeiras peças do portfólio no ar');
        expect(depois.replace(/^---\n[\s\S]*?\n---\n?/, '')).toBe(antes.replace(/^---\n[\s\S]*?\n---\n?/, ''));
    });

    it('📅 grava a revisão da semana, fecha a nota da semana com o feito e a mudança, e conclui a SMART marcada', async () => {
        const { arquivos } = await rodar({
            id: 'review_semanal',
            ativa: `${WEEK}/2026-W10.md`,
            respostas: {
                smart_feitas: ['Publicar três peças no portfólio'],
                fato_semana: 'Três peças no ar e dois treinos',
                travou: 'A entrega do cliente na quinta',
                licao: 'Legenda curta sai mais rápido',
                valor_vivido: 'Perguntei o que a colega entendeu da página',
                ajuste_minimo: 'Começar a semana pela página de contato',
            },
        });
        const caminho = '400 - MEMORY/200 - WEEKLY/2026-W10 - Review.md';
        const revisao = fm(arquivos, caminho);
        expect(revisao).toMatchObject({ type: 'review_weekly', week: '2026-W10', status: 'closed', fato_semana: 'Três peças no ar e dois treinos', ajuste_minimo: 'Começar a semana pela página de contato' });
        const corpo = arquivos.get(caminho)!;
        for (const trecho of ['A entrega do cliente na quinta', 'Legenda curta sai mais rápido', 'Perguntei o que a colega entendeu da página']) expect(corpo).toContain(trecho);
        const semana = fm(arquivos, `${WEEK}/2026-W10.md`);
        expect(semana).toMatchObject({ status: 'closed', fato_semana: 'Três peças no ar e dois treinos', ajuste_minimo: 'Começar a semana pela página de contato' });
        // Só os três campos vão à semana: o tipo e a data da revisão não.
        expect(semana.type).toBe('weekly_note');
        expect(fm(arquivos, 'TaskNotes/Tasks/Publicar três peças no portfólio.md').status).toBe('done');
        expect(fm(arquivos, 'TaskNotes/Tasks/Correr 3 km sem parar.md').status).toBe('next-action');
    });

    it('🧭 cria o trimestre que vem pelo modelo, com o foco, os objetivos, os valores e os marcos', async () => {
        const { arquivos } = await rodar({
            id: 'planejamento_trimestral',
            iniciais: { _target_quarter_pin: '2026-Q2' },
            respostas: {
                snapshot: 'O portfólio saiu; a corrida ficou pela metade',
                temporada: ['Portfólio novo', 'Correr 5 km'],
                objetivos: 'Doze peças no portfólio\nCorrer 5 km sem parar',
                valores: ['Curiosidade'],
                valores_relacoes: ['Gentileza'],
                marco_1_4: 'A página de contato no ar',
                marco_5_8: 'Nove peças',
                marco_9_12: 'Doze peças e os 5 km',
            },
        });
        const caminho = '300 - RUNTIME/302 - Daymiss/Quarterly/2026-Q2.md';
        const q = fm(arquivos, caminho);
        expect(q).toMatchObject({ type: 'quarterly_note', quarter: '2026-Q2', status: 'open', snapshot: 'O portfólio saiu; a corrida ficou pela metade', marco_1_4: 'A página de contato no ar', marco_5_8: 'Nove peças', marco_9_12: 'Doze peças e os 5 km' });
        expect(String(q.year)).toBe('2026');
        const nomes = (v: unknown) => (Array.isArray(v) ? v : [v]).map(x => String(x ?? '').replace(/^\[\[|\]\]$/g, ''));
        expect(nomes(q.temporada)).toEqual(['Portfólio novo', 'Correr 5 km']);
        expect(nomes(q.projetos_foco)).toEqual(['Portfólio novo', 'Correr 5 km']);
        expect(q.objetivos).toEqual(['Doze peças no portfólio', 'Correr 5 km sem parar']);
        expect(nomes(q.valores)).toEqual(['Curiosidade']);
        expect(nomes(q.valores_relacoes)).toEqual(['Gentileza']);
        expect(arquivos.get(caminho)).toContain('id: planejamento_trimestral');
    });
});

/* ------------------------------------------------------------------ o ramo e o modelo da peça */

const RAMO = join(MODELO, '200 - FUNCTIONS/Config/ramos/criacao.json');
const DOMINIOS = join(MODELO, '200 - FUNCTIONS/Config/dominios');
// O cofre de origem, quando a prova roda ao lado dele (`DK_COFRE`, o mesmo da exportação).
const ORIGEM = process.env.DK_COFRE ? join(process.env.DK_COFRE, '200 - FUNCTIONS', 'Config') : '';

describe.skipIf(!existsSync(RAMO))('o ramo Criação e o modelo da peça do pacote', () => {
    // Lidos dentro dos casos: o corpo do describe roda mesmo quando ele fica de fora.
    let ramo: any, tipoDaPeca = '', modelo: any;
    beforeAll(() => {
        ramo = JSON.parse(readFileSync(RAMO, 'utf8'));
        tipoDaPeca = ramo.novo.tipos[0].tipo as string;
        modelo = JSON.parse(readFileSync(join(DOMINIOS, `${tipoDaPeca}.json`), 'utf8'));
    });

    it('o leitor do ramo e o do modelo de tipo leem os dois sem problema', () => {
        const lido = lerRamoPrincipal(ramo);
        expect(lido.problemas).toEqual([]);
        expect(lido.ramoPrincipal?.id).toBe('criacao');
        const dominio = parseDomainModel(modelo, tipoDaPeca);
        expect(dominio.problemas).toEqual([]);
        expect(dominio.modelo?.formatos?.valores.length).toBeGreaterThan(0);
    });

    it('o canal fica neutro: um canal de exemplo, que a pessoa troca pelos seus', () => {
        const canal = modelo.campos.find((c: any) => c.nome === 'canal');
        expect(canal).toMatchObject({ tipo: 'escolha', valores: ['Canal principal'] });
    });

    it.skipIf(!ORIGEM || !existsSync(join(ORIGEM, 'ramos', 'criacao.json')))('as colunas, os estados, os formatos e os campos são os do cofre de origem', () => {
        const origemRamo = lerRamoPrincipal(JSON.parse(readFileSync(join(ORIGEM, 'ramos', 'criacao.json'), 'utf8'))).ramoPrincipal!;
        const pacoteRamo = lerRamoPrincipal(ramo).ramoPrincipal!;
        const colunas = (r: any) => [...r.trabalho, ...r.tempo].map((c: any) => c.id);
        expect(colunas(pacoteRamo)).toEqual(colunas(origemRamo));
        expect(pacoteRamo.colecoes.map(c => c.id)).toEqual(origemRamo.colecoes.map(c => c.id));
        const origemModelo = parseDomainModel(JSON.parse(readFileSync(join(ORIGEM, 'dominios', `${tipoDaPeca}.json`), 'utf8')), tipoDaPeca).modelo!;
        const pacoteModelo = parseDomainModel(modelo, tipoDaPeca).modelo!;
        expect(pacoteModelo.campos.map(c => c.nome)).toEqual(origemModelo.campos.map(c => c.nome));
        expect(pacoteModelo.estados.map((e: any) => e.valor)).toEqual(origemModelo.estados.map((e: any) => e.valor));
        expect(pacoteModelo.formatos).toEqual(origemModelo.formatos);
    });
});
