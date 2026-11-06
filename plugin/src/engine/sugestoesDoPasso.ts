/**
 * As sugestões declaradas nos passos dos protocolos: `defaultFrom` com `{ "sugestao": "<nome>" }`.
 * Cada nome é uma função pura desta lista fechada, que dá o valor com que o campo abre e o porquê,
 * em palavras.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §5.5, seção O porquê de cada valor): as
 * sugestões que o protótipo fazia no código (`prefill`: as feitas da semana, as pendentes sem
 * computador, a próxima pelo peso) entram como fontes declaradas no próprio passo, resolvidas por
 * uma lista fechada e pura, com o porquê. Assim o JSON do protocolo continua a fonte única das
 * perguntas e de onde vem cada valor. O mesmo padrão das sugestões do Novo (`missao/sugestoes.ts`,
 * P8). O modal (a resposta de abertura) e o formulário usam a mesma função.
 *
 * A sugestão só abre o campo: quem confirma é ele (Enter mantém; mudar é uso normal). Nada aqui
 * grava, e nenhuma fonte inventa valor: sem dado, a fonte devolve `null` e o campo abre como antes.
 *
 * Módulo puro: o que o cofre diz (as tarefas, os pesos, os lugares, o par da semana) chega pronto
 * no contexto, lido pelo motor (`JSONProtocol.contextoDasSugestoes`). Prova:
 * tests/engine/sugestoesDoPasso.test.ts.
 */
import { isClosedUnit, isoWeekOf, linkName, type TaskUnit } from './decisionWeights';
import { leftCommitmentMark } from './commitmentLeft';
import { lugarDoDia } from '../missao/lugares';
import type { Estadia } from '../missao/tipos';
import { addDays, diaDaSemana, diaMes } from '../missao/tempo';
import { weekDates } from './calendario';
import { DIA } from './dia';
import { ehManutencao } from './taskSemantics';
import { campoDaDataDePublicacao, publicadaPeloModelo, valoresLivres, type DomainModel } from './domainModel';
import { grammarCounts, grammarText, timeHorizon } from './showGrammar';

/** A lista fechada das fontes declaráveis num passo. */
export const FONTES_DE_SUGESTAO = [
    'feitas_do_dia', 'feitas_da_semana', 'compromisso_de_amanha', 'acao_do_dia', 'valor_da_semana',
    'modo_do_dia', 'modo_da_semana', 'onde_na_semana', 'cidades_da_semana', 'projetos_da_semana', 'pendentes_sem_computador',
    'smart_da_semana', 'publicadas_da_semana', 'resultados_da_semana',
] as const;

export type FonteDeSugestao = typeof FONTES_DE_SUGESTAO[number];

/** O que faz: o nome é uma fonte da lista fechada. */
export function ehFonteDeSugestao(nome: unknown): nome is FonteDeSugestao {
    return typeof nome === 'string' && (FONTES_DE_SUGESTAO as readonly string[]).includes(nome);
}

/** Os pontos de uma tarefa pela tabela única e a linha do porquê (os pesos que contaram). */
export interface PontosDaTarefa { pontos: number; motivo: string }

/** O que o motor leu do cofre para as sugestões de uma rodada. */
export interface ContextoDaSugestao {
    /** O relógio (`AAAA-MM-DD`). */
    hoje: string;
    /** A data de contexto da rodada (`AAAA-MM-DD`). */
    dia: string;
    /** A semana-alvo (`_target_week`: a que o 🌳 planeja). */
    semanaAlvo: string;
    /** A semana da data de contexto (`_context_week`: a que o 📅 revisa). */
    semanaDoDia: string;
    /** As tarefas (as abertas e as fechadas, com o arquivo). */
    tarefas: readonly TaskUnit[];
    /** Os pontos de cada tarefa aberta pelo caminho; vazio sem a tabela de pesos. */
    pontos: ReadonlyMap<string, PontosDaTarefa>;
    /** Os projetos da Temporada do trimestre da semana-alvo (os nomes). */
    temporada: readonly string[];
    /** As estadias (os lugares), ou `null` se não foram lidas. */
    estadias: readonly Estadia[] | null;
    /** O valor da semana do dia (o par do núcleo): o nome e se já está na nota da semana. */
    valorDaSemana: { nome: string; daNota: boolean } | null;
    /** O compromisso que o 🌙 deixou para o dia (`pinFromYesterday` do passo), com quando. */
    deixada: { nome: string; quando: string } | null;
    /**
     * As peças (05/11, a campanha da semana): as notas de cada modelo com formatos (o frontmatter e o nome), lidas só
     * quando um passo da rodada pede o publicado ou os resultados da semana; sem a chave, nenhuma.
     */
    pecas?: ReadonlyArray<PecasDoModelo>;
}

/** As notas de um tipo com formatos, com o modelo dele (05/11). */
export interface PecasDoModelo {
    modelo: Pick<DomainModel, 'campos' | 'estados' | 'formatos'> & { sinais?: Record<string, unknown> };
    notas: ReadonlyArray<{ nome: string; campos: Record<string, unknown> }>;
}

/** O que faz: as opções da fonte no passo (`defaultFrom` com o `sugestao` dela): os campos de uma chave (`por`, `campos`). */
function camposDaFonte(step: any, nome: string, chave: 'por' | 'campos'): string[] {
    const lista = Array.isArray(step?.defaultFrom) ? step.defaultFrom : step?.defaultFrom ? [step.defaultFrom] : [];
    const v = lista.find((x: any) => x?.sugestao === nome)?.[chave];
    return Array.isArray(v) ? v.map((x: unknown) => String(x ?? '').trim()).filter(Boolean) : [];
}

/** O que faz: os valores de um campo de uma nota, como nomes (o link pelo nome da nota; a lista item por item). */
const valoresDe = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).map(x => linkName(x)).filter(x => x.replace(/[\[\]"'\s]/g, ''));

/**
 * O que faz: o publicado de uma semana, por campo: para cada campo de `por` (o canal, a frente), cada valor com a linha
 * da forma de mostrar (do plano é a peça com o dia de ir ao ar na semana; feita é a publicada pelo modelo); e as
 * peças publicadas na semana, com os campos pedidos (o link da campanha, o que trouxe).
 * Por quê: 05/11, a campanha da semana: o 📅 conta o publicado por canal e por frente, ao lado do que entrou por fonte,
 * e lê o `resultado` e o `link_cta` de cada peça, pela função única de mostrar (nenhuma conta à parte).
 * Entra → sai: as peças, a semana e os campos → `{ porCampo, publicadas }` (vazio sem peça com o dia na semana).
 * Erro e ataque: o campo que o modelo não tem fica de fora; o campo de escolha mostra todos os valores dele (o canal
 * sem peça diz o texto de ausência); o vazio de um campo pedido é o `vazio` do modelo ou "sem dado".
 */
function publicadoDaSemana(pecas: ReadonlyArray<PecasDoModelo>, semana: string, por: readonly string[], campos: readonly string[]): { porCampo: string[]; publicadas: string[] } {
    const dias = weekDates(semana);
    const horizonte = timeHorizon({ weeks: [], dates: dias });
    const porCampo: string[] = [];
    const publicadas: string[] = [];
    const grupos = new Map<string, { rotulo: string; valores: Map<string, Array<{ status: string; scheduled?: string; completedDate?: string }>> }>();
    for (const { modelo, notas } of pecas) {
        const data = campoDaDataDePublicacao(modelo);
        if (!data) continue;
        for (const n of notas) {
            const dia = String(n.campos?.[data] ?? '').slice(0, 10);
            if (!dias.includes(dia)) continue;
            const feita = publicadaPeloModelo(modelo, n.campos);
            const unidade = { status: feita ? 'done' : 'open', scheduled: dia, completedDate: dia };
            for (const nome of por) {
                const campo = modelo.campos.find(c => c.nome === nome);
                if (!campo) continue;
                const g = grupos.get(nome) ?? { rotulo: campo.rotulo, valores: new Map() };
                // O valor livre (o canal sem cadência) só aparece quando tem peça na semana.
                const livres = new Set(valoresLivres(modelo.sinais, nome).map(x => x.toLowerCase()));
                if (!grupos.has(nome) && campo.tipo === 'escolha') for (const v of campo.valores ?? []) if (!livres.has(String(v).toLowerCase())) g.valores.set(String(v), []);
                grupos.set(nome, g);
                for (const v of valoresDe(n.campos?.[nome])) g.valores.set(v, [...(g.valores.get(v) ?? []), unidade]);
            }
            if (feita) {
                const lidos = campos.map(nome => {
                    const campo = modelo.campos.find(c => c.nome === nome);
                    const v = valoresDe(n.campos?.[nome]).join(', ') || String(n.campos?.[nome] ?? '').trim();
                    return campo ? `${campo.rotulo}: ${v || campo.vazio || 'sem dado'}` : '';
                }).filter(Boolean);
                publicadas.push(lidos.length ? `${n.nome} (${lidos.join(' · ')})` : n.nome);
            }
        }
    }
    for (const nome of por) {
        const g = grupos.get(nome);
        if (!g) continue;
        const partes = [...g.valores].map(([v, us]) => `${v}: ${grammarText(grammarCounts(us, horizonte), 'sem peça no plano')}`);
        porCampo.push(`${g.rotulo} · ${partes.join('; ')}`);
    }
    return { porCampo, publicadas };
}

/** Uma sugestão: o valor (na forma da resposta do passo), o porquê e a fonte. */
export interface SugestaoDoPasso { valor: string; porque: string; fonte: FonteDeSugestao }

/** Os status fora da grade do dia (não são a ação de agora nem de amanhã). */
const FORA_DA_GRADE = new Set(['someday', 'maybe', 'waiting-on', 'inbox']);
/** Os contextos que não dependem do computador (os do `countFrom` do pós-cota). */
const SEM_COMPUTADOR = new Set(['📱 Celular', '🌍 Externo', '🚶 Campo', '🤝 Relacional']);

const aberta = (u: TaskUnit) => !isClosedUnit(u);
const acao = (u: TaskUnit) => aberta(u) && u.type !== 'tarefa_smart' && !FORA_DA_GRADE.has(u.status);
const feita = (u: TaskUnit) => u.status === 'done' || u.status === 'completed';

/** O que faz: as tarefas pelos pontos (maior primeiro; empate pelo nome); sem os pontos, a ordem do nome. */
function pelosPontos(lista: readonly TaskUnit[], pontos: ReadonlyMap<string, PontosDaTarefa>): TaskUnit[] {
    const de = (u: TaskUnit) => pontos.get(u.path)?.pontos ?? 0;
    return [...lista].sort((a, b) => de(b) - de(a) || a.name.localeCompare(b.name));
}

/** O que faz: a opção do passo que casa com o padrão (a primeira), ou `null`. */
function opcao(opcoes: readonly string[] | null, padrao: RegExp): string | null {
    return (opcoes ?? []).find(o => padrao.test(String(o))) ?? null;
}

/** O que faz: os nomes de todos os pais de uma tarefa pelo `projects`, subindo até quatro níveis. */
function ancestrais(u: TaskUnit, porNome: ReadonlyMap<string, TaskUnit>): string[] {
    const out: string[] = [];
    let fila = [...u.projects];
    for (let nivel = 0; nivel < 4 && fila.length; nivel++) {
        const proxima: string[] = [];
        for (const nome of fila) {
            if (out.includes(nome)) continue;
            out.push(nome);
            proxima.push(...(porNome.get(nome)?.projects ?? []));
        }
        fila = proxima;
    }
    return out;
}

const lista3 = (us: readonly TaskUnit[]) => us.slice(0, 3).map(u => u.name).join(' · ');
const dataCurta = (dia: string) => `${diaDaSemana(dia)} ${diaMes(dia)}`;

/**
 * O que faz: a sugestão de uma fonte para um passo, ou `null` (a fonte não tem valor agora).
 * Por quê: §5.5; o que cada fonte faz é o que o protótipo fazia (`prefill`), com os dados reais:
 * - `feitas_do_dia`: até três concluídas no dia ("concluídas neste dia");
 * - `feitas_da_semana`: até três concluídas na semana revisada ("o que foi concluído na semana");
 * - `compromisso_de_amanha`: a ação aberta marcada para amanhã, senão a de mais peso ("vira tarefa
 *   com data de amanhã");
 * - `acao_do_dia`: a deixada pelo 🌙 (a marca dela, como na lista), senão a do dia (ou atrasada,
 *   hoje) de mais peso, com os pesos que contaram;
 * - `valor_da_semana`: o valor da semana do dia ("o valor da semana" ou "a sugestão da semana");
 * - `modo_do_dia`: "✈️ Viagem" no dia de trajeto ou de uma chegada;
 * - `modo_da_semana`: "✈️ viagem" se a semana tem um trajeto ou uma chegada, senão "normal";
 * - `onde_na_semana`: "✈️ Cidade nova" com uma chegada marcada na semana, senão "📍 Mesma cidade" (o 🌳 do cofre
 *   pergunta as cidades desde 02/11, pela `cidades_da_semana`; a cópia congelada do registro de ouro ainda lê esta);
 * - `cidades_da_semana`: as cidades das passagens da semana, na ordem (a semana dividida), e sem nenhuma
 *   marcada nela, a passagem de agora ("a passagem de agora, pelas Days"; proposta da viagem nos ciclos, §3);
 * - `projetos_da_semana`: a Temporada e os projetos com tarefa aberta na semana;
 * - `pendentes_sem_computador`: até três pendentes nos contextos sem computador;
 * - `smart_da_semana`: criar a SMART agora até a semana ter três (as de manutenção, `natureza: manutencao`, fora da conta);
 * - `publicadas_da_semana` (05/11): o publicado da semana revisada por cada campo do `por` da fonte (o canal, a frente),
 *   pela forma de mostrar ("o publicado da semana, pelas peças");
 * - `resultados_da_semana` (05/11): as peças publicadas na semana revisada, com os `campos` da fonte (o link da
 *   campanha, o que trouxe), para a leitura do resultado.
 * Entra → sai: o nome da fonte, o passo (o tipo e as opções do JSON), o contexto e as opções do
 * passo montado (`null` = as do JSON) → a sugestão, com o valor na forma da resposta do passo
 * (o texto, a opção, o nome da nota, ou `[[A]], [[B]]` nas notas).
 * Erro e ataque: nome fora da lista → `null`; opção que o passo não tem → `null`; data inválida
 * não casa com dia nenhum; a ação "de mais peso" sem a tabela de pesos → `null` (sem o porquê dos
 * pesos não há sugestão); a entrada não muda.
 * Prova: tests/engine/sugestoesDoPasso.test.ts.
 */
export function sugestaoDoPasso(nome: string, step: any, ctx: ContextoDaSugestao, opcoes?: readonly string[] | null): SugestaoDoPasso | null {
    if (!ehFonteDeSugestao(nome) || !ctx) return null;
    const opts = opcoes ?? (Array.isArray(step?.options) ? step.options.map(String) : null);
    const s = (valor: string | null | undefined, porque: string): SugestaoDoPasso | null =>
        (valor && String(valor).trim() ? { valor: String(valor), porque, fonte: nome } : null);
    const tarefas = ctx.tarefas ?? [];
    switch (nome) {
        case 'feitas_do_dia': {
            const feitas = tarefas.filter(u => feita(u) && u.completed === ctx.dia);
            return s(lista3(feitas), 'concluídas neste dia');
        }
        case 'feitas_da_semana': {
            const feitas = tarefas.filter(u => feita(u) && u.completed && isoWeekOf(u.completed) === ctx.semanaDoDia)
                .sort((a, b) => a.completed.localeCompare(b.completed) || a.name.localeCompare(b.name));
            return s(lista3(feitas), 'o que foi concluído na semana');
        }
        case 'compromisso_de_amanha': {
            if (!DIA.test(String(ctx.dia))) return null;
            const amanha = addDays(ctx.dia, 1);
            const marcadas = pelosPontos(tarefas.filter(u => acao(u) && u.scheduled === amanha), ctx.pontos);
            const escolhida = marcadas[0] ?? (ctx.pontos.size ? pelosPontos(tarefas.filter(u => acao(u) && ctx.pontos.has(u.path)), ctx.pontos)[0] : undefined);
            return escolhida ? s(escolhida.name, `vira tarefa com data de amanhã (${dataCurta(amanha)})`) : null;
        }
        case 'acao_do_dia': {
            const deixada = ctx.deixada ? tarefas.find(u => u.name === ctx.deixada!.nome && acao(u)) : undefined;
            if (deixada) return s(deixada.name, leftCommitmentMark(ctx.deixada!.quando));
            if (!ctx.pontos.size) return null;
            const doDia = tarefas.filter(u => acao(u) && ctx.pontos.has(u.path) && (u.scheduled === ctx.dia
                || (ctx.dia === ctx.hoje && ((u.scheduled && u.scheduled < ctx.dia) || (u.due && u.due < ctx.dia)))));
            const escolhida = pelosPontos(doDia, ctx.pontos)[0];
            return escolhida ? s(escolhida.name, ctx.pontos.get(escolhida.path)?.motivo || 'sem peso do plano') : null;
        }
        case 'valor_da_semana': {
            const v = ctx.valorDaSemana;
            return v ? s(v.nome, v.daNota ? 'o valor da semana' : 'a sugestão da semana') : null;
        }
        case 'modo_do_dia': {
            if (!ctx.estadias) return null;
            const lugar = lugarDoDia(ctx.estadias, ctx.dia, ctx.hoje);
            if (lugar.viagem) return s(opcao(opts, /viag/i), `dia de trajeto (${lugar.texto})`);
            // A chegada sem a estadia de antes marcada também é mudança de lugar no dia.
            const chegada = ctx.estadias.find(e => e.de === ctx.dia);
            return chegada ? s(opcao(opts, /viag/i), `chegada em ${chegada.cidade}`) : null;
        }
        case 'modo_da_semana': {
            if (!ctx.estadias) return null;
            const dias = weekDates(ctx.semanaAlvo);
            const trajeto = dias.map(d => ({ d, l: lugarDoDia(ctx.estadias!, d, ctx.hoje) })).find(x => x.l.viagem);
            if (trajeto) return s(opcao(opts, /viag/i), `a semana tem o trajeto de ${diaMes(trajeto.d)} (${trajeto.l.texto})`);
            const chegada = ctx.estadias.find(e => dias.includes(e.de));
            if (chegada) return s(opcao(opts, /viag/i), `chegada em ${chegada.cidade} em ${diaMes(chegada.de)}`);
            return s(opcao(opts, /^normal$/i), 'nenhuma mudança de lugar marcada nesta semana');
        }
        case 'onde_na_semana': {
            if (!ctx.estadias) return null;
            const dias = new Set(weekDates(ctx.semanaAlvo));
            const chegada = ctx.estadias.find(e => dias.has(e.de));
            if (chegada) return s(opcao(opts, /nova/i), `chegada em ${chegada.cidade} em ${diaMes(chegada.de)}`);
            return s(opcao(opts, /mesma/i), 'sem chegada nova marcada');
        }
        case 'cidades_da_semana': {
            if (!ctx.estadias) return null;
            const nomes: string[] = [];
            for (const d of weekDates(ctx.semanaAlvo)) for (const p of lugarDoDia(ctx.estadias, d, ctx.hoje).passagens) if (!nomes.includes(p.cidade)) nomes.push(p.cidade);
            if (nomes.length) return s(nomes.map(n => `[[${n}]]`).join(', '), nomes.length > 1 ? `a semana dividida, pelas Days (${nomes.join(' → ')})` : 'a passagem da semana, pelas Days');
            const agora = lugarDoDia(ctx.estadias, ctx.hoje, ctx.hoje).passagens;
            const atual = agora[agora.length - 1];
            return atual ? s(`[[${atual.cidade}]]`, `a passagem de agora (${atual.cidade}), pelas Days`) : null;
        }
        case 'projetos_da_semana': {
            const porNome = new Map(tarefas.map(u => [u.name, u]));
            const nomes: string[] = [...(ctx.temporada ?? [])];
            for (const u of tarefas) {
                if (!aberta(u) || u.week !== ctx.semanaAlvo) continue;
                for (const n of ancestrais(u, porNome)) if (!porNome.has(n) && !nomes.includes(n)) nomes.push(n);
            }
            return s(nomes.map(n => `[[${n}]]`).join(', '), 'a Temporada e os projetos com tarefa aberta nesta semana');
        }
        case 'pendentes_sem_computador': {
            const pendentes = tarefas.filter(u => aberta(u) && !['waiting-on', 'someday', 'maybe'].includes(u.status)
                && u.contexts.some(c => SEM_COMPUTADOR.has(c)));
            return s(lista3(pelosPontos(pendentes, ctx.pontos)), 'pendentes que não dependem do computador');
        }
        case 'smart_da_semana': {
            // A SMART de manutenção (a mudança de cidade, um documento) não conta nas até 3 (29/10, §3).
            const n = tarefas.filter(u => u.type === 'tarefa_smart' && u.week === ctx.semanaAlvo && u.status !== 'cancelled' && !ehManutencao(u)).length;
            const escolha = (opts ?? [])[n >= 3 ? 1 : 0];
            return s(escolha, `a semana tem ${n ? `${n} SMART` : 'nenhuma SMART'} (até 3)`);
        }
        case 'publicadas_da_semana': {
            if (!ctx.pecas) return null;
            const { porCampo } = publicadoDaSemana(ctx.pecas, ctx.semanaDoDia, camposDaFonte(step, nome, 'por'), []);
            return s(porCampo.join(' | ') || 'nenhuma peça com o dia de ir ao ar nesta semana', 'o publicado da semana, pelas peças');
        }
        case 'resultados_da_semana': {
            if (!ctx.pecas) return null;
            const { publicadas } = publicadoDaSemana(ctx.pecas, ctx.semanaDoDia, [], camposDaFonte(step, nome, 'campos'));
            return s(publicadas.join(' | ') || 'nenhuma peça publicada nesta semana', 'as peças publicadas na semana, com o link e o que trouxe');
        }
    }
    return null;
}
