/**
 * Do gesto na tela à intenção: o que soltar um nó sobre outro (ou numa linha) quer dizer,
 * a ligação que se desliga e as opções do "Mover para…", em dados que as gravações entendem.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §3.1: "intenções ('mover t para
 * 28/10', 'ligar SMART s à ação t', 'concluir t')"; §9.3: todo arrasto tem um caminho pelo
 * teclado ou pelo menu). O componente só lê o modelo e chama estas funções; a regra do
 * campo é da tabela das setas (`gestos.ts`), nunca daqui. Os valores de status vêm da
 * tabela de estados da tarefa (`tarefa.json`), pela classe de cada um.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/intencoes.test.ts.
 */
import type { ProjectRef } from '../canvas/edgeLinks';
import type { DomainState } from '../engine/domainModel';
import { fold, linkTarget } from '../project/projectCanvasModel';
import { isoWeekOf } from '../engine/calendario';
import type { Destino, Ligacao, MissaoModelo, MissaoProjeto, MissaoTarefa } from './tipos';
import { addDays, addWeeks, diaDaSemana, diaMes, periodoDoId, semanaCurta, type Escala, MARCA_DA_TRIAGEM } from './tempo';

/** Uma intenção pronta para gravar: a tarefa (o caminho) e o destino; ou o porquê de não. */
export type IntencaoDaTela = { caminho: string; destino: Destino; texto: string } | { problema: string };

/** O modelo, no que estas funções leem. */
type ModeloLido = Pick<MissaoModelo, 'indice' | 'hoje'>;

/** O que faz: a referência de projeto da seta (o nome e as chaves pelas quais as tarefas o apontam). */
export function refDoProjeto(p: Pick<MissaoProjeto, 'nome' | 'nota'>): ProjectRef {
    const keys = new Set([fold(p.nome)]);
    const base = String(p.nota ?? '').split('/').pop()?.replace(/\.md$/, '') ?? '';
    if (base && base.toLowerCase() !== 'readme') keys.add(fold(base));
    return { name: p.nome, keys: [...keys] };
}

/**
 * O que faz: o valor de status de uma classe da tabela de estados (`algum_dia` → `someday`).
 * Erro e ataque: a tabela sem a classe dá `null` (o gesto some, nunca grava um valor inventado).
 */
export function valorDoEstado(tabela: readonly DomainState[], estado: string): string | null {
    return tabela.find(e => e.estado === estado)?.valor ?? null;
}

/**
 * O que faz: o status que a tarefa ganha quando ganha um lugar no tempo (um dia ou uma semana), se o estado
 * dela é de entrada: o estado com a marca `triagem` (no modelo, a `entrada`, `inbox`) passa à `aberta`
 * (`next-action`); os outros estados, `null` (nada muda no status).
 * Por quê: o diagnóstico de 02/11 (D1, aprovado): a tarefa em inbox era a única fantasma real, porque
 * nenhum gesto a tirava de lá. Agora ela tem o grupo Entrada na triagem, e dar um dia ou uma semana, ali ou em
 * qualquer gesto (a seta, o Mover para…), a tira da entrada pelo mesmo caminho. A marca e os valores vêm da
 * tabela do modelo, não do código.
 * Erro e ataque: tabela sem a `aberta`, ou status fora da tabela, dá `null`.
 * Prova: tests/missao/triagem.test.ts ("a Entrada").
 */
export function statusAoGanharLugar(tabela: readonly DomainState[], status: string): string | null {
    const e = tabela.find(x => x.valor === String(status ?? '').trim());
    return e?.marca === MARCA_DA_TRIAGEM ? valorDoEstado(tabela, 'aberta') : null;
}

/** O grupo de um estado no menu de status: o ciclo (planejar, executar, fechar), ou só "estado" no tipo sem lugar. */
export type GrupoDoEstado = 'planejar' | 'executar' | 'fechar' | 'estado';

/** Uma linha do menu de status: o valor gravado, o rótulo da tabela, o grupo, se é o de agora e se conclui. */
export interface OpcaoDoEstado {
    valor: string;
    estado: string;
    rotulo: string;
    grupo: GrupoDoEstado;
    atual: boolean;
    /** O estado de conclusão (`lugar: conclusao`): grava pela conclusão única, que pergunta quando terminou. */
    conclui: boolean;
    /** O estado de fora (`lugar: fora`, a cancelada): neutro, não conta como falta. */
    neutro: boolean;
}

/** A ordem dos grupos no menu: o ciclo do sistema; o tipo sem lugar tem um grupo só. */
export const ORDEM_DOS_GRUPOS: readonly GrupoDoEstado[] = ['planejar', 'executar', 'fechar', 'estado'];

/**
 * O que faz: as opções do menu de status de um nó, lidas da tabela de estados do tipo dele, agrupadas
 * pelo ciclo: o que tem lugar no tempo ou em algum dia é planejar, a conclusão é executar, o de fora é
 * fechar; a tabela sem `lugar` (a estadia) fica num grupo só. Dentro do grupo, a ordem da tabela.
 * Por quê: o menu de status oferece arquivar, excluir e deixar para algum dia (02/11/2026); e o padrão:
 * qualquer tipo com a tabela `estados` ganha o mesmo menu, sem lista escrita no código.
 * Entra → sai: a tabela e o valor de agora → as opções (vazio sem tabela).
 * Erro e ataque: o valor de agora fora da tabela não marca nenhuma; valor repetido na tabela aparece uma vez.
 * Prova: tests/missao/intencoes.test.ts ("o menu de status").
 */
export function opcoesDoEstado(tabela: readonly DomainState[], atual: string | null | undefined): OpcaoDoEstado[] {
    const vistos = new Set<string>();
    const opcoes: OpcaoDoEstado[] = [];
    for (const e of tabela) {
        if (vistos.has(e.valor)) continue;
        vistos.add(e.valor);
        const grupo: GrupoDoEstado = !e.lugar ? 'estado' : e.lugar === 'conclusao' ? 'executar' : e.lugar === 'fora' ? 'fechar' : 'planejar';
        opcoes.push({ valor: e.valor, estado: e.estado, rotulo: e.rotulo, grupo, atual: String(atual ?? '').trim() === e.valor, conclui: e.lugar === 'conclusao', neutro: e.lugar === 'fora' });
    }
    return ORDEM_DOS_GRUPOS.flatMap(g => opcoes.filter(o => o.grupo === g));
}

/** O que faz: o projeto de onde a tarefa sai (o do modelo, direto ou pela SMART), para o "Mudar para" outro projeto. */
function projetoDe(m: ModeloLido, t: MissaoTarefa): ProjectRef | null {
    const p = t.projeto ? m.indice.projetos.get(t.projeto) : null;
    return p ? refDoProjeto(p) : null;
}

const dataCurta = (d: string) => `${diaDaSemana(d)} ${diaMes(d)}`;

/**
 * O que faz: o que soltar a tarefa `origem` sobre o alvo quer dizer.
 * - um dia (`d:`) ou uma semana (`w:`), nó ou linha: mover no tempo;
 * - a prateleira "Sem data": tirar o dia e a semana; "Algum dia" fica com o status (outra gravação);
 * - um projeto (`p:`) ou a faixa dele: mudar de projeto;
 * - uma SMART (`s:`), com uma ação: pôr a ação nela, somando às mães que já tem (`intencaoDeLigarASmart`).
 * Erro e ataque: o trimestre e o ano não têm campo (solte numa semana); a SMART sobre SMART;
 * soltar no próprio lugar; a tarefa que o modelo não conhece.
 */
export function intencaoDeSoltar(m: ModeloLido, origem: string, alvo: string): IntencaoDaTela {
    const t = m.indice.porId.get(origem);
    if (!t) return { problema: 'esta tarefa não está mais no modelo' };
    if (alvo === origem) return { problema: '' };
    const periodo = periodoDoId(alvo);
    if (periodo) {
        if (periodo.chave === 'sem-data') return { caminho: t.caminho, destino: { tipo: 'sem-data' }, texto: 'Tirar a data' };
        if (periodo.chave === 'algum-dia') return { problema: 'Algum dia é um estado: use o botão Algum dia' };
        if (periodo.chave === 'antes' || periodo.chave === 'depois') return { problema: 'solte numa linha do tempo' };
        if (periodo.escala === 'dia') {
            if (t.tipo === 'smart') return { caminho: t.caminho, destino: { tipo: 'semana', semana: isoWeekOf(periodo.chave) }, texto: `Mover para a ${semanaCurta(isoWeekOf(periodo.chave))} (a SMART é da semana)` };
            return { caminho: t.caminho, destino: { tipo: 'dia', data: periodo.chave }, texto: `Agendar para ${dataCurta(periodo.chave)}` };
        }
        if (periodo.escala === 'semana') return { caminho: t.caminho, destino: { tipo: 'semana', semana: periodo.chave }, texto: `Mover para a ${semanaCurta(periodo.chave)}` };
        return { problema: 'o trimestre não tem campo: solte numa semana' };
    }
    const p = m.indice.projetos.get(alvo);
    if (p) {
        if (t.projeto === p.id && !t.smart) return { problema: 'já está neste projeto' };
        return { caminho: t.caminho, destino: { tipo: 'projeto', projeto: refDoProjeto(p), de: projetoDe(m, t) }, texto: `Mudar para ${p.nome}` };
    }
    const s = m.indice.porId.get(alvo);
    if (s && s.tipo === 'smart') return intencaoDeLigarASmart(m, t.id, s.id);
    return { problema: 'solte num dia, numa semana, num projeto ou numa SMART' };
}

/**
 * O que faz: pôr uma ação numa SMART: acrescenta a SMART às mães dela (o `projects`, pela seta
 * SMART → ação), sem tirar as outras SMART nem as tarefas mães; o vínculo direto com o projeto da
 * SMART sai, como na seta (`patchFor` com `motherLink`). É a função única do gesto, em todo lugar:
 * o arrasto da ação sobre a SMART, a alça da SMART, o "Ligar a uma ação", o "＋ Adicionar" do campo
 * do pai, a busca e as candidatas do "+ Nova ação", a triagem e a proposta do agente.
 * Por quê: a regra de 30/10/2026 (uma tarefa pode se ligar a várias SMART, e a segunda SMART é
 * acrescentada à lista) e a decisão de 02/11: pôr numa SMART sempre soma, nunca troca a mãe.
 * Tirar uma mãe é o Desligar (a seção Ligações do painel, a remoção do campo).
 * Entra → sai: o modelo, a ação e a SMART (ids) → a intenção `ligar-smart`, ou o problema.
 * Erro e ataque: a tarefa que o modelo não conhece; a SMART como filha (a SMART não tem SMART
 * mãe); o alvo que não é SMART; a ação que já tem esta SMART entre as mães (a primeira ou não).
 * Prova: tests/missao/intencoes.test.ts ("pôr numa SMART soma").
 */
export function intencaoDeLigarASmart(m: ModeloLido, acao: string, smart: string): IntencaoDaTela {
    const t = m.indice.porId.get(acao);
    const s = m.indice.porId.get(smart);
    if (!t) return { problema: 'esta tarefa não está mais no modelo' };
    if (!s || s.tipo !== 'smart') return { problema: 'solte sobre uma SMART' };
    if (t.tipo === 'smart') return { problema: 'a SMART não tem SMART mãe: solte uma ação' };
    const nome = fold(s.record.basename);
    if (t.smart === s.id || (t.record.projects ?? []).some(x => fold(linkTarget(x)) === nome)) return { problema: 'já está nesta SMART' };
    return { caminho: t.caminho, destino: { tipo: 'ligar-smart', smart: s.caminho }, texto: `Ligar à SMART ${s.titulo}` };
}

/**
 * O que faz: a alça da SMART solta numa ação: a mesma função de pôr numa SMART
 * (`intencaoDeLigarASmart`), lida do lado da SMART.
 * Erro e ataque: a alça solta noutra SMART, no vazio, na ação que já é filha dela.
 */
export function intencaoDaAlca(m: ModeloLido, smart: string, alvo: string): IntencaoDaTela {
    const s = m.indice.porId.get(smart);
    const t = m.indice.porId.get(alvo);
    if (!s || s.tipo !== 'smart') return { problema: 'a alça é de uma SMART' };
    if (!t || t.tipo !== 'acao') return { problema: 'solte sobre uma ação' };
    return intencaoDeLigarASmart(m, t.id, s.id);
}

/**
 * O que faz: a subtarefa (30/10): pôr a ação `filha` embaixo da ação `mae`, acrescentando a mãe ao
 * `projects` dela (o jeito do TaskNotes), sem tirar a SMART nem o projeto que ela já tem.
 * Por quê: ligar duas tarefas também oferece a subtarefa; e as tarefas se conectam entre si e a mais de
 * uma (30/10/2026): a ligação nova se soma, e o Desfazer tira só ela.
 * Erro e ataque: a SMART como mãe ou como filha (é a alça da SMART), a mesma tarefa, a que já é subtarefa
 * dela, a tarefa que o modelo não conhece.
 */
export function intencaoDeSubtarefa(m: ModeloLido, filha: string, mae: string): IntencaoDaTela {
    const f = m.indice.porId.get(filha);
    const p = m.indice.porId.get(mae);
    if (!f || !p) return { problema: 'esta tarefa não está mais no modelo' };
    if (f.tipo !== 'acao' || p.tipo !== 'acao') return { problema: 'a subtarefa liga duas ações' };
    if (f.id === p.id) return { problema: 'a tarefa não é subtarefa dela mesma' };
    const nomeDaMae = fold(p.record.basename);
    if ((f.record.projects ?? []).some(x => fold(x) === nomeDaMae)) return { problema: `já é subtarefa de ${p.titulo}` };
    return { caminho: f.caminho, destino: { tipo: 'mae-tarefa', mae: p.caminho }, texto: `Subtarefa de ${p.titulo}` };
}

/**
 * O que faz: as SMART mães de uma tarefa: a que a linhagem achou e todas as do `projects` dela, pelo nome
 * (uma tarefa liga a mais de uma SMART; 02/11: pôr numa SMART sempre soma).
 * Erro e ataque: um nome que não é SMART fica de fora; a própria tarefa nunca é mãe dela.
 */
export function maesSmartDe(m: ModeloLido, t: MissaoTarefa): string[] {
    const porNome = new Map(m.indice.tarefas.filter(x => x.tipo === 'smart').map(x => [fold(x.record.basename), x.id]));
    const out = new Set<string>(t.smart ? [t.smart] : []);
    for (const p of t.record.projects ?? []) {
        const nome = String(p);
        const s = porNome.get(fold(linkTarget(nome))) ?? porNome.get(fold(nome));
        if (s && s !== t.id) out.add(s);
    }
    return [...out];
}

/** O que faz: a ligação do desenho pode ser desligada? (a mãe, o projeto e o bloqueio; o tempo não). */
export function ligacaoDesligavel(m: ModeloLido, l: Pick<Ligacao, 'de' | 'para' | 'tipo'>): boolean {
    if (l.tipo === 'bloqueio') return m.indice.porId.has(l.de) && m.indice.porId.has(l.para);
    if (l.tipo !== 'estrutura') return false;
    const filha = m.indice.porId.get(l.para);
    if (!filha) return false;
    if (l.de.startsWith('s:')) return maesSmartDe(m, filha).includes(l.de);
    if (l.de.startsWith('p:')) return m.indice.projetos.has(l.de) && !filha.smart;
    return false;
}

/**
 * O que faz: o que desligar uma ligação do desenho quer dizer (a seta apagada no canvas).
 * Erro e ataque: a ligação do tempo, da área ou do lugar não se desliga (não é campo da tarefa).
 */
export function intencaoDeDesligar(m: ModeloLido, l: Pick<Ligacao, 'de' | 'para' | 'tipo'>): IntencaoDaTela {
    if (!ligacaoDesligavel(m, l)) return { problema: 'esta ligação não é um campo da tarefa' };
    const filha = m.indice.porId.get(l.para)!;
    if (l.tipo === 'bloqueio') {
        const b = m.indice.porId.get(l.de)!;
        return { caminho: filha.caminho, destino: { tipo: 'desligar-bloqueio', bloqueio: b.caminho }, texto: `${b.titulo} não bloqueia mais ${filha.titulo}` };
    }
    if (l.de.startsWith('s:')) {
        const s = m.indice.porId.get(l.de)!;
        return { caminho: filha.caminho, destino: { tipo: 'desligar-smart', smart: s.caminho }, texto: `Desligar da SMART ${s.titulo}` };
    }
    const p = m.indice.projetos.get(l.de)!;
    return { caminho: filha.caminho, destino: { tipo: 'desligar-projeto', projeto: refDoProjeto(p) }, texto: `Desligar do projeto ${p.nome}` };
}

/** Uma opção rápida do "Mover para…": o rótulo e o destino. */
export interface OpcaoDeMover { id: string; rotulo: string; destino: Destino }

/**
 * O que faz: as opções rápidas do "Mover para…" de uma tarefa (o caminho do teclado para o
 * arrasto no tempo): hoje, amanhã, a semana que vem e "Sem data"; a SMART fica com as semanas.
 */
export function opcoesDeMover(m: ModeloLido, id: string): OpcaoDeMover[] {
    const t = m.indice.porId.get(id);
    if (!t) return [];
    const hoje = m.hoje;
    const semana = isoWeekOf(hoje);
    const out: OpcaoDeMover[] = [];
    if (t.tipo === 'acao') {
        out.push({ id: 'hoje', rotulo: `Hoje (${dataCurta(hoje)})`, destino: { tipo: 'dia', data: hoje } });
        out.push({ id: 'amanha', rotulo: `Amanhã (${dataCurta(addDays(hoje, 1))})`, destino: { tipo: 'dia', data: addDays(hoje, 1) } });
    } else {
        out.push({ id: 'esta-semana', rotulo: `Esta semana (${semanaCurta(semana)})`, destino: { tipo: 'semana', semana } });
    }
    const prox = addWeeks(semana, 1);
    out.push({ id: 'prox-semana', rotulo: `Próxima semana (${semanaCurta(prox)})`, destino: { tipo: 'semana', semana: prox } });
    out.push({ id: 'sem-data', rotulo: 'Sem data', destino: { tipo: 'sem-data' } });
    return out;
}

/** O que faz: as ações abertas que a alça da SMART pode ligar (o caminho do teclado para a alça). */
export function acoesParaLigar(m: ModeloLido, smart: string): Array<{ id: string; nome: string }> {
    const s = m.indice.porId.get(smart);
    if (!s || s.tipo !== 'smart') return [];
    return m.indice.vivas
        // As que a alça aceita (a mesma função de pôr numa SMART): a que já tem a SMART, a primeira ou não, sai.
        .filter(t => t.tipo === 'acao' && t.aberta && 'caminho' in intencaoDaAlca(m, smart, t.id))
        .sort((a, b) => Number(b.projeto === s.projeto) - Number(a.projeto === s.projeto) || a.titulo.localeCompare(b.titulo))
        .map(t => ({ id: t.id, nome: t.titulo }));
}

/** O que faz: as ligações desligáveis de um nó (o caminho do menu para "selecionar a ligação e Delete"). */
export function ligacoesDoNo(m: ModeloLido, id: string): Array<{ ligacao: Pick<Ligacao, 'de' | 'para' | 'tipo'>; rotulo: string }> {
    const t = m.indice.porId.get(id);
    if (!t) return [];
    const out: Array<{ ligacao: Pick<Ligacao, 'de' | 'para' | 'tipo'>; rotulo: string }> = [];
    // Uma tarefa liga a mais de uma SMART (02/11: pôr numa SMART sempre soma): cada mãe tem o seu Desligar.
    const maes = maesSmartDe(m, t);
    for (const s of maes) out.push({ ligacao: { de: s, para: id, tipo: 'estrutura' }, rotulo: `SMART ${m.indice.porId.get(s)?.titulo ?? ''}` });
    // Com SMART, o projeto vem por ela; sem, o vínculo direto ao projeto.
    if (!maes.length && t.projeto && m.indice.projetos.has(t.projeto)) out.push({ ligacao: { de: t.projeto, para: id, tipo: 'estrutura' }, rotulo: `Projeto ${m.indice.projetos.get(t.projeto)!.nome}` });
    const nomes = new Map(m.indice.tarefas.map(x => [fold(x.record.basename), x]));
    for (const b of t.record.blockedBy ?? []) {
        const x = nomes.get(fold(b));
        if (x) out.push({ ligacao: { de: x.id, para: id, tipo: 'bloqueio' }, rotulo: `Bloqueada por ${x.titulo}` });
    }
    return out;
}

/** O que faz: a escala de uma linha aceita soltar? (o trimestre e o ano não têm campo). */
export const linhaAceitaSoltar = (escala: Escala) => escala === 'dia' || escala === 'semana';

/**
 * O que faz: o projeto de agora de uma tarefa, para o "Mover para outro projeto…" do canvas:
 * o vínculo direto, ou o projeto da SMART mãe (o mesmo `projetoDe` da Missão, §8.5, num
 * nível; o canvas não tem o modelo inteiro).
 * Entra → sai: os destinos de `projects` da tarefa, a SMART pelo nome e os projetos (as
 * referências da seta) → o projeto, ou `null` (sem projeto).
 */
export function projetoAtual(projects: readonly string[], smartPorNome: (nome: string) => { projects: readonly string[] } | null, projetos: readonly ProjectRef[]): ProjectRef | null {
    const achar = (nome: string) => projetos.find(p => p.keys.map(fold).includes(fold(nome))) ?? null;
    for (const nome of projects) {
        const direto = achar(nome);
        if (direto) return direto;
        const smart = smartPorNome(nome);
        for (const dela of smart?.projects ?? []) {
            const p = achar(dela);
            if (p) return p;
        }
    }
    return null;
}
