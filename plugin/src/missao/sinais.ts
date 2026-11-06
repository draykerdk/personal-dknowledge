/**
 * Os sinais da Missão: o que o plano e os dados mostram, com o fato, a data e o próximo
 * passo. Uma função só.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, 8.8) e o plano (3d.4): a SMART
 * sem próxima ação, o prazo vencido, o que ficou de antes, a central sem movimento desde
 * uma data, a semana sem plano no começo, e as faltas de dado da triagem (sem data, sem
 * projeto, sem onde, sem estimativa). A forma é a do cartão de drift (`missionIntent`):
 * o fato, a data e a evidência. Descrevem o plano e os dados, nunca a pessoa: sem
 * "atrasado", "falha", porcentagem nem sequência.
 *
 * Módulo puro. Prova: tests/missao/sinais.test.ts.
 */
import { weekDates } from '../engine/calendario';
import { weekGrammar } from '../engine/tarefasNoPeriodo';
import { fieldNumber } from '../engine/choose';
import { fold, linkTarget } from '../project/projectCanvasModel';
import { ehManutencao } from '../engine/taskSemantics';
import type { ConferenciaLida, MissaoEntrada, NotaComCampos } from './entrada';
import type { Passagem, MissaoIndice, MissaoTarefa, ProximoPasso, Sinal, TipoDeSinal } from './tipos';
import { dataDoCampo, ehDia, semEmojiInicial, textoDoCampo } from './formatos';
import { addDays, chaveDeHoje, diaMes, semanaCurta } from './tempo';
import type { ConferenciaDeclarada, DatasDeclaradas, DeclaracoesDeSinais, LimiteDeclarado, PassoDeclarado } from './estados';
import { campoDaDataDePublicacao, publicadaPeloModelo, valoresLivres, type DomainModel } from '../engine/domainModel';
import { sinaisDaSemanaDoPlano, sinaisDeDataDaTarefa } from './sinaisDoPlano';
import { sinaisDaParaFora, sinalDoFimDaSmart } from './sinaisDaDirecao';

/** Os tipos que são falta de dado (a triagem os filtra). */
export const FALTAS: readonly TipoDeSinal[] = ['sem-data', 'sem-projeto', 'sem-onde', 'sem-estimativa'];

export interface ConfigDosSinais {
    /** Dias sem nada feito nem criado no ramo para a central dar sinal (o modelo do tipo; parto de 7). */
    diasSemMovimento: number;
}

export const CONFIG_PADRAO: ConfigDosSinais = { diasSemMovimento: 7 };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * O que faz: os sinais do cofre de hoje, nesta ordem: os da semana (com os dias úteis vazios e o projeto
 * fora do foco, 02/11), os das centrais e os de cada tarefa (a SMART sem ação, o prazo, o que ficou de
 * antes, as faltas de dado e as datas que se contradizem, 02/11) e os da direção do trabalho (a SMART sem
 * condição de fim e a ação para fora que espera, 02/11).
 * Por quê: "uma função só calcula os sinais" (3d.4); a marca no nó e o filtro da
 * triagem leem daqui.
 * Entra → sai: o índice, a entrada (as notas da semana), hoje e a config → `Sinal[]`.
 * Erro e ataque: a tarefa de algum dia, feita ou cancelada não dá sinal; a recorrente
 * (🌳, 💰) não é "sem projeto", como no "Organizar"; o que veio pelo prazo e ficou de
 * antes é um sinal só (o do prazo).
 * Prova: tests/missao/sinais.test.ts.
 */
export function sinais(indice: MissaoIndice, entrada: Pick<MissaoEntrada, 'semanas'> & Partial<Pick<MissaoEntrada, 'foco' | 'direcao'>>, hoje: string, config: ConfigDosSinais = CONFIG_PADRAO): Sinal[] {
    const out: Sinal[] = [];

    const week = chaveDeHoje('semana', hoje);
    const w = semanaCurta(week);
    const monday = weekDates(week)[0] ?? hoje;
    if (!entrada.semanas?.[week]) {
        out.push({ tipo: 'semana-sem-plano', alvo: `w:${week}`, fato: `a ${w} começou sem nota da semana`, desde: monday, proximoPasso: { acao: 'planejar-semana', rotulo: `🌳 Planejar a ${w}` } });
    } else if (!weekGrammar(week, indice.registros, '').shown) {
        out.push({ tipo: 'semana-sem-plano', alvo: `w:${week}`, fato: `a ${w} começou sem nada no horizonte`, desde: monday, proximoPasso: { acao: 'planejar-semana', rotulo: `🌳 Planejar a ${w}` } });
    }
    // As conferências do plano da semana (02/11): os dias úteis vazios e o projeto fora do foco (sinaisDoPlano).
    out.push(...sinaisDaSemanaDoPlano(indice, { foco: entrada.foco ?? [] }, hoje, new Set(out.map(s => s.alvo))));

    for (const { central: nome, id, familia: family } of indice.ramos) {
        let last: string | null = null;
        for (const t of indice.tarefas) {
            if (!t.projeto || !family.has(t.projeto)) continue;
            for (const d of [t.record.created, t.feita ? t.record.completedDate : '']) if (d && d <= hoje && (!last || d > last)) last = d;
        }
        if (!last) {
            out.push({ tipo: 'central-sem-movimento', alvo: id, fato: `nenhuma tarefa no ramo de ${nome}`, desde: null, proximoPasso: { acao: 'mais-smart', rotulo: '+ SMART' } });
        } else if (daysBetween(last, hoje) >= config.diasSemMovimento) {
            out.push({ tipo: 'central-sem-movimento', alvo: id, fato: `nada feito nem criado no ramo de ${nome} desde ${diaMes(last)}`, desde: last, proximoPasso: { acao: 'mais-smart', rotulo: '+ SMART' } });
        }
    }

    const openChildren = new Map<string, number>();
    for (const t of indice.vivas) if (t.smart && t.tipo === 'acao' && t.aberta) openChildren.set(t.smart, (openChildren.get(t.smart) ?? 0) + 1);
    for (const t of indice.vivas) {
        if (!t.aberta) continue;
        out.push(...sinaisDaTarefa(t, hoje, openChildren.get(t.id) ?? 0), ...sinaisDeDataDaTarefa(t, hoje), ...sinalDoFimDaSmart(t));
    }
    // A direção do trabalho (02/11): a ação para fora que espera, em cada projeto (sinaisDaDirecao).
    out.push(...sinaisDaParaFora(indice, entrada));
    return out;
}

/** O que faz: os sinais de uma tarefa aberta (a SMART sem ação, o prazo, o que ficou de antes, as faltas). */
function sinaisDaTarefa(t: MissaoTarefa, hoje: string, filhasAbertas: number): Sinal[] {
    const out: Sinal[] = [];
    const r = t.record;
    if (t.tipo === 'smart' && filhasAbertas === 0) {
        out.push({ tipo: 'smart-sem-acao', alvo: t.id, fato: 'SMART sem ação aberta', desde: r.created || null, proximoPasso: { acao: 'mais-acao', rotulo: '+ ação' } });
    }
    const due = ehDia(r.due) ? r.due : '';
    const vencida = !!due && due < hoje;
    if (vencida) out.push({ tipo: 'prazo-vencido', alvo: t.id, fato: `prazo em ${diaMes(due)}`, desde: due, proximoPasso: { acao: 'mover-para', rotulo: 'Mover para…' } });
    if (t.deAntes && !(vencida && t.colocacao.fonte === 'prazo')) {
        const c = t.colocacao;
        const fato = c.daSemana ? `era da ${semanaCurta(c.semana ?? '')}` : `marcada para ${diaMes(c.dia ?? '')}`;
        const desde = c.daSemana ? addDays(weekDates(c.semana ?? '')[6] ?? hoje, 1) : c.dia;
        out.push({ tipo: 'ficou-de-antes', alvo: t.id, fato, desde, proximoPasso: { acao: 'mover-para', rotulo: 'Mover para…' } });
    }
    if (t.colocacao.lugar === 'sem-data') out.push({ tipo: 'sem-data', alvo: t.id, fato: 'sem data marcada', desde: null, proximoPasso: { acao: 'mover-para', rotulo: 'Mover para…' } });
    if (!t.projeto && !r.recurrence) {
        const fato = t.motivo === 'vinculo-quebrado' ? `o vínculo aponta para "${t.quebrado}", que não é projeto nem SMART` : t.motivo === 'smart-sem-projeto' ? 'a SMART mãe está sem projeto' : 'sem projeto';
        out.push({ tipo: 'sem-projeto', alvo: t.id, fato, desde: null, proximoPasso: { acao: 'ligar-projeto', rotulo: 'Ligar a um projeto' } });
    }
    if (t.tipo === 'acao' && !(r.contexts ?? []).length) out.push({ tipo: 'sem-onde', alvo: t.id, fato: 'sem "onde"', desde: null, proximoPasso: { acao: 'dar-onde', rotulo: 'Onde dá para fazer' } });
    if (t.tipo === 'acao' && t.estimativa === null) out.push({ tipo: 'sem-estimativa', alvo: t.id, fato: 'sem estimativa', desde: null, proximoPasso: { acao: 'dar-estimativa', rotulo: 'Estimar' } });
    return out;
}

/**
 * O que faz: o trecho fechado sem a revisão: a SMART do trecho concluída (a que tem o `destino`, a que o 🤝 Decidir
 * do 🌍 cria; ou a de manutenção de rotina da linhagem de viagem, a mudança de cidade) e ainda sem o `revisado`, que
 * o 🔄 Revisar o trecho grava nela. O fato diz o dia em que fechou; o próximo passo é o protocolo que a situação do
 * nó sobe na seção Protocolos (o P13, o modelo da SMART), por isso sem o id aqui.
 * Por quê: o ciclo do trecho (02/11): depois que o trecho fecha, a SMART dele oferece a revisão, como a estadia
 * concluída já oferece; a condição é um sinal da lista única, nenhuma condição nova no P13.
 * Entra → sai: o índice e o teste da linhagem de viagem (a borda o tira do recorte do ramo, `noRecorteDoRamo`) → os sinais.
 * Erro e ataque: a SMART aberta, a cancelada, a já revisada e a de manutenção fora da linhagem não dão sinal; a
 * concluída sem a data de conclusão diz só que fechou.
 * Prova: tests/missao/sinais.test.ts ("o trecho sem a revisão").
 */
export function sinaisDosTrechos(indice: Pick<MissaoIndice, 'vivas'>, daViagem: (t: MissaoTarefa) => boolean): Sinal[] {
    const out: Sinal[] = [];
    for (const t of indice.vivas) {
        const r = t.record;
        if (t.tipo !== 'smart' || !t.feita || r.revisado || !(r.destino || (ehManutencao(r) && daViagem(t)))) continue;
        const fechou = ehDia(r.completedDate) ? r.completedDate : '';
        out.push({ tipo: 'trecho-sem-revisao', alvo: t.id, fato: fechou ? `trecho fechado em ${diaMes(fechou)}, sem a revisão` : 'trecho fechado, sem a revisão', desde: fechou || null, proximoPasso: { acao: 'protocolo', rotulo: '🔄 Revisar o trecho' } });
    }
    return out;
}

/**
 * O que faz: a conferência das tarefas de pesquisa (05/11): a tarefa com a tag de uma declaração, aberta e sem os
 * itens da seção da conferência na nota, dá `pesquisa-sem-conferencia` (o próximo passo é o protocolo que leva a
 * lista, e a situação do modelo o sobe no painel); a concluída com item da seção ainda aberto dá
 * `conferencia-aberta`, com quantos, e o próximo passo é abrir a nota.
 * Por quê: nenhuma pesquisa de agente é aceita sem a conferência dos itens críticos; a
 * tag e a seção moram no modelo (`sinais.conferencias`), e o leitor conta os itens da seção (`ConferenciaLida`).
 * Entra → sai: o índice, as declarações e o que o leitor contou (`undefined` = não leu) → os sinais.
 * Erro e ataque: sem a leitura, nenhum sinal (ausência não é zero); a tarefa sem a tag, a cancelada e a de algum
 * dia não dão sinal; a concluída sem a seção não dá sinal (a conferência não foi levada a ela, e o sinal é do
 * item aberto); a seção sem item vale como sem a conferência.
 * Prova: tests/missao/sinais.test.ts ("a conferência de uma pesquisa").
 */
export function sinaisDasConferencias(indice: Pick<MissaoIndice, 'vivas'>, declaradas: readonly ConferenciaDeclarada[], lidas: readonly ConferenciaLida[] | undefined): Sinal[] {
    const out: Sinal[] = [];
    if (!lidas) return out;
    for (const d of declaradas) {
        for (const t of indice.vivas) {
            if (!(t.record.tags ?? []).includes(d.tag)) continue;
            const lida = lidas.find(l => l.caminho === t.caminho && l.secao === d.secao && l.total > 0);
            if (t.aberta && !lida) {
                out.push({ tipo: 'pesquisa-sem-conferencia', alvo: t.id, fato: `${d.fato} sem a conferência`, desde: null, proximoPasso: proximo(d.passo) });
            } else if (t.feita && lida && lida.abertos > 0) {
                const n = lida.abertos;
                const fechou = ehDia(t.record.completedDate) ? t.record.completedDate : '';
                out.push({ tipo: 'conferencia-aberta', alvo: t.id, fato: `${d.fato} concluída com ${n === 1 ? '1 item' : `${n} itens`} da conferência em aberto`, desde: fechou || null, proximoPasso: { acao: 'abrir-nota', rotulo: 'Abrir a nota' } });
            }
        }
    }
    return out;
}

/** O que faz: os sinais por nó (a marca discreta no nó e o texto no título e no painel). */
export function sinaisPorAlvo(lista: readonly Sinal[]): Map<string, Sinal[]> {
    const out = new Map<string, Sinal[]>();
    for (const s of lista) out.set(s.alvo, [...(out.get(s.alvo) ?? []), s]);
    return out;
}

/* ------------------------------------------------------------ os sinais declarados nos modelos */

const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const passoDe = (v: any): PassoDeclarado | null => (txt(v?.protocolo) && txt(v?.rotulo) ? { protocolo: txt(v.protocolo), rotulo: txt(v.rotulo) } : null);

/**
 * O que faz: as declarações de sinal dos modelos dos tipos (o bloco `sinais`: `prazos` e
 * `limites`), só as que têm o que pedem; a conferência com o problema dito é a do modelo
 * (`domainModel.signalProblems`) e a do juiz.
 * Prova: tests/missao/sinais.test.ts ("os sinais declarados").
 */
export function declaracoesDosModelos(modelos: ReadonlyArray<{ sinais?: Record<string, unknown> } & Partial<Pick<DomainModel, 'campos' | 'estados' | 'formatos'>>>): DeclaracoesDeSinais {
    const out: DeclaracoesDeSinais = { prazos: [], limites: [] };
    for (const m of modelos) {
        const b = (m?.sinais ?? {}) as Record<string, any>;
        // 05/11: a cadência e a origem leem do modelo os valores do campo, o dia de ir ao ar, o publicado e o oculto.
        const doModelo = { campos: m?.campos ?? [], estados: m?.estados ?? [], formatos: m?.formatos };
        for (const c of Array.isArray(b.cadencias) ? b.cadencias : []) {
            const campo = doModelo.campos.find(x => x.nome === txt(c?.por));
            const data = campoDaDataDePublicacao(doModelo);
            // Os `livres` (05/11, o canal pessoal de testes, "sem obrigação") saem da cadência.
            const livres = new Set(valoresLivres({ cadencias: [c] }, txt(c?.por)).map(fold));
            const valores = campo?.tipo === 'escolha' && Array.isArray(campo.valores) ? campo.valores.map(String).filter(v => !livres.has(fold(v))) : [];
            if (!txt(c?.type) || !txt(c?.fato) || !data || !valores.length) continue;
            (out.cadencias ??= []).push({ type: txt(c.type), por: txt(c.por), valores, data, publicada: campos => publicadaPeloModelo(doModelo, campos), fato: txt(c.fato), passo: passoDe(c.passo) });
        }
        for (const o of Array.isArray(b.origens) ? b.origens : []) {
            if (!txt(o?.type) || !txt(o?.campo) || !txt(o?.fato)) continue;
            const formatos = Array.isArray(o.formatos) ? o.formatos.map(txt).filter(Boolean) : [];
            const ocultos = doModelo.estados.filter(e => e.mostrar === 'oculto').map(e => e.valor);
            (out.origens ??= []).push({ type: txt(o.type), campo: txt(o.campo), campoDoFormato: doModelo.formatos?.campo ?? null, formatos, ocultos, fato: txt(o.fato), passo: passoDe(o.passo) });
        }
        for (const v of Array.isArray(b.vazios) ? b.vazios : []) {
            if (!txt(v?.type) || !txt(v?.campo) || !txt(v?.fato)) continue;
            const estados = Array.isArray(v.estados) ? v.estados.map(txt).filter(Boolean) : [];
            const ocultos = doModelo.estados.filter(e => e.mostrar === 'oculto').map(e => e.valor);
            (out.vazios ??= []).push({ type: txt(v.type), campo: txt(v.campo), estados, ocultos, fato: txt(v.fato), passo: passoDe(v.passo) });
        }
        for (const p of Array.isArray(b.prazos) ? b.prazos : []) {
            if (txt(p?.type) && txt(p?.campo) && txt(p?.fato)) out.prazos.push({ type: txt(p.type), campo: txt(p.campo), fato: txt(p.fato), passo: passoDe(p.passo) });
        }
        for (const l of Array.isArray(b.limites) ? b.limites : []) {
            if (txt(l?.type) && (txt(l?.ate) || txt(l?.dias)) && txt(l?.lugar) && txt(l?.fato)) {
                out.limites.push({ type: txt(l.type), ate: txt(l.ate) || null, dias: txt(l.dias) || null, lugar: txt(l.lugar), fato: txt(l.fato), recente: txt(l.recente) || null, passo: passoDe(l.passo) });
            }
        }
        for (const c of Array.isArray(b.conferencias) ? b.conferencias : []) {
            if (txt(c?.tag) && txt(c?.secao) && txt(c?.fato)) (out.conferencias ??= []).push({ tag: txt(c.tag).toLowerCase().replace(/^#/, ''), secao: txt(c.secao), fato: txt(c.fato), passo: passoDe(c.passo) });
        }
        for (const d of Array.isArray(b.datas) ? b.datas : []) {
            const lista = (v: unknown) => (Array.isArray(v) ? v.map(txt).filter(Boolean) : []);
            if (txt(d?.type) && txt(d?.de) && txt(d?.ate) && txt(d?.estado) && txt(d?.fato) && lista(d?.conta).length) {
                (out.datas ??= []).push({ type: txt(d.type), de: txt(d.de), ate: txt(d.ate), estado: txt(d.estado), conta: lista(d.conta), aberta: lista(d.aberta), fato: txt(d.fato), passo: passoDe(d.passo) });
            }
        }
    }
    return out;
}

/** Uma nota da sequência: o caminho, o nome, a entrada, a saída e se a reserva está aberta. */
interface NotaDaSequencia { caminho: string; nome: string; de: string; ate: string; aberta: boolean }

/**
 * O que faz: a conferência das datas das notas seguidas (as estadias, 02/11): na ordem da entrada, entre uma nota
 * que conta e a próxima, a noite sem nota (a saída antes da entrada seguinte) e as duas na mesma noite (a entrada
 * seguinte antes da saída); a saída antes da entrada na mesma nota; e a saída que já passou numa reserva aberta.
 * Cada aviso diz o fato e as datas e vai para a nota que o mostra (as duas, entre duas notas).
 * Por quê: a proposta dos ciclos (29/10, §3, a conferência das datas): as datas de tudo se conferem, para
 * não se comprar nem reservar uma data errada; depois de gravar, a Missão confere sozinha e avisa quando
 * algo não fecha, e o aviso diz o fato e as datas, sem julgar. A saída é o
 * dia de deixar o lugar: a saída de uma igual à entrada da próxima fecha a sequência.
 * Entra → sai: as notas (com o frontmatter), as declarações `datas` dos modelos e hoje → `Sinal[]`.
 * Erro e ataque: a nota sem as duas datas, ou num estado fora do `conta` (a triagem, a cancelada), fica de fora da
 * sequência; a sequência só se confere da nota que ainda não acabou em diante (o que já passou não pede conserto);
 * a mesma nota lida duas vezes conta uma; a data malformada vale como sem data.
 * Prova: tests/missao/conferenciaDasDatas.test.ts.
 */
export function sinaisDasDatas(notas: readonly NotaComCampos[], datas: readonly DatasDeclaradas[], hoje: string): Sinal[] {
    const out: Sinal[] = [];
    const unicas = [...new Map(notas.map(n => [n.caminho, n])).values()];
    for (const d of datas) {
        const aviso = (n: NotaDaSequencia, fato: string, desde: string) => out.push({ tipo: 'datas-que-nao-fecham', alvo: `n:${n.caminho}`, fato: `${d.fato}: ${fato}`, desde, proximoPasso: proximo(d.passo) });
        const seq: NotaDaSequencia[] = [];
        for (const n of unicas) {
            if (String(n.campos?.type ?? '').trim() !== d.type) continue;
            const estado = textoDoCampo(n.campos?.[d.estado]);
            if (!d.conta.includes(estado)) continue;
            const de = dataDoCampo(n.campos?.[d.de]);
            const ate = dataDoCampo(n.campos?.[d.ate]);
            if (!de || !ate) continue;
            const nota = { caminho: n.caminho, nome: n.nome, de, ate, aberta: d.aberta.includes(estado) };
            if (ate < de) { aviso(nota, `a saída de ${n.nome} (${diaMes(ate)}) vem antes da entrada (${diaMes(de)})`, de); continue; }
            if (nota.aberta && ate < hoje) aviso(nota, `a saída de ${n.nome} (${diaMes(ate)}) já passou, e a reserva segue aberta`, ate);
            seq.push(nota);
        }
        seq.sort((a, b) => a.de.localeCompare(b.de) || a.ate.localeCompare(b.ate) || a.caminho.localeCompare(b.caminho));
        for (let i = 1; i < seq.length; i++) {
            const a = seq[i - 1], b = seq[i];
            if (b.ate < hoje) continue;
            if (b.de > a.ate) {
                const noites = daysBetween(a.ate, b.de);
                const fato = `${noites === 1 ? 'uma noite' : `${noites} noites`} sem hospedagem entre ${a.nome} (saída ${diaMes(a.ate)}) e ${b.nome} (entrada ${diaMes(b.de)})`;
                aviso(a, fato, a.ate);
                aviso(b, fato, a.ate);
            } else if (b.de < a.ate) {
                const fato = `duas reservas na mesma noite: ${a.nome} (até ${diaMes(a.ate)}) e ${b.nome} (desde ${diaMes(b.de)})`;
                aviso(a, fato, b.de);
                aviso(b, fato, b.de);
            }
        }
    }
    return out;
}

/** O que faz: a chave de um país para comparar: sem a bandeira do começo e sem acento nem caixa ("🇻🇳 Vietnam" = "Vietnam"). */
const chaveDoPais = (v: unknown) => fold(semEmojiInicial(v));

const proximo = (p: PassoDeclarado | null): ProximoPasso => (p ? { acao: 'protocolo', protocolo: p.protocolo, rotulo: p.rotulo } : { acao: 'abrir-nota', rotulo: 'Abrir a nota' });

/**
 * O que faz: a chegada no país (o lugar) da passagem de hoje: a primeira de uma sequência de
 * passagens seguidas no mesmo país, sem dia vazio entre elas.
 * Erro e ataque: passagem sem país, ou nenhuma passagem hoje, dá `null`; um dia vazio entre
 * duas passagens corta a sequência (os dados não dizem onde se esteve nele).
 */
export function chegadaNoLugar(lista: readonly Passagem[], hoje: string): { passagem: Passagem; chegada: string } | null {
    let i = -1;
    lista.forEach((e, k) => { if (e.de <= hoje && (e.ate === null || hoje <= e.ate)) i = k; });
    if (i < 0 || !lista[i].pais) return null;
    const pais = chaveDoPais(lista[i].pais);
    let j = i;
    while (j > 0) {
        const a = lista[j - 1], b = lista[j];
        if (!a.pais || chaveDoPais(a.pais) !== pais) break;
        if (a.ate !== null && a.ate < addDays(b.de, -1)) break;
        j--;
    }
    return { passagem: lista[i], chegada: lista[j].de };
}

/** O que faz: "faltam 12 dias", "é hoje" ou "há 3 dias": o último dia contado de hoje. */
function contadoDeHoje(limite: string, hoje: string): string {
    const n = daysBetween(hoje, limite);
    if (n === 0) return 'é hoje';
    const dias = (k: number) => `${k} ${k === 1 ? 'dia' : 'dias'}`;
    return n > 0 ? `${n === 1 ? 'falta' : 'faltam'} ${dias(n)}` : `há ${dias(-n)}`;
}

/** Um limite achado numa nota: o último dia e de onde ele veio (a data do campo, ou os dias contados). */
interface LimiteAchado { limite: string; porData: boolean; dias: number | null; caminho: string; quando: string }

/**
 * O que faz: o limite de uma nota pela declaração: a data do campo `ate`, quando ela existe e não é
 * de antes da chegada (a de antes é de outra entrada no país); senão os dias do campo `dias`,
 * contados da chegada (o dia da chegada é o primeiro).
 * Erro e ataque: data malformada, número que não é inteiro positivo, ou nenhum dos dois: `null`.
 */
function limiteDaNota(n: NotaComCampos, l: LimiteDeclarado, chegada: string): LimiteAchado | null {
    const quando = l.recente ? dataDoCampo(n.campos?.[l.recente]) : '';
    const data = l.ate ? dataDoCampo(n.campos?.[l.ate]) : '';
    if (data && data >= chegada) return { limite: data, porData: true, dias: null, caminho: n.caminho, quando };
    const dias = l.dias ? fieldNumber(n.campos?.[l.dias]) : null;
    if (dias === null || !Number.isInteger(dias) || dias <= 0) return null;
    return { limite: addDays(chegada, dias - 1), porData: false, dias, caminho: n.caminho, quando };
}

/**
 * O que faz: os sinais que os modelos dos tipos declaram (P10b, §8.8): o prazo adiante (a
 * data de um campo, de hoje em diante: "saída planejada para 05/11") e o limite no lugar,
 * no país da passagem de hoje: pela data até quando ele vale ("último dia do visto: 11/12
 * (faltam 43 dias)", com a saída da passagem quando ela vai além), ou pelos dias contados da
 * chegada ("último dia do visto: 11/12 (o 45º dia desde a chegada no país, em 28/10)").
 * Por quê: §3.8, "o prazo de visto e de saída como sinal"; a forma é a do cartão de drift
 * (o fato, a data e o próximo passo), sem falar da pessoa. O país guarda a data do visto
 * (`visto_ate`, 30/10), que o aviso lê primeiro; os dias ficam para quando não há a data.
 * Entra → sai: as notas (com o frontmatter, o `type` dentro), as passagens, as declarações e
 * hoje → `Sinal[]`.
 * Erro e ataque: a data que passou não é prazo adiante (o trecho feito vem das passagens); sem
 * país na passagem, sem data nem número de dias, ou nenhuma nota do país, o limite fica inerte
 * (nenhum sinal, nenhum número inventado); a data do limite de antes da chegada é de outra
 * entrada e não vale; as declarações com o mesmo `fato` dão um sinal só (a primeira que tem o
 * dado); a mesma nota lida duas vezes conta uma.
 * Prova: tests/missao/sinais.test.ts ("os sinais declarados").
 */
export function sinaisDeclarados(notas: readonly NotaComCampos[], lista: readonly Passagem[], decl: DeclaracoesDeSinais, hoje: string): Sinal[] {
    // As datas de notas seguidas (as estadias, 02/11): a conferência das datas, pela declaração do modelo.
    // A origem que falta (05/11, o corte sem a peça-mãe), também pela declaração do modelo.
    // O campo vazio num estado (05/11, a peça editada ou aprovada sem destino), também pela declaração do modelo.
    const out: Sinal[] = [...sinaisDasDatas(notas, decl.datas ?? [], hoje), ...sinaisDeOrigem(notas, decl.origens ?? []), ...sinaisDeVazio(notas, decl.vazios ?? [])];
    const unicas = [...new Map(notas.map(n => [n.caminho, n])).values()];
    const doTipo = (type: string) => unicas.filter(n => String(n.campos?.type ?? '').trim() === type);
    for (const p of decl.prazos) {
        for (const n of doTipo(p.type)) {
            const d = dataDoCampo(n.campos?.[p.campo]);
            if (!d || d < hoje) continue;
            out.push({ tipo: 'prazo-adiante', alvo: `n:${n.caminho}`, fato: `${p.fato} para ${diaMes(d)}`, desde: d, proximoPasso: proximo(p.passo) });
        }
    }
    const aqui = chegadaNoLugar(lista, hoje);
    if (aqui) {
        const pais = chaveDoPais(aqui.passagem.pais);
        const ditos = new Set<string>();
        for (const l of decl.limites) {
            if (ditos.has(l.fato)) continue;
            const cands = doTipo(l.type)
                .filter(n => chaveDoPais(textoDoCampo(n.campos?.[l.lugar])) === pais)
                .map(n => limiteDaNota(n, l, aqui.chegada))
                .filter((x): x is LimiteAchado => !!x)
                .sort((a, b) => b.quando.localeCompare(a.quando) || a.caminho.localeCompare(b.caminho));
            const c = cands[0];
            if (!c) continue;
            ditos.add(l.fato);
            const saida = aqui.passagem.ate;
            const fato = c.porData
                ? `${l.fato}: ${diaMes(c.limite)} (${contadoDeHoje(c.limite, hoje)}${saida && saida > c.limite ? `; a passagem vai até ${diaMes(saida)}` : ''})`
                : `${l.fato}: ${diaMes(c.limite)} (o ${c.dias}º dia desde a chegada no país, em ${diaMes(aqui.chegada)})`;
            out.push({ tipo: 'limite-no-lugar', alvo: aqui.passagem.id, fato, desde: c.limite, proximoPasso: proximo(l.passo) });
        }
    }
    return out;
}

/**
 * O que faz: a origem que falta: cada nota do tipo, num dos formatos da declaração, sem a nota de origem no campo (o
 * corte sem a peça-mãe), ou com a de origem que não é nota do tipo ("aponta X, que não é peça"). O fato diz isso, sem
 * julgar; o sinal vai para a nota.
 * Por quê: 05/11, a campanha da semana: o corte sai de um longo, e o corte solto não se liga a frente nem a canal pelo
 * longo; só informa, e o próximo passo é o protocolo que a declaração diz.
 * Entra → sai: as notas (com o frontmatter) e as declarações `origens` → `Sinal[]`.
 * Erro e ataque: a nota no estado oculto (o arquivado) e a de outro formato ficam de fora; o link vazio do protocolo
 * (`[[]]`) conta como sem origem; a mesma nota lida duas vezes conta uma.
 * Prova: tests/missao/sinaisDaCampanha.test.ts.
 */
export function sinaisDeOrigem(notas: readonly NotaComCampos[], origens: readonly NonNullable<DeclaracoesDeSinais['origens']>[number][]): Sinal[] {
    const out: Sinal[] = [];
    const unicas = [...new Map(notas.map(n => [n.caminho, n])).values()];
    for (const o of origens) {
        const doTipo = unicas.filter(n => String(n.campos?.type ?? '').trim() === o.type);
        const nomes = new Set(doTipo.map(n => fold(n.nome)));
        for (const n of doTipo) {
            if (o.ocultos.includes(textoDoCampo(n.campos?.status))) continue;
            if (o.formatos.length && !(o.campoDoFormato && o.formatos.includes(textoDoCampo(n.campos?.[o.campoDoFormato])))) continue;
            const cru = n.campos?.[o.campo];
            const alvos = (Array.isArray(cru) ? cru : [cru]).map(linkTarget).filter(x => x.replace(/[\[\]"'\s]/g, ''));
            const fora = alvos.find(x => !nomes.has(fold(x)));
            if (alvos.length && !fora) continue;
            out.push({ tipo: 'sem-peca-mae', alvo: `n:${n.caminho}`, fato: fora ? `${o.fato}: aponta "${fora}", que não está entre as notas do tipo` : o.fato, desde: null, proximoPasso: proximo(o.passo) });
        }
    }
    return out;
}

/**
 * O que faz: o campo vazio num estado: cada nota do tipo num dos estados da declaração (sem a lista, em qualquer um que
 * não é oculto) com o campo vazio; o fato diz isso, sem julgar, e o sinal vai para a nota.
 * Por quê: 05/11, o gerenciamento dos destinos: "para qual perfil ou rede vai cada conteúdo"; a peça editada ou aprovada
 * sem destino ainda não sabe aonde vai. Só informa; nada se cria.
 * Entra → sai: as notas (com o frontmatter, os nomes antigos já lidos) e as declarações `vazios` → `Sinal[]`.
 * Erro e ataque: o texto em branco, a lista vazia e o link vazio (`[[]]`) contam como vazio; o estado compara sem caixa;
 * o oculto (o arquivado) fica de fora; a mesma nota lida duas vezes conta uma.
 * Prova: tests/engine/destinosDaPeca.test.ts.
 */
export function sinaisDeVazio(notas: readonly NotaComCampos[], vazios: readonly NonNullable<DeclaracoesDeSinais['vazios']>[number][]): Sinal[] {
    const out: Sinal[] = [];
    const unicas = [...new Map(notas.map(n => [n.caminho, n])).values()];
    const cheio = (v: unknown) => (Array.isArray(v) ? v : [v]).some(x => String(x ?? '').replace(/[\[\]"'\s]/g, '') !== '');
    for (const d of vazios) {
        const estados = d.estados.map(e => e.toLowerCase());
        for (const n of unicas) {
            if (String(n.campos?.type ?? '').trim() !== d.type) continue;
            const estado = textoDoCampo(n.campos?.status).toLowerCase();
            if (d.ocultos.some(o => o.toLowerCase() === estado)) continue;
            if (estados.length && !estados.includes(estado)) continue;
            if (cheio(n.campos?.[d.campo])) continue;
            out.push({ tipo: 'campo-vazio', alvo: `n:${n.caminho}`, fato: d.fato, desde: null, proximoPasso: proximo(d.passo) });
        }
    }
    return out;
}

/**
 * O que faz: a cadência da semana de hoje: cada valor declarado (o canal) sem nenhuma nota do tipo publicada nesta
 * semana, pelo dia de ir ao ar e pelo modelo. O sinal vai para o nó do valor (o canal na coluna Canais), quando a
 * borda o dá; senão, para a semana.
 * Por quê: 05/11, a campanha da semana: um longo por semana e cortes todos os dias em cada canal; o sinal só diz o
 * fato ("o canal X está sem peça publicada nesta semana") e nunca cria tarefa: a semana é dele.
 * Entra → sai: as notas, as declarações `cadencias`, hoje e o nó de um valor (opcional) → `Sinal[]`.
 * Erro e ataque: a nota sem o dia de ir ao ar, ou com o dia fora da semana, não conta; o valor compara sem acento nem
 * caixa; a mesma nota lida duas vezes conta uma.
 * Prova: tests/missao/sinaisDaCampanha.test.ts.
 */
export function sinaisDeCadencia(notas: readonly NotaComCampos[], cadencias: readonly NonNullable<DeclaracoesDeSinais['cadencias']>[number][], hoje: string, noDoValor: (valor: string) => string | null = () => null): Sinal[] {
    const out: Sinal[] = [];
    const week = chaveDeHoje('semana', hoje);
    const dias = new Set(weekDates(week));
    const monday = weekDates(week)[0] ?? hoje;
    const unicas = [...new Map(notas.map(n => [n.caminho, n])).values()];
    for (const c of cadencias) {
        const publicadas = unicas.filter(n => String(n.campos?.type ?? '').trim() === c.type && dias.has(dataDoCampo(n.campos?.[c.data]) ?? '') && c.publicada(n.campos ?? {}));
        for (const valor of c.valores) {
            if (publicadas.some(n => fold(textoDoCampo(n.campos?.[c.por])) === fold(valor))) continue;
            out.push({ tipo: 'sem-peca-publicada', alvo: noDoValor(valor) ?? `w:${week}`, fato: c.fato.split('{valor}').join(valor), desde: monday, proximoPasso: proximo(c.passo) });
        }
    }
    return out;
}
