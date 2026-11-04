/**
 * A linhagem da Missão: o projeto de cada TaskNote (direto ou pela SMART mãe), o papel de
 * cada projeto na Temporada (central, auxiliar, fora), a área, o ramo e a faixa "sem
 * projeto"; e o realce da linhagem de um nó.
 *
 * Por quê: os nós e as ligações saem dos campos que já existem (`projects`, `week`,
 * `scheduled`, a SMART mãe); nada é desenhado à parte (plano, 2). A tarefa sem projeto
 * fica numa faixa neutra e não some (3c.5); o vínculo para nada é "vínculo quebrado",
 * como no "Organizar" do painel (`panelNav.ts`).
 *
 * Módulo puro. Prova: tests/missao/linhagem.test.ts.
 */
import type { TaskRecord } from '../tasks/taskRecord';
import { fold, linkTarget, projectKeys } from '../project/projectCanvasModel';
import { estadoDaTarefa, estadoDoProjeto, tabelasVazias } from './estados';
import { CASAS_PADRAO, tarefaEmCasa, type MissaoEntrada } from './entrada';
import { chaveNaEscala, ficouDeAntes, idDoPeriodo, isChaveEspecial, linhaDe, lugarNoTempo, periodoDoId, estaAberta, estaAlgumDia, estaFeita, type Janela } from './tempo';
import { isoWeekOf, quarterOfWeek } from '../engine/calendario';
import type { MissaoArea, MissaoIndice, MissaoProjeto, MissaoTarefa, MotivoDoProjeto, Papel, RecorteDoRamo } from './tipos';

export const idDoProjeto = (nome: string) => `p:${fold(nome)}`;
export const idDaArea = (nome: string) => `a:${fold(nome)}`;
export const idDaTarefa = (r: Pick<TaskRecord, 'path' | 'type'>) => `${r.type === 'tarefa_smart' ? 's' : 't'}:${r.path}`;
export const VISAO_ID = 'v:visao';

const isSmart = (r: Pick<TaskRecord, 'type'>) => r.type === 'tarefa_smart';
const TASK_TYPES = new Set(['task', 'tarefa_smart']);

/**
 * O que faz: o projeto de uma lista de vínculos (`projects`): o que aponta direto para
 * um projeto vence; senão, pela SMART mãe, até 4 níveis; senão, pela tarefa mãe (a subtarefa do
 * TaskNotes, 29/10), também até 4 níveis; sem nada, o motivo.
 * Por quê: "pelo `projects` direto, ou pela SMART mãe (até 4 níveis). O vínculo para
 * nada é 'vínculo quebrado'" (arquitetura 8.5). A subtarefa é a tarefa cujo `projects` aponta
 * outra tarefa: não é vínculo quebrado, e o projeto vem da mãe.
 * Entra → sai: os vínculos, as chaves de projeto (`projectKeys`), as SMART por chave, os
 * outros destinos válidos (áreas) e as tarefas mães por chave → { projeto, motivo, quebrado }.
 * Erro e ataque: ciclo SMART → SMART para no limite; caixa e acento não contam.
 * Prova: tests/missao/linhagem.test.ts ("o projeto de cada tarefa").
 */
export function projetoDe(
    links: readonly string[],
    projetoPorChave: ReadonlyMap<string, string>,
    smartPorChave: ReadonlyMap<string, Pick<TaskRecord, 'projects'>>,
    outros: ReadonlySet<string> = new Set(),
    nivel = 0,
    maes: ReadonlyMap<string, Pick<TaskRecord, 'projects'>> = new Map(),
): { projeto: string | null; motivo: MotivoDoProjeto; quebrado: string | null } {
    const list = (links ?? []).map(l => fold(linkTarget(l))).filter(Boolean);
    if (!list.length) return { projeto: null, motivo: 'sem-vinculo', quebrado: null };
    for (const key of list) if (projetoPorChave.has(key)) return { projeto: projetoPorChave.get(key)!, motivo: nivel ? 'pela-smart' : 'direto', quebrado: null };
    let viaSmart = false;
    if (nivel < 4) {
        for (const key of list) {
            const smart = smartPorChave.get(key);
            if (!smart) continue;
            viaSmart = true;
            const found = projetoDe(smart.projects ?? [], projetoPorChave, smartPorChave, outros, nivel + 1, maes);
            if (found.projeto) return { projeto: found.projeto, motivo: 'pela-smart', quebrado: null };
        }
    }
    if (viaSmart || list.some(k => smartPorChave.has(k))) return { projeto: null, motivo: 'smart-sem-projeto', quebrado: null };
    // A tarefa mãe (a subtarefa): o projeto dela, ou o motivo dela (nunca "vínculo quebrado").
    const mae = list.map(k => maes.get(k)).find(Boolean);
    if (mae) {
        const found = nivel < 4 ? projetoDe(mae.projects ?? [], projetoPorChave, smartPorChave, outros, nivel + 1, maes) : null;
        return found?.projeto ? { projeto: found.projeto, motivo: 'pela-tarefa', quebrado: null } : { projeto: null, motivo: found && found.motivo !== 'vinculo-quebrado' ? found.motivo : 'sem-vinculo', quebrado: null };
    }
    const broken = (links ?? []).find(l => !outros.has(fold(linkTarget(l))));
    if (broken === undefined) return { projeto: null, motivo: 'outro-destino', quebrado: null };
    return { projeto: null, motivo: 'vinculo-quebrado', quebrado: linkTarget(broken) };
}

/**
 * O que faz: o índice da Missão: os projetos com o papel na Temporada, as áreas e cada
 * TaskNote com o lugar no tempo, a SMART mãe e o projeto.
 * Por quê: a central é a da Temporada (`temporadaFrom`); o auxiliar serve a uma central
 * pelo `projects` da própria nota (em cadeia) e, com a lista de foco do trimestre
 * (`focoDoTrimestre`), só se está nela, como no painel (`panelNav.buildNav`).
 * Entra → sai: `MissaoEntrada` (com as tabelas dos tipos) → `MissaoIndice` (a entrada não é mutada).
 * Erro e ataque: projeto que serve a si mesmo não vira auxiliar de si; ciclo de
 * centrais para em 4 níveis; projeto encerrado não é auxiliar.
 * Prova: tests/missao/linhagem.test.ts ("índice: vínculos e papéis").
 */
export function indiceDaMissao(entrada: MissaoEntrada): MissaoIndice {
    // Os estados (feita, algum dia, cancelada; a coluna do projeto) e o modelo antigo vêm
    // das tabelas dos tipos (Passo 0, 0b e 0f), nunca de uma lista no código.
    const tabelas = entrada.tabelas ?? tabelasVazias();
    const antigas = new Set(entrada.tarefasAntigas ?? []);
    const temporadaKeys = (entrada.temporada ?? []).map(n => fold(linkTarget(n))).filter(Boolean);
    const focoKeys = new Set((entrada.foco ?? []).map(n => fold(linkTarget(n))));
    const byKey = new Map<string, MissaoEntrada['projetos'][number]>();
    for (const p of entrada.projetos ?? []) if (p?.nome && !byKey.has(fold(p.nome))) byKey.set(fold(p.nome), p);

    const centralOf = (key: string, seen: string[] = []): string | null => {
        if (temporadaKeys.includes(key)) return key;
        const p = byKey.get(key);
        if (!p || seen.includes(key) || seen.length > 4) return null;
        for (const s of p.serve ?? []) {
            const c = centralOf(fold(linkTarget(s)), [...seen, key]);
            if (c) return c;
        }
        return null;
    };

    const projetos = new Map<string, MissaoProjeto>();
    const projetoPorChave = new Map<string, string>();
    for (const [key, p] of byKey) {
        const estado = estadoDoProjeto(p.fase, tabelas.projeto);
        const encerrado = estado?.estado === 'feito';
        const isCentral = temporadaKeys.includes(key);
        const central = isCentral ? key : encerrado ? null : centralOf(key);
        const inFoco = !focoKeys.size || focoKeys.has(key);
        const papel: Papel = isCentral ? 'central' : central && inFoco ? 'auxiliar' : 'fora';
        const id = idDoProjeto(p.nome);
        projetos.set(id, {
            id, nome: p.nome, area: p.area || 'Sem área', tipo: p.tipo, fase: p.fase, estado, encerrado, papel,
            central: papel === 'fora' ? null : byKey.get(central!)?.nome ?? null,
            serve: [...(p.serve ?? [])],
            ...(p.proxima ? { fixada: p.proxima } : {}),
            ramo: papel === 'fora' ? -1 : temporadaKeys.indexOf(central!),
            nota: p.nota ?? null, canvas: p.canvas ?? null, pasta: p.pasta,
        });
        for (const k of projectKeys({ name: p.nome, index: p.nota })) if (!projetoPorChave.has(k)) projetoPorChave.set(k, id);
    }

    const areas = new Map<string, MissaoArea>();
    for (const a of entrada.areas ?? []) {
        const id = idDaArea(a.nome);
        if (!areas.has(id)) areas.set(id, { id, nome: a.nome, nota: a.nota, canvas: a.canvas, projetos: [] });
    }
    for (const p of projetos.values()) {
        const id = idDaArea(p.area);
        if (!areas.has(id)) areas.set(id, { id, nome: p.area, nota: null, canvas: null, projetos: [] });
        areas.get(id)!.projetos.push(p.id);
    }
    const outros = new Set([...areas.values()].map(a => fold(a.nome)));

    const registros = [...(entrada.tarefas ?? [])].filter(Boolean);
    const smartPorChave = new Map(registros.filter(isSmart).map(t => [fold(t.basename), t]));
    const maes = new Map(registros.filter(t => TASK_TYPES.has(t.type) && !isSmart(t)).map(t => [fold(t.basename), t]));
    const tarefas: MissaoTarefa[] = [];
    const fora: TaskRecord[] = [];
    for (const r of registros) {
        // Só a TaskNote da casa vira nó (o `type` confirma): o modelo e a tarefa arquivada
        // fora das pastas do TaskNotes ficam de fora, contados.
        if (!TASK_TYPES.has(r.type) || !tarefaEmCasa(r.path, entrada.casas ?? CASAS_PADRAO)) { fora.push(r); continue; }
        const colocacao = lugarNoTempo(r, tabelas.tarefa);
        const smart = isSmart(r);
        const mother = smart ? null : (r.projects ?? []).map(l => smartPorChave.get(fold(linkTarget(l)))).find(Boolean) ?? null;
        const where = projetoDe(r.projects ?? [], projetoPorChave, smartPorChave, outros, 0, maes);
        const est = typeof r.timeEstimate === 'number' && r.timeEstimate > 0 ? r.timeEstimate : null;
        tarefas.push({
            id: idDaTarefa(r), caminho: r.path, titulo: r.title || r.basename, tipo: smart ? 'smart' : 'acao',
            status: String(r.status ?? '').toLowerCase(), feita: estaFeita(r, tabelas.tarefa), algumDia: estaAlgumDia(r, tabelas.tarefa), aberta: estaAberta(r, tabelas.tarefa),
            colocacao, deAntes: ficouDeAntes(r, colocacao, entrada.hoje, tabelas.tarefa), smart: mother ? idDaTarefa(mother) : null,
            projeto: where.projeto, motivo: where.motivo, quebrado: where.quebrado, estimativa: est,
            estado: estadoDaTarefa(r.status, tabelas.tarefa), modeloAntigo: antigas.has(r.path), record: r,
        });
    }
    const centrais = temporadaKeys.map(k => byKey.get(k)?.nome).filter((n): n is string => !!n);
    // O ramo de cada central, composto uma vez aqui: os sinais o recebem pronto (passo familia).
    const ramos = centrais.map(nome => ({ central: nome, id: idDoProjeto(nome), familia: familiaDe({ projetos }, idDoProjeto(nome)) }));
    return {
        hoje: entrada.hoje, tarefas, vivas: tarefas.filter(t => t.colocacao.lugar !== 'neutra'),
        porId: new Map(tarefas.map(t => [t.id, t])), projetos, areas, registros, fora, centrais, ramos, tabelas,
    };
}

/** O que faz: os ids dos projetos de um ramo: a central e os auxiliares dela (ou só o próprio projeto). */
export function familiaDe(indice: Pick<MissaoIndice, 'projetos'>, id: string): Set<string> {
    const p = indice.projetos.get(id);
    const out = new Set<string>([id]);
    if (p?.papel === 'central') for (const x of indice.projetos.values()) if (x.papel === 'auxiliar' && x.central === p.nome) out.add(x.id);
    return out;
}

/**
 * O que faz: o teste do recorte de um ramo sobre uma tarefa: entra a que tem uma das etiquetas do
 * recorte, ou cujo projeto (direto ou pela SMART mãe, o `projeto` do índice) é um dos projetos do
 * recorte ou um auxiliar dele; sem etiqueta nem projeto no recorte, toda tarefa entra.
 * Por quê: a proposta dos ciclos (29/10, §5, parte 1 do §9): o ramo de um recorte acha as tarefas
 * também pela linhagem do projeto, e não só pela etiqueta, e a tarefa ligada ao projeto sem a
 * etiqueta aparece. Um teste só para o modelo (as tarefas à vista) e para as listas do
 * escolher (o que se escolhe no ramo), para os dois nunca divergirem.
 * Entra → sai: o índice (os projetos) e o recorte → o teste (a tarefa → entra ou não).
 * Erro e ataque: etiqueta com `#` ou em maiúsculas casa igual; o projeto que não existe no índice não
 * acha tarefa nenhuma (só a etiqueta vale); a tarefa sem projeto entra só pela etiqueta.
 * Prova: tests/missao/linhagem.test.ts ("o recorte do ramo").
 */
export function noRecorteDoRamo(indice: Pick<MissaoIndice, 'projetos'>, recorte: RecorteDoRamo | null | undefined): (t: Pick<MissaoTarefa, 'projeto' | 'record'>) => boolean {
    const tags = new Set((recorte?.tags ?? []).map(x => String(x).replace(/^#/, '').toLowerCase()).filter(Boolean));
    const projetos = new Set<string>();
    for (const nome of recorte?.projetos ?? []) for (const id of familiaDe(indice, idDoProjeto(linkTarget(nome) || nome))) projetos.add(id);
    if (!tags.size && !projetos.size) return () => true;
    return t => (t.record.tags ?? []).some(x => tags.has(String(x).replace(/^#/, '').toLowerCase()))
        || (!!t.projeto && projetos.has(t.projeto));
}

/** O que faz: as tarefas vivas sem projeto (a faixa neutra "sem projeto"), do jeito que o índice as tem. */
export function semProjeto(indice: MissaoIndice): MissaoTarefa[] {
    return indice.vivas.filter(t => !t.projeto);
}

/**
 * O que faz: a linhagem de um nó: tudo o que se liga a ele pelos campos (a tarefa, a
 * SMART mãe, o projeto, a área, a central, o dia, a semana, o trimestre, o ano, a visão;
 * o projeto, as tarefas dele e dos auxiliares; o período, as tarefas dele; o lugar, os
 * dias dele).
 * Por quê: o realce da linhagem (passar o mouse ou escolher um nó) mostra de onde vem e
 * para onde vai cada coisa, sem nada desenhado à parte.
 * Entra → sai: índice, id, a janela da escala à vista e os dias de cada lugar → ids
 * (inclui o próprio).
 * Prova: tests/missao/linhagem.test.ts ("linhagem").
 */
export function linhagemDe(indice: MissaoIndice, id: string, janela: Janela, lugares: ReadonlyMap<string, readonly string[]> = new Map()): Set<string> {
    const out = new Set<string>([id]);
    const lugarDoDia = new Map<string, string[]>();
    for (const [lid, dias] of lugares) for (const d of dias) lugarDoDia.set(d, [...(lugarDoDia.get(d) ?? []), lid]);
    const addPeriodos = (dia: string) => {
        const w = isoWeekOf(dia);
        const q = quarterOfWeek(w);
        out.add(`d:${dia}`); out.add(`w:${w}`);
        if (q) { out.add(`q:${q}`); out.add(`y:${q.slice(0, 4)}`); }
        out.add(VISAO_ID);
        for (const l of lugarDoDia.get(dia) ?? []) out.add(l);
    };
    const addTask = (t: MissaoTarefa, down: boolean) => {
        out.add(t.id);
        if (t.smart) out.add(t.smart);
        if (t.projeto) {
            out.add(t.projeto);
            const p = indice.projetos.get(t.projeto);
            if (p) { out.add(idDaArea(p.area)); if (p.central) out.add(idDoProjeto(p.central)); }
        }
        const c = t.colocacao;
        if (c.dia) addPeriodos(c.dia);
        if (c.semana) out.add(`w:${c.semana}`);
        const row = linhaDe(c, janela);
        if (row) out.add(idDoPeriodo(janela.escala, row));
        if (down && t.tipo === 'smart') for (const x of indice.vivas) if (x.smart === t.id) addTask(x, false);
    };
    const kind = id.slice(0, 2);
    if (kind === 't:' || kind === 's:') {
        const t = indice.porId.get(id);
        if (t) addTask(t, true);
    } else if (kind === 'p:') {
        const p = indice.projetos.get(id);
        if (p) {
            out.add(idDaArea(p.area));
            if (p.central) out.add(idDoProjeto(p.central));
            const family = familiaDe(indice, id);
            family.forEach(f => out.add(f));
            for (const t of indice.vivas) if (t.projeto && family.has(t.projeto)) addTask(t, false);
        }
    } else if (kind === 'a:') {
        for (const pid of indice.areas.get(id)?.projetos ?? []) {
            out.add(pid);
            for (const t of indice.vivas) if (t.projeto === pid) addTask(t, false);
        }
    } else if (kind === 'l:') {
        for (const d of lugares.get(id) ?? []) {
            addPeriodos(d);
            for (const t of indice.vivas) if (t.colocacao.dia === d) out.add(t.id);
        }
    } else if (id === VISAO_ID) {
        for (const t of indice.vivas) {
            if (t.colocacao.semana) out.add(`w:${t.colocacao.semana}`);
            if (t.colocacao.trimestre) out.add(`q:${t.colocacao.trimestre}`);
        }
    } else {
        const periodo = periodoDoId(id);
        if (periodo) {
            const { escala, chave } = periodo;
            if (isChaveEspecial(chave)) {
                for (const t of indice.vivas) if (linhaDe(t.colocacao, { ...janela, escala }) === chave) addTask(t, false);
            } else {
                for (const t of indice.vivas) if (chaveNaEscala(t.colocacao, escala) === chave) addTask(t, false);
                if (escala === 'dia') addPeriodos(chave);
                if (escala === 'semana') { const q = quarterOfWeek(chave); if (q) { out.add(`q:${q}`); out.add(`y:${q.slice(0, 4)}`); } }
                if (escala === 'trimestre') out.add(`y:${chave.slice(0, 4)}`);
                out.add(VISAO_ID);
            }
        }
    }
    return out;
}
