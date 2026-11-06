/**
 * A gaveta dos protocolos do ciclo, pura (P12b): o que o botão do ciclo abre, cada campo com o
 * valor de abertura e o porquê, o que fica para o modal, a conferência e as variáveis com que o
 * protocolo roda.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §5.5 e §5.6) e o protótipo aprovado
 * (template, 2203–2330): os botões do ciclo abrem o formulário do protocolo na gaveta larga, com
 * cada valor e o porquê dele; "Gravar" roda o protocolo pelo `run()` de sempre, com as respostas
 * do formulário (`rodadaDoFormulario`); "Abrir no protocolo" roda passo a passo, cada passo
 * aberto com o valor da gaveta (`rodadaCompleta`). O motor é um só: aqui só se monta o pedido,
 * pelas funções do formulário (`engine/protocolForm.ts`), e quem lê o cofre e grava é o motor,
 * pelo `ProtocoloDaGaveta` que o lugar dá.
 *
 * Nenhum nome de protocolo, de passo nem de ramo mora aqui: o protocolo vem do botão do ramo,
 * os passos do JSON dele, e os do topo do 📅 da tabela dos botões do ciclo (`BOTOES_DO_CICLO`).
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/gaveta.test.ts.
 */
import {
    aberturaDoCampo, BOTOES_DO_CICLO, camposComDestaque, formularioDoProtocolo, rodadaCompleta, rodadaDoFormulario, validarFormulario,
    type CampoDoFormulario, type ContextoDaRodada, type DatasDaRodada, type EstadoDoFormulario, type LeitorDoFormulario, type MotivoFora, type MotivoPulado, type RodadaDoFormulario,
} from '../engine/protocolForm';
import type { Papel } from '../engine/papeisDeProtocolo';
import { DEFINICOES_PADRAO } from '../definicoes';
import type { CicloDoPeriodo } from './ramoPrincipal';
import { DIA } from './formatos';

/** A nota criada no passo pelo motor (`JSONProtocol.criarNotaDoPasso`): as respostas do passo e a nota. */
export interface CriacaoDoPasso { respostas: Record<string, unknown>; caminho: string; criada: boolean }

/** Uma nota que o seletor do passo oferece (o nome e o caminho). */
export interface NotaCandidata { nome: string; caminho: string }

/** As opções de um passo montado com as respostas do momento. */
export interface OpcoesDoPasso {
    /** As opções das seleções e as notas do critério (`multiselect_note`, como `[[Nome]]`); `null` = as do JSON. */
    lista: string[] | null;
    /** As notas que o seletor de notas oferece (`suggest_note`); `null` = sem a leitura. */
    notas: NotaCandidata[] | null;
    /** O texto de apoio do passo montado (o `info`, com o que o motor acrescenta, como a Herança do trimestre). */
    info?: string | null;
}

/**
 * O protocolo aberto na gaveta, como o lugar o dá: as leituras do motor para a rodada (o contexto,
 * o leitor das aberturas, as opções de cada passo) e o que ele faz (rodar, guardar o rascunho,
 * criar a nota do passo). Um apelido (`redirect`) chega resolvido: `id` e `def` são os do destino,
 * e `doBotao` traz as `redirectVariables` dele.
 */
export interface ProtocoloDaGaveta {
    id: string;
    nome: string;
    descricao: string;
    def: any;
    /** As respostas que o botão já dá: as `redirectVariables` do apelido e as variáveis do ramo que não são datas. */
    doBotao: Record<string, unknown>;
    contexto: ContextoDaRodada;
    leitor: LeitorDoFormulario;
    opcoes(step: any, variaveis: Record<string, unknown>): Promise<OpcoesDoPasso>;
    /** O `run()` do protocolo, com as variáveis do formulário. */
    rodar(variaveis: Record<string, unknown>): Promise<void>;
    /** O rascunho do motor (`guardarRascunho`); `true` se escreveu. */
    rascunho(variaveis: Record<string, unknown>): Promise<boolean>;
    /**
     * O título curto que o modal sugere para a tarefa de um `askTitle` (`shortenTaskTitle`, com o
     * `titleFromNoteName`); sem a função, a gaveta não mostra o título e o modal o pergunta.
     */
    tituloCurto?(resposta: string, config: any): string;
    /** A nota que o passo cria (`criarNotaDoPasso`), com os contextos já escolhidos. */
    criarNota(passo: string, titulo: string, variaveis: Record<string, unknown>, contextos: string[]): Promise<CriacaoDoPasso | null>;
}

/** O que um botão do ciclo pede à gaveta: o protocolo, as datas da rodada, as variáveis do botão, o modo e os passos do topo. */
export interface PedidoDoCiclo {
    protocolo: string;
    datas: DatasDaRodada;
    /** As variáveis do ramo que não são datas (as respostas que o botão dá). */
    doBotao: Record<string, string>;
    modo: 'planejar' | 'revisar';
    lideres: string[];
}


/**
 * O que faz: o protocolo só roda passo a passo: algum passo dele se decide na hora, pelo motor, e não cabe num campo
 * do formulário (o passo `fila` do 🗣️ Inglês de hoje: a próxima frase da fila do dia, com o `diga` que o passo
 * seguinte mostra).
 * Por quê: 06/11, a conferência de ponta a ponta: aberto pelo painel do módulo, o 🗣️ abria a gaveta com o campo da
 * fila vazio, sem o `diga` nem a frase; só o "Abrir no protocolo" funcionava.
 * Entra → sai: o JSON do protocolo → se ele foge da gaveta.
 * Erro e ataque: o JSON sem passos fica na gaveta, como sempre.
 * Prova: tests/missao/gaveta.test.ts ("só passo a passo").
 */
export function soPassoAPasso(def: any): boolean {
    return Array.isArray(def?.steps) && def.steps.some((s: any) => s && typeof s === 'object' && s.fila);
}

/**
 * O que faz: o pedido de um botão do ciclo: o protocolo dele; o dia da rodada (o `_context_date`
 * que o ramo dá, senão hoje), a semana e o trimestre que ele fixa (`_target_week_pin`,
 * `_target_quarter_pin`), as outras variáveis como respostas; o modo e os passos do topo, pela
 * tabela dos botões do ciclo quando ela tem o mesmo emoji e o papel dela é o protocolo do botão,
 * pela tabela vigente (`idDoPapel`; sem ela, a dos padrões da v0) (senão a ponta do botão: o do começo
 * planeja, o do fim revisa).
 * Por quê: §5.3, 6, "as datas vão sempre explícitas" (a nota ativa é o painel); o passo a passo
 * de hoje roda com as variáveis do ramo, e o dia que ela não diz é o de hoje, o mesmo em que o
 * modal rodaria; §5.5, o 📅 abre com os líderes no topo (os do 📨, desde 05/11).
 * Entra → sai: o botão do período (com os valores resolvidos) e hoje → o pedido, ou `null`
 * (sem protocolo, ou o dia fora do formato).
 * Erro e ataque: o `_context_date` vazio (a prateleira) cai em hoje; o pino fora do formato vai
 * assim mesmo e a rodada diz o problema (`rodadaDoFormulario`).
 * Prova: tests/missao/gaveta.test.ts ("o pedido do botão").
 */
export function pedidoDoCiclo(
    ciclo: Pick<CicloDoPeriodo, 'emoji' | 'protocolo' | 'ponta' | 'valores'>, hoje: string,
    idDoPapel: (papel: Papel) => string | null = papel => DEFINICOES_PADRAO.protocolos_por_papel[papel],
): PedidoDoCiclo | null {
    if (!ciclo?.protocolo) return null;
    const valores = ciclo.valores ?? {};
    const dia = DIA.test(String(valores._context_date ?? '')) ? valores._context_date : hoje;
    if (!DIA.test(String(dia))) return null;
    const datas: DatasDaRodada = { dia };
    if (valores._target_week_pin) datas.semana = valores._target_week_pin;
    if (valores._target_quarter_pin) datas.trimestre = valores._target_quarter_pin;
    const doBotao: Record<string, string> = {};
    for (const [k, v] of Object.entries(valores)) if (k !== '_context_date' && k !== '_target_week_pin' && k !== '_target_quarter_pin') doBotao[k] = v;
    const tabela = BOTOES_DO_CICLO[ciclo.emoji];
    const daTabela = tabela && idDoPapel(tabela.papel) === ciclo.protocolo ? tabela : null;
    return {
        protocolo: ciclo.protocolo, datas, doBotao,
        modo: daTabela?.modo ?? (ciclo.ponta === 'inicio' ? 'planejar' : 'revisar'),
        lideres: [...(daTabela?.lideres ?? [])],
    };
}

/** As variáveis das datas da rodada (as que o motor lê para o contexto e o leitor). */
export function variaveisDasDatas(datas: DatasDaRodada): Record<string, string> {
    return {
        _context_date: datas.dia,
        ...(datas.semana ? { _target_week_pin: datas.semana } : {}),
        ...(datas.trimestre ? { _target_quarter_pin: datas.trimestre } : {}),
    };
}

/** Um campo na gaveta: o do formulário, o valor com que está, de onde veio e as opções. */
export interface CampoNaGaveta {
    campo: CampoDoFormulario;
    /** O valor de agora: o que foi digitado, senão o de abertura, senão a resposta vazia do modal; `undefined` = sem resposta. */
    valor: unknown;
    /** O porquê do valor, quando ele veio de uma fonte do passo (a nota, a sugestão declarada, o par da semana). */
    origem: string;
    /** O valor veio de uma fonte do passo e o operador ainda não o mexeu. */
    sugerido: boolean;
    /** O valor veio do botão (o apelido) e o operador ainda não o mexeu. */
    doBotao: boolean;
    opcoes: string[] | null;
    notas: NotaCandidata[] | null;
    /** O texto de apoio do passo (o do passo montado, senão o do JSON). */
    info: string | null;
}

/** O formulário na gaveta para as respostas do momento. */
export interface VistaDaGaveta {
    estado: EstadoDoFormulario;
    /** As respostas com que se grava: as digitadas, as de abertura e as vazias do modal, sem as dos passos escondidos. */
    respostas: Record<string, unknown>;
    /** Os campos do topo (os líderes do botão) e o resto, na ordem do protocolo. */
    topo: CampoNaGaveta[];
    resto: CampoNaGaveta[];
    /** Os campos sem resposta (a escolha sem padrão): o protocolo os pergunta ao gravar. */
    semResposta: string[];
    fora: Array<{ id: string; motivo: MotivoFora }>;
    pulados: Array<{ id: string; motivo: MotivoPulado }>;
    /** O título curto de cada tarefa com `askTitle`, pelo passo que a dá (`titleVar`). */
    titulos: Record<string, TituloNaGaveta>;
}

/** O título curto de uma tarefa que a gravação cria (`askTitle`): a chave da resposta (`<titleVar>_titulo`), o rótulo e o valor. */
export interface TituloNaGaveta { chave: string; rotulo: string; valor: string; sugerido: boolean }

/** O rótulo do título curto, como o modal pergunta (`titlePrompt`, senão a pergunta de sempre do motor). */
const PERGUNTA_DO_TITULO = '✍️ Nome curto para esta tarefa (Enter aceita a sugestão):';

const temValor = (v: unknown) => v !== undefined && v !== null;
const naoVazio = (v: unknown) => temValor(v) && !(typeof v === 'string' && (v.trim() === '' || v.trim() === 'Nenhum')) && !(Array.isArray(v) && !v.length);

/**
 * O que faz: o formulário na gaveta: cada campo visível com o valor de agora (o digitado; senão o
 * de abertura, pela mesma função do modal, `aberturaDoCampo`; senão a resposta vazia que o modal
 * daria), de onde veio, e as opções; as condições relidas com esses valores até ficarem paradas
 * (a resposta de um passo escondido sai, a regra do laço); os do topo e o resto.
 * Por quê: §5.5, "o porquê de cada valor", e P12a: a gaveta abre cada campo como o modal o abriria;
 * Enter no modal mantém a abertura, e gravar pela gaveta grava a mesma.
 * Entra → sai: o protocolo da gaveta, o que o operador digitou (por passo, e os `_path` das notas
 * escolhidas), as opções de cada passo e os líderes → a vista (a entrada não muda).
 * Erro e ataque: a abertura vazia não conta como valor; um passo que some e volta reabre pela
 * fonte dele; no máximo uma volta por passo (as condições não andam em círculo).
 * Prova: tests/missao/gaveta.test.ts ("os campos na gaveta").
 */
export function vistaDaGaveta(p: Pick<ProtocoloDaGaveta, 'def' | 'contexto' | 'leitor' | 'doBotao' | 'tituloCurto'>, digitadas: Record<string, unknown>, opcoes: ReadonlyMap<string, OpcoesDoPasso>, lideres: readonly string[] = []): VistaDaGaveta {
    const efetivas: Record<string, unknown> = { ...(p.doBotao ?? {}), ...(digitadas ?? {}) };
    const origens = new Map<string, { origem: string; sugerido: boolean }>();
    const passos = Array.isArray(p.def?.steps) ? p.def.steps.length : 0;
    const listaDe = (c: CampoDoFormulario) => c.opcoes ?? opcoes.get(c.id)?.lista ?? null;
    let estado = formularioDoProtocolo(p.def, efetivas, p.contexto);
    for (let volta = 0; volta <= passos; volta++) {
        let mudou = false;
        for (const campo of estado.campos) {
            if (temValor(efetivas[campo.id])) continue;
            const ab = aberturaDoCampo(p.def, campo.passo, efetivas, p.leitor, listaDe(campo));
            if (naoVazio(ab.value)) {
                efetivas[campo.id] = ab.value;
                origens.set(campo.id, { origem: ab.origem, sugerido: ab.fonte === 'defaultFrom' || ab.fonte === 'todas' });
                mudou = true;
            } else if (campo.vazio !== null) {
                efetivas[campo.id] = campo.vazio;
                mudou = true;
            }
        }
        if (!mudou) break;
        estado = formularioDoProtocolo(p.def, efetivas, p.contexto);
    }
    const respostas = { ...estado.respostas };
    // O título curto (P11, `<titleVar>_titulo`): o digitado, senão o que o modal sugeriria; vale sem perguntar.
    const titulos: Record<string, TituloNaGaveta> = {};
    for (const config of ([] as any[]).concat(p.def?.createTask ?? [])) {
        const titleVar = typeof config?.titleVar === 'string' ? config.titleVar : '';
        if (!config?.askTitle || !titleVar || !p.tituloCurto || !naoVazio(respostas[titleVar])) continue;
        const chave = `${titleVar}_titulo`;
        const digitado = Object.prototype.hasOwnProperty.call(digitadas ?? {}, chave);
        const valor = digitado ? String(digitadas[chave] ?? '') : p.tituloCurto(String(respostas[titleVar]), config);
        if (valor.trim()) respostas[chave] = valor; else delete respostas[chave];
        titulos[titleVar] = { chave, rotulo: rotuloDoPasso({ prompt: config.titlePrompt || PERGUNTA_DO_TITULO }), valor, sugerido: !digitado };
    }
    const daGaveta = (campo: CampoDoFormulario): CampoNaGaveta => {
        const digitado = Object.prototype.hasOwnProperty.call(digitadas ?? {}, campo.id);
        const o = origens.get(campo.id);
        return {
            campo, valor: respostas[campo.id], origem: o?.origem ?? '', sugerido: !digitado && !!o?.sugerido,
            doBotao: !digitado && Object.prototype.hasOwnProperty.call(p.doBotao ?? {}, campo.id),
            opcoes: listaDe(campo), notas: opcoes.get(campo.id)?.notas ?? null,
            info: opcoes.get(campo.id)?.info ?? (typeof campo.passo?.info === 'string' && campo.passo.info.trim() ? campo.passo.info : null),
        };
    };
    const { topo, resto } = camposComDestaque(estado, lideres);
    return {
        estado, respostas, topo: topo.map(daGaveta), resto: resto.map(daGaveta),
        semResposta: estado.campos.filter(c => !temValor(respostas[c.id])).map(c => c.id),
        fora: estado.fora, pulados: estado.pulados, titulos,
    };
}

/** As notas a criar no passo ao gravar: o passo, o título e os contextos escolhidos na gaveta. */
export type CriacoesPedidas = Record<string, { contextos: string[] }>;

/**
 * O que faz: as notas que a gaveta cria ao gravar: os passos de nota que deixam criar
 * (`allowCreate`), com o "criar" pedido na gaveta e um título que nenhuma candidata tem.
 * Por quê: o ▶️ "criar" (P12a, follow-up 3 do P11): a nota nasce pela função do motor, no dia da
 * rodada, e as respostas dela entram na rodada; nada nasce antes do Gravar.
 * Entra → sai: a vista e os pedidos → `[{ passo, titulo, contextos }]`, na ordem dos campos.
 * Erro e ataque: título vazio, ou o de uma candidata (a nota já existe), não cria; o passo que não
 * deixa criar, ou que saiu da vista, não cria.
 * Prova: tests/missao/gaveta.test.ts ("criar no passo").
 */
export function criacoesAoGravar(vista: VistaDaGaveta, pedidas: CriacoesPedidas): Array<{ passo: string; titulo: string; contextos: string[] }> {
    const out: Array<{ passo: string; titulo: string; contextos: string[] }> = [];
    for (const c of [...vista.topo, ...vista.resto]) {
        const pedido = pedidas?.[c.campo.id];
        if (!pedido || c.campo.tipo !== 'nota' || c.campo.passo?.allowCreate !== true) continue;
        const titulo = typeof c.valor === 'string' ? c.valor.trim() : '';
        if (!titulo || (c.notas ?? []).some(n => n.nome === titulo)) continue;
        out.push({ passo: c.campo.id, titulo, contextos: [...pedido.contextos] });
    }
    return out;
}

/**
 * O que faz: os problemas da gaveta antes de gravar: os do formulário (o obrigatório vazio, as
 * marcadas a mais), pelas funções do laço (`validarFormulario`).
 * Por quê: §10, P12b: nada se grava com um campo inválido; a mesma validação do modal.
 * Entra → sai: o protocolo e a vista → passo → aviso.
 * Prova: tests/missao/gaveta.test.ts ("a conferência").
 */
export function conferirGaveta(p: Pick<ProtocoloDaGaveta, 'def' | 'contexto'>, vista: VistaDaGaveta): Record<string, string> {
    return validarFormulario(p.def, vista.respostas, p.contexto);
}

/**
 * O que faz: as variáveis com que "Gravar" roda o protocolo: as respostas da gaveta (com as das
 * notas criadas no passo) pelo formulário do motor (`rodadaDoFormulario`, com `_respondidos` e as
 * datas explícitas).
 * Por quê: §5.3, 6: gravar é o `run()` de sempre com as respostas; o motor pergunta no modal só o
 * que ficou sem resposta ou para o modal.
 * Entra → sai: o protocolo, a vista, as respostas das notas criadas e as datas → a rodada.
 * Prova: tests/missao/gaveta.test.ts e tests/missao/componenteGaveta.test.ts (a gaveta grava o
 * mesmo que o passo a passo, nos seis do ciclo, com o topo do 📅).
 */
export function rodadaDaGaveta(p: Pick<ProtocoloDaGaveta, 'def' | 'contexto'>, vista: VistaDaGaveta, criadas: Record<string, unknown>, datas: DatasDaRodada): RodadaDoFormulario {
    return rodadaDoFormulario(p.def, { ...vista.respostas, ...(criadas ?? {}) }, datas, p.contexto);
}

/**
 * O que faz: as variáveis com que "Abrir no protocolo" roda: todo passo no modal, aberto com o
 * valor da gaveta (`rodadaCompleta`, `_valoresIniciais`), e o que o botão dá.
 * Por quê: §5.6, "Abrir no protocolo".
 * Entra → sai: o protocolo, a vista e as datas → a rodada.
 * Prova: tests/missao/gaveta.test.ts ("abrir no protocolo").
 */
export function rodadaCompletaDaGaveta(p: Pick<ProtocoloDaGaveta, 'def' | 'contexto' | 'doBotao'>, vista: VistaDaGaveta, datas: DatasDaRodada): RodadaDoFormulario {
    const r = rodadaCompleta(p.def, vista.respostas, datas, p.contexto);
    if ('problema' in r) return r;
    // As respostas do botão (o apelido) valem como no passo a passo: o destino roda com elas.
    return { variaveis: { ...(p.doBotao ?? {}), ...r.variaveis } };
}

/** O que faz: a primeira linha do texto de um passo, sem o "OPCIONAL:" da frente (o rótulo do campo). */
export function rotuloDoPasso(step: any): string {
    const primeira = String(step?.prompt ?? step?.id ?? '').split('\n')[0].trim();
    return primeira.replace(/^OPCIONAL\s*[:—–-]\s*/i, '').trim() || String(step?.id ?? '');
}

/**
 * O que faz: a descrição do protocolo em duas partes: a primeira frase (a que a gaveta mostra) e o resto (o
 * histórico, recolhido).
 * Por quê: a percorrida de 06/11: o 📹 abria com oito linhas de histórico antes do primeiro campo.
 * Entra → sai: o texto → `{ primeira, resto }`; sem ponto que feche a frase, tudo é a primeira.
 * Erro e ataque: a abreviação seguida de minúscula ("ex.: a", "p. ex.") não corta; espaços sobrando saem.
 * Prova: tests/missao/gaveta.test.ts ("a descrição recolhida").
 */
export function primeiraFrase(texto: string): { primeira: string; resto: string } {
    const t = String(texto ?? '').trim();
    const m = /^([\s\S]+?[.!?])\s+(?=[A-ZÀ-ÖØ-Þ0-9"“(«])/.exec(t);
    return m ? { primeira: m[1].trim(), resto: t.slice(m[0].length).trim() } : { primeira: t, resto: '' };
}

/**
 * O que faz: os campos que o nó já responde, quando a gaveta abre pelo protocolo de um nó: o que o botão deu
 * (`doBotao`) e o operador não mexeu. A gaveta não os desenha; o nó é o contexto, e a linha "Do nó" os nomeia.
 * Por quê: a percorrida de 06/11: o 📹 aberto pela peça perguntava a peça de novo, e o 🔎 da pesquisa, a tarefa.
 * Entra → sai: a vista → os campos respondidos pelo nó, na ordem do protocolo.
 * Prova: tests/missao/gaveta.test.ts ("o gesto curto do nó").
 */
export function respondidosPeloNo(vista: VistaDaGaveta): CampoNaGaveta[] {
    return [...vista.topo, ...vista.resto].filter(c => c.doBotao && naoVazio(c.valor));
}

/** O que faz: quantos campos do resto têm valor e quantos deles vieram de uma sugestão (o resumo da parte recolhida do 📅). */
export function resumoDoResto(vista: VistaDaGaveta): { campos: number; preenchidos: number; sugeridos: number } {
    return {
        campos: vista.resto.length,
        preenchidos: vista.resto.filter(c => naoVazio(c.valor)).length,
        sugeridos: vista.resto.filter(c => c.sugerido && naoVazio(c.valor)).length,
    };
}

/** O que faz: a chave do rascunho em memória de um botão num período (o mesmo botão no mesmo período volta com o que estava). */
export function chaveDoRascunho(ciclo: Pick<CicloDoPeriodo, 'escala' | 'chave' | 'emoji' | 'protocolo'>): string {
    return `${ciclo.escala}|${ciclo.chave}|${ciclo.emoji}|${ciclo.protocolo}`;
}
