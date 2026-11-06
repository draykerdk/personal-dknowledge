/**
 * A borboleta da Missão: as linhas fechadas e abertas, as asas, os nós e as ligações, e
 * o modelo inteiro de uma versão do cofre (`modeloDaMissao`).
 *
 * Por quê: o plano (2) e a arquitetura da página Missão (27/10/2026, 3.1, 3.2 e 9.2). O
 * tempo corre na vertical; a asa esquerda é o trabalho (tarefa → SMART → projeto →
 * área), a direita o tempo (dia → semana → trimestre → visão), a coluna de lado o lugar.
 * A linha de cada nó sai só das funções únicas, as mesmas de `nucleo.formaDo*` e
 * `nucleo.cargaDoDia` (`dayGrammar`, `weekGrammar`, `quarterGrammar`, `projectProgress`
 * e `progressText`, `showGrammar` da SMART, `dayLoad` e `loadText`): a página não conta
 * nada por conta própria. Cada linha é montada uma vez por versão, quando pedida.
 *
 * Módulo puro. Prova: tests/missao/borboleta.test.ts (com a comparação com o núcleo).
 */
import { fold, progressText, projectKeys, projectProgress, smartChildren } from '../project/projectCanvasModel';
import { SMART_HORIZON, showGrammar, timeHorizon } from '../engine/showGrammar';
import { periodOfWeeks, quarterOfWeek, quarterPeriod, quarterWeeks, weekDates } from '../engine/calendario';
import { dayGrammar, dayLoad, loadText, overCapacity, parseBlockMinutes, quarterGrammar, weekGrammar, weekLoadSummary, type BlockTask } from '../engine/tarefasNoPeriodo';
import { linkNames } from '../engine/temporada';
import type { MarcaDoRamo, MissaoEntrada } from './entrada';
import { estadoDaNota, feitaPeloModelo, formaDoEstado, rotuloDoStatus, MARCA_MANUTENCAO, MODELO_ANTIGO } from './estados';
import { ehManutencao } from '../engine/taskSemantics';
import { filtrosPadrao, resolverFiltros, type ContextoDosFiltros } from './filtros';
import type { ArquivosDoNo, CamadasDoLugar, CentroDoAprendizado, Contagens, Criavel, Passagem, Faixa, FiltrosResolvidos, Ligacao, LinhaAberta, LinhaFechada, LugarDaLinha, MarcaFechada, MissaoFiltros, MissaoIndice, MissaoModelo, MissaoNo, MissaoTarefa, Papel, PessoaDaMissao, ProximaAcao, DoDia, RecorteDoRamo, Reserva, Sinal, Trecho, VisaoVigente } from './tipos';
import { familiaDe, idDaArea, idDoProjeto, indiceDaMissao, linhagemDe, noRecorteDoRamo, VISAO_ID } from './linhagem';
import { buscar } from './busca';
import { estadoInicial } from './estadoTela';
import { type EstadiaLida, datasDaPassagem, diasPorPassagem, estadiasDaCidade, estadiasDaPassagem, estadiasDasNotas, passagens as lerPassagens, faixaDoPeriodo, lugarDoDia, trechosDasPassagens } from './lugares';
import { chaveDaFonte, colecoesDaLinha, contasDaLinha, detalheDoNo, indiceDasColecoes, noDaColecaoPeloNome, noDaNota, noDoTrecho, noDoVinculo, passaNoFiltro, trechosPlanejados, type IndiceDasColecoes } from './colecoes';
import type { RamoPrincipal } from './ramoPrincipal';
import { visaoVigente } from './visao';
import { CONFIG_PADRAO, sinais as lerSinais, sinaisDasConferencias, sinaisDeCadencia, sinaisDeclarados, sinaisDosTrechos, sinaisPorAlvo, type ConfigDosSinais } from './sinais';
import { centroDoAprendizado } from './aprendizado';
import { custoDaPassagem, marcaDoDia, reserva as lerReserva, somaDoPeriodo } from './dinheiro';
import { camadasDoLugar, lugarDoNo, noDoLugarPeloNome, regrasDoLugar } from './lugarDoNo';
import { prateleira } from './triagem';
import { proximaAcaoDoProjeto } from './proximaAcao';
import { comandoDoDia, linhaDoComando } from './comandoDoDia';
import { trilhaDoModelo } from './trilha';
import { marcaDasExposicoes, marcaDoNoAr, marcaDoNoArNaSemana, marcaDoRamoNoPeriodo, type MarcaDoDia } from './marcasDoDia';
import { diasDaPessoa, linhaDaPessoa, pessoasDaPassagem, pessoasDaMissao, pessoasDoDia as pessoasNoDia, PREFIXO_DA_PESSOA } from './pessoas';
import type { WeightReason } from '../engine/decisionWeights';
import { FRASES, PAINEL } from './frases';
import {
    addWeeks, chaveDeHoje, diaComAno, chaveNaEscala, chavesDaJanela, diaDaSemana, diaMes, diasDoPeriodo, ehHoje, idDoPeriodo, pendentesDe,
    isChaveEspecial, janelaDe, linhaDe, MESES, periodoDoId, PRATELEIRAS, semanaCurta, semanasDoAno,
    type ChaveEspecial, type Escala, type Janela,
} from './tempo';
import { ehDia, marcaDePessoas, minutosTexto, textoDoCampo } from './formatos';
import { camposComApelidos, opcoesDaOutraNota } from '../engine/domainModel';
import { adicaoDoPai, campoDoAdicionar, gestoNoCampo, opcoesDeEscolher, opcoesDoCampo } from './escolher';
import { contextoDoPainel } from './painel';
import { comLigacoesPadrao, conexoesNaMemoria, conexoesPadraoDoNo, dominioDoNo, ramoDoNo } from './ramo';
import { ligacoesEntre } from './ligar';
import { linhaDoSistema } from './sistema';
import { protocolosDoNo } from './protocolosDoNo';
import { modeloDaNota } from './camposDoNo';
import { dataDoPeriodo, habitosDoCentro } from './ramoPrincipal';

export interface OpcoesDoModelo {
    versao?: number;
    filtros?: MissaoFiltros;
    contexto?: Partial<ContextoDosFiltros>;
    config?: ConfigDosSinais;
    /** Os pontos da tabela de pesos por caminho (a ordem da triagem); sem eles, a ordem do prazo. */
    pontos?: ReadonlyMap<string, number> | null;
    /** Os motivos da tabela de pesos por caminho (o "Por que agora"), da mesma conta dos pontos. */
    motivos?: ReadonlyMap<string, readonly WeightReason[]> | null;
    /**
     * O grau do nível da reputação de cada tarefa por caminho (o `grau` dos níveis de `reputacao.json`,
     * lido pelo núcleo); só desempata a ordem padrão entre pesos iguais. Hoje a tarefa não tem reputação
     * por item (só os hábitos e as funções têm): sem a chave, ou sem nível, nada muda.
     */
    grauDaReputacao?: ((caminho: string) => number | null | undefined) | null;
    /**
     * O que o ramo declara para o modelo (P10b): as coleções e o recorte das tarefas; as colunas e o
     * centro, para as ligações padrão (o nó do centro é uma coluna à parte, 30/10); sem ela, nenhum.
     */
    ramoPrincipal?: (Pick<RamoPrincipal, 'colecoes' | 'recorte'> & Partial<Pick<RamoPrincipal, 'trabalho' | 'tempo' | 'centro'>>) | null;
}

/* ------------------------------------------------------------------ textos */

/** O que faz: a data com que a tarefa aparece: o dia (com a hora), a semana quando veio por ela, ou a prateleira. */
export function dataDaTarefa(t: MissaoTarefa): string {
    const c = t.colocacao;
    if (c.lugar === 'algum-dia') return 'algum dia';
    if (!c.dia) return 'sem data';
    if (c.daSemana && c.semana) return semanaCurta(c.semana);
    return `${diaDaSemana(c.dia)} ${diaMes(c.dia)}${c.hora ? ` · ${c.hora}` : ''}`;
}

const estadoDe = (t: MissaoTarefa): MissaoNo['estado'] => (t.feita ? 'feita' : t.algumDia ? 'algum-dia' : t.deAntes ? 'pendente' : 'aberta');

/** O que faz: a carga do dia em texto, a mesma conta e o mesmo texto de `nucleo.cargaDoDia`. */
export function cargaTexto(dia: string, registros: readonly BlockTask[], blocoSagrado: unknown): string {
    const load = dayLoad(dia, registros);
    return load.actions ? loadText(load, parseBlockMinutes(blocoSagrado)).replace(/^⏱ /, '').replace('\n', ' · ') : FRASES.nadaAgendado;
}

/** O que faz: a forma do dia, a mesma de `nucleo.formaDoDia`. */
export const formaDoDia = (dia: string, registros: readonly BlockTask[]) => dayGrammar(dia, registros, FRASES.semTarefas);
/** O que faz: a forma da semana, a mesma de `nucleo.formaDaSemana`. */
export const formaDaSemana = (semana: string, registros: readonly BlockTask[]) => weekGrammar(semana, registros, FRASES.semPlanejamento);
/** O que faz: a forma do trimestre, a mesma de `nucleo.formaDoTrimestre`. */
export function formaDoTrimestre(trimestre: string, registros: readonly BlockTask[]) {
    const g = quarterGrammar(trimestre, registros);
    return g.shown ? g : { ...g, text: FRASES.semPlanejamento };
}
/** O que faz: a forma do ano (as semanas dos quatro trimestres), pela função única. */
export const formaDoAno = (ano: string, registros: readonly BlockTask[]) => showGrammar(registros, timeHorizon(periodOfWeeks(semanasDoAno(ano))), FRASES.semPlanejamento);

/* ------------------------------------------------------------------ o modelo */

/**
 * O que faz: o modelo da Missão de uma versão do cofre: o índice, os filtros resolvidos,
 * as janelas e, quando pedidas (e uma vez só), as linhas abertas e fechadas, a linhagem,
 * a busca; mais os lugares, a visão, os sinais, a triagem, a reserva e as contagens.
 * Por quê: "nada é recalculado a cada pintura" (arquitetura 11 e 9.2); a vista pede a
 * linha e recebe a mesma enquanto a versão não muda.
 * Entra → sai: a entrada lida do cofre e as opções → `MissaoModelo` (a entrada não é mutada).
 * Erro e ataque: filtro de projeto que não existe deixa a linha vazia, não quebra; chave
 * de linha desconhecida devolve a linha vazia daquela chave.
 * Prova: tests/missao/borboleta.test.ts.
 */
export function modeloDaMissao(lida: MissaoEntrada, opcoes: OpcoesDoModelo = {}): MissaoModelo {
    // Os nomes antigos dos campos (05/11: o `plataforma` da peça é lido como `destinos`): as coleções, os cartões e os
    // sinais leem as notas pelo nome de agora, sem migrar nenhuma.
    const entrada = comOsNomesAntigos(lida);
    const hoje = entrada.hoje;
    const indice = indiceDaMissao(entrada);
    const filtros = resolverFiltros(opcoes.filtros ?? filtrosPadrao('pagina'), { hoje, ...(opcoes.contexto ?? {}) });
    const registros = indice.registros as BlockTask[];
    const visiveis = indice.vivas.filter(visivelPor(indice, filtros, opcoes.ramoPrincipal?.recorte ?? null));
    const visivelIds = new Set(visiveis.map(t => t.id));

    const passagens = lerPassagens(entrada.dias, entrada.cidades);
    const visao = visaoVigente(entrada.visoes, entrada.longoPrazo);
    const notasLidas = Object.values(entrada.notasDosRamos ?? {}).flat();
    const sinais = [
        ...lerSinais(indice, entrada, hoje, opcoes.config ?? CONFIG_PADRAO),
        // O trecho fechado sem a revisão (02/11): a linhagem de viagem é a dos recortes que marcam o dia (o ✈️).
        ...sinaisDosTrechos(indice, daLinhagemMarcada(indice, entrada.marcasDosRamos ?? [])),
        // P10b: os sinais que os modelos dos tipos declaram (o prazo adiante, o limite no lugar).
        // As estadias entram também (02/11): a conferência das datas delas, declarada no modelo da estadia.
        ...sinaisDeclarados([...notasLidas, ...(entrada.estadias ?? [])], passagens, entrada.tabelas?.sinais ?? { prazos: [], limites: [] }, hoje),
        // A conferência das tarefas de pesquisa (05/11): a tag e a seção do modelo, os itens que o leitor contou.
        ...sinaisDasConferencias(indice, entrada.tabelas?.sinais?.conferencias ?? [], entrada.conferencias),
    ];
    // G6: o lugar em camadas (o país, a cidade, a passagem), pelo modelo do tipo, em qualquer ramo.
    const lugares = camadasDoLugar(passagens, entrada.cidades ?? [], entrada.paises ?? [], regrasDoLugar(entrada.tabelas?.tipos ?? [], entrada.cidades ?? []));
    const porAlvo = sinaisPorAlvo(sinais);
    const triagem = prateleira(indice, sinais, entrada.caixaDeEntrada, entrada.ideias, opcoes.pontos ?? null, entrada.rascunhos ?? [], hoje);
    const reserva = lerReserva(entrada.reserva, entrada.dias, hoje);
    const pessoas = pessoasDaMissao(entrada.pessoas ?? []);
    // As estadias (30/10): as notas do lugar onde se fica, com o estado do planejamento no cartão.
    const estadias = estadiasDasNotas(entrada.estadias ?? [], entrada.tabelas?.tipos ?? []);
    // O projeto que uma coleção mostra (02/11: as frentes dos Roteiros) é o cartão do projeto, o mesmo do mapa.
    const naColecao = new Set(Object.values(entrada.notasDosRamos ?? {}).flat().map(n => n.caminho));
    const projetosNaColecao = [...indice.projetos.values()].filter(p => p.nota && naColecao.has(p.nota))
        .map(p => [p.nota!, noDoProjeto({ indice, registros, porAlvo }, p.id, null)] as const).filter((x): x is readonly [string, MissaoNo] => !!x[1]);
    // A nota da fonte de um modelo (`dominio`, 02/11: o roteiro) leva o estado da tabela dele no cartão: o rótulo na
    // linha, no lugar do valor cru do `status`, e a forma (cheio, contorno, claro), como a estadia e a tarefa.
    const comEstado: Array<readonly [string, MissaoNo]> = [];
    for (const f of (opcoes.ramoPrincipal?.colecoes ?? []).flatMap(c => c.fontes)) {
        if (!f.dominio) continue;
        for (const n of entrada.notasDosRamos?.[chaveDaFonte(f)] ?? []) {
            const st = estadoDaNota(n.campos, entrada.tabelas?.tipos ?? []);
            if (!st || !passaNoFiltro(n, f) || comEstado.some(([c]) => c === n.caminho)) continue;
            comEstado.push([n.caminho, noDaNota(n, f, { valor: st.valor, rotulo: st.rotulo, forma: formaDoEstado(st) })]);
        }
    }
    // A contagem das coleções com `conta` (05/11, a campanha da semana): a nota feita pelo modelo do tipo dela (a peça publicada).
    const feita = (n: { campos: Record<string, unknown> }) => feitaPeloModelo(n.campos, entrada.tabelas?.tipos ?? []);
    const colecoes = indiceDasColecoes(opcoes.ramoPrincipal?.colecoes ?? [], entrada.notasDosRamos ?? {}, passagens, hoje, new Map([...comEstado, ...estadias.map(e => [e.caminho, e.no] as const), ...projetosNaColecao]), feita);
    const trechos = [...trechosDasPassagens(passagens), ...trechosPlanejados(colecoes, hoje)].sort((a, b) => a.dia.localeCompare(b.dia));
    // O limite no lugar (o visto) chega também ao nó do país da passagem (P13, 02/11): o limite é do país, e o
    // nó dele (a nota, ou o vínculo sem nota do ramo) mostra o mesmo sinal, sem contar duas vezes na triagem.
    for (const s of sinais) {
        if (s.tipo !== 'limite-no-lugar') continue;
        const pais = lugarDoNo(lugares, s.alvo)?.pais;
        const id = !pais ? null : pais.nota ? pais.id : noDoVinculo(colecoes, pais.nome)?.id ?? pais.id;
        if (id && id !== s.alvo && !(porAlvo.get(id) ?? []).includes(s)) porAlvo.set(id, [...(porAlvo.get(id) ?? []), s]);
    }
    // A cadência da semana (05/11, a campanha): só no ramo que mostra o campo dela numa coluna de vínculo (os canais da
    // Criação); o canal sem peça publicada vai ao nó dele na coluna, senão à semana. Só informa, como todo sinal.
    const vinculos = new Set((opcoes.ramoPrincipal?.colecoes ?? []).map(c => c.vinculo?.campo).filter(Boolean));
    const cadencias = (entrada.tabelas?.sinais?.cadencias ?? []).filter(c => vinculos.has(c.por));
    for (const s of sinaisDeCadencia(notasLidas, cadencias, hoje, v => noDoVinculo(colecoes, v)?.id ?? null)) {
        sinais.push(s);
        porAlvo.set(s.alvo, [...(porAlvo.get(s.alvo) ?? []), s]);
    }

    const memo = new Map<string, unknown>();
    const once = <T>(key: string, make: () => T): T => {
        if (!memo.has(key)) memo.set(key, make());
        return memo.get(key) as T;
    };

    const janela = (escala: Escala): Janela => once(`janela|${escala}`, () => {
        const keys = visiveis.map(t => chaveNaEscala(t.colocacao, escala)).filter((k): k is string => !!k);
        return janelaDe(escala, hoje, keys, filtros.recorte);
    });
    /** As tarefas visíveis por linha de cada escala, de uma vez. */
    const porLinha = (escala: Escala): Map<string, MissaoTarefa[]> => once(`porLinha|${escala}`, () => {
        const out = new Map<string, MissaoTarefa[]>();
        const j = janela(escala);
        for (const t of visiveis) {
            const k = linhaDe(t.colocacao, j);
            if (k) out.set(k, [...(out.get(k) ?? []), t]);
        }
        return out;
    });
    const chaves = (escala: Escala): string[] => once(`chaves|${escala}`, () => {
        const rows = porLinha(escala);
        return [
            ...PRATELEIRAS.filter(k => rows.has(k)),
            ...(rows.has('depois') ? ['depois'] : []),
            ...chavesDaJanela(janela(escala)),
            ...(rows.has('antes') ? ['antes'] : []),
        ];
    });

    // A próxima ação real de cada projeto (02/11): a ordem padrão do Dia (a hora, o peso, a reputação, o título), a mesma das linhas.
    const ordemDoDia = ordemPadrao('dia', opcoes.pontos ?? null, opcoes.grauDaReputacao ?? null, (a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
    const proxima = (id: string): ProximaAcao | null => once(`proxima|${id}`, () => proximaAcaoDoProjeto(indice, id, ordemDoDia));
    // O Comando do Dia e o compromisso deixado (02/11), uma vez por dia por versão.
    const doDia = (dia: string): DoDia => once(`doDia|${dia}`, () => comandoDoDia(entrada, indice, dia, hoje));
    // O centro do módulo de aprendizado (05/11): o projeto ou departamento que as notas do tipo apontam, pelo nome da nota.
    const aprendizadoDe = (id: string): CentroDoAprendizado | null => once(`aprendizado|${id}`, () => {
        const p = indice.projetos.get(id);
        return p && entrada.aprendizado?.length ? centroDoAprendizado(p.nome, entrada.aprendizado, entrada.tabelas?.tipos ?? [], hoje, entrada.novasDeHoje ?? {}) : null;
    });
    const ctx: Ctx = { entrada, indice, registros, hoje, porAlvo, passagens, visao, reserva, filtros, visivelIds, colecoes, trechos, pontos: opcoes.pontos ?? null, grauDaReputacao: opcoes.grauDaReputacao ?? null, proxima, marcasNoTempo: marcasDosRamosNoTempo(indice, entrada.marcasDosRamos ?? []), doDia, aprendizado: id => aprendizadoDe(id)?.linhaDoCartao ?? null };
    // A base dos ramos (29/10): as colunas "ligacoes": "padrao" tomam as ligações das conexões padrão dos modelos.
    const colunas = [...(opcoes.ramoPrincipal?.trabalho ?? []), ...(opcoes.ramoPrincipal?.tempo ?? [])];
    let padrao: ReturnType<typeof conexoesNaMemoria> | null = null;
    const padraoDe = (id: string) => (padrao ??= conexoesNaMemoria(modelo))(id);
    // Os hábitos do dia que o ramo mostra (03/11: o Roteiros, só o de gravar), pela escolha do centro.
    const comOsHabitosDoRamo = (l: LinhaAberta): LinhaAberta => (l.habitos.length ? { ...l, habitos: habitosDoCentro(l.habitos, opcoes.ramoPrincipal?.centro?.habitos) } : l);
    const linha = (escala: Escala, chave: string): LinhaAberta => once(`linha|${escala}|${chave}`, () => comOsHabitosDoRamo(comLigacoesPadrao(linhaAbertaDe(ctx, escala, chave, porLinha(escala).get(chave) ?? [], pendentesDe(visiveis, escala, chave, hoje)), colunas, padraoDe, opcoes.ramoPrincipal?.centro ?? null)));
    const linhaFechada = (escala: Escala, chave: string): LinhaFechada => once(`fechada|${escala}|${chave}`, () => linhaFechadaDe(ctx, escala, chave, porLinha(escala).get(chave) ?? []));
    const lugaresDosDias = (): Map<string, string[]> => once('lugaresDosDias', () => diasPorPassagem(passagens, chavesDaJanela(janela('dia')), hoje));
    const linhaDoNo = (id: string, escala: Escala): string | null => {
        const t = indice.porId.get(id);
        if (t) return linhaDe(t.colocacao, janela(escala));
        if (id.startsWith('p:')) {
            const family = familiaDe(indice, id);
            const rows = chaves(escala);
            const now = rows.indexOf(chaveDeHoje(escala, hoje));
            const cand = rows.filter(k => !isChaveEspecial(k) && (porLinha(escala).get(k) ?? []).some(x => x.projeto && family.has(x.projeto)));
            if (cand.length) return cand.sort((a, b) => Math.abs(rows.indexOf(a) - now) - Math.abs(rows.indexOf(b) - now))[0];
            return indice.projetos.get(id)?.papel !== 'fora' ? chaveDeHoje(escala, hoje) : null;
        }
        // P10b: o trecho mora no dia dele; a nota de uma coleção, no trecho de tempo que tem hoje, ou no primeiro.
        const dia = id.startsWith('r:') ? trechos.find(t => t.id === id)?.dia
            : id.startsWith('n:') ? (() => { const sp = colecoes.notas.find(n => n.no.id === id)?.spans ?? []; return (sp.find(([a, b]) => a <= hoje && hoje <= b) ? hoje : sp[0]?.[0]); })()
                : id.startsWith('l:') ? (() => { const e = passagens.find(x => x.id === id); return e ? (e.de <= hoje && (e.ate === null || hoje <= e.ate) ? hoje : e.de) : undefined; })()
                    : undefined;
        return dia ? chaveDeHoje(escala, dia) : null;
    };

    const modelo: MissaoModelo = {
        versao: opcoes.versao ?? 0,
        hoje, filtros, indice, visiveis,
        janela, chaves, linha, linhaFechada,
        linhagem: (id, escala) => once(`linhagem|${escala}|${id}`, () => linhagemDe(indice, id, janela(escala), lugaresDosDias())),
        buscar: (consulta, escala, limite = 20) => buscar({ ...indice, vivas: visiveis }, consulta, escala, janela(escala), limite),
        linhaDoNo,
        estadoInicial: () => {
            const f = filtros.filtros;
            const foco = filtros.focoChave ?? (filtros.focoNo ? linhaDoNo(filtros.focoNo, f.escala) : null);
            return estadoInicial(hoje, { escala: f.escala, foco, selecionado: filtros.focoNo, zoom: f.zoom });
        },
        passagens, visao, sinais, triagem, reserva,
        // O trecho planejado mostra os sinais da nota que o planeja (P10b).
        sinaisDoNo: id => porAlvo.get(id) ?? (id.startsWith('r:') ? porAlvo.get(`n:${trechos.find(t => t.id === id)?.nota ?? ''}`) : undefined) ?? [],
        contagens: contar(indice, sinais, passagens),
        arquivos: id => arquivosDoNo(entrada, indice, passagens, visao, id, trechos),
        criaveis: id => criaveisDoNo(id, arquivosDoNo(entrada, indice, passagens, visao, id, trechos)),
        motivos: id => { const t = indice.porId.get(id); const m = t ? opcoes.motivos?.get(t.caminho) : undefined; return m ? [...m] : null; },
        pessoas,
        pessoasDoDia: dia => pessoasNoDia(entrada.dias, dia, pessoas),
        pessoa: id => {
            const p = pessoas.find(x => x.id === id);
            return p ? { pessoa: p, dias: diasDaPessoa(entrada.dias, p.nome) } : null;
        },
        pessoasDoLugar: id => { const e = passagens.find(x => x.id === id); return e ? pessoasDaPassagem(entrada.dias, e, hoje, pessoas) : []; },
        notaDaReserva: entrada.reserva?.caminho ?? null,
        trechos,
        detalhe: id => once(`detalhe|${id}`, () => detalheDoNo(colecoes, trechos, id)),
        custoDaPassagem: id => { const e = passagens.find(x => x.id === id); return e ? custoDaPassagem(e, entrada.dias, hoje, reserva) : null; },
        // A seção Protocolos do painel (a peça 2b): o modelo do tipo da nota do nó e as datas da rodada pelo período.
        protocolosDoNo: (id, lido, camposDaNota) => {
            const nota = arquivosDoNo(entrada, indice, passagens, visao, id, trechos).nota;
            if (!nota) return [];
            const campos = camposDaNota(nota) ?? {};
            const p = periodoDoId(id);
            const dia = (p && !isChaveEspecial(p.chave) ? dataDoPeriodo(p.escala, p.chave, hoje) : null) ?? hoje;
            const datas: Record<string, string> = { _context_date: dia };
            if (p?.escala === 'semana' && !isChaveEspecial(p.chave)) datas._target_week_pin = p.chave;
            if (p?.escala === 'trimestre' && !isChaveEspecial(p.chave)) datas._target_quarter_pin = p.chave;
            const nome = nota.slice(nota.lastIndexOf('/') + 1).replace(/\.md$/, '');
            // As situações do nó (o P13): os sinais dele agora e o estado pela tabela do tipo (a coluna no projeto,
            // o status na TaskNote, o `status` da nota nos outros).
            const sinaisDoNo = (porAlvo.get(id) ?? []).map(s => ({ tipo: s.tipo, fato: s.fato }));
            const linha = indice.projetos.get(id)?.estado ?? indice.porId.get(id)?.estado ?? estadoDaNota(campos, entrada.tabelas?.tipos ?? []);
            const estado = linha ? { estado: linha.estado, rotulo: linha.rotulo } : null;
            // O módulo de aprendizado (05/11) ganha os protocolos do tipo do aprendizado (o gesto do dia, a captura): o módulo
            // especial no painel genérico, sem ramo especial.
            const doTipo = modeloDaNota(nota, campos, entrada.tabelas?.tipos ?? []);
            const centro = aprendizadoDe(id);
            const comCentro = centro && doTipo ? { ...doTipo, protocolos: [...doTipo.protocolos, ...centro.protocolos.filter(x => !doTipo.protocolos.some(y => y.id === x.id))] } : doTipo;
            return protocolosDoNo(comCentro, { nome, caminho: nota, campos, datas, sinais: sinaisDoNo, estado }, lido);
        },
        estadiasDaPassagem: id => { const e = passagens.find(x => x.id === id); return e ? estadiasDaPassagem(e, estadias, hoje).map(x => x.no) : []; },
        estadiasDaCidade: nome => estadiasDaCidade(nome, estadias).map(x => x.no),
        noDaNota: caminho => once('porCaminho', () => nosPorCaminho(entrada, indice, passagens, visao, colecoes, pessoas, lugares)).get(caminho) ?? null,
        // O vínculo do ramo primeiro (o nó que ele mostra); senão o lugar, em qualquer ramo (G6).
        noDoNome: nome => { const n = noDoVinculo(colecoes, nome) ?? noDaColecaoPeloNome(colecoes, nome); return n ? { id: n.id, titulo: n.titulo } : noDoLugarPeloNome(lugares, nome); },
        // O país sem nota leva o id do vínculo do ramo quando ela o mostra (o mesmo nó da grade).
        lugarDoNo: id => {
            const l = lugarDoNo(lugares, id);
            const v = l?.pais && !l.pais.nota ? noDoVinculo(colecoes, l.pais.nome) : null;
            return l && v ? { ...l, pais: { ...l.pais!, id: v.id } } : l;
        },
        // O "Escolher uma que já existe" e o "＋ Adicionar" de um campo (escolher.ts), compostos sobre este modelo:
        // a vista os recebe prontos, como o buscar.
        opcoesDeEscolher: (escolha, tipo, origem, leitor, texto, limite) => opcoesDeEscolher(modelo, escolha, tipo, origem, leitor, texto, limite),
        opcoesDoCampo: (adicao, leitor, texto, limite, alvo) => opcoesDoCampo(modelo, adicao, leitor, texto, limite, alvo),
        gestoNoCampo: (adicao, campo, fm, nota) => gestoNoCampo(modelo, adicao, campo, fm, nota),
        campoDoAdicionar: (adicao, leitor) => campoDoAdicionar(adicao, leitor),
        adicaoDoPai: (no, especie, leitor) => adicaoDoPai(modelo, no, especie, leitor),
        ligacoesEntre: (de, para, leitor) => ligacoesEntre(modelo, de, para, leitor),
        // Os nós do painel do nó, pelo contexto que painel.ts compõe do modelo: a vista os recebe prontos.
        noDaTarefaNoPainel: t => noDaTarefa(contextoDoPainel(modelo), t),
        noDoProjetoNoPainel: (id, periodo) => noDoProjeto(contextoDoPainel(modelo), id, periodo),
        // O ramo de um nó (a pinça): ramo.ts compõe sobre este modelo, e a vista o recebe pronto.
        ramo: (id, profundidade, leitor, expansao) => ramoDoNo(modelo, id, profundidade, leitor, expansao),
        // A ordem padrão (02/11) com os pontos e os graus desta versão, para as candidatas do "＋ Adicionar".
        ordemDasTarefas: escala => ordemPadrao(escala, ctx.pontos, ctx.grauDaReputacao, (a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR')),
        sistema: () => once('sistema', () => linhaDoSistema({
            dias: Object.keys(entrada.dias), semanas: Object.keys(entrada.semanas), trimestres: Object.keys(entrada.trimestres),
            tarefas: indice.tarefas.map(t => ({ trimestre: t.colocacao.trimestre, feita: t.feita, aberta: t.aberta })),
        }, hoje)),
        conexoesPadrao: (id, leitor) => conexoesPadraoDoNo(modelo, id, leitor),
        dominioDoNo: (id, leitor) => dominioDoNo(modelo, id, leitor),
        // O nó de qualquer id como o mapa o compõe: o dado do cartão único (o ramo, o Sistema, as listas).
        no: id => once(`no|${id}`, () => noDoId(ctx, { lugares, pessoas, estadias, contagem: (escala, chave) => (porLinha(escala).get(chave) ?? []).length }, id)),
        proximaAcao: proxima,
        aprendizadoDoProjeto: id => aprendizadoDe(id),
        // As opções de um campo pela outra nota (05/11, os destinos pelos perfis do canal): a outra é o alvo do vínculo do
        // ramo pelo campo que a nomeia (a coluna Canais, pelo `canal` das peças).
        opcoesPelaOutraNota: (caminho, campos, nome) => {
            const doTipo = modeloDaNota(caminho, campos, entrada.tabelas?.tipos ?? []);
            const campo = doTipo?.campos.find(c => c.nome === nome);
            if (!doTipo || !campo?.opcoes) return null;
            const lidos = camposComApelidos(doTipo, campos);
            const valor = textoDoCampo(Array.isArray(lidos[campo.opcoes.de]) ? (lidos[campo.opcoes.de] as unknown[])[0] : lidos[campo.opcoes.de]);
            const vinculo = colecoes.colecoes.find(c => c.vinculo?.campo === campo.opcoes!.de);
            const outra = valor && vinculo ? colecoes.alvos.get(vinculo.id)?.get(fold(valor)) ?? null : null;
            return outra ? opcoesDaOutraNota(campo, lidos, outra.nota.campos, outra.no.titulo) : null;
        },
        doDia,
        // A trilha de uso (05/11): a acolhida de hoje, o gesto da semana e as dicas, pela entrada lida.
        trilha: trilhaDoModelo(entrada, indice, hoje),
    };
    return modelo;
}

/**
 * O que faz: o nó de cada nota que a Missão conhece, pelo caminho: a nota de uma coleção da
 * ramo vem primeiro (é o nó que o ramo mostra); depois a tarefa, o projeto, a área, o dia, a
 * semana, o trimestre, a visão, a pessoa e, para a nota de uma cidade, a passagem mais nova dela.
 * Por quê: P10c: cada conexão do painel abre o painel do nó do outro lado, e o mesmo nó que
 * a linha do tempo mostra (o mesmo id), não um painel à parte.
 * Entra → sai: a entrada, o índice, as passagens, a visão, as coleções e as pessoas → caminho → nó.
 */
function nosPorCaminho(entrada: MissaoEntrada, indice: MissaoIndice, passagens: readonly Passagem[], visao: VisaoVigente, colecoes: IndiceDasColecoes, pessoas: readonly PessoaDaMissao[], lugares: CamadasDoLugar): Map<string, { id: string; titulo: string }> {
    const m = new Map<string, { id: string; titulo: string }>();
    const pos = (caminho: string | null | undefined, id: string, titulo: string) => { if (caminho && !m.has(caminho)) m.set(caminho, { id, titulo }); };
    for (const n of colecoes.notas) pos(n.nota.caminho, n.no.id, n.no.titulo);
    for (const alvos of colecoes.alvos.values()) for (const n of alvos.values()) pos(n.nota.caminho, n.no.id, n.no.titulo);
    for (const t of indice.porId.values()) pos(t.caminho, t.id, t.titulo);
    for (const p of indice.projetos.values()) pos(p.nota, p.id, p.nome);
    for (const a of indice.areas.values()) pos(a.nota, a.id, a.nome);
    for (const [k, n] of Object.entries(entrada.dias ?? {})) pos(n?.caminho, `d:${k}`, diaComAno(k));
    for (const [k, n] of Object.entries(entrada.semanas ?? {})) pos(n?.caminho, `w:${k}`, semanaCurta(k));
    for (const [k, n] of Object.entries(entrada.trimestres ?? {})) pos(n?.caminho, `q:${k}`, k);
    pos(visao.nota, VISAO_ID, visao.nome ?? 'Visão');
    for (const p of pessoas) pos(p.caminho, p.id, p.nome);
    // G6: a nota da cidade e a do país abrem o painel delas (separado do da passagem, com os atalhos).
    for (const c of lugares.cidades) if (c.id) pos(c.nota, c.id, c.nome);
    for (const p of lugares.paises) if (p.id && p.nota) pos(p.nota, p.id, p.nome);
    for (const e of [...passagens].sort((a, b) => b.de.localeCompare(a.de))) pos(e.nota, e.id, e.cidade);
    return m;
}

/**
 * O que faz: a nota e o canvas de um nó, pelo id: a TaskNote (e o canvas do projeto
 * dela), o projeto, a área, o dia, a semana, o trimestre, a visão e a cidade.
 * Por quê: o painel do nó oferece "Abrir a nota" e "Abrir o canvas" só quando existem
 * (arquitetura, 1, a linha do painel do nó); quem abre é o lugar onde a Missão mora.
 * Entra → sai: a entrada, o índice, as passagens, a visão e o id → `ArquivosDoNo`.
 * Erro e ataque: id desconhecido ou nota que não existe dá `null`, nunca um caminho inventado.
 * Prova: tests/missao/borboleta.test.ts ("os arquivos do nó").
 */
export function arquivosDoNo(entrada: MissaoEntrada, indice: MissaoIndice, passagens: readonly Passagem[], visao: VisaoVigente, id: string, trechos: readonly Trecho[] = []): ArquivosDoNo {
    const nada: ArquivosDoNo = { nota: null, canvas: null };
    const k = String(id ?? '');
    if (k.startsWith('t:') || k.startsWith('s:')) {
        const t = indice.porId.get(k);
        if (!t) return nada;
        return { nota: t.caminho, canvas: t.projeto ? indice.projetos.get(t.projeto)?.canvas ?? null : null };
    }
    if (k.startsWith('p:')) { const p = indice.projetos.get(k); return p ? { nota: p.nota, canvas: p.canvas } : nada; }
    if (k.startsWith('a:')) { const a = indice.areas.get(k); return a ? { nota: a.nota, canvas: a.canvas } : nada; }
    if (k.startsWith('d:')) return { nota: entrada.dias?.[k.slice(2)]?.caminho ?? null, canvas: null };
    // O canvas da semana e o do trimestre se aposentaram em 02/11/2026: o nó deles só tem a nota.
    if (k.startsWith('w:')) return { nota: entrada.semanas?.[k.slice(2)]?.caminho ?? null, canvas: null };
    if (k.startsWith('q:')) return { nota: entrada.trimestres?.[k.slice(2)]?.caminho ?? null, canvas: null };
    // G5 (29/10, C7): a nota da visão é a da visão vigente; o longo prazo tem a seção dele no painel.
    if (k === VISAO_ID) return { nota: visao.nota ?? null, canvas: null };
    if (k.startsWith('l:')) return { nota: passagens.find(e => e.id === k)?.nota ?? null, canvas: null };
    // P10b: a nota de uma coleção (`n:`) é ela mesma; o trecho planejado, a nota que o planeja.
    if (k.startsWith('n:')) return { nota: k.slice(2) || null, canvas: null };
    if (k.startsWith('r:')) return { nota: trechos.find(t => t.id === k)?.nota ?? null, canvas: null };
    if (k.startsWith(PREFIXO_DA_PESSOA)) { const c = k.slice(PREFIXO_DA_PESSOA.length); return { nota: entrada.pessoas.some(p => p.caminho === c) ? c : null, canvas: null }; }
    return nada;
}

/**
 * O que faz: o que um nó ainda não tem e o sistema já sabe criar: o canvas do projeto (e do
 * departamento) e a Day do dia que não tem. O canvas da semana e o do trimestre não se criam mais
 * (aposentados em 02/11/2026); a nota deles nasce pelo 🌳 e pelo 🧭, os botões do ciclo.
 * Por quê: o plano (§3): "Sem canvas ainda, aparece 'Criar canvas', pelo mesmo comando do
 * painel"; a arquitetura (§1, o painel do nó): "Abrir no TaskNotes · Nota · Canvas, ou Criar".
 * Entra → sai: o id e os arquivos do nó → a lista (vazia quando não há o que criar).
 * Prova: tests/missao/refinos.test.ts ("criar o que falta").
 */
export function criaveisDoNo(id: string, arquivos: ArquivosDoNo): Criavel[] {
    const k = String(id ?? '');
    if (k.startsWith('p:')) return arquivos.canvas ? [] : ['canvas'];
    if (k.startsWith('d:') && ehDia(k.slice(2))) return arquivos.nota ? [] : ['nota'];
    return [];
}

/** O que os construtores de linha leem. */
interface Ctx {
    entrada: MissaoEntrada;
    indice: MissaoIndice;
    registros: BlockTask[];
    hoje: string;
    porAlvo: Map<string, Sinal[]>;
    passagens: Passagem[];
    visao: VisaoVigente;
    reserva: Reserva;
    filtros: FiltrosResolvidos;
    visivelIds: Set<string>;
    colecoes: IndiceDasColecoes;
    trechos: Trecho[];
    /** Os pontos dos pesos e o grau da reputação por caminho, para a ordem padrão (`ordemPadrao`). */
    pontos: ReadonlyMap<string, number> | null;
    grauDaReputacao: ((caminho: string) => number | null | undefined) | null;
    /** A próxima ação real de um projeto (`proximaAcaoDoProjeto`, 02/11), para o cartão dele. */
    proxima?: (id: string) => ProximaAcao | null;
    /** O Comando do Dia e o compromisso deixado de um dia (`comandoDoDia`, 02/11), para o centro dele. */
    doDia?: (dia: string) => DoDia;
    /** As marcas dos ramos no dia e na semana (02/11, `marcasDosRamosNoTempo`); sem a chave, nenhuma. */
    marcasNoTempo?: MarcasNoTempo;
    /** A linha do centro do módulo de aprendizado de um projeto (05/11, `centroDoAprendizado`), para o cartão dele. */
    aprendizado?: (id: string) => string | null;
}

/**
 * O que faz: o teste da linhagem marcada: a tarefa entra no recorte de algum ramo com `marca` (o ✈️ da Viagem), pela
 * regra única do recorte (`noRecorteDoRamo`); o recorte sem tag nem projeto não conta (o "todas" dele).
 * Por quê: o trecho da manutenção (a mudança de cidade) é o da linhagem que marca o dia; uma regra só para "é de viagem".
 */
export function daLinhagemMarcada(indice: Pick<MissaoIndice, 'projetos'>, marcas: readonly MarcaDoRamo[]): (t: MissaoTarefa) => boolean {
    const testes = marcas.filter(m => m.marca && (m.recorte.tags.length || m.recorte.projetos.length)).map(m => noRecorteDoRamo(indice, m.recorte));
    return t => testes.some(f => f(t));
}

/** As marcas dos ramos por dia (`AAAA-MM-DD`) e por semana (`AAAA-Www`), cada uma com a dica. */
export interface MarcasNoTempo { dia: ReadonlyMap<string, readonly MarcaDoDia[]>; semana: ReadonlyMap<string, readonly MarcaDoDia[]> }

/**
 * O que faz: as marcas dos ramos no tempo (o ✈️ da Viagem): para cada ramo com `recorte.marca`, as ações do recorte
 * dele (`noRecorteDoRamo`, a regra única do que é do ramo) no dia em que caem e na semana delas, cada período com a
 * marca e os títulos na dica.
 * Por quê: o inventário da aposentadoria (fase 2, itens 1 e 2): o "✈️ Deslocamentos" do canvas da semana e a marca da
 * semana no canvas do trimestre; na Missão, o dia e a semana as mostram em todo ramo (o mapa, a Viagem, a semana, o
 * trimestre), pelo mesmo nó.
 * Entra → sai: o índice e as marcas dos ramos → as marcas por dia e por semana.
 * Erro e ataque: a SMART não marca (a data dela é prazo, não deslocamento); a cancelada, a de algum dia e a sem data
 * também não; a que só tem a semana marca a semana e não a segunda; o recorte sem tag nem projeto não marca nada (o
 * "todas" do recorte vazio marcaria todo dia).
 * Prova: tests/missao/marcasDoDia.test.ts ("as marcas dos ramos no tempo").
 */
export function marcasDosRamosNoTempo(indice: Pick<MissaoIndice, 'projetos' | 'tarefas'>, marcas: readonly MarcaDoRamo[]): MarcasNoTempo {
    const dia = new Map<string, MarcaDoDia[]>(), semana = new Map<string, MarcaDoDia[]>();
    const validas = marcas.filter(m => m.marca && (m.recorte.tags.length || m.recorte.projetos.length));
    if (!validas.length) return { dia, semana };
    const tarefas = indice.tarefas.filter(t => t.tipo === 'acao' && t.colocacao.lugar === 'linha')
        .sort((a, b) => String(a.colocacao.dia).localeCompare(String(b.colocacao.dia)) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
    for (const m of validas) {
        const doRamo = noRecorteDoRamo(indice, m.recorte);
        const porDia = new Map<string, string[]>(), porSemana = new Map<string, string[]>();
        for (const t of tarefas) {
            if (!doRamo(t)) continue;
            if (t.colocacao.dia && !t.colocacao.daSemana) porDia.set(t.colocacao.dia, [...(porDia.get(t.colocacao.dia) ?? []), t.titulo]);
            if (t.colocacao.semana) porSemana.set(t.colocacao.semana, [...(porSemana.get(t.colocacao.semana) ?? []), t.titulo]);
        }
        for (const [alvo, de, onde] of [[dia, porDia, 'neste dia'], [semana, porSemana, 'nesta semana']] as const) {
            for (const [k, titulos] of de) {
                const marca = marcaDoRamoNoPeriodo(m, titulos, onde);
                if (marca && !(alvo.get(k) ?? []).some(x => x.marca === marca.marca)) alvo.set(k, [...(alvo.get(k) ?? []), marca]);
            }
        }
    }
    return { dia, semana };
}

/** Os grupos da ordem padrão das tarefas de um período (02/11). */
const COM_HORA = 0, ABERTA = 1, FECHADA = 2;

/** O que faz: o grupo da tarefa na ordem padrão: fechada (feita ou cancelada) por último; com hora primeiro. */
function grupoNaOrdem(t: MissaoTarefa): number {
    if (t.feita || t.estado?.lugar === 'fora') return FECHADA;
    return t.colocacao.hora ? COM_HORA : ABERTA;
}

/**
 * O que faz: a ordem padrão das tarefas de um período, a mesma do Dia e de cada dia da semana: (1) as de
 * hora marcada primeiro, na ordem do horário (a de hora passada e não feita fica no topo por ser a mais
 * cedo, e o cartão a marca); (2) as outras abertas pelos pontos da tabela única de pesos (os mesmos do
 * 🤝 e da árvore do agora, `scoresByPath`, que o serviço passa por caminho), e, no mesmo peso, a de
 * reputação mais alta (o grau do nível); (3) as feitas e as canceladas por último. Fora da escala do dia,
 * o dia vem antes de tudo.
 * Por quê: a ordem padrão da Missão (02/11/2026); sem esses estados, a regra geral é que mais reputação
 * dá mais prioridade: a reputação só desempata, nunca passa dos pesos declarados.
 * Entra → sai: a escala, os pontos por caminho, o grau por caminho e o desempate final → a comparação.
 * Erro e ataque: tarefa sem ponto (fora da grade do agora) vai depois das pontuadas; grau que falha conta
 * como sem grau; sem pontos nem grau, vale o desempate (a SMART mãe, o título).
 * Prova: tests/missao/ordemPadrao.test.ts.
 */
export function ordemPadrao(
    escala: Escala,
    pontos: ReadonlyMap<string, number> | null,
    grau: ((caminho: string) => number | null | undefined) | null,
    desempate: (a: MissaoTarefa, b: MissaoTarefa) => number,
): (a: MissaoTarefa, b: MissaoTarefa) => number {
    const ponto = (t: MissaoTarefa) => pontos?.get(t.caminho) ?? -Infinity;
    const grauDe = (t: MissaoTarefa) => { try { const g = grau?.(t.caminho); return typeof g === 'number' && Number.isFinite(g) ? g : -1; } catch { return -1; } };
    return (a, b) => {
        const dia = String(a.colocacao.dia ?? '').localeCompare(String(b.colocacao.dia ?? ''));
        if (escala !== 'dia' && dia) return dia;
        const ga = grupoNaOrdem(a), gb = grupoNaOrdem(b);
        if (ga !== gb) return ga - gb;
        if (ga === COM_HORA) return a.colocacao.hora.localeCompare(b.colocacao.hora) || desempate(a, b);
        if (ga === ABERTA) {
            const pa = ponto(a), pb = ponto(b);
            if (pa !== pb) return pb > pa ? 1 : -1;
            const d = grauDe(b) - grauDe(a);
            if (d) return d;
        }
        return desempate(a, b);
    };
}

/**
 * O que faz: o filtro de área, projeto (com o ramo) e Temporada sobre as tarefas, e o recorte
 * do ramo (P10b): só as que têm uma das tags dele ou são da linhagem dos projetos dele (`noRecorteDoRamo`).
 */
function visivelPor(indice: MissaoIndice, f: FiltrosResolvidos, recorte: RecorteDoRamo | null = null): (t: MissaoTarefa) => boolean {
    const areas = new Set(f.filtros.areas.map(fold));
    const pid = f.projeto ? idDoProjeto(f.projeto) : null;
    const allowed = pid ? (f.filtros.ramo ? familiaDe(indice, pid) : new Set([pid])) : null;
    const noRecorte = noRecorteDoRamo(indice, recorte);
    return t => {
        if (!noRecorte(t)) return false;
        const p = t.projeto ? indice.projetos.get(t.projeto) : null;
        if (areas.size && !(p && areas.has(fold(p.area)))) return false;
        if (allowed && !(t.projeto && allowed.has(t.projeto))) return false;
        if (f.filtros.temporada && !(p && p.papel !== 'fora')) return false;
        return true;
    };
}

/** As que ficaram de antes: a função mora no tempo (02/11), para o ramo do período usá-la também. */
export { pendentesDe };

/* ------------------------------------------------------------------ nós */

function ramoDe(ctx: Ctx, projeto: string | null): number {
    return projeto ? ctx.indice.projetos.get(projeto)?.ramo ?? -1 : -1;
}

/** O que faz: o nó de uma tarefa: a ação (status · estimativa · data) ou a SMART (a forma das ações dela). */
export function noDaTarefa(ctx: Pick<Ctx, 'indice' | 'registros' | 'porAlvo'>, t: MissaoTarefa, pendente = false): MissaoNo {
    const ramo = t.projeto ? ctx.indice.projetos.get(t.projeto)?.ramo ?? -1 : -1;
    const sinais = (ctx.porAlvo.get(t.id) ?? []).map(s => s.tipo);
    const estado = pendente ? 'pendente' : estadoDe(t);
    if (t.tipo === 'smart') {
        const g = showGrammar(smartChildren(t.record, ctx.registros), SMART_HORIZON, FRASES.semAcoesLigadas);
        // A SMART do modelo velho (smart_s/m/a/r, o `legado` de smart.json) leva a marca (0f); a de manutenção
        // de rotina (`natureza`, 29/10, §3), a dela e a chave que a tira das até 3 da semana.
        const manutencao = ehManutencao(t.record);
        const marcas = [...(t.modeloAntigo ? [MODELO_ANTIGO] : []), ...(manutencao ? [MARCA_MANUTENCAO] : [])];
        return { id: t.id, tipo: 'smart', titulo: t.titulo, linha: g.text, contagens: g.counts, estado, ramo, sinais, daSemana: t.colocacao.daSemana, ...(marcas.length ? { marcas } : {}), ...(manutencao ? { manutencao: true } : {}) };
    }
    // O rótulo do status vem da tabela de estados da tarefa (Passo 0, 0b); "pendente" vem do tempo.
    const status = t.deAntes ? 'pendente' : rotuloDoStatus(t.status, ctx.indice.tabelas?.tarefa ?? []);
    const linha = [status, minutosTexto(t.estimativa) ?? 'sem estimativa', dataDaTarefa(t)].join(' · ');
    return { id: t.id, tipo: 'acao', titulo: t.titulo, linha, estado, ramo, sinais, hora: t.colocacao.hora || undefined, ...(t.colocacao.dia ? { dia: t.colocacao.dia } : {}), daSemana: t.colocacao.daSemana };
}

/**
 * O que faz: o nó de um projeto: a linha dele no período (a mesma de `nucleo.formaDoProjeto` no trimestre) e o
 * estágio, pela marca e pelo rótulo da linha da tabela de estados que a coluna dele dá.
 */
export function noDoProjeto(ctx: Pick<Ctx, 'indice' | 'registros' | 'porAlvo' | 'proxima' | 'aprendizado'>, id: string, periodo: { escala: 'trimestre' | 'ano'; chave: string } | null): MissaoNo | null {
    const p = ctx.indice.projetos.get(id);
    if (!p) return null;
    const period = !periodo ? null : periodo.escala === 'trimestre' ? quarterPeriod(periodo.chave) : periodOfWeeks(semanasDoAno(periodo.chave));
    const progress = projectProgress({ name: p.nome, index: p.nota }, ctx.registros, period);
    const prox = ctx.proxima?.(id) ?? null;
    const aprendizado = ctx.aprendizado?.(id) ?? null;
    const papel = p.papel === 'central' ? 'central' : p.papel === 'auxiliar' ? `auxiliar de ${p.central}` : p.encerrado ? 'encerrado' : 'fora da Temporada';
    // A central diz o ramo: ela e os auxiliares, pela mesma conta, com as chaves de todos.
    let doRamo: MissaoNo['doRamo'];
    if (p.papel === 'central') {
        const keys = [...familiaDe(ctx.indice, id)].map(x => ctx.indice.projetos.get(x)).filter((x): x is NonNullable<typeof x> => !!x)
            .flatMap(x => [...projectKeys({ name: x.nome, index: x.nota })]);
        const ramo = projectProgress({ name: p.nome, index: p.nota, keys }, ctx.registros, period);
        doRamo = { linha: progressText(ramo), contagens: ramo.grammar };
    }
    return {
        id, tipo: 'projeto', titulo: p.nome, linha: progressText(progress), contagens: progress.grammar, ...(doRamo ? { doRamo } : {}),
        sub: [periodo ? (periodo.escala === 'trimestre' ? periodo.chave.slice(5) : periodo.chave) : null, papel].filter(Boolean).join(' · '),
        ramo: p.ramo, papel: p.papel, temCanvas: !!p.canvas, sinais: (ctx.porAlvo.get(id) ?? []).map(s => s.tipo),
        // O estágio no próprio cartão (decisão 9 do mapa dos tipos): a linha da tabela pela coluna, sem coluna nova.
        ...(p.estado ? { estagio: [p.estado.marca, p.estado.rotulo].filter(Boolean).join(' ') } : {}),
        // A próxima ação real (02/11): o título da tarefa; sem ação aberta, nada (a central sem movimento já diz).
        ...(prox ? { proxima: prox.tarefa.titulo } : {}),
        // O centro do módulo de aprendizado (05/11): a fila de hoje e o nível em curso, na linha de baixo do cartão.
        ...(aprendizado ? { aprendizado } : {}),
    };
}

/**
 * O que faz: o nó de uma área: as frentes ativas (o projeto numa coluna de faixa, ativo, em
 * revisão ou integrando, e o departamento, que é frente contínua) e as do backlog.
 * Por quê: a revisão de 29/10: "7 frentes" contava o backlog e o pausado como frente; a
 * coluna é a dona do estágio, e a tabela de estados do projeto diz como ela se mostra.
 * Entra → sai: o índice e o id → "3 frentes ativas · 7 no backlog" (ou "sem frentes ativas").
 */
export function noDaArea(indice: MissaoIndice, id: string): MissaoNo | null {
    const a = indice.areas.get(id);
    if (!a) return null;
    const ps = a.projetos.map(pid => indice.projetos.get(pid)).filter((p): p is NonNullable<typeof p> => !!p && !p.encerrado);
    const ativas = ps.filter(p => p.tipo === 'departamento' || p.estado?.mostrar === 'faixa').length;
    const backlog = ps.filter(p => p.estado?.mostrar === 'claro').length;
    const linha = [ativas ? `${ativas} ${ativas === 1 ? 'frente ativa' : 'frentes ativas'}` : FRASES.semFrentesAtivas, backlog ? `${backlog} no backlog` : ''].filter(Boolean).join(' · ');
    return { id, tipo: 'area', titulo: a.nome, linha, ramo: -1, temCanvas: !!a.canvas };
}

function parTexto(ctx: Ctx, semana: string): string {
    const par = ctx.entrada.pares?.[semana];
    if (!par || (!par.valor && !par.relacao)) return '';
    const v = [par.valor, par.relacao].filter(Boolean).join(' · ');
    return par.daNota ? v : `sugestão: ${v}`;
}

/** O que faz: o nó da semana (a forma dela, `nucleo.formaDaSemana`), com as datas, o par de valores e, fechada, a forma cheia. */
export function noDaSemana(ctx: Ctx, semana: string): MissaoNo {
    const g = formaDaSemana(semana, ctx.registros);
    const d = weekDates(semana);
    const par = parTexto(ctx, semana);
    // A semana fechada (o 🌳 grava `status: closed`) tem a forma cheia, com a cor dela (02/11, item 21).
    const fechada = String(ctx.entrada.semanas?.[semana]?.campos?.status ?? '').trim() === 'closed';
    // As marcas da semana (02/11, o que a célula dela no canvas do trimestre dizia): a dos ramos (o ✈️) e o 📤 no ar.
    const marcas = [...(ctx.marcasNoTempo?.semana.get(semana) ?? []), marcaDoNoArNaSemana(semana, ctx.registros)].filter((m): m is MarcaDoDia => !!m);
    return {
        id: `w:${semana}`, tipo: 'semana', titulo: `Semana ${semanaCurta(semana)}`, linha: g.text, contagens: g.counts, ...(fechada ? { estado: 'feita' as const } : {}),
        sub: [d.length ? `${diaMes(d[0])}–${diaMes(d[6])}` : semana, par].filter(Boolean).join(' · '), ramo: -1,
        sinais: (ctx.porAlvo.get(`w:${semana}`) ?? []).map(s => s.tipo),
        ...(marcas.length ? { marcas: marcas.map(m => m.marca), dicas: Object.fromEntries(marcas.map(m => [m.marca, m.dica])) } : {}),
    };
}

/** O que faz: o nó do trimestre (a forma dele, `nucleo.formaDoTrimestre`), com o tema ou as semanas. */
export function noDoTrimestre(ctx: Ctx, trimestre: string): MissaoNo {
    const g = formaDoTrimestre(trimestre, ctx.registros);
    const weeks = quarterWeeks(trimestre);
    const tema = String(ctx.entrada.trimestres?.[trimestre]?.campos?.theme ?? '').trim();
    return {
        id: `q:${trimestre}`, tipo: 'trimestre', titulo: trimestre, linha: g.text, contagens: g.counts,
        sub: tema || (weeks.length ? `${semanaCurta(weeks[0])}–${semanaCurta(weeks[weeks.length - 1])}` : ''), ramo: -1,
    };
}

/** O que faz: o nó da visão: a vigente, ou "sem visão ainda"; o ciclo longo como linha de cima. */
export function noDaVisao(visao: VisaoVigente): MissaoNo {
    return { id: VISAO_ID, tipo: 'visao', titulo: 'Visão de longo prazo', linha: visao.linha, sub: visao.longoPrazo ? `Longo prazo · ${visao.longoPrazo.nome}` : undefined, ramo: -1 };
}

const TITULO_ESPECIAL: Record<ChaveEspecial, string> = { 'algum-dia': 'Algum dia', 'sem-data': 'Sem data', antes: 'Antes', depois: 'Depois' };
const SUB_ESPECIAL: Record<ChaveEspecial, string> = {
    'algum-dia': 'prateleira fora da linha', 'sem-data': 'abertas sem data marcada', antes: 'antes das linhas', depois: 'depois das linhas',
};

/** O que faz: as pessoas do dia (`pessoas` na Day, links para as notas de pessoa). */
export function pessoasDoDia(entrada: Pick<MissaoEntrada, 'dias'>, dia: string): string[] {
    return linkNames(entrada.dias?.[dia]?.campos?.pessoas);
}

/** O que faz: o nó central de uma linha: o dia, a semana, o trimestre, o ano ou a prateleira. */
export function noDoCentro(ctx: Ctx, escala: Escala, chave: string, contagem: number): MissaoNo {
    const id = idDoPeriodo(escala, chave);
    if (isChaveEspecial(chave)) {
        return { id, tipo: 'prateleira', titulo: TITULO_ESPECIAL[chave], linha: contagem ? `${contagem} ${contagem === 1 ? 'tarefa' : 'tarefas'}` : FRASES.semTarefas, sub: SUB_ESPECIAL[chave], ramo: -1 };
    }
    if (escala === 'dia') {
        const g = formaDoDia(chave, ctx.registros);
        const semana = chaveDeHoje('semana', chave);
        const bloco = ctx.entrada.semanas?.[semana]?.campos?.bloco_sagrado;
        const carga = cargaTexto(chave, ctx.registros, bloco);
        const excede = overCapacity(dayLoad(chave, ctx.registros), parseBlockMinutes(bloco));
        const [y, m] = chave.split('-').map(Number);
        const marcas: string[] = [];
        const pessoas = marcaDePessoas(pessoasDoDia(ctx.entrada, chave));
        if (pessoas) marcas.push(pessoas.marca);
        const dinheiro = marcaDoDia(ctx.entrada.dias?.[chave]);
        if (dinheiro) marcas.push(dinheiro);
        // As marcas dos ramos (02/11: o ✈️ do dia com uma tarefa da Viagem) e as dos registros (P9): as peças 📤
        // que foram ao ar e as exposições 🎭 do dia.
        const registro = [...(ctx.marcasNoTempo?.dia.get(chave) ?? []), marcaDoNoAr(chave, ctx.registros), marcaDasExposicoes(chave, ctx.entrada.exposicoes ?? [])].filter((m): m is MarcaDoDia => !!m);
        for (const m of registro) marcas.push(m.marca);
        if (ctx.entrada.dias?.[chave]?.modeloAntigo) marcas.push(MODELO_ANTIGO);
        const semDinheiro = !dinheiro && !!ctx.entrada.dias?.[chave] && chave <= ctx.hoje;
        // O que o ▶️ gravou, ou o que o 🌙 deixou para hoje (02/11): uma linha embaixo, só informação.
        const comando = linhaDoComando(ctx.doDia?.(chave) ?? comandoDoDia(ctx.entrada, ctx.indice, chave, ctx.hoje));
        return {
            id, tipo: 'dia', titulo: `${diaDaSemana(chave)} ${Number(chave.slice(8, 10))}`, linha: g.text, contagens: g.counts, sub: `${MESES[m - 1]} ${y} · ${carga}`, carga, excede, ramo: -1, marcas,
            ...(pessoas || registro.length ? { dicas: Object.fromEntries([...(pessoas ? [pessoas] : []), ...registro].map(m => [m.marca, m.dica])) } : {}),
            ...(semDinheiro ? { semDinheiro } : {}),
            ...(comando ? { comando } : {}),
        };
    }
    if (escala === 'semana') {
        const node = noDaSemana(ctx, chave);
        const carga = weekLoadSummary(chave, ctx.registros, ctx.entrada.semanas?.[chave]?.campos?.bloco_sagrado, !!ctx.entrada.semanas?.[chave]).replace(/^\*\*⏱ Carga\*\* · /, '');
        return { ...node, id, titulo: semanaCurta(chave), sub: [node.sub, carga].filter(Boolean).join(' · '), marcas: [...(node.marcas ?? []), ...(ctx.entrada.semanas?.[chave]?.modeloAntigo ? [MODELO_ANTIGO] : [])] };
    }
    if (escala === 'trimestre') {
        const node = noDoTrimestre(ctx, chave);
        return { ...node, id, marcas: ctx.entrada.trimestres?.[chave]?.modeloAntigo ? [MODELO_ANTIGO] : [] };
    }
    const g = formaDoAno(chave, ctx.registros);
    return { id, tipo: 'ano', titulo: chave, linha: g.text, contagens: g.counts, ramo: -1 };
}

/** O que faz: a asa direita de uma linha: dia → semana → trimestre → visão (sem o centro). */
export function asaDe(ctx: Ctx, escala: Escala, chave: string): MissaoNo[] {
    if (isChaveEspecial(chave)) return [];
    const visao = noDaVisao(ctx.visao);
    if (escala === 'dia') {
        const week = chaveDeHoje('semana', chave);
        const quarter = quarterOfWeek(week);
        return [noDaSemana(ctx, week), ...(quarter ? [noDoTrimestre(ctx, quarter)] : []), visao];
    }
    if (escala === 'semana') {
        const quarter = quarterOfWeek(chave);
        return [...(quarter ? [noDoTrimestre(ctx, quarter)] : []), visao];
    }
    return [visao];
}

/* ------------------------------------------------------------------ linhas */

/** Ordem da Temporada: central por central (na ordem da nota), central antes de auxiliar, depois o nome. */
function ordemDoProjeto(indice: MissaoIndice, id: string | null): [number, number, string] {
    const p = id ? indice.projetos.get(id) : null;
    if (!p) return [99, 9, '￿'];
    return [p.ramo < 0 ? 50 : p.ramo, p.papel === 'central' ? 0 : p.papel === 'auxiliar' ? 1 : 2, fold(p.nome)];
}
function compararOrdem(a: [number, number, string], b: [number, number, string]): number {
    return a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0);
}

function lugarDaLinha(ctx: Ctx, escala: Escala, chave: string): LugarDaLinha {
    if (isChaveEspecial(chave)) return { texto: '', trechos: [], passagens: [], viagem: false };
    if (escala === 'dia') {
        const l = lugarDoDia(ctx.passagens, chave, ctx.hoje);
        return { texto: l.texto, trechos: faixaDoPeriodo(ctx.passagens, [chave], ctx.hoje), passagens: l.passagens, viagem: l.viagem };
    }
    const dias = diasDoPeriodo(escala, chave);
    const trechos = faixaDoPeriodo(ctx.passagens, dias, ctx.hoje);
    const ids = new Set(trechos.map(t => t.passagem).filter(Boolean));
    const list = ctx.passagens.filter(e => ids.has(e.id));
    return { texto: list.length ? list.map(e => `${e.cidade} ${datasDaPassagem(e)}`).join(' → ') : FRASES.semLugar, trechos, passagens: list, viagem: list.length > 1 };
}

/**
 * O que faz: o conteúdo de uma linha aberta: o centro, as duas asas, as faixas de tarefas
 * por projeto (a sem projeto numa faixa neutra, "sem projeto", por último), as pendentes
 * de antes na linha de hoje, as horas marcadas do dia e as ligações tiradas dos campos
 * (área → projeto → SMART → ação → período → semana → trimestre → visão; quem bloqueia;
 * o lugar).
 * Por quê: o centro, as asas e as ligações do plano (2); "as tarefas sem projeto ficam
 * numa faixa neutra e não somem" (3c.5); a hora fixa no dia (3d.3).
 * Prova: tests/missao/borboleta.test.ts ("a linha").
 */
function linhaAbertaDe(ctx: Ctx, escala: Escala, chave: string, own: MissaoTarefa[], pend: MissaoTarefa[]): LinhaAberta {
    const { indice } = ctx;
    const id = idDoPeriodo(escala, chave);
    const especial = isChaveEspecial(chave);
    const periodo: { escala: 'trimestre' | 'ano'; chave: string } | null = especial ? null
        : escala === 'ano' ? { escala: 'ano', chave }
            : { escala: 'trimestre', chave: escala === 'trimestre' ? chave : escala === 'semana' ? quarterOfWeek(chave) ?? '' : quarterOfWeek(chaveDeHoje('semana', chave)) ?? '' };

    const all = [...own, ...pend];
    const pendIds = new Set(pend.map(t => t.id));
    const smartIds: string[] = [];
    const addSmart = (sid: string | null) => { if (sid && indice.porId.has(sid) && !smartIds.includes(sid)) smartIds.push(sid); };
    for (const t of all) if (t.tipo === 'smart') addSmart(t.id);
    for (const t of all) if (t.tipo === 'acao') addSmart(t.smart);

    const projectIds = new Set<string>();
    for (const t of all) if (t.projeto) projectIds.add(t.projeto);
    for (const sid of smartIds) { const s = indice.porId.get(sid); if (s?.projeto) projectIds.add(s.projeto); }
    if ((escala === 'trimestre' || escala === 'ano') && !especial) {
        for (const p of indice.projetos.values()) if (p.papel !== 'fora' && passaFiltroDeProjeto(ctx, p.id)) projectIds.add(p.id);
    }
    const projects = [...projectIds].filter(p => indice.projetos.has(p)).sort((a, b) => compararOrdem(ordemDoProjeto(indice, a), ordemDoProjeto(indice, b)));
    const pIndex = (pid: string | null) => (pid && projects.includes(pid) ? projects.indexOf(pid) : 999);

    const smarts = smartIds.map(sid => indice.porId.get(sid)!).sort((a, b) => pIndex(a.projeto) - pIndex(b.projeto) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
    const sIndex = (sid: string | null) => (sid ? smarts.findIndex(s => s.id === sid) : 999);
    // A ordem padrão (02/11), a mesma em toda escala; o desempate final é o de antes: a SMART mãe, o título.
    const byOrder = ordemPadrao(escala, ctx.pontos, ctx.grauDaReputacao, (a, b) => sIndex(a.smart) - sIndex(b.smart) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
    // No dia, a coluna segue a ordem padrão de ponta a ponta (o peso decide, não o projeto): a faixa é a
    // sequência de tarefas seguidas do mesmo projeto. Nas outras escalas, uma faixa por projeto.
    const naOrdem = escala === 'dia';
    const faixasDe = (list: MissaoTarefa[]): Faixa[] => {
        const lanes: Faixa[] = [];
        for (const t of [...list].sort((a, b) => (naOrdem ? 0 : pIndex(a.projeto) - pIndex(b.projeto)) || byOrder(a, b))) {
            const pid = t.projeto && indice.projetos.has(t.projeto) ? t.projeto : null;
            let lane = naOrdem ? (lanes[lanes.length - 1]?.projeto === pid ? lanes[lanes.length - 1] : undefined) : lanes.find(l => l.projeto === pid);
            if (!lane) {
                const p = pid ? indice.projetos.get(pid)! : null;
                lane = { projeto: pid, rotulo: p ? p.nome : 'sem projeto', ramo: p ? p.ramo : -1, nos: [] };
                lanes.push(lane);
            }
            lane.nos.push(noDaTarefa(ctx, t, pendIds.has(t.id)));
        }
        return naOrdem ? lanes : lanes.sort((a, b) => (a.projeto ? 0 : 1) - (b.projeto ? 0 : 1));
    };
    const ownActions = own.filter(t => t.tipo === 'acao');
    const pendActions = pend.filter(t => t.tipo === 'acao');

    const areaIds: string[] = [];
    for (const pid of projects) { const a = idDaArea(indice.projetos.get(pid)!.area); if (!areaIds.includes(a)) areaIds.push(a); }

    const ligacoes: Ligacao[] = [];
    for (const pid of projects) ligacoes.push({ de: idDaArea(indice.projetos.get(pid)!.area), para: pid, tipo: 'estrutura' });
    for (const s of smarts) {
        if (s.projeto && projects.includes(s.projeto)) ligacoes.push({ de: s.projeto, para: s.id, tipo: 'estrutura' });
        if (all.some(t => t.id === s.id)) ligacoes.push({ de: s.id, para: id, tipo: pendIds.has(s.id) ? 'pendente' : 'tempo' });
    }
    const actionIds = new Set([...ownActions, ...pendActions].map(t => t.id));
    const byBasename = new Map([...ownActions, ...pendActions].map(t => [fold(t.record.basename), t.id]));
    for (const t of [...ownActions, ...pendActions]) {
        if (t.smart && smartIds.includes(t.smart)) ligacoes.push({ de: t.smart, para: t.id, tipo: 'estrutura' });
        else if (t.projeto && projects.includes(t.projeto)) ligacoes.push({ de: t.projeto, para: t.id, tipo: 'estrutura' });
        ligacoes.push({ de: t.id, para: id, tipo: pendIds.has(t.id) ? 'pendente' : 'tempo' });
        for (const b of t.record.blockedBy ?? []) {
            const from = byBasename.get(fold(b));
            if (from && from !== t.id && actionIds.has(from)) ligacoes.push({ de: from, para: t.id, tipo: 'bloqueio' });
        }
    }
    const asa = asaDe(ctx, escala, chave);
    let prev = id;
    for (const n of asa) { ligacoes.push({ de: prev, para: n.id, tipo: 'tempo' }); prev = n.id; }
    const lugar = lugarDaLinha(ctx, escala, chave);
    for (const e of lugar.passagens) ligacoes.push({ de: e.id, para: id, tipo: 'lugar' });
    // P10b: as passagens como nós, os trechos do período e as coleções do ramo.
    const diasDaLinha = especial ? [] : diasDoPeriodo(escala, chave);
    const deLinha = diasDaLinha[0] ?? '', ateLinha = diasDaLinha[diasDaLinha.length - 1] ?? '';
    const passagensNos = [...lugar.passagens].reverse().map(e => noDaPassagem(e, ctx.hoje));
    const trechosNos = deLinha ? ctx.trechos.filter(t => t.dia >= deLinha && t.dia <= ateLinha).map(noDoTrecho) : [];
    for (const t of trechosNos) {
        ligacoes.push({ de: id, para: t.id, tipo: 'tempo' });
        const nota = ctx.trechos.find(x => x.id === t.id)?.nota;
        if (nota) ligacoes.push({ de: t.id, para: `n:${nota}`, tipo: 'tempo' });
    }
    const cols = deLinha ? colecoesDaLinha(ctx.colecoes, deLinha, ateLinha, lugar.passagens, ctx.hoje) : { nos: {}, ligacoes: [] };
    ligacoes.push(...cols.ligacoes);
    const contas = contasDaLinha(ctx.colecoes, cols.nos);

    // As de hora marcada, abertas (a feita com hora vai para o fim, com as outras feitas).
    const horarios = escala === 'dia' ? ownActions.filter(t => grupoNaOrdem(t) === COM_HORA).sort(byOrder).map(t => noDaTarefa(ctx, t)) : [];
    const habitos = escala === 'dia' && !especial
        ? ctx.entrada.habitos.filter(h => h.ativo).map(h => ({ caminho: h.path, titulo: h.title, vezes: h.entries.filter(d => d === chave).length }))
        : [];
    const trimestres = escala === 'ano' && !especial ? [1, 2, 3, 4].map(q => noDoTrimestre(ctx, `${chave}-Q${q}`)) : [];
    // G3 (29/10): só a soma do período; a reserva aparece uma vez, na seção Dinheiro do painel do trimestre.
    const dinheiro = especial ? '' : somaDoPeriodo(ctx.entrada.dias, diasDoPeriodo(escala, chave), ctx.hoje).texto;

    return {
        escala, chave, id, hoje: ehHoje(escala, chave, ctx.hoje), especial,
        centro: noDoCentro(ctx, escala, chave, own.length), lugar,
        areas: areaIds.map(a => noDaArea(indice, a)).filter((n): n is MissaoNo => !!n),
        // A frente de renda (05/11): o projeto que as coleções com `conta` apontam leva a contagem delas no cartão.
        projetos: projects.map(p => noDoProjeto(ctx, p, periodo)).filter((n): n is MissaoNo => !!n).map(n => (contas.has(n.id) ? { ...n, conta: contas.get(n.id)! } : n)),
        smarts: smarts.map(s => noDaTarefa(ctx, s, pendIds.has(s.id))),
        faixas: faixasDe(ownActions), pendentes: faixasDe(pendActions), horarios, asa, ligacoes,
        contagem: own.length, habitos, trimestres, dinheiro,
        passagens: passagensNos, trechos: trechosNos, colecoes: cols.nos,
        visao: ctx.visao.nota ? [noDaVisao(ctx.visao)] : [],
    };
}

/** O que o nó de qualquer id lê além do contexto do mapa: o lugar em camadas, as pessoas e quantas tarefas tem cada período. */
export interface FontesDoNo { lugares: CamadasDoLugar; pessoas: readonly PessoaDaMissao[]; contagem: (escala: Escala, chave: string) => number; /** As estadias (30/10). */ estadias?: readonly EstadiaLida[] }

/**
 * O que faz: o nó de qualquer id, pelos mesmos construtores com que o mapa o compõe: a tarefa e a
 * SMART (`noDaTarefa`), o projeto no trimestre de hoje (`noDoProjeto`, o da linha de hoje), a área,
 * a semana e o trimestre da asa, o dia e o ano do centro, a visão, a passagem, a nota de uma coleção
 * do ramo e o vínculo sem nota, o trecho, o lugar em camadas (a cidade e o país fora das coleções)
 * e a pessoa (o último dia no registro, como o painel dela diz).
 * Por quê: o nó de tarefa, SMART ou comum, é do mesmo tipo na tela inicial e no ramo, e os outros nós
 * seguem o mesmo padrão (30/10/2026). O ramo, o Sistema e as listas do painel desenham com o cartão do mapa (`noEl`), e
 * o dado do cartão sai daqui, não de uma cópia na vista.
 * Entra → sai: o contexto do mapa, as fontes de fora dele e o id → `MissaoNo`, ou `null` (o id que a
 * Missão não conhece: a nota solta e o item da checklist têm o nó composto por quem os traz).
 * Prova: tests/missao/cartaoUnico.test.ts.
 */
export function noDoId(ctx: Ctx, f: FontesDoNo, id: string): MissaoNo | null {
    const { indice, hoje } = ctx;
    const t = indice.porId.get(id);
    if (t) return noDaTarefa(ctx, t);
    if (indice.projetos.has(id)) return noDoProjeto(ctx, id, { escala: 'trimestre', chave: chaveDeHoje('trimestre', hoje) });
    if (indice.areas.has(id)) return noDaArea(indice, id);
    if (id === VISAO_ID) return noDaVisao(ctx.visao);
    const p = periodoDoId(id);
    if (p) {
        if (isChaveEspecial(p.chave) || !diasDoPeriodo(p.escala, p.chave).length) return null;
        if (p.escala === 'semana') return noDaSemana(ctx, p.chave);
        if (p.escala === 'trimestre') return noDoTrimestre(ctx, p.chave);
        return noDoCentro(ctx, p.escala, p.chave, f.contagem(p.escala, p.chave));
    }
    const e = ctx.passagens.find(x => x.id === id);
    if (e) return noDaPassagem(e, hoje);
    // A estadia (30/10): o cartão da nota com o estado do planejamento.
    const estadia = f.estadias?.find(x => x.no.id === id);
    if (estadia) return estadia.no;
    const r = ctx.trechos.find(x => x.id === id);
    if (r) return noDoTrecho(r);
    const daColecao = ctx.colecoes.notas.find(n => n.no.id === id)?.no
        ?? [...ctx.colecoes.alvos.values()].flatMap(m => [...m.values()]).find(n => n.no.id === id)?.no;
    if (daColecao) return daColecao;
    // O vínculo sem nota (`c:<coleção>:<nome>`): o nó que a coleção dá ao nome, o mesmo da coluna.
    const vinculo = id.match(/^c:[^:]+:(.+)$/);
    const doVinculo = vinculo ? noDoVinculo(ctx.colecoes, vinculo[1]) : null;
    if (doVinculo?.id === id) return doVinculo;
    const l = lugarDoNo(f.lugares, id);
    if (l && (l.cidade || l.pais)) {
        const recente = [...l.passagens].sort((a, b) => b.de.localeCompare(a.de))[0];
        if (l.cidade) return { id, tipo: 'lugar', titulo: l.cidade.nome, sub: l.pais?.nome ?? PAINEL.paisADefinir, linha: recente ? datasDaPassagem(recente) : PAINEL.semPassagem, ramo: -1 };
        return { id, tipo: 'lugar', titulo: l.pais!.nome, sub: l.pais!.nota ? undefined : FRASES.semNota, linha: l.cidades.map(c => c.nome).join(' · ') || PAINEL.semCidade, ramo: -1 };
    }
    const pessoa = f.pessoas.find(x => x.id === id);
    if (pessoa) {
        return { id, tipo: 'pessoa', titulo: pessoa.nome, linha: linhaDaPessoa(diasDaPessoa(ctx.entrada.dias, pessoa.nome)), ramo: -1 };
    }
    return null;
}

/**
 * O que faz: o nó de uma passagem (`l:`): a cidade, o país e as datas, com quantos dias até a
 * saída (ou até hoje, na aberta).
 * Por quê: P10b, o centro de um ramo de lugar; o mesmo id do lugar da faixa e do painel.
 */
export function noDaPassagem(e: Passagem, hoje: string): MissaoNo {
    const fim = e.ate ?? (hoje > e.de ? hoje : e.de);
    const n = Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${e.de}T00:00:00Z`)) / 86_400_000) + 1;
    return { id: e.id, tipo: 'lugar', titulo: e.cidade, sub: e.pais ?? FRASES.paisADefinir, linha: `${datasDaPassagem(e)} · ${n} ${n === 1 ? 'dia' : 'dias'}`, ramo: -1 };
}

function passaFiltroDeProjeto(ctx: Ctx, pid: string): boolean {
    const f = ctx.filtros;
    const p = ctx.indice.projetos.get(pid);
    if (!p) return false;
    if (f.filtros.areas.length && !f.filtros.areas.map(fold).includes(fold(p.area))) return false;
    if (f.projeto) {
        const wanted = idDoProjeto(f.projeto);
        const allowed = f.filtros.ramo ? familiaDe(ctx.indice, wanted) : new Set([wanted]);
        if (!allowed.has(pid)) return false;
    }
    return true;
}

/**
 * O que faz: a linha fechada de um período: o rótulo, o detalhe da escala (até 14 marcas:
 * as tarefas no dia, as SMART na semana, os projetos no trimestre, os trimestres no ano),
 * a linha da forma de mostrar do centro e o começo de semana ou de trimestre.
 * Prova: tests/missao/borboleta.test.ts ("a linha fechada").
 */
function linhaFechadaDe(ctx: Ctx, escala: Escala, chave: string, own: MissaoTarefa[]): LinhaFechada {
    const centro = noDoCentro(ctx, escala, chave, own.length);
    const especial = isChaveEspecial(chave);
    let rotulo = centro.titulo;
    let nota = '';
    if (!especial) {
        if (escala === 'dia') {
            rotulo = `${diaDaSemana(chave)} ${diaMes(chave)}`;
            const week = chaveDeHoje('semana', chave);
            if (weekDates(week)[0] === chave) {
                const q = quarterOfWeek(week);
                nota = `${semanaCurta(week)} começa${q && quarterOfWeek(addWeeks(week, -1)) !== q ? ` · ${q} começa` : ''}`;
            }
        } else if (escala === 'semana') {
            const d = weekDates(chave);
            rotulo = `${semanaCurta(chave)} · ${d.length ? `${diaMes(d[0])}–${diaMes(d[6])}` : ''}`;
            const q = quarterOfWeek(chave);
            if (q && q !== quarterOfWeek(addWeeks(chave, -1))) nota = `${q} começa`;
        } else if (escala === 'trimestre' && chave.endsWith('-Q1')) nota = `${chave.slice(0, 4)} começa`;
    }
    let marcas: MarcaFechada[];
    if (escala === 'dia' || especial) {
        marcas = own.map(t => ({ id: t.id, tipo: t.tipo, estado: estadoDe(t), ramo: ramoDe(ctx, t.projeto) }));
    } else if (escala === 'semana') {
        const ids = new Set<string>();
        for (const t of own) { if (t.tipo === 'smart') ids.add(t.id); else if (t.smart) ids.add(t.smart); }
        marcas = [...ids].map(sid => ctx.indice.porId.get(sid)).filter((s): s is MissaoTarefa => !!s)
            .map(s => ({ id: s.id, tipo: 'smart' as const, estado: estadoDe(s), ramo: ramoDe(ctx, s.projeto) }));
    } else if (escala === 'trimestre') {
        const ids = new Set<string>();
        for (const t of own) if (t.projeto) ids.add(t.projeto);
        for (const p of ctx.indice.projetos.values()) if (p.papel !== 'fora') ids.add(p.id);
        marcas = [...ids].filter(pid => ctx.indice.projetos.has(pid) && passaFiltroDeProjeto(ctx, pid))
            .sort((a, b) => compararOrdem(ordemDoProjeto(ctx.indice, a), ordemDoProjeto(ctx.indice, b)))
            .map(pid => ({ id: pid, tipo: 'projeto' as const, ramo: ramoDe(ctx, pid) }));
    } else {
        marcas = [1, 2, 3, 4].map(q => ({ id: `q:${chave}-Q${q}`, tipo: 'trimestre' as const, ramo: -1 }));
    }
    const lugar = especial ? [] : faixaDoPeriodo(ctx.passagens, diasDoPeriodo(escala, chave), ctx.hoje);
    return {
        escala, chave, id: centro.id, rotulo, hoje: ehHoje(escala, chave, ctx.hoje), especial,
        marcas: marcas.slice(0, 14), mais: Math.max(0, marcas.length - 14),
        linha: own.length || escala === 'trimestre' || escala === 'ano' ? centro.linha : FRASES.semTarefas, nota, lugar,
    };
}

/* ------------------------------------------------------------------ contagens */

/** O que faz: as contagens do índice para conferir contra o cofre (cada TaskNote num lugar só). */
export function contar(indice: MissaoIndice, sinais: readonly Sinal[], passagens: readonly Passagem[]): Contagens {
    const porLugar = { linha: 0, 'algum-dia': 0, 'sem-data': 0, neutra: 0 };
    for (const t of indice.tarefas) porLugar[t.colocacao.lugar]++;
    const projetos: Record<Papel, number> = { central: 0, auxiliar: 0, fora: 0 };
    for (const p of indice.projetos.values()) projetos[p.papel]++;
    const sem = indice.vivas.filter(t => !t.projeto);
    const porMotivo: Record<string, number> = {};
    for (const t of sem) porMotivo[t.motivo] = (porMotivo[t.motivo] ?? 0) + 1;
    const sinaisPorTipo: Record<string, number> = {};
    for (const s of sinais) sinaisPorTipo[s.tipo] = (sinaisPorTipo[s.tipo] ?? 0) + 1;
    return {
        porLugar, taskNotes: indice.tarefas.length, fora: indice.fora.length,
        abertas: indice.tarefas.filter(t => t.aberta).length, feitas: indice.tarefas.filter(t => t.feita).length,
        algumDia: indice.tarefas.filter(t => t.algumDia).length, canceladas: porLugar.neutra,
        smart: indice.vivas.filter(t => t.tipo === 'smart').length, acoes: indice.vivas.filter(t => t.tipo === 'acao').length,
        projetos, semProjeto: { total: sem.length, acoes: sem.filter(t => t.tipo === 'acao').length, smart: sem.filter(t => t.tipo === 'smart').length, porMotivo },
        sinais: sinais.length, sinaisPorTipo, passagens: passagens.length, deAntes: indice.vivas.filter(t => t.deAntes).length,
    };
}

/**
 * O que faz: a entrada com os nomes antigos dos campos lidos nas notas das coleções: cada nota pelo modelo dela
 * (`modeloDaNota`), e o campo que ela não tem toma o do nome antigo (`camposComApelidos`).
 * Por quê: 05/11, o gerenciamento dos destinos: o `plataforma` da peça virou `destinos`, e as notas antigas valem como
 * estão (nada se migra).
 * Entra → sai: a entrada → a mesma, ou uma cópia rasa com as notas que mudaram (a entrada não muda).
 * Erro e ataque: a nota sem modelo, ou sem nome antigo a ler, fica como está.
 * Prova: tests/engine/destinosDaPeca.test.ts.
 */
function comOsNomesAntigos(entrada: MissaoEntrada): MissaoEntrada {
    const tipos = entrada.tabelas?.tipos ?? [];
    if (!entrada.notasDosRamos || !tipos.some(m => m.campos.some(c => c.antes?.length))) return entrada;
    const notasDosRamos: NonNullable<MissaoEntrada['notasDosRamos']> = {};
    for (const [chave, notas] of Object.entries(entrada.notasDosRamos)) {
        notasDosRamos[chave] = notas.map(n => {
            const campos = camposComApelidos(modeloDaNota(n.caminho, n.campos, tipos), n.campos ?? {});
            return campos === n.campos ? n : { ...n, campos };
        });
    }
    return { ...entrada, notasDosRamos };
}
