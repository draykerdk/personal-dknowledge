import { App, Notice, TFile } from 'obsidian';
import type DFMPlugin from '../main';
import { marcaDoProtocolo } from './protocolGroups';
import { isTerminalStatus } from './taskSemantics';
import { InputModal, TextAreaModal, MultiSelectModal } from '../ui/modals';
import { DFM_Suggester, NoteSuggester, TaskSuggester, noteLinkName } from '../ui/suggesters';
import { contextDayOf } from './contextDate';
import { planWeekStart, renderTemplateTokens, resolveClockTokens, resolveDateTokens, resolveWeekdayTokens, targetQuarterStart, targetWeekStart, weekStartFromValue, type TokenClock } from './templateTokens';
import { completeTaskFrontmatter } from './tasknotesAdapter';
import { TASK_CONTEXTS, TASK_CONTEXT_INFO, TASK_CONTEXT_QUESTION, TASK_CONTEXT_SKIP, taskContextsFrom, taskContextsYaml } from './taskContexts';
import { NOW_NEW_TASK_LABEL, NOW_PLACE_INFO, NOW_PLACE_PROMPT, NOW_TIME_INFO, NOW_TIME_PROMPT, nowReasonLine, placeOptions, timeChoiceOf, timeOptions } from './nowTree';
import { commitmentNoteName, lastLeftCommitment, leftWhenLabel } from './commitmentLeft';
import { COMMONS_FOLDER, expandCommonSteps, parseCommon, type CommonDef } from './commonSteps';
import { RECORD_TYPE_PATTERN, noteNameOf, pertenceAoProjeto, recordPropertiesFor } from './records';
import { choiceRankItems, escolher, type ChoiceRankItem } from './choose';
import { HABIT_TRACKER_FOLDER } from './habits';
import { chosenDiaryLabels, diaryNoticeText, diaryOptions } from './diaryService';
import { opcoesComDestino, rankOptions, rankableTargets, stepTargets, type RankedOptions } from './protocolRank';
import { aberturaDoPasso, declaraSugestao, defaultSourcesOf, fontesDaAbertura, listFromAnswer, ORIGEM_DO_FORMULARIO, type Abertura, type ResolvedorDeSugestao } from './stepDefault';
import { sugestaoDoPasso, type ContextoDaSugestao, type PontosDaTarefa } from './sugestoesDoPasso';
import { buildTaskRelations, isClosedUnit, scoreTask, taskUnitFrom } from './decisionWeights';
import { estadias as lerEstadias } from '../missao/lugares';
import { temporadaFrom } from './temporada';
import type { ContextoDaRodada, LeitorDoFormulario } from './protocolForm';
import { avisoDoProblema, chavesDaResposta, condicaoDoPasso, conditionMatches, ehPassoDeContextoGenerico, passosContinuados, problemaDaResposta, pulaNoSeletorDeNota, respondidoNoFormulario, respondidosDe, valoresIniciaisDe, RESPONDIDOS, VALORES_INICIAIS } from './stepRules';
import { acrescentarNaSecao } from './secaoDaNota';
import { herancaDoFoco, herancaText, quarterLogContent, quarterReviewOf, shiftQuarter } from './quarterHandoff';
import { focoDoTrimestre, linkNames } from './temporada';
import { quarterOfWeek } from './calendario';
import { linhasDoRegistro } from '../missao/registrarFeito';
import { DIA, diaNoInicio } from './dia';
import { avisoDasFaltas, teleprompterDoRoteiro } from './teleprompter';
import { ehSemana, ehTrimestre, semanaOuVazio, trimestreOuVazio } from './periodo';
import { aplicarInicializacao, definicoesDaRodada, definicoesRespondidas, fraseDoRelatorio, MODELO_DA_AREA, MODELO_DO_VALOR, PASTA_DAS_AREAS, pastasDasAreas, planoDaInicializacao, type CofreDaInicializacao, type RelatorioDaInicializacao } from './inicializacao';
import { ehDoPapel, protocoloDoPapel, type Papel, type TabelaDosPapeis } from './papeisDeProtocolo';
import { DEFINICOES_PADRAO, chaveDoNivelPessoal, definicoesDe, lerDefinicoes } from '../definicoes';

const CANONICAL_DAYMISS_DIR = "300 - RUNTIME/302 - Daymiss/Day";
const QUARTERLY_DIR = "300 - RUNTIME/302 - Daymiss/Quarterly";
const LEGACY_DAYMISS_DIR = "300 - RUNTIME/302 - Daymiss";

const TASK_TITLE_MAX = 70;

/** As chaves do frontmatter que os protocolos gravam como número (o nível pessoal entra pelo nome, nas definições). */
const CHAVES_NUMERICAS_DAS_NOTAS = ['ech_expansion', 'ech_complexity', 'ech_harmony', 'sono', 'energia', 'flow', 'effort'];

/** O 🔀 com mais de uma frente em andamento: qual fica em pausa. */
export const PAUSE_WHICH_PROMPT = '⏸️ Qual frente fica em pausa?';
export const PAUSE_WHICH_INFO = 'Há mais de uma tarefa em andamento hoje. A que ficar em pausa volta a próxima ação, sem data.';
export const PAUSE_ALL_FRONTS = '⏸️ Todas';
export const PAUSE_NO_FRONT = '⏭️ Nenhuma';

/** Opções de "voltar" sem destino nomeado: voltam ao router que abriu o protocolo. */
const GENERIC_BACK_OPTIONS = new Set(['🔙 Voltar', '🔙 Voltar ao Menu Anterior', '🔙 Voltar / Cancelar']);
const TASKNOTES_CONFIG = ".obsidian/plugins/tasknotes/data.json";

/**
 * Encurta a resposta de um step para virar título de tarefa.
 *
 * A resposta a um protocolo é uma frase inteira ("ser sincero com a pessoa, mas sem
 * jogar culpa, com equanimidade, falar sobre..."), e ela virava nome de arquivo cortado
 * em 120 caracteres no meio da palavra. Aqui o corte é na primeira pontuação forte e,
 * na falta dela, em fronteira de palavra. A resposta completa não se perde: vai para o
 * corpo da tarefa em `buildTaskNoteContent`.
 */
export function shortenTaskTitle(raw: string, max = TASK_TITLE_MAX): string {
    const limpo = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!limpo) return '';

    const aparar = (texto: string) => texto.replace(/[\s,;:.!?—-]+$/u, '').trim();

    // 1. Pontuação forte dentro do limite: é o fim da primeira frase.
    const pontuacao = limpo.search(/[.;!?]\s/u);
    if (pontuacao > 0 && pontuacao <= max) return aparar(limpo.slice(0, pontuacao));

    if (limpo.length <= max) return aparar(limpo);

    // 2. Frase longa sem ponto: a primeira vírgula quase sempre fecha a ideia principal
    // ("Ser sincero com a pessoa, mas sem jogar culpa, com equanimidade..."). Cortar em
    // 70 caracteres daria um título terminado em verbo solto.
    const virgula = limpo.indexOf(',');
    if (virgula >= 20 && virgula <= max) return aparar(limpo.slice(0, virgula));

    // 3. Último recurso: fronteira de palavra.
    const corte = limpo.lastIndexOf(' ', max);
    return aparar(limpo.slice(0, corte > 0 ? corte : max));
}

/** O que faz: o título curto do formulário (`<titleVar>_titulo`) aparado; o que não é texto, ou vazio, → `''`. */
export function tituloCurtoDe(raw: unknown): string {
    return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * O que faz: o nome de arquivo de uma nota capturada → um título legível, para sugerir o
 * nome da tarefa que nasce dela (a 🔥 da triagem de ideia). Tira o prefixo das capturas
 * antigas ("CapturadeIdeias - "), o carimbo das novas ("AAAA-MM-DD HH-mm - Ideia - ",
 * também "Ideia de vídeo") e troca "_" por espaço. Ex.: "CapturadeIdeias -
 * Canal_de_viagem" → "Canal de viagem". Só sugere: o nome continua editável no modal.
 */
export function noteNameToTitle(name: string): string {
    return String(name ?? '')
        .replace(/\.md$/i, '')
        .replace(/^\s*CapturadeIdeias\s*-\s*/u, '')
        // Forma própria (não é a `DIA`): o prefixo `AAAA-MM-DD HH-mm - Ideia -` do nome da captura, que sai do título.
        .replace(/^\s*\d{4}-\d{2}-\d{2} \d{2}-\d{2}\s*-\s*Ideia(?: de vídeo)?\s*-\s*/u, '')
        .replace(/_+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Tira do registro as linhas de lista cujo rótulo ficou sem conteúdo
 * (`- **Pode vir junto:** `, `- **ECH:**  ·  · ` ou `- 🧠 **Pensamento:** “”`; o
 * rótulo pode vir depois de um ícone): no modo curto do ▶️ e no 🌙
 * normal, os passos opcionais não são perguntados e o log do dia saía todo dia com
 * rótulos vazios. Linha com qualquer palavra depois do rótulo fica.
 */
export function dropEmptyLabelLines(text: string): string {
    return String(text ?? '')
        .split('\n')
        .filter(line => !/^\s*[-*]\s+(?:\S+\s+)?\*\*[^*\n]+?:\*\*[\s·•|,;—–"“”-]*$/u.test(line))
        .join('\n');
}

/**
 * O que faz: tira do modelo a seção (um cabeçalho `#`) cujo corpo, até o próximo
 * cabeçalho ou `---`, é só de respostas vazias (`{{passo}}` sem conteúdo, sem nenhuma
 * palavra fixa ao redor). Ex.: "## 🧠 Análise" de um protocolo na rodada do
 * "🚫 NÃO", em que a análise não é perguntada: a nota saía com o cabeçalho e nada
 * embaixo, como se faltasse algo. Seção com texto fixo (para preencher à mão), com token
 * de data ou com uma resposta preenchida fica; cabeçalho com token também.
 * Entra: o modelo e quem diz se a resposta está vazia. Sai: o modelo sem essas seções.
 */
export function dropEmptyTokenSections(template: string, isEmpty: (name: string) => boolean): string {
    const lines = String(template ?? '').split('\n');
    const isHeading = (line: string) => /^#{1,6}\s+\S/.test(line);
    const isBreak = (line: string) => isHeading(line) || /^\s*(?:---|\*\*\*)\s*$/.test(line);
    const onlyEmptyAnswers = (line: string) => {
        if (/{{[^}]*[^a-zA-Z0-9_}][^}]*}}/.test(line)) return false;
        const names = [...line.matchAll(/{{([a-zA-Z0-9_]+)}}/g)].map(m => m[1]);
        if (names.length === 0) return false;
        return !/[\p{L}\p{N}]/u.test(line.replace(/{{[a-zA-Z0-9_]+}}/g, '')) && names.every(isEmpty);
    };
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!isHeading(line) || line.includes('{{')) { out.push(line); continue; }
        let end = i + 1;
        while (end < lines.length && !isBreak(lines[end])) end++;
        const body = lines.slice(i + 1, end).filter(l => l.trim() !== '');
        if (body.length > 0 && body.every(onlyEmptyAnswers)) {
            i = end - 1;
            continue;
        }
        out.push(line);
    }
    return out.join('\n');
}

/**
 * O que faz: o cabeçalho do rascunho de um protocolo (`savePartialProgress`):
 * `type: rascunho_protocolo`, o `protocolo` (o id) e a `data` (o dia da rodada).
 * Por quê: os rascunhos nasciam sem cabeçalho, espalhados entre a Caixa de entrada e a
 * `400 - MEMORY`, e nada os achava (proposta de organização de 27/10, item 5); a
 * triagem da Missão lê o tipo e a data (`missao/triagem.ts`, grupo "rascunhos").
 * Entra → sai: o id do protocolo e o dia `YYYY-MM-DD` → o bloco `---` com a quebra de
 * linha final; o corpo vem depois, sem mudança.
 */
export function draftFrontmatter(protocolId: string, day: string): string {
    return `---\ntype: rascunho_protocolo\nprotocolo: ${protocolId}\ndata: ${day}\n---\n`;
}

/**
 * O que faz: o texto do rascunho (`savePartialProgress`) depois que a rodada retomada
 * por ele terminou: o Status vira "✅ Concluído em <data> → [[nota]]" e o botão
 * "▶️ Continuar" sai, com a linha "Retomado e concluído." no lugar.
 * Por quê: o rascunho seguia com o botão ativo, e um segundo clique refazia a revisão
 * por cima (o 📅 Revisão Semanal regravava "AAAA-Www - Review" e pontuava de novo).
 * Entra → sai: o texto, o id do protocolo, o destino e a data `DD/MM/YYYY` → o texto
 * novo. Rascunho de outro protocolo (o bloco dfm não tem `id: <id>`) ou já concluído →
 * o mesmo texto.
 */
export function closeDraftText(text: string, id: string, target: string, dateLabel: string): string {
    const source = String(text ?? '');
    const block = /\n## ▶️ Continuar Protocolo\n```dfm\n([\s\S]*?)\n```\n?/;
    const match = source.match(block);
    if (!match || !match[1].split('\n').some(line => line.trim() === `id: ${id}`)) return source;
    const link = target ? ` → [[${target}]]` : '';
    return source
        .replace(block, '\nRetomado e concluído.\n')
        .replace('> **Status:** ⏸️ Em Progresso', `> **Status:** ✅ Concluído em ${dateLabel}${link}`)
        .replace('\n*Protocolo interrompido - Use o botão acima para continuar*', '');
}

/** A condição de um passo ou de um modo: mora com as regras do passo (`stepRules.ts`), a mesma do formulário. */
export { conditionMatches };

/**
 * O que faz: as opções de um passo segundo uma resposta anterior
 * (`optionsWhen: [{ condition, options, optionValues? }]`): a primeira regra cuja
 * `condition` casa troca `options` (e `optionValues`, se vier); nenhuma → o passo como está.
 * Por quê: no gesto, "Hoje" e "Amanhã" não se aplicam a hábito (plano de 22/10, seção 4):
 * escolhido um 🔁, o "⏱️ Quando?" mostra só "⚡ Agora". Sem a chave, nada muda.
 * Prova: tests/engine/diaryStep.test.ts ("optionsWhen").
 */
export function withOptionsWhen(step: any, variables: any): any {
    const rules = Array.isArray(step?.optionsWhen) ? step.optionsWhen : [];
    const hit = rules.find((rule: any) => rule && typeof rule === 'object' && Array.isArray(rule.options) && rule.options.length
        && conditionMatches(rule.condition, variables));
    if (!hit) return step;
    return { ...step, options: [...hit.options], ...(Array.isArray(hit.optionValues) ? { optionValues: [...hit.optionValues] } : {}) };
}

/**
 * As chaves que uma variante (`variants`) pode trocar: só o que diz ONDE e COMO a nota
 * da rodada é gravada. Passos, encadeamento e tarefas continuam os do protocolo.
 */
/**
 * O que faz: o `info` do passo com a linha que diz de onde veio a resposta com que ele
 * abriu (`openingAnswer`); sem origem, o `info` como está.
 * Prova: tests/engine/trimestrePadrao.test.ts ("abre com o que está na nota").
 */
export function withOpeningInfo(info: unknown, opening: { value: any; origem: string; kind: string }): string {
    const base = String(info ?? '').trim();
    if (!opening?.origem || opening.value === undefined || opening.value === '') return base;
    const line = opening.kind === 'multiselect' || opening.kind === 'multiselect_note'
        ? `⭐ Já vem marcado ${opening.origem}: Confirmar mantém; desmarcar muda.`
        : `⭐ Abre com ${opening.origem}: Enter mantém; mudar é uso normal.`;
    return base ? `${base}\n${line}` : line;
}

/** Os tipos de passo que `comoLista: true` grava como lista (`listStepAnswer`). */
const LIST_STEP_TYPES = new Set(['multiselect_note', 'multiselect', 'textarea', 'text']);

export const VARIANT_KEYS = ['targetFolder', 'filename', 'template', 'templateFile', 'properties', 'onExisting', 'overwriteExisting'] as const;

/**
 * O que faz: a variante de gravação desta rodada (`variants: [{ condition, ...chaves }]`):
 * a primeira cuja `condition` casa, só com as chaves de `VARIANT_KEYS`; nenhuma → `null`.
 * Por quê: um protocolo com dois momentos (o 🌍 "Começar um planejamento" grava o
 * planejamento; "Decidir o destino" grava a SMART da etapa) continua um protocolo só:
 * a pergunta do momento escolhe onde e como a nota nasce (plano da viagem, 22/10).
 * Erro e ataque: lista ausente, item sem condition ou com chave fora da lista (ignorada).
 * Prova: tests/engine/viagemModelo.test.ts.
 */
export function protocolVariant(def: any, variables: any): Record<string, any> | null {
    const variants = Array.isArray(def?.variants) ? def.variants : [];
    const hit = variants.find((variant: any) => variant && typeof variant === 'object' && conditionMatches(variant.condition, variables));
    if (!hit) return null;
    const out: Record<string, any> = {};
    for (const key of VARIANT_KEYS) if (hit[key] !== undefined) out[key] = hit[key];
    return out;
}

/**
 * O que faz: a regra de `registroQuando` que vale nesta rodada:
 * `registroQuando: [{ condition, registro, campos?, notaDoPasso?, projeto? }]`. A primeira
 * cuja `condition` casa e, com `notaDoPasso` e `projeto`, cuja nota escolhida naquele
 * passo pertence ao projeto (`pertence`, que sobe pelos `projects`) → `{ registro, campos }`;
 * nenhuma → `null`.
 * Por quê: o 📤 de um criativo de uma obra grava, na própria nota do 📤, um registro de
 * exposição de ideias, uma vez (o plano de uma área, 22/10, seção 1); a nota sem a
 * peça da obra continua só o registro do bloco. Sem a chave, nada muda.
 * Erro e ataque: tipo fora do snake_case (ignorado; o juiz acusa); `campos` com valor que
 * não é texto (ignorado); regra sem `condition` nunca vale.
 * Prova: tests/engine/protocolNucleo.test.ts ("registroQuando").
 */
export function recordRuleFor(
    rules: any,
    variables: any,
    pertence: (passo: string, projeto: string) => boolean
): { registro: string; campos: Record<string, string> } | null {
    for (const rule of Array.isArray(rules) ? rules : []) {
        if (!rule || typeof rule !== 'object' || !conditionMatches(rule.condition, variables)) continue;
        if (typeof rule.registro !== 'string' || !RECORD_TYPE_PATTERN.test(rule.registro)) continue;
        if (rule.notaDoPasso !== undefined || rule.projeto !== undefined) {
            if (typeof rule.notaDoPasso !== 'string' || typeof rule.projeto !== 'string') continue;
            if (!pertence(rule.notaDoPasso, rule.projeto)) continue;
        }
        const campos: Record<string, string> = {};
        for (const [key, value] of Object.entries(rule.campos && typeof rule.campos === 'object' ? rule.campos : {})) {
            if (typeof value === 'string') campos[key] = value;
        }
        return { registro: rule.registro, campos };
    }
    return null;
}

/**
 * O que faz: troca, num texto, `{{nome}}` pela variável da rodada com esse nome; os
 * tokens de sistema (`{{date:…}}`, `{{targetweek:…}}`) e os nomes sem variável ficam
 * como estão (a resolução de sempre cuida deles depois).
 * Por quê: o filtro de um `suggest_note` pode depender de uma resposta anterior (os
 * candidatos ligados ao planejamento escolhido: `planejamento: "[[{{planejamento}}]]"`).
 */
export function resolveRunTokens(text: string, variables: any): string {
    return String(text).replace(/{{([A-Za-z0-9_]+)}}/g, (whole: string, name: string) => {
        const value = variables?.[name];
        return value === undefined || value === null || typeof value === 'object' ? whole : String(value);
    });
}

/**
 * O que faz: a resposta de um passo de texto sem o espaço das pontas, quando o passo pede
 * (`trim: true`); sem a chave, ou fora do envio, a resposta fica como veio.
 * Por quê: o ✈️ de 28/10 gravou `cidade: "SaPa "`, com o espaço digitado junto (P10 da
 * Missão). Opt-in por passo, para nenhum outro protocolo mudar o que grava.
 * Entra → sai: o passo e o resultado do modal → o resultado (cópia, quando muda).
 * Prova: tests/engine/chegadaCidade.test.ts ("trim").
 */
export function trimmedAnswer(step: any, result: any): any {
    if (step?.trim !== true || result?.status !== 'submit' || typeof result.value !== 'string') return result;
    const value = result.value.trim();
    return value === result.value ? result : { ...result, value };
}

/** O que faz: um passo com os valores de `criteria.property` já resolvidos pelas respostas da rodada. */
export function stepWithRunCriteria(step: any, variables: any): any {
    const property = step?.criteria?.property;
    if (!property) return step;
    const resolveValue = (value: any) => typeof value === 'string'
        ? resolveRunTokens(value, variables)
        : Array.isArray(value) ? value.map(item => typeof item === 'string' ? resolveRunTokens(item, variables) : item) : value;
    const resolveOne = (criterion: any) => criterion && typeof criterion === 'object' ? { ...criterion, value: resolveValue(criterion.value) } : criterion;
    return { ...step, criteria: { ...step.criteria, property: Array.isArray(property) ? property.map(resolveOne) : resolveOne(property) } };
}

/**
 * Qual canvas estratégico a nota recém-salva pede, pelo caminho dela (`null` = nenhum).
 * Departamento: só a nota-índice (`Departamento/Departamento.md`, nome igual ao da pasta). Antes,
 * qualquer nota salva dentro de `200 - DEPARTMENTS` (um hub de cidade, uma decisão)
 * criava e abria `<subpasta>/<subpasta>.canvas` a partir do modelo de projeto, com nós
 * de arquivo que não existem ali. Projeto: a mesma regra. Antes, os protocolos que salvam
 * em `{{_active_folder}}` (os de nova nota, análise SWOT e internalização do
 * projeto) criavam `<subpasta>/<subpasta>.canvas` numa subpasta do
 * projeto e, na raiz, reabriam o canvas do projeto por cima da nota recém-criada. O canvas
 * de projeto nasce com o protocolo de novo projeto (ramo próprio no run()) e se atualiza pelo gerente
 * do canvas de projeto. Área segue como antes.
 */
export function strategicCanvasKindFor(path: string, basename: string, parentName: string): 'project' | 'department' | 'area' | null {
    if (path.includes('100 - PROJECTS')) return basename === parentName ? 'project' : null;
    if (path.includes('200 - DEPARTMENTS')) return basename === parentName ? 'department' : null;
    if (path.includes('000 - INDEX')) return 'area';
    return null;
}

export interface TaskNoteInput {
    title: string;
    answer?: string;
    tag?: string;
    status?: string;
    priority?: string;
    impacto?: string | number;
    due?: string;
    scheduled?: string;
    week?: string;
    /** Onde dá para fazer: texto (`"📱 Celular"`, `"a, b"`) ou lista; só o vocabulário fica. */
    contexts?: string | string[];
    timeEstimate?: number;
    projects?: string;
    /**
     * Onde a tarefa acontece: o nome (ou o link) da nota da cidade ou do país, que vira
     * `lugar: "[[nome]]"`. O `projects` segue sendo o pai (o porquê); o `lugar` diz o onde
     * e nunca conta como projeto (proposta da viagem nos ciclos, 29/10, §5).
     */
    lugar?: string;
    origin?: string;
    now?: string;
    bodyTemplate?: string;
    /** Peça do fluxo de criação (`ignicao` | `soltar`); vazio = não é peça. */
    peca?: string;
    /** Nome da tarefa que bloqueia esta (vira `blockedBy: ["[[nome]]"]`). */
    blockedBy?: string;
}

/**
 * Monta a nota da tarefa no mesmo formato que o TaskNotes produziria.
 *
 * Antes o frontmatter era montado à mão com cinco campos fixos, e a tarefa nascia sem
 * `title`, sem datas, sem estimativa e com o corpo vazio — visivelmente diferente das
 * criadas pela UI do TaskNotes. Dois campos que PARECEM redundantes continuam aqui de
 * propósito: `type: task` é lido por `day_context.js` para montar a Execução da semana,
 * e a tag `task` é como o TaskNotes identifica a nota (`taskIdentificationMethod: tag`).
 *
 * Campo opcional não declarado é OMITIDO em vez de gravado vazio: chave vazia polui o
 * Kanban ("No estimate" é diferente de `timeEstimate: `).
 */
export function buildTaskNoteContent(input: TaskNoteInput): string {
    const linhas: string[] = ['type: task'];
    const push = (chave: string, valor: any) => {
        if (valor === undefined || valor === null || valor === '' || valor === 0) return;
        linhas.push(`${chave}: ${valor}`);
    };

    linhas.push(`status: ${input.status || 'next-action'}`);
    // Ausencia de urgencia explicita nasce normal. `high` e reservado para pressao
    // operacional real; importancia estrategica vive separadamente em `impacto`.
    linhas.push(`priority: ${input.priority || 'normal'}`);
    push('impacto', input.impacto);
    push('due', input.due);
    push('scheduled', input.scheduled);
    push('week', input.week);
    push('timeEstimate', input.timeEstimate);
    push('contexts', taskContextsYaml(taskContextsFrom(input.contexts)));
    push('projects', input.projects ? `["[[${input.projects}]]"]` : '');
    push('lugar', taskPlaceYaml(input.lugar));
    push('peca', input.peca === 'ignicao' || input.peca === 'soltar' ? input.peca : '');
    push('blockedBy', input.blockedBy ? `["[[${String(input.blockedBy).replace(/"/g, '\\"')}]]"]` : '');
    linhas.push(`title: "${String(input.title).replace(/"/g, '\\"')}"`);
    push('dateCreated', input.now);
    push('dateModified', input.now);

    const tagExtra = input.tag && input.tag !== 'task' ? `, ${input.tag}` : ', protocolo';
    linhas.push(`tags: [task${tagExtra}]`);

    const corpo = buildTaskBody(input);
    return `---\n${linhas.join('\n')}\n---\n\n${corpo}`;
}

/**
 * O que faz: o valor de `lugar` no frontmatter da tarefa, `"[[Nome]]"`, a partir do nome
 * da nota ou de um link já pronto (`[[Nome]]`, `"[[Nome]]"`, `[[Nome|apelido]]`); vazio
 * quando não há nome.
 * Por quê: o `createTask.lugar` é um modelo com marcadores, e a resposta de um passo de
 * nota chega como link; o campo guarda sempre um link só, citado para o YAML.
 * Erro e ataque: aspas no nome são escapadas; mais de um link, só o primeiro vale; texto
 * sem letra nem número e o "Sem conexão contextual" de um `[[{{passo}}]]` pulado não
 * viram lugar.
 * Prova: tests/engine/createTaskLugar.test.ts.
 */
export function taskPlaceYaml(raw: unknown): string {
    let texto = String(raw ?? '').trim().replace(/^"([\s\S]*)"$/, '$1').trim();
    const link = texto.match(/\[\[([^\[\]]+)\]\]/);
    if (link) texto = link[1].trim();
    if (!/[\p{L}\p{N}]/u.test(texto) || texto === 'Sem conexão contextual') return '';
    return `"[[${texto.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}]]"`;
}

/**
 * O que faz: o modelo da semana de uma tarefa do protocolo: o `week` de sempre; quando ele é a semana
 * do dia da tarefa (`{{scheduled:FMT}}`) e a tarefa não tem dia, o `weekSemDia` (a semana de hoje,
 * `{{date:GGGG-[W]WW}}`), e sem ele, o `week` (que dá vazio, como antes).
 * Por quê: a proposta da viagem nos ciclos (29/10, §6, seção Duas travas de hoje saem): a Partida e a mala
 * exigiam um dia (`onlyWithDate`) e passam a aceitar só a semana; sem o dia, elas ficam "em algum dia
 * da semana" (§3), e não sem semana nenhuma.
 * Entra → sai: o `week` e o `weekSemDia` do `createTask` (texto ou nada) e o dia da tarefa (`AAAA-MM-DD`
 * ou vazio) → o modelo da semana, ainda com os marcadores.
 * Erro e ataque: `week` que não é texto dá vazio; `weekSemDia` vazio ou que não é texto não vale; com o
 * dia, o `weekSemDia` nunca troca a semana do dia.
 * Prova: tests/engine/createTaskViagem.test.ts.
 */
export function modeloDaSemanaDaTarefa(week: unknown, weekSemDia: unknown, scheduled: string): string {
    const modelo = typeof week === 'string' ? week : '';
    if (!scheduled && /{{scheduled:/.test(modelo) && typeof weekSemDia === 'string' && weekSemDia.trim()) return weekSemDia;
    return modelo;
}

/** Uma TaskNote como o `naoRepetir` a lê: o caminho, o nome do arquivo e o `status`. */
export interface TarefaDoCofre { caminho: string; titulo: string; status: string }

/**
 * O que faz: o caminho da tarefa aberta (nem `done` nem `cancelled`) com o mesmo título, sem o sufixo
 * de repetição (" (2)") e sem diferença de maiúsculas; `null` quando não há.
 * Por quê: a proposta da viagem nos ciclos (29/10, §1, defeito 4): "a mala aparece duas vezes: uma
 * tarefa pela 🧳 e outra pelo 🌍 Decidir". Com `naoRepetir: true` no `createTask`, a tarefa que já está
 * aberta com o mesmo nome não nasce de novo, e o aviso diz qual é.
 * Entra → sai: o título que nasceria e as tarefas do cofre → o caminho da que já existe, ou `null`.
 * Erro e ataque: a fechada não conta (a próxima viagem tem a mala dela); título vazio não acha nada; o
 * sufixo " (N)" de uma repetição antiga casa com o título sem ele.
 * Prova: tests/engine/createTaskViagem.test.ts.
 */
export function tarefaAbertaDeMesmoTitulo(titulo: string, tarefas: readonly TarefaDoCofre[]): string | null {
    // O mesmo "fechada" do sistema (`isTerminalStatus`), em vez de uma lista própria (revisão de 02/11).
    const base = (t: string) => String(t ?? '').replace(/\s\(\d+\)$/, '').trim().toLocaleLowerCase('pt-BR');
    const alvo = base(titulo);
    if (!alvo) return null;
    const achada = tarefas.find(t => base(t.titulo) === alvo && !isTerminalStatus(String(t.status ?? '').trim()));
    return achada ? achada.caminho : null;
}

/**
 * O que faz: a linha (ou o bloco) que um protocolo escreve na Day, e o fragmento que diz
 * que ela já está lá hoje.
 * - Com nota própria: `**[hora] Protocolo <rótulo> executado:** [[nota]]` (`![[nota]]` no
 *   `logMode: embed`), com o resumo do `logSuffix` depois de " · " e a marca invisível da
 *   captura numa nota-lista; não se repete no mesmo dia (pela marca, senão pela nota).
 * - Sem nota própria (`append`): uma linha em branco, `**[HH:mm] <rótulo>**` e o bloco.
 * Por quê: o formato limpo e único de todo registro de protocolo (decisão de 29/10,
 * harmonização H3, item 1): sem o "- " na frente e com o embutido onde o protocolo o pede.
 * Entra → sai: rótulo, hora já formatada, nota criada, embutir?, bloco, resumo, marca, id →
 * `{ entry, dedupe }` (`dedupe` nulo no append: cada bloco é uma escrita nova).
 * Prova: tests/engine/escritorDaDay.test.ts.
 */
export function protocolDayEntry(input: {
    label: string; timestamp: string; createdNote?: string; embed?: boolean;
    block?: string; suffix?: string; marca?: string; id?: string;
}): { entry: string; dedupe: string | null } {
    const note = String(input.createdNote ?? '');
    // O id do protocolo vai invisível no fim da linha (02/11): trocar o nome não apaga o uso.
    const doProtocolo = marcaDoProtocolo(input.id ?? '');
    if (note) {
        const reference = input.embed ? `![[${note}]]` : `[[${note}]]`;
        const suffix = input.suffix ? ` · ${input.suffix}` : '';
        const marca = input.marca ?? '';
        return {
            entry: `**[${input.timestamp}] Protocolo ${input.label} executado:** ${reference}${suffix}${marca}${doProtocolo}`,
            dedupe: marca ? marca.trim() : note,
        };
    }
    return { entry: `\n**[${input.timestamp}] ${input.label}**${doProtocolo}\n${String(input.block ?? '').trim()}\n`, dedupe: null };
}

/**
 * Usa o `bodyTemplate` configurado no TaskNotes, colocando a resposta completa sob o
 * cabeçalho de execução. Sem template configurado, cai num corpo mínimo — nunca vazio.
 */
function buildTaskBody(input: TaskNoteInput): string {
    const resposta = String(input.answer ?? '').trim();
    const origem = input.origin ? `\n> Origem: [[${input.origin}]]\n` : '';
    const template = String(input.bodyTemplate ?? '').trim();

    if (!template) {
        return `# ${input.title}\n\n${resposta}\n${origem}`;
    }

    // Função em vez de string: o texto do operador pode conter `$&`, `$'` ou `$1`, que o
    // JS interpretaria como padrão de substituição e corromperia o valor gravado.
    let corpo = template.replace(/\{\{title\}\}/g, () => input.title);
    // Remove tokens de data que o TaskNotes não renderiza e que apareciam literais.
    corpo = corpo.replace(/^.*\{\{date:[^}]*\}\}.*$/gm, '').replace(/\n{3,}/g, '\n\n');

    if (!corpo.trimStart().startsWith('#')) corpo = `# ${input.title}\n\n${corpo}`;

    if (resposta) {
        const marcador = corpo.match(/^##\s+.*O que precisa ser feito.*$/mu);
        if (marcador) {
            const alvo = `${marcador[0]}\n- ${resposta}`;
            corpo = corpo.replace(marcador[0], () => alvo).replace(alvo + '\n- \n', () => alvo + '\n');
        } else {
            corpo = `${corpo}\n\n${resposta}`;
        }
    }

    return `${corpo.trimEnd()}\n${origem}`;
}

/**
 * O passo montado (`JSONProtocol.montarPasso`): o que o modal mostra, sem nada aberto.
 * `ui` é o passo com o contexto, as opções, a contagem e a Herança; o resto vem por tipo.
 */
export interface PassoMontado {
    ui: any;
    /** A resposta com que o passo abre (texto, texto longo, `multiselect`, `multiselect_note`). */
    abertura?: { value: any; origem: string; kind: string };
    /** As notas do critério (`multiselect_note`). */
    opcoes?: string[];
    /** As opções na ordem dos pesos (`suggest` com `rankOptions`); `null` = a ordem do JSON. */
    ordenadas?: RankedOptions | null;
    /** O passo do seletor de notas, com o filtro e a resposta padrão da semana (`suggest_note`). */
    passoDaNota?: any;
    /**
     * A opção que abre a lista (`suggest`, `select`): a que veio do formulário (`_valoresIniciais`),
     * senão a do `defaultFrom` (a nota, o valor fixo ou a sugestão declarada).
     */
    padrao?: string;
    /** A linha do porquê da opção padrão que veio do `defaultFrom` (vai como a nota dela na lista). */
    notaDoPadrao?: string;
}

/** O que faz: a nota da opção que abre a lista pelo `defaultFrom`: o porquê e o Enter. */
export function notaDaOpcaoPadrao(origem: string): string {
    return `⭐ ${origem}: Enter mantém`;
}

/**
 * O que faz: a opção do passo que o valor do formulário escolhe (a mesma, ou a única que
 * começa por ele); nenhuma, ou mais de uma, → `undefined`.
 * Prova: tests/engine/protocolForm.test.ts ("_valoresIniciais").
 */
export function opcaoDoFormulario(options: unknown, inicial: unknown): string | undefined {
    if (typeof inicial !== 'string' || !inicial.trim() || !Array.isArray(options)) return undefined;
    const lista = options.map(o => String(o));
    if (lista.includes(inicial)) return inicial;
    const comeca = lista.filter(o => o.startsWith(inicial.trim()));
    return comeca.length === 1 ? comeca[0] : undefined;
}

/**
 * O que faz: o passo do seletor de notas com a nota do formulário como resposta padrão (a
 * primeira linha; Enter aceita) e a linha que diz de onde ela veio, como o par da semana.
 */
export function withFormNoteDefault(step: any, nome: string): any {
    return withNoteDefault(step, nome, ORIGEM_DO_FORMULARIO);
}

/**
 * O que faz: o passo do seletor de notas com uma nota como resposta padrão (a primeira linha;
 * Enter aceita) e a linha que diz de onde ela veio (o formulário, ou o porquê do `defaultFrom`).
 */
export function withNoteDefault(step: any, nome: string, origem: string): any {
    return {
        ...step,
        defaultNote: nome,
        prompt: `${String(step?.prompt ?? '')}\n⭐ ${nome} (${origem}): Enter aceita; escolher outro é uso normal.`,
    };
}

/**
 * O que faz: as variáveis da nota ativa que toda rodada recebe (`_active_folder`,
 * `_active_basename`, `_active_path`); sem nota ativa, a Caixa de entrada e "Nenhum".
 * Por quê: o `run()` e o contexto do formulário (`contextoDaRodada`) calculam o mesmo, para
 * uma condição que lê a nota ativa valer igual nos dois (P12a da Missão, follow-up 4 do P11).
 * Entra → sai: a nota ativa (ou `null`) → as três variáveis, nesta ordem.
 */
export function variaveisDaNotaAtiva(activeFile: { parent?: { path?: string } | null; basename?: string; path?: string } | null | undefined): Record<string, string> {
    if (!activeFile) return { _active_folder: "Inbox", _active_basename: "Nenhum", _active_path: "" };
    return { _active_folder: activeFile.parent ? String(activeFile.parent.path ?? '') : "", _active_basename: String(activeFile.basename ?? ''), _active_path: String(activeFile.path ?? '') };
}

export class JSONProtocol {
    public plugin: DFMPlugin;
    public app: App;
    public def: any;
    /**
     * Data de contexto (`AAAA-MM-DD`) fixada pela rodada anterior de um protocolo que
     * chama a si próprio ("criar outra SMART desta semana"). Entre uma rodada e outra a
     * nota criada é aberta, e a nota ativa deixa de dizer de que dia ou semana se trata;
     * sem isto, a segunda rodada caía na semana do calendário. Vale por uma execução:
     * `run()` a redefine a cada início, a partir de `_context_date`.
     */
    private contextDateOverride: string | null = null;
    /**
     * Rodada de verdade (`run()`): a tarefa que nasce pergunta "🧭 Onde dá para
     * fazer?" quando o protocolo não declara o contexto. Fora do `run()` (chamada
     * direta de `createTaskFromVariable`/`createNoteFromStep`) nada é perguntado: não
     * há operador diante do modal.
     */
    private askTaskContexts = false;
    /**
     * A variante de gravação desta rodada (`variants`, ver `protocolVariant`): escolhida
     * depois dos passos, zerada no início de cada `run()`. Sem variante, vale o protocolo.
     */
    private activeVariant: Record<string, any> | null = null;

    constructor(plugin: DFMPlugin, definition: any) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.def = definition;
    }

    get id() { return this.def.id; }
    get name() { return this.def.name; }
    /** O que vale para gravar a nota da rodada: o protocolo com a variante por cima. */
    get saveDef(): any { return this.activeVariant ? { ...this.def, ...this.activeVariant } : this.def; }
    get icon() { return this.def.icon || "star"; }

    resolveFolderFilter(folderPath) {
        if (!folderPath || typeof folderPath !== "string") {
            return folderPath;
        }

        const candidate = folderPath.trim();
        if (this.app.vault.getAbstractFileByPath(candidate)) {
            return candidate;
        }

        if (candidate.startsWith("100 - MÓDULOS")) {
            const mapped = candidate.replace(/^100 - MÓDULOS/, "100 - AREAS");
            if (this.app.vault.getAbstractFileByPath(mapped)) {
                return mapped;
            }

            if (this.app.vault.getAbstractFileByPath("100 - AREAS")) {
                return "100 - AREAS";
            }
        }

        return candidate;
    }

    sanitizeFilename(filename) {
        const sanitized = filename
            .replace(/[\\/:*?"<>|]/g, " - ")
            .replace(/[\u0000-\u001F]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .replace(/[. ]+$/g, "");

        // Respostas livres (como `padrao` no Protocolo da Sombra) entram no
        // nome da nota. Obsidian/sistemas de arquivos rejeitam nomes longos;
        // o teto por bytes mantém o título legível sem ultrapassar o limite.
        const encoder = new TextEncoder();
        const maxBytes = 180;
        let result = "";
        for (const char of sanitized) {
            if (encoder.encode(result + char).length > maxBytes) break;
            result += char;
        }
        return result.trim() || "Registro DFM";
    }

    deriveContextFoldersFromPath(notePath: string): any {
        if (!notePath || typeof notePath !== "string") {
            return {};
        }

        const parts = notePath.split("/");
        if (parts.length < 2 || parts[0] !== "100 - AREAS") {
            return {};
        }

        const areaRoot = parts.slice(0, 2).join("/");
        const result: any = {
            area_root: areaRoot,
            objetivos_folder: `${areaRoot}/001 - ESTRATÉGIA/100 - OBJETIVOS`,
            metas_folder: `${areaRoot}/001 - ESTRATÉGIA/200 - METAS`
        };

        const projectIndex = parts.indexOf("100 - PROJECTS");
        if (projectIndex > -1 && parts.length > projectIndex + 1) {
            const projectRoot = parts.slice(0, projectIndex + 2).join("/");
            result.project_root = projectRoot;
            result.objetivos_folder = `${projectRoot}/100 - OBJETIVOS`;
            result.metas_folder = `${projectRoot}/200 - METAS`;
        }

        return result;
    }

    escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    getAutomaticPreferredFolders() {
        const preferred = [];
        const activeFile = this.app.workspace.getActiveFile();

        if (!activeFile) {
            return preferred;
        }

        if (activeFile.parent?.path) {
            preferred.push(activeFile.parent.path);
        }

        const derived = this.deriveContextFoldersFromPath(activeFile.path);
        if (derived.project_root) {
            preferred.push(derived.project_root);
        }
        if (derived.area_root) {
            preferred.push(derived.area_root);
        }

        return [...new Set(preferred.filter(Boolean))];
    }

    getCanonicalDailyNotePath(dateStr) {
        return `${CANONICAL_DAYMISS_DIR}/${dateStr}.md`;
    }

    getLegacyDailyNotePath(dateStr) {
        return `${LEGACY_DAYMISS_DIR}/${dateStr}.md`;
    }

    getDailyNoteFile(dateStr) {
        const canonical = this.app.vault.getAbstractFileByPath(this.getCanonicalDailyNotePath(dateStr));
        if (canonical instanceof TFile) {
            return canonical;
        }

        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile instanceof TFile && activeFile.name === `${dateStr}.md`) {
            return activeFile;
        }

        const legacy = this.app.vault.getAbstractFileByPath(this.getLegacyDailyNotePath(dateStr));
        if (legacy instanceof TFile) {
            return legacy;
        }

        return null;
    }

    resolveFolderPath(folderPath: string, variables: any = {}) {
        if (!folderPath || typeof folderPath !== "string") {
            return folderPath;
        }

        let resolved = folderPath;
        if (resolved.includes("{{")) {
            resolved = this.processTemplate(resolved, variables);
        }

        return resolved.trim();
    }

    getMeaningfulVariableEntries(variables: any) {
        const ignoredKeys = new Set(["contexto", "frente_maior", "targetFolder"]);
        return Object.entries(variables).filter(([key, value]) => {
            if (!value) return false;
            if (ignoredKeys.has(key)) return false;
            if (key.startsWith("_")) return false;
            if (key.endsWith("_display") || key.endsWith("_path") || key.endsWith("_folder")) return false;
            if (typeof value === "string" && value.trim().length === 0) return false;
            if (typeof value === "string" && value.trim() === "Nenhum") return false;
            return true;
        });
    }

    /**
     * O que faz: diz se este protocolo é o que faz um dos papéis dados, pela tabela vigente do
     * gerente (`ProtocolManager.ehDoPapel`).
     * Por quê: D1 do mapa da v0: o motor reage ao papel (o 🌳 grava na Week, o projeto novo ganha o
     * canvas gerido), não ao id do cofre de origem.
     */
    ehDoPapel(...papeis: Papel[]): boolean {
        const manager = this.plugin?.manager;
        return manager?.ehDoPapel ? manager.ehDoPapel(this.id, papeis) : ehDoPapel(this.id, papeis, DEFINICOES_PADRAO.protocolos_por_papel);
    }

    /**
     * O que faz: a ação `inicializar`: monta o plano pelas definições da rodada (as áreas
     * respondidas, senão as do plugin; os valores das definições já com as respostas, que viram as
     * notas de valor), aplica no cofre do Obsidian só o que falta, grava as respostas nas
     * definições (`definicoesRespondidas`; só se mudou) e guarda o relatório em `_inicializacao`
     * (para o modelo da nota e o protocolo seguinte), com um aviso.
     * Por quê: C0 do mapa da v0: o protocolo de inicialização pergunta em JSON e entrega o passo
     * final a uma função testada à parte (`engine/inicializacao.ts`).
     * Erro e ataque: o plano e o aplicador recusam o caminho fora do cofre e não sobrescrevem; o
     * modelo da área que não se lê dá a nota mínima; a falha do cofre vira recusa no relatório.
     */
    async inicializarCofre(variables: any): Promise<RelatorioDaInicializacao> {
        const vault = this.app.vault;
        const cofre: CofreDaInicializacao = {
            existe: caminho => !!vault.getAbstractFileByPath(caminho),
            criarPasta: async caminho => { await vault.createFolder(caminho); },
            criarNota: async (caminho, conteudo) => { await vault.create(caminho, conteudo); },
        };
        const areas: any = vault.getAbstractFileByPath(PASTA_DAS_AREAS);
        const existentes: string[] = (areas?.children ?? []).filter((c: any) => Array.isArray(c?.children)).map((c: any) => String(c.name));
        const lerModelo = async (caminho: string): Promise<string | null> => {
            const modelo = vault.getAbstractFileByPath(caminho);
            try { return modelo instanceof TFile ? await vault.read(modelo) : null; } catch (e) { return null; }
        };
        const daRodada = definicoesDaRodada(variables, definicoesDe(this.plugin));
        // As respostas vão às definições (o nome, os valores, as áreas com a pasta do plano, o foco), com `inicializado`.
        const partida = this.plugin.partidaDasDefinicoes ?? [];
        const respondidas = definicoesRespondidas(this.plugin.settings, partida, variables, pastasDasAreas(daRodada.areas, existentes).pastas);
        // Os valores e a pasta deles saem das definições já com as respostas: cada valor ganha a nota dele.
        const lidas = lerDefinicoes({ ...(this.plugin.settings ?? {}), definicoes: respondidas.bloco }, partida);
        const plano = planoDaInicializacao({ ...daRodada, valores: lidas.valores, pastaDosValores: lidas.pastas.valores }, existentes, await lerModelo(MODELO_DA_AREA), await lerModelo(MODELO_DO_VALOR));
        const relatorio = await aplicarInicializacao(plano, cofre);
        if (respondidas.mudou && this.plugin.settings) {
            this.plugin.settings.definicoes = respondidas.bloco;
            await this.plugin.saveSettings?.();
        }
        variables._inicializacao = { ...relatorio, problemas: [...plano.problemas, ...respondidas.problemas], frase: fraseDoRelatorio(relatorio) };
        new Notice(`🌱 ${fraseDoRelatorio(relatorio)}`, 8000);
        return relatorio;
    }

    /** O id do primeiro menu (o papel `perguntar_a_situacao`) pela tabela vigente; sem ele, `null`. */
    get idDaSituacao(): string | null {
        return this.plugin?.manager?.tabelaDosPapeis?.().perguntar_a_situacao ?? null;
    }

    // Resolve target folder from settings if mapped, otherwise use definition default
    get targetFolder() {
        if (this.id === 'compra') return this.plugin.settings.folderCompra;
        if (this.id === 'crise') return this.plugin.settings.folderCrise;
        if (this.id === 'review') return definicoesDe(this.plugin).pastas.revisao_semanal;
        return this.saveDef.targetFolder || definicoesDe(this.plugin).pastas.inbox;
    }

    async getFilesByCriteria(criteria: any, variables: any = {}) {
        let files = this.app.vault.getMarkdownFiles();
        const folder = criteria.folder ? this.resolveFolderFilter(criteria.folder) : null;
        const pathIncludes = Array.isArray(criteria.pathIncludes)
            ? criteria.pathIncludes
            : criteria.pathIncludes
                ? [criteria.pathIncludes]
                : [];

        if (folder) {
            files = files.filter(f => f.path.startsWith(folder));
        }

        if (pathIncludes.length > 0) {
            files = files.filter(f => pathIncludes.some(fragment => f.path.includes(fragment)));
        }

        // criteria.property aceita um único {key, value} (retrocompatível) ou um array
        // de {key, value, negate?} combinados em AND. criteria.propertyAny aceita grupos
        // alternativos: basta um grupo inteiro corresponder. Ambos resolvem tokens do protocolo.
        const resolvePropertyCriteria = (rawCriteria: any): any[] => {
            const items = rawCriteria
                ? (Array.isArray(rawCriteria) ? rawCriteria : [rawCriteria])
                : [];
            return items.map((criterion: any) => ({
                ...criterion,
                value: typeof criterion.value === 'string'
                    ? this.processTemplate(criterion.value, variables)
                    : Array.isArray(criterion.value)
                        ? criterion.value.map((value: any) => typeof value === 'string'
                            ? this.processTemplate(value, variables)
                            : value)
                        : criterion.value
            }));
        };
        const propertyCriteria = resolvePropertyCriteria(criteria.property);
        const propertyAnyGroups = (Array.isArray(criteria.propertyAny) ? criteria.propertyAny : [])
            .map(group => resolvePropertyCriteria(group));

        // `quarterFocus: "<AAAA-Qn com tokens>"`: só as notas da lista de foco daquele
        // trimestre (`focoDoTrimestre`: centrais + `projetos_foco`). A nota do trimestre é a
        // dona do foco (Passo 0 da Missão, 0c, 27/10/2026): o `quarter` e o
        // `foco_12_semanas` do projeto se aposentaram, e o trimestre sem lista não oferece
        // nenhuma nota (o passo diz, pelo `emptyMessage`, que a lista sai do 🧭).
        // `linkedTo: { variable, property }`: só as notas cujo campo `property` liga a uma
        // das notas escolhidas no passo `variable`, sem elas (os auxiliares das centrais).
        const fold = (name: string) => String(name ?? '').normalize('NFC').toLowerCase();
        const quarterFocus = typeof criteria.quarterFocus === 'string' && criteria.quarterFocus
            ? this.processTemplate(criteria.quarterFocus, variables).trim() : '';
        const focusKeys = quarterFocus ? new Set(this.quarterFocusNames(quarterFocus).map(fold)) : null;
        const linkedTo = criteria.linkedTo && typeof criteria.linkedTo === 'object'
            && typeof criteria.linkedTo.variable === 'string' && typeof criteria.linkedTo.property === 'string'
            ? criteria.linkedTo : null;
        const linkedKeys = linkedTo ? new Set(linkNames(variables?.[linkedTo.variable]).map(fold)) : null;

        if (criteria.tag || propertyCriteria.length > 0 || propertyAnyGroups.length > 0 || quarterFocus || linkedTo) {
            files = files.filter(f => {
                const cache = this.app.metadataCache.getFileCache(f);
                if (!cache) return false;
                const props = cache.frontmatter || {};

                const matchesAllProperties = (propertyGroup: any[]) => propertyGroup.every(propertyCriterion => {
                    const { key, value, negate } = propertyCriterion;
                    let propMatch;
                    if (value === undefined || value === null) {
                        propMatch = (props[key] !== undefined);
                    } else if (value === "!null") {
                        propMatch = (props[key] !== undefined && props[key] !== null);
                    } else if (Array.isArray(value)) {
                        propMatch = Array.isArray(props[key])
                            ? props[key].some((item: any) => value.includes(item))
                            : value.includes(props[key]);
                    } else if (Array.isArray(props[key])) {
                        propMatch = props[key].includes(value);
                    } else {
                        propMatch = (props[key] === value);
                    }
                    return negate ? !propMatch : propMatch;
                });

                let match = true;
                if (criteria.tag) {
                    const tags = (cache.tags || []).map(t => t.tag);
                    const frontmatterTags = (cache.frontmatter?.tags || []);
                    // Handle both array and string frontmatter tags
                    const fmt = Array.isArray(frontmatterTags) ? frontmatterTags : [frontmatterTags];
                    const allTags = [...tags, ...fmt.map(t => t.startsWith('#') ? t : `#${t}`)];
                    match = match && allTags.some(t => t.toLowerCase() === criteria.tag.toLowerCase());
                }

                match = match && matchesAllProperties(propertyCriteria);
                if (propertyAnyGroups.length > 0) {
                    match = match && propertyAnyGroups.some(matchesAllProperties);
                }
                if (match && focusKeys) match = focusKeys.has(fold(noteLinkName(f)));
                if (match && linkedKeys) {
                    const own = fold(noteLinkName(f));
                    match = !linkedKeys.has(own) && linkNames(props[linkedTo!.property]).some(name => linkedKeys.has(fold(name)));
                }
                return match;
            });
        }

        // README vira o nome da pasta (ver noteLinkName): `[[README]]` é o do KERNEL.
        return [...new Set(files.map(f => noteLinkName(f)))]
            .sort((a, b) => a.localeCompare(b, "pt-BR"))
            .map(name => `[[${name}]]`);
    }

    /**
     * O que faz: a lista de foco do trimestre `quarter` (`focoDoTrimestre` do frontmatter da
     * nota `Quarterly/<quarter>.md`); sem a nota → `[]`.
     * Prova: tests/engine/trimestrePadrao.test.ts ("um foco só").
     */
    quarterFocusNames(quarter: string): string[] {
        if (!ehTrimestre(String(quarter ?? ''))) return [];
        const vault = this.app?.vault;
        let note: any = vault?.getAbstractFileByPath?.(`300 - RUNTIME/302 - Daymiss/Quarterly/${quarter}.md`);
        if (!(note instanceof TFile)) note = (vault?.getMarkdownFiles?.() ?? []).find((f: TFile) => f.basename === quarter) ?? null;
        if (!(note instanceof TFile)) return [];
        return focoDoTrimestre(this.app.metadataCache?.getFileCache?.(note)?.frontmatter ?? {});
    }

    async getPendingTasks(criteria: any = {}) {
        let files = this.app.vault.getMarkdownFiles();
        const folders = [];

        if (criteria.folder) folders.push(criteria.folder);
        if (Array.isArray(criteria.folders)) folders.push(...criteria.folders);

        const resolvedFolders = folders
            .map(folder => this.resolveFolderFilter(folder))
            .filter(Boolean);

        if (resolvedFolders.length > 0) {
            files = files.filter(file => resolvedFolders.some(folder => file.path.startsWith(folder)));
        }

        const activeFile = this.app.workspace.getActiveFile();
        const currentDay = this.getContextDate().format("YYYY-MM-DD");
        const tasks = [];

        for (const file of files) {
            const content = await this.app.vault.cachedRead(file);
            const lines = content.split("\n");

            lines.forEach((line, index) => {
                const match = line.match(/^\s*[-*]\s+\[(.)\]\s+(.*)$/);
                if (!match) return;

                const status = match[1];
                const text = match[2].trim();
                if (!text) return;
                if (status.toLowerCase() === 'x') return;

                tasks.push({
                    text,
                    status,
                    line: index + 1,
                    file,
                    isToday: file.name === `${currentDay}.md`,
                    isActive: activeFile ? file.path === activeFile.path : false,
                    mtime: file.stat?.mtime || 0
                });
            });
        }

        tasks.sort((a, b) => {
            if (a.isToday !== b.isToday) return a.isToday ? -1 : 1;
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            return b.mtime - a.mtime;
        });

        return tasks.slice(0, criteria.limit || 200);
    }

    async run(initialVariables: any = {}) {
        // 0. Redirect (Alias Mechanism) — permite fundir/renomear protocolos sem quebrar botões antigos
        if (this.def.redirect) {
            const target = this.plugin.manager.get(this.def.redirect);
            if (target) {
                // redirectVariables permite ao alias pré-responder passos do destino (ex: diagnóstico)
                await target.run({ ...(this.def.redirectVariables || {}), ...initialVariables });
            } else {
                new Notice(`⚠️ Redirect não encontrado: ${this.def.redirect}`);
            }
            return;
        }

        this.contextDateOverride = this.parseContextDateOverride(initialVariables?._context_date);
        this.askTaskContexts = true;
        this.activeVariant = null;
        const variables: any = { ...initialVariables };
        this.hydrateSelectedNoteProps(variables);
        // Data de contexto desta rodada, lida antes de qualquer nota ser aberta: é a que
        // segue para a próxima rodada quando o protocolo chama a si próprio.
        const runContextDate = this.getContextDate().format("YYYY-MM-DD");

        // Auto-injetar contexto do arquivo ativo (Útil para canvas templates)
        const activeFile = this.app.workspace.getActiveFile();
        Object.assign(variables, variaveisDaNotaAtiva(activeFile));
        // A rodada que começou com um rascunho aberto (o "▶️ Continuar" dele): ao fim,
        // o rascunho é marcado como concluído e perde o botão (`closeResumedDraft`).
        const resumedDraftPath = activeFile && activeFile.extension === 'md' && / - RASCUNHO$/.test(activeFile.basename)
            ? activeFile.path
            : null;
        // A semana-alvo desta rodada (a de `{{targetweek}}`) como variável, para
        // `{{weekday:_target_week:4:YYYY-[Q]Q}}`: o trimestre de uma semana é o da
        // quinta-feira dela (a W40/2026 começa em 28/09 e é do Q4). Sempre recalculada:
        // a de outro protocolo da cadeia não vale aqui.
        // A semana da data de contexto (a de hoje, ou a da nota aberta), sem o salto de
        // sexta da semana planejada: `{{weekday:_context_week:4:YYYY-[Q]Q}}` é o trimestre
        // que a revisão fecha, pela quinta-feira da semana em que ela roda (4.4).
        Object.assign(variables, this.semanasDaRodada(variables));

        // Router que abriu esta rodada (o topo de `_callers`). Router não ganha o
        // Voltar extra: o menu dele já tem o "🔙 Voltar" próprio.
        const callerRouter = this.id.startsWith('router_') ? null : this.callerRouterOf(variables);

        // `continueFromDay`: o modo que continua um registro já feito hoje (o 🔎
        // Aprofundar depois do 🌙) pula os passos já gravados na Day e não pontua de novo.
        const continuation = this.continuationOf(variables);
        if (continuation) {
            new Notice("↪️ Continuando o registro de hoje: o que já foi gravado não é perguntado de novo.", 4000);
        }

        const history = []; // Stack of step indices
        let currentIndex = 0;
        const steps = this.def.steps || [];
        // Setado ao voltar (ver 'back' abaixo) para forçar a reexibição do passo de
        // destino mesmo que ele já tenha valor — sem isso, o skip de Context Passing
        // logo abaixo o pularia de novo silenciosamente e o Voltar nunca funcionaria.
        // Vale só para UMA iteração (a do passo-alvo do Voltar), por isso é consumido
        // e resetado logo no início do loop, antes de qualquer `continue`.
        let cameFromBack = false;
        // Passos respondidos NESTA execução. Se o operador volta e muda a resposta de
        // que um passo condicional dependia, a resposta antiga dele sai (ver abaixo).
        const answeredHere = new Set<string>();
        // `returnTo` ("🔄 Tentar novamente"): até este índice, os passos já respondidos
        // nesta rodada são perguntados de novo, com a resposta anterior no campo.
        let rewindUntil = -1;

        // 1. Execute Steps
        while (currentIndex < steps.length) {
            const step = steps[currentIndex];
            const forceReprompt = cameFromBack || (currentIndex <= rewindUntil && answeredHere.has(step.id));
            cameFromBack = false;

            // Check Condition
            if (step.condition) {
                const isMatch = condicaoDoPasso(step.condition, variables, steps);

                if (!isMatch) {
                    // Respondido antes de um Voltar que mudou a condição: a resposta não
                    // vale mais (ex.: o 📤 par de uma 🔥 que virou ⚙️). Pré-resposta vinda
                    // de fora (alias, botão, encadeamento) não é tocada.
                    if (answeredHere.has(step.id)) {
                        answeredHere.delete(step.id);
                        for (const key of chavesDaResposta(step.id)) delete variables[key];
                    }
                    currentIndex++;
                    continue;
                }
            }

            // Já gravado na Day por este mesmo protocolo hoje (`continueFromDay`): não
            // pergunta de novo, e a resposta de lá não volta ao registro desta rodada.
            if (continuation?.has(step.id)) {
                currentIndex++;
                continue;
            }

            // Skip step if variable already exists (Context Passing)
            // But only if we are moving forward and not explicitly asked
            // O passo respondido no formulário (`_respondidos`, P11 da Missão, §5.3, 5) vale como
            // respondido mesmo vazio e mesmo com `alwaysAsk`; com a resposta que não passa na
            // validação, é perguntado (aberto com ela). Fora da lista, a regra de sempre.
            const listado = respondidosDe(variables).has(step.id);
            const alreadyHasValue = listado ? respondidoNoFormulario(step, variables) : (variables[step.id] && !step.alwaysAsk);
            const isMovingForward = history.length <= currentIndex; // Simple heuristic
            // A tarefa já escolhida fora da lista (o 🤝 Fazer agora do nó no canvas) ainda
            // pergunta onde estou e quanto tempo tenho: é o dado que ensina a reputação
            // contextual (decisão de 18/10; 4.6). Só a lista é pulada.
            const preChosenNow = Boolean(alreadyHasValue && isMovingForward && !forceReprompt && this.needsNowPlaceTime(step, variables));

            if (alreadyHasValue && isMovingForward && !forceReprompt && !preChosenNow) {
                if (listado && step.type === 'multiselect' && step.fromDiary) {
                    // O "📖 Pelo diário" respondido no formulário grava aqui o que o modal gravaria
                    // ao confirmar o passo (`aplicarDiario`). Sem nada citado no diário agora, o
                    // passo não aparece, como no modal, e a resposta não vale.
                    const dia = this.getContextDate().format('YYYY-MM-DD');
                    const options = await this.opcoesDoDiario(dia);
                    if (!options || options.length === 0) {
                        for (const key of chavesDaResposta(step.id)) delete variables[key];
                        currentIndex++;
                        continue;
                    }
                    this.gravarResposta(step, this.applyStepOptions(step, variables), await this.aplicarDiario(options, { value: variables[step.id] }, dia), variables);
                    answeredHere.add(step.id);
                } else if (listado) {
                    // Respondido no formulário: os mesmos derivados da resposta dada no modal
                    // (`_value`, `_num`, `_display`, `_path`, `_folder`, `_prop_*`; §5.2, limite 2).
                    this.gravarResposta(step, this.applyStepOptions(step, variables), this.resultadoPreDado(step, variables), variables);
                    answeredHere.add(step.id);
                } else if (Array.isArray(step.optionValues) && variables[`${step.id}_value`] === undefined) {
                    // Pré-respondido (alias, botão, encadeamento): o valor da opção também vale.
                    variables[`${step.id}_value`] = this.optionValueFor(this.applyStepOptions(step, variables), variables[step.id]);
                }
                // Se estivermos pulando o passo, ainda precisamos registrar no histórico para poder voltar
                if (history[history.length - 1] !== currentIndex) {
                    history.push(currentIndex);
                }
                currentIndex++;
                continue;
            }

            // No 1º passo de um destino aberto por um router, o Voltar devolve a esse
            // router (escolher errado no menu não termina só com Esc).
            const showBack = history.length > 0 || Boolean(callerRouter);
            let result;

            // Preenche o passo com a resposta anterior ao reexibi-lo (Voltar), em vez de
            // abrir vazio e obrigar o usuário a redigitar/reselecionar tudo de novo.
            const previousValue = variables[step.id];

            // O passo como o modal o mostra: o contexto, as opções, a contagem, a Herança, a
            // resposta de abertura e as opções de cada tipo (`montarPasso`).
            const montado = await this.montarPasso(step, variables, { preChosenNow });
            const uiStep = montado.ui;

            if (step.type === 'text') {
                const opening = montado.abertura!;
                result = await this.prompt(uiStep.prompt, uiStep.placeholder, showBack, opening.value, withOpeningInfo(uiStep.info, opening));
                // `trim: true` (o ✈️, P10 da Missão): o nome digitado é gravado sem o espaço das
                // pontas, na nota, na Day, no nome do arquivo e na tarefa. Sem a chave, nada muda.
                result = trimmedAnswer(step, result);
            } else if (step.type === 'textarea') {
                const opening = montado.abertura!;
                result = await this.promptTextarea(uiStep.prompt, uiStep.placeholder, showBack, opening.value, withOpeningInfo(uiStep.info, opening));
            } else if (step.type === 'suggest') {
                // `rankOptions` (Fase D): as opções que levam a protocolo na ordem dos pesos,
                // com o porquê abaixo; a resposta continua o texto do JSON. Sem a chave, nada muda.
                const ranked = montado.ordenadas;
                // A opção que veio do formulário (`_valoresIniciais`) abre a lista: Enter mantém.
                if (montado.padrao) {
                    // O porquê da opção que veio do `defaultFrom` vai como a nota dela (a do formulário é a de sempre).
                    const notas = { ...(ranked ? ranked.notes : {}) };
                    if (montado.notaDoPadrao) notas[montado.padrao] = notas[montado.padrao] ? `${montado.notaDoPadrao} · ${notas[montado.padrao]}` : montado.notaDoPadrao;
                    result = await this.suggest(ranked ? ranked.options : uiStep.options, uiStep.prompt, showBack, uiStep.info, notas, montado.padrao);
                }
                else result = ranked
                    ? await this.suggest(ranked.options, uiStep.prompt, showBack, uiStep.info, ranked.notes)
                    : await this.suggest(uiStep.options, uiStep.prompt, showBack, uiStep.info);
            } else if (step.type === 'select') {
                result = montado.padrao
                    ? await this.suggest(uiStep.options, uiStep.prompt, showBack, uiStep.info, montado.notaDoPadrao ? { [montado.padrao]: montado.notaDoPadrao } : {}, montado.padrao)
                    : await this.suggest(uiStep.options, uiStep.prompt, showBack, uiStep.info);
            } else if (step.type === 'suggest_note') {
                result = await this.suggestNote(montado.passoDaNota, showBack);
            } else if (step.type === 'suggest_task') {
                result = await this.suggestTask(uiStep, showBack);
            } else if (step.type === 'multiselect' && step.fromDiary) {
                // "📖 Pelo diário" (o 🌙, em teste; plano de 22/10): sem nada citado no
                // diário do dia, o passo não aparece.
                result = await this.diaryStep(uiStep, showBack, previousValue);
                if (result?.status === 'skip') {
                    currentIndex++;
                    continue;
                }
            } else if (step.type === 'multiselect') {
                const opening = montado.abertura!;
                result = await this.multiSelect(uiStep.options, uiStep.prompt, showBack, opening.value, withOpeningInfo(uiStep.info, opening));
            } else if (step.type === 'multiselect_note') {
                const options = montado.opcoes!;
                const opening = montado.abertura!;
                if (options.length === 0) {
                    // Nada para escolher: o passo opcional segue com o `skipLabel` (o
                    // "⏭️ Nenhuma concluída" do 📅), e o aviso é o texto do passo — o
                    // critério em JSON, com token sem resolver, não diz nada a ninguém.
                    if (step.emptyMessage) new Notice(String(step.emptyMessage), 6000);
                    else if (!step.optional) new Notice("⚠️ Nenhuma nota atende a este passo agora.", 6000);
                    result = { status: 'submit', value: step.optional && step.skipLabel ? String(step.skipLabel) : "Nenhum" };
                } else {
                    result = await this.multiSelect(options, uiStep.prompt, showBack, opening.value, withOpeningInfo(uiStep.info, opening));
                }
            } else {
                new Notice(`⚠️ Tipo de passo não suportado: ${step.type}`);
                return;
            }

            // `onEmpty: "end"`: o passo não tinha o que oferecer e o aviso já foi dado. Não é
            // desistência no meio do caminho: termina sem rascunho e sem gravar nada.
            if (result.status === 'end') return;

            if (result.status === 'cancel') {
                // Salvar progresso parcial somente se pelo menos a primeira etapa estiver concluída com dados (e não for router)
                const hasMeaningfulData = this.getMeaningfulVariableEntries(variables).length > 0;
                if (currentIndex > 0 && hasMeaningfulData && !this.id.startsWith('router_')) {
                    await this.savePartialProgress(variables);
                }
                return;
            }

            if (result.status === 'back') {
                if (history.length > 0) {
                    currentIndex = history.pop();
                    // NÃO apagar variables[steps[currentIndex].id] aqui: isso destruía a
                    // resposta anterior antes mesmo de reabrir o passo para edição (bug:
                    // "voltar esvazia a sessão"). O valor antigo agora é preservado e usado
                    // para pré-preencher o campo; forceReprompt evita que o skip de Context
                    // Passing engula o passo de novo por já ter valor.
                    cameFromBack = true;
                } else if (callerRouter) {
                    // Nada foi gravado: o router que abriu este protocolo volta limpo.
                    const caller = this.plugin.manager?.get?.(callerRouter);
                    if (caller) {
                        const back = this.getNextProtocolVariables(callerRouter, variables, runContextDate);
                        this.setCallers(back, this.callersOf(variables).slice(0, -1), variables);
                        await caller.run(back);
                    }
                    return;
                }
                continue;
            }

            // status === 'submit'
            // A validação (`problemaDaResposta`, a mesma do formulário): `required: true` é a
            // única forma de tornar um campo realmente obrigatório (o InputModal confirma o
            // valor cru; opt-in de propósito, os protocolos legados seguem aceitando vazio), e
            // `maxSelect: N` numa seleção (no máximo três centrais na Temporada, no máximo dois
            // números): marcado a mais, o passo reabre com as marcas para desmarcar.
            const problema = problemaDaResposta(step, result.value);
            if (problema) {
                new Notice(avisoDoProblema(problema), problema.tipo === 'obrigatorio' ? 4000 : 6000);
                if (problema.tipo === 'maxSelect') variables[step.id] = result.value;
                cameFromBack = true; // força reexibir o passo em vez de avançar
                continue;
            }

            // `returnTo: { "<opção>": "<passo anterior>" }`: a opção que pede para refazer
            // volta de fato àquele passo ("🔄 Tentar novamente" da Transvaloração volta à
            // autohipnose). A opção é navegação, não resposta: não é gravada. Os passos de
            // lá até aqui são perguntados de novo, com a resposta anterior no campo.
            const rewindTo = this.returnIndexOf(step, result.value, steps, currentIndex);
            if (rewindTo !== null) {
                rewindUntil = Math.max(rewindUntil, currentIndex);
                const visited = history.indexOf(rewindTo);
                if (visited >= 0) history.length = visited;
                currentIndex = rewindTo;
                cameFromBack = true;
                continue;
            }

            // "🔙 Voltar" escrito como OPÇÃO de um passo de dado (o nível de energia, o
            // estado do corpo no check-in) não é resposta: entrava no registro ("energia
            // 🔙 Voltar"), gravava energia: 0 na Day e pontuava antes de voltar. Antes de
            // qualquer texto escrito nesta rodada, ele encerra sem gravar e volta ao router
            // (o que abriu este protocolo; aberto direto, o do mapa do JSON), como o
            // ⬅️ Voltar do 1º passo. Depois de texto escrito (crise, medo: o Voltar vem no
            // fim, com o registro feito), segue o caminho normal: grava e encadeia.
            if ((step.type === 'suggest' || step.type === 'select') && !this.id.startsWith('router_')
                && typeof result.value === 'string' && GENERIC_BACK_OPTIONS.has(result.value)
                && !this.hasWrittenAnswer(steps, variables, answeredHere)) {
                const target = callerRouter || this.backRouterOf(step.id, result.value);
                const next = target && target !== this.id ? this.plugin.manager?.get?.(target) : null;
                if (next) {
                    const back = this.getNextProtocolVariables(target, variables, runContextDate);
                    this.setCallers(back, callerRouter ? this.callersOf(variables).slice(0, -1) : [], variables);
                    await next.run(back);
                }
                return;
            }

            // A resposta e os derivados dela (`gravarResposta`).
            this.gravarResposta(step, uiStep, result, variables);
            answeredHere.add(step.id);

            // Gravar no histórico ANTES de avançar
            if (history[history.length - 1] !== currentIndex) {
                history.push(currentIndex);
            }
            currentIndex++;
        }

        // CHECK IF ROUTER (Bypass File Creation)
        const isRouter = this.id.startsWith('router_');

        if (!isRouter) {
            // ⚙️ A ação de sistema (`acao: "inicializar"`, C0 do mapa da v0): a árvore e as notas de
            // partida do cofre, antes da nota do protocolo. Sem nota a gravar (sem pasta nem modelo), para aqui.
            if (this.def.acao === 'inicializar') {
                await this.inicializarCofre(variables);
                if (!this.def.targetFolder && !this.def.template && !this.def.templateFile && !Array.isArray(this.def.variants)) return;
            }

            // 1.5 Entidades reutilizáveis: resolve ANTES do template/properties para que
            // {{var_entity_display}} já exista na nota criada. É isso que permite agregar
            // por entidade (ex: estratégia de enfrentamento) em vez de casar texto solto.
            if (this.def.createEntity) {
                const entityConfigs = Array.isArray(this.def.createEntity)
                    ? this.def.createEntity
                    : [this.def.createEntity];
                for (const cfg of entityConfigs) {
                    await this.createEntityFromVariable(cfg, variables);
                }
            }

            // 📱 `teleprompter: { notaVar }` (03/11): a fala da nota escolhida, em linhas curtas, vira as variáveis
            // `teleprompter_texto` e `teleprompter_faltas` antes do modelo; o roteiro sem as seções da fala para aqui.
            if (this.def.teleprompter && !(await this.prepararTeleprompter(this.def.teleprompter, variables))) return;

            // 🔀 Mudei de frente (`pauseFront`, arquitetura 4.3): qual frente fica em pausa
            // (a do bloco aberto, ou a do pomodoro em curso), lida ANTES do template para a
            // linha da Day dizer qual foi (`{{frente_pausada}}`). A pausa grava só depois de
            // a tarefa nova ser gravada (abaixo).
            const pauseConfig = this.def.pauseFront && (!this.def.pauseFront.condition || conditionMatches(this.def.pauseFront.condition, variables))
                ? this.def.pauseFront : null;
            const toPause: string[] = pauseConfig ? await this.frontsToPause(pauseConfig, variables) : [];

            // `variants`: a variante desta rodada troca onde e como a nota é gravada
            // (pasta, nome, modelo, properties). Sem variante, `saveDef` é o protocolo.
            this.activeVariant = protocolVariant(this.def, variables);
            const saveDef = this.saveDef;
            // A variante com `template` próprio não herda o `templateFile` do protocolo.
            const templateFile = this.activeVariant && this.activeVariant.template !== undefined && this.activeVariant.templateFile === undefined
                ? undefined
                : saveDef.templateFile;

            // 2. Process Template & Properties
            let baseTemplate = "";
            if (templateFile) {
                const tFile = this.app.vault.getAbstractFileByPath(templateFile);
                if (tFile instanceof TFile) {
                    baseTemplate = await this.app.vault.read(tFile);
                } else {
                    new Notice(`⚠️ Template não encontrado: ${templateFile}`);
                    baseTemplate = this.buildFallbackTemplate(variables);
                }
            } else if (typeof saveDef.template === "string") {
                baseTemplate = saveDef.template;
            } else {
                baseTemplate = this.buildFallbackTemplate(variables);
            }
            // Protocolo append vira linhas no log do dia: rótulo sem resposta sai. Na
            // nota própria sai só a linha cujo rótulo esperava um passo não perguntado
            // (a ação de 24 h do medo no modo RÁPIDO); rótulo fixo do modelo, para
            // preencher à mão, fica.
            const source = this.def.logMode === 'append' ? baseTemplate : this.dropUnansweredLabelLines(baseTemplate, variables);
            const rendered = this.processTemplate(source, variables);
            const content = this.def.logMode === 'append' ? dropEmptyLabelLines(rendered) : rendered;
            const properties = this.processProperties(saveDef.properties, variables);
            this.addCycleContextProperties(properties);
            // `registro: "<tipo>"` (núcleo, 21/10): a nota salva vira um registro com tipo,
            // com `registro` e `data` (a data de contexto da rodada). Sem a chave, nada muda.
            if (this.def.registro !== undefined) Object.assign(properties, recordPropertiesFor(this.def.registro, properties, runContextDate));
            // `registroQuando` (o plano de uma área, 22/10): o registro que só vale numa
            // condição, com campos próprios (o 📤 de uma peça de uma obra = exposição de ideias).
            const regraRegistro = recordRuleFor(this.def.registroQuando, variables,
                (passo, projeto) => this.selectedNoteBelongsTo(variables, passo, projeto));
            if (regraRegistro) Object.assign(properties, recordPropertiesFor(regraRegistro.registro, properties, runContextDate), regraRegistro.campos);

            // CHECK IF PAYLOAD IS EMPTY
            const meaningfulEntries = this.getMeaningfulVariableEntries(variables);
            if (meaningfulEntries.length === 0) {
                new Notice("⚠️ Cancelado: Nenhum conteúdo inserido.");
                return;
            }

            // Atualização explícita de uma nota escolhida pelo próprio operador.
            // O caminho vem exclusivamente de um suggest_note e é confinado à pasta
            // permitida pelo protocolo; não é um patch arbitrário de texto.
            // Uma configuração ou uma lista delas; cada uma pode ter `condition` (a do
            // gesto: "⚡ Agora" põe em andamento, "📅 Hoje"/"🌅 Amanhã" agendam).
            if (this.def.updateSelectedNote) {
                const configs = Array.isArray(this.def.updateSelectedNote) ? this.def.updateSelectedNote : [this.def.updateSelectedNote];
                for (const config of configs) {
                    if (config?.condition && !conditionMatches(config.condition, variables)) continue;
                    const updated = await this.updateSelectedNoteFromVariable(config, variables);
                    if (!updated) return;
                }
            }
            // O bloco aberto pelo gesto (arquitetura 4.3): o pomodoro do TaskNotes na
            // tarefa e a linha da reputação contextual. Falha aqui não perde o registro.
            if (toPause.length) await this.pauseFronts(toPause);
            if (this.def.openBlock && (!this.def.openBlock.condition || conditionMatches(this.def.openBlock.condition, variables))) {
                await this.openBlockFromVariable(this.def.openBlock, variables);
            }
            if (this.def.updateSelectedNotes) {
                const updated = await this.updateSelectedNotesFromVariable(this.def.updateSelectedNotes, variables);
                if (!updated) return;
            }
            // A linha a mais na seção de uma nota que já existe (o 🔄 Revisar da nota de função, 02/11).
            if (this.def.appendToSection) await this.appendToSectionFromConfig(this.def.appendToSection, variables);

            // 3. Generate Filename
            let filename;
            if (saveDef.filename) {
                filename = this.sanitizeFilename(this.processTemplate(saveDef.filename, variables));
                if (!filename.endsWith('.md')) filename += '.md';
            } else {
                const titleVar = variables['produto'] || variables['medo'] || variables['titulo'] || 'Protocolo';
                const safeTitle = titleVar.replace(/[^a-z0-9]/gi, '_');
                const prefix = this.def.name.replace(/[^a-z0-9]/gi, '');
                filename = `${prefix} - ${safeTitle}.md`;
            }

            // 4. Save
            let createdFile;
            let skipFile = this.def.logMode === "append";

            // Protocolos "lista corrente" (ex.: act_micropraticas, act_painel_valores): não criam nota própria,
            // inserem uma entrada no topo de uma nota fixa (mais recente primeiro).
            if (this.def.prependToNote) {
                try {
                    createdFile = await this.prependToNote(this.def.prependToNote, content);
                    filename = createdFile.name;
                    variables._currentNote = createdFile.basename;
                    skipFile = false; // já foi "salvo" — loga como link normal, não como dump
                } catch (e) {
                    new Notice(`Erro ao adicionar à lista: ${e.message}`);
                    return;
                }
            } else if (!skipFile) {
                try {
                    createdFile = await this.saveNote(filename, content, properties, variables._previousNote, variables);
                    // O nome que a nota ganhou de fato (`onExisting: "suffix"` pode dar "Nome (2)").
                    if (createdFile?.name) filename = createdFile.name;
                    variables._currentNote = filename.replace('.md', ''); // Guardar para próximo protocolo
                    variables._currentPath = createdFile?.path ?? '';

                    // AUTO-GENERATE STRATEGIC CANVAS
                    if (createdFile && this.plugin.canvasEngine) {
                        const path = createdFile.path;
                        const canvasKind = strategicCanvasKindFor(path, createdFile.basename ?? '', createdFile.parent?.name ?? '');
                        if (this.ehDoPapel('criar_projeto', 'criar_departamento')) {
                            // O canvas do projeto e do departamento novos é o canvas gerido (o mapa
                            // DFM), e nasce em projectCanvasManager.onProtocol, no
                            // `dfm:protocol-complete`: o mesmo do "Criar canvas" do painel, com o
                            // repositório aninhado tratado e a primeira ação na zona. Este ramo fica
                            // vazio de propósito: sem ele, a nota-índice cairia no `canvasKind`
                            // abaixo e o modelo antigo de botões ("Central de Comando", com nós para
                            // documentos que o protocolo não cria) nasceria antes, no mesmo caminho.
                            // Um nascimento só (o padrão fractal, 02/11/2026).
                        } else if (canvasKind) {
                            await this.plugin.canvasEngine.generateStrategicCanvas(createdFile, canvasKind);
                        } else if (this.ehDoPapel('inventariar_sofrimento') && typeof variables.sofrimentos === 'string') {
                            const items = variables.sofrimentos.split('\n').map((s: string) => s.trim()).filter(Boolean);
                            if (items.length > 0) {
                                await this.plugin.canvasEngine.generateSufferingInventoryCanvas(items, createdFile.path);
                            }
                        }
                    }

                } catch (e) {
                    new Notice(`Erro ao salvar nota: ${e.message}`);
                    return; // Stop execution on save error
                }
            }

            // 5. Log to Daily Note
            try {
                await this.logToDailyNote(skipFile ? null : filename, content, variables);

                // If logMode is append, also save frontmatter properties to daily note directly (skipping generic type/status)
                if (skipFile && Object.keys(properties).length > 0) {
                    const targetDateStr = this.getContextDate().format("YYYY-MM-DD");
                    const dailyFile = this.getDailyNoteFile(targetDateStr);
                    if (dailyFile) {
                        await this.mergeDailyProperties(dailyFile, properties);
                        console.log(`DFM: Metadados salvos na nota diária ${dailyFile.name}:`, properties);
                    } else {
                        // Falha silenciosa: sem a diária, as propriedades do protocolo append
                        // simplesmente não existem em lugar nenhum — o operador precisa saber.
                        console.error(`DFM mergeDailyProperties: nota diária (${targetDateStr}) não encontrada — propriedades não salvas.`);
                        new Notice("⚠️ As propriedades não foram salvas: a nota diária de hoje não existe.", 6000);
                    }
                }
            } catch (e) {
                console.error(`Error logging to daily note or saving frontmatter: ${e.message}`);
                new Notice("⚠️ O registro na nota diária não foi salvo — confira a nota do dia.", 6000);
            }

            // `dayProperties: { "cidade": "{{cidade}}" }`: campos que o protocolo grava no
            // frontmatter da Day da rodada, além da nota própria (a chegada grava a cidade).
            if (this.def.dayProperties && typeof this.def.dayProperties === 'object') await this.writeDayProperties(this.def.dayProperties, variables);

            // Comando do Dia da Day: só o protocolo do comando o grava (`syncDailyCommand`).
            // A SMART escolhida no 💡 (Peça da Temporada) ou no ⚡ também se chama
            // `tarefa_smart` e trocava o command_task_path pela SMART: concluir a tarefa do
            // ▶️ deixava de marcar o hábito, e o painel mostrava a tarefa errada.
            const commandPayload = this.def.syncDailyCommand === true ? this.getDailyCommandSyncPayload(variables) : {};
            if (Object.keys(commandPayload).length > 0) {
                try {
                    const targetDateStr = this.getContextDate().format("YYYY-MM-DD");
                    const success = await this.plugin.updateDailyCommandFields(
                        commandPayload.unicaCoisa,
                        commandPayload.valor,
                        commandPayload.tarefaSmart,
                        commandPayload.macroFoco,
                        targetDateStr,
                        commandPayload.commandTaskPath
                    );
                    if (success) {
                        new Notice("🎯 Comando do Dia preenchido automaticamente!");
                    }
                } catch (e) {
                    console.error(`Error syncing daily command fields: ${e.message}`);
                }
            }

            // 6. Log to Weekly Note
            if (!skipFile && filename) {
                // Determine Temporal Date (Deadline or specific date)
                const temporalDate = variables.deadline || variables.prazo || variables.date || variables.start_date;

                if (this.def.logToWeekly || this.targetFolder.includes("200 - WEEKLY") || this.ehDoPapel('planejar_semana') || this.id === 'review') {
                    await this.logToWeeklyNote(filename, temporalDate); // Pass date!
                }

                // 7. Log to Monthly Note
                if (this.def.logToMonthly || this.targetFolder.includes("400 - QUARTERLY") || this.id === 'planejamento_mensal') {
                    await this.logToMonthlyNote(filename, temporalDate);
                }

                // 8. Log to Quarterly Note
                if (this.def.logToQuarterly || this.targetFolder.includes("400 - QUARTERLY") || this.ehDoPapel('planejar_trimestre', 'revisar_trimestre')) {
                    await this.logToQuarterlyNote(filename, temporalDate, createdFile?.path ?? null);
                }

                // 9. Log to Annual Note
                if (this.id === 'planejamento_anual') await this.logToAnnualNote(filename, temporalDate);
            }

            // 5b. Write properties to the cycle note frontmatter (weekly/quarterly), if requested.
            // A nota de ciclo nasce só pelo planejamento (🌳 / trimestral): os passos 6/8 não a
            // criam mais. Sem ela, o aviso abaixo diz que os dados não foram gravados.
            if (this.def.frontmatterTarget && Object.keys(properties).length > 0) {
                try {
                    const cyclePath = this.resolveCycleTargetPath(this.def.frontmatterTarget, properties);
                    const cycleFile = cyclePath ? this.app.vault.getAbstractFileByPath(cyclePath) : null;
                    if (cycleFile instanceof TFile) {
                        await this.app.fileManager.processFrontMatter(cycleFile, (fm) => {
                            // `frontmatterTargetFields`: só estes campos vão à nota de ciclo (a revisão
                            // trimestral manda só `status`; as respostas ficam na nota dela, 4.4).
                            const onlyFields = Array.isArray(this.def.frontmatterTargetFields) ? new Set<string>(this.def.frontmatterTargetFields) : null;
                            for (const [key, value] of Object.entries(properties)) {
                                if (key === 'type' || key === 'date') continue;
                                if (onlyFields && !onlyFields.has(key)) continue;
                                // Passo deixado em branco não apaga o que a nota de ciclo já tem.
                                if (value === '' || value === null || value === undefined) continue;
                                fm[key] = value;
                            }
                        });
                        console.log(`DFM: Metadados salvos na nota de ciclo ${cycleFile.name}:`, properties);
                    } else {
                        console.error(`DFM frontmatterTarget: nota de ciclo não encontrada em ${cyclePath || '(destino indefinido)'}`);
                        new Notice("⚠️ Os dados não foram salvos: a nota de ciclo (semana/trimestre) ainda não existe.", 6000);
                    }
                } catch (e) {
                    console.error(`DFM frontmatterTarget: ${e.message}`);
                    new Notice("⚠️ Os dados não foram salvos na nota de ciclo (semana/trimestre).", 6000);
                }
            }

            // 10. A pontuação da gamificação (os pontos pelo `rewards`, E.C.H. pelo
            // `ech_type`/`ech_points` e pelos `score_*` do 🔎, o aviso "nada foi pontuado de
            // novo" e o `onComplete` com `awardXP`) saiu em 29/10/2026, quando a gamificação
            // foi arquivada (`ARQUIVO_GAMIFICACAO.md`). O motor não lê mais essas chaves; o
            // juiz recusa o `onComplete`.

            // 10.5 Habit Tracking (New!) — a continuação não marca o hábito outra vez.
            if (!variables._notePreserved && !continuation && (this.def.isHabit || this.def.habitGroup)) {
                // A marca vai para o dia a que a execução pertence (a data de contexto),
                // não para o relógio: o 🌙 depois da meia-noite fecha o dia da Day aberta.
                await this.plugin.habitLog.logHabit(this.id, variables, createdFile, this.getContextDate().format('YYYY-MM-DD'));
            }

            // AUTO-OPEN note to continue the writing flow
            if (createdFile) {
                await this.app.workspace.getLeaf(false).openFile(createdFile);
            }

            // 10.6 Loop Closing: criar tarefa real no TaskNotes a partir de uma variável do protocolo
            if (this.def.createTask) {
                const configs = Array.isArray(this.def.createTask) ? this.def.createTask : [this.def.createTask];
                // A nota criada acabou de ser aberta e a nota ativa mudou: as datas da
                // tarefa (week, today/tomorrow) seguem o dia em que o protocolo rodou.
                const savedOverride = this.contextDateOverride;
                this.contextDateOverride = runContextDate;
                try {
                    for (const cfg of configs) {
                        await this.createTaskFromVariable(cfg, variables, createdFile);
                    }
                } finally {
                    this.contextDateOverride = savedOverride;
                }
            }

            // 10.7 `registrarFeito: { linhasVar }`: cada linha da resposta vira o registro do que
            // foi feito fora do plano, no dia desta rodada, pela função única (a pergunta do 🌙).
            if (this.def.registrarFeito) await this.registrarFeitoDasLinhas(this.def.registrarFeito, variables, runContextDate);

            // Quem precisa agir depois de um protocolo (criar o canvas de um projeto
            // novo, atualizar o canvas do trimestre) escuta este evento — o protocolo
            // não conhece canvas nenhum. `contextDate` é o dia a que esta rodada pertence
            // (o 🌙 depois da meia-noite fecha o dia da Day aberta, não o do relógio), e
            // `continuation` marca a rodada que continua um registro já feito hoje (o 🔎
            // depois do 🌙): quem escuta não repete o que a primeira rodada já disparou.
            if (resumedDraftPath) {
                await this.closeResumedDraft(resumedDraftPath, createdFile ? createdFile.basename : runContextDate);
            }

            this.app.workspace?.trigger?.('dfm:protocol-complete', {
                id: this.id,
                file: createdFile ?? null,
                variables,
                contextDate: runContextDate,
                continuation: Boolean(continuation),
            });
            // A variante vale só para a nota desta rodada.
            this.activeVariant = null;

        }

        // 11. Protocol Chaining (Next Protocol)
        let nextProtocolId = this.def.nextProtocol;

        // Quem abre a próxima rodada: o "🔙 Voltar" que volta a quem chamou desce um
        // nível na pilha `_callers`; o resto (ver abaixo) a mantém ou empilha.
        let backToCaller = false;
        let genericBack = false;
        // Opção própria de volta ("🔙 Voltar ao hub"): é um passo para
        // trás, não um nível novo — o router não se empilha como quem abriu o destino.
        let backwardOption = false;

        // `queue: true` num router: se ele também casa depois de outro já ter escolhido o
        // próximo protocolo, o destino dele roda em seguida, quando a cadeia acabar (o 🌳:
        // "✈️ Cidade nova" abre a chegada e, depois dela, a SMART pedida antes).
        const queued: string[] = [];

        // Dynamic Chaining Override
        if (this.def.dynamicNextProtocol) {
            // Support both single object and array of routers
            const routers = Array.isArray(this.def.dynamicNextProtocol)
                ? this.def.dynamicNextProtocol
                : [this.def.dynamicNextProtocol];

            let chosen = false;
            for (const router of routers) {
                const { stepId, map } = router;
                const answer = variables[stepId];

                if (chosen) {
                    if (router.queue === true && answer && map?.[answer]) queued.push(map[answer]);
                    continue;
                }
                if (answer && map[answer]) {
                    nextProtocolId = map[answer];
                    backwardOption = typeof answer === 'string' && answer.trim().startsWith('🔙');
                    // "🔙 Voltar" volta a quem chamou: o JSON aponta um router fixo (o
                    // check-in aberto pelo 🆘 voltava ao ⚙️ Operacional). Aberto direto
                    // (sem router que o abriu), vale o router do JSON. O Voltar de um
                    // submenu que aponta o próprio router reabre o menu principal dele.
                    if (GENERIC_BACK_OPTIONS.has(answer) && nextProtocolId !== this.id) {
                        genericBack = true;
                        const caller = this.isRouterProtocol(nextProtocolId) ? this.callerRouterOf(variables) : null;
                        if (caller) {
                            nextProtocolId = caller;
                            backToCaller = true;
                        }
                    }
                    chosen = true; // o primeiro que casa escolhe; os seguintes só entram na fila (`queue`)
                }
            }
        }

        // A fila que chegou de uma rodada anterior (`_then`): sem próximo protocolo aqui,
        // a cadeia acabou e o primeiro da fila roda agora, com as variáveis guardadas.
        const pending: Array<{ id: string; vars: any }> = [
            ...queued.map(id => this.queuedEntry(id, variables, runContextDate)),
            ...(Array.isArray(variables._then) ? variables._then : []),
        ].filter(entry => entry && typeof entry.id === 'string');
        if (!nextProtocolId && pending.length) {
            const [first, ...rest] = pending;
            const after = this.plugin.manager?.get?.(first.id);
            if (after) {
                const vars = { ...(first.vars || {}), ...(rest.length ? { _then: rest } : {}) };
                new Notice(`🔗 Iniciando próximo protocolo: ${after.name}`, 3000);
                setTimeout(() => after.run(vars), 1000);
            }
            return;
        }

        if (nextProtocolId) {
            const next = this.plugin.manager.get(nextProtocolId);
            if (next) {
                // Um protocolo que chama a si próprio ("outra técnica agora")
                // precisa iniciar uma sessão nova. Reusar `variables` fazia todas
                // as etapas serem puladas e criava um loop de notas/notificações.
                const isSelfChain = next.id === this.id;
                // Protocolos por onde esta cadeia já passou: uma volta a qualquer um
                // deles começa limpa (ver getNextProtocolVariables).
                variables._chain = [...this.chainOf(variables), this.id];
                const carry = this.def.carry?.[next.id];
                const nextVariables = carry
                    ? this.carryVariables(carry, variables, runContextDate)
                    : this.getNextProtocolVariables(next.id, variables, runContextDate);
                // Pilha de routers que abriram cada rodada, para o Voltar: voltar a quem
                // chamou desempilha; a mesma rodada de novo mantém; um router que abre
                // um destino se empilha; um protocolo comum que abre outro não deixa
                // Voltar automático (o destino não foi escolhido num menu). A opção
                // própria de volta de um router não o empilha: o 🎈 ACT aberto direto,
                // "Voltar ao Hub" → 🆘 → 🔙 Voltar, voltava ao ACT, e os dois menus se
                // alternavam sem saída.
                const callers = this.callersOf(variables);
                const nextCallers = backToCaller || genericBack
                    ? callers.slice(0, -1)
                    : isSelfChain
                        ? callers
                        : this.isRouterProtocol(this.id)
                            ? (backwardOption ? callers : [...callers, this.id])
                            : [];
                // Voltar a um router que já está na pilha (opção própria, como "🔙 Voltar
                // ao hub") é desempilhar até ele, não abrir um nível novo.
                const target = next.def?.redirect || next.id;
                const again = nextCallers.indexOf(target);
                const finalCallers = again >= 0 ? nextCallers.slice(0, again) : nextCallers;
                // A situação do primeiro menu do 🧭 segue pelas paradas (Fase D, seção 5).
                if (this.id === this.idDaSituacao) {
                    const situacao = variables.situacao_central;
                    if (typeof situacao === 'string' && situacao && !situacao.trim().startsWith('🔙')) variables._rota_situacao = situacao;
                }
                this.setCallers(nextVariables, finalCallers, variables);
                // Um protocolo aberto a partir do 🧭 (o router que o abre está numa pilha
                // que começa no 🧭) deixa a linha da rota. Voltar e outro menu não contam.
                if (!backToCaller && !genericBack && !backwardOption && this.isRouterProtocol(this.id)
                    && !this.isRouterProtocol(next.id) && finalCallers.includes(this.idDaSituacao ?? '')) {
                    this.registerRoute(variables._rota_situacao, next);
                }
                // A fila segue com a cadeia até ela acabar.
                if (pending.length) nextVariables._then = pending;
                else delete nextVariables._then;
                new Notice(
                    isSelfChain
                        ? `🔄 Nova rodada: ${next.name}`
                        : `🔗 Iniciando próximo protocolo: ${next.name}`,
                    3000
                );
                setTimeout(() => next.run(nextVariables), 1000); // Small delay for UX
            } else {
                new Notice(`⚠️ Protocolo seguinte não encontrado: ${nextProtocolId}`);
            }
        }

    }

    /**
     * O que faz: monta um passo como o modal o mostra, sem abrir nada: o contexto da nota
     * escolhida (`contextFrom`), as opções por condição e por marcador (`optionsWhen`,
     * `optionValues`), a contagem (`countFrom`), a Herança (`herancaDoTrimestre`), a escolha
     * prévia da árvore do agora e, por tipo, a resposta de abertura (texto, texto longo e
     * seleções), as opções na ordem dos pesos (`rankOptions`), as notas do critério
     * (`multiselect_note`) e o passo do seletor de notas com o filtro e a resposta padrão da
     * semana (`suggest_note`).
     * Por quê: o P11 da Missão (arquitetura de 27/10, §5.3, 1): o laço do `run()` e o
     * formulário da gaveta montam o passo pela mesma função; antes a montagem morava no meio do
     * laço, misturada com a abertura de cada modal.
     * Com `_valoresIniciais` (o "Abrir o protocolo completo" do Novo, §5.6), cada passo abre
     * com o valor do formulário: na abertura do texto e das seleções, na opção que abre a lista
     * (`padrao`) e na nota padrão do seletor de notas.
     * Entra → sai: o passo do JSON, as variáveis da rodada (só lidas) e se a tarefa do agora já
     * veio escolhida → o passo montado (`ui`) e, conforme o tipo, `abertura`, `ordenadas`,
     * `padrao`, `opcoes` ou `passoDaNota`.
     * Erro e ataque: lê o cofre (a contagem, as notas do critério, a nota de `defaultFrom`) e
     * os serviços do plugin (os pesos, o par da semana), cada um com a falha que já tinha
     * (a contagem que falha deixa o passo como está; o serviço ausente, a ordem do JSON); tipo
     * desconhecido sai só com o `ui`, e o laço avisa.
     * Prova: tests/engine/protocolGolden.test.ts (as perguntas de 14 rodadas reais, iguais
     * antes e depois da extração) e tests/engine/protocolForm.test.ts.
     */
    async montarPasso(step: any, variables: any, opts: { preChosenNow?: boolean } = {}): Promise<PassoMontado> {
        const previousValue = variables[step.id];
        // `contextFrom` traz para dentro da pergunta um campo da nota já escolhida
        // (ex.: o timeEstimate que a semana deu à tarefa). É contexto para decidir,
        // não decisão: quem responde continua sendo o operador.
        let builtStep = await this.applyStepCount(this.applyStepOptions(this.applyStepContext(step, variables), variables), variables);
        // A opção que leva a um protocolo que o cofre não tem some (D1 do mapa da v0); sem o gerente, ficam todas.
        const gerente = this.plugin?.manager;
        if ((step.type === 'suggest' || step.type === 'select') && Array.isArray(builtStep?.options) && typeof gerente?.get === 'function') {
            builtStep = { ...builtStep, options: opcoesComDestino(builtStep.options, stepTargets(this.def, step.id), id => !!gerente.get(id)) };
        }
        // `herancaDoTrimestre`: o passo mostra a revisão e os projetos do trimestre
        // anterior antes da primeira pergunta do 🧭 (proposta de 27/10, 4.2, passo 0).
        if (step.herancaDoTrimestre) builtStep = this.withQuarterInheritance(builtStep, variables);
        const ui = opts.preChosenNow
            ? { ...builtStep, nowPreChosen: { value: variables[step.id], display: variables[`${step.id}_display`], path: variables[`${step.id}_path`] } }
            : builtStep;

        // As sugestões declaradas (`defaultFrom` com `sugestao`), resolvidas com o que o cofre diz agora.
        const sugestaoDe = declaraSugestao(step) ? await this.resolvedorDeSugestao(step, variables) : null;
        if (step.type === 'text' || step.type === 'textarea') {
            return { ui, abertura: this.openingAnswer(step, variables, previousValue, null, sugestaoDe?.(null)) };
        }
        const inicial = valoresIniciaisDe(variables)[step.id];
        if (step.type === 'suggest' || step.type === 'select') {
            let padrao = opcaoDoFormulario(ui.options, inicial);
            let notaDoPadrao: string | undefined;
            // Sem o valor do formulário, a opção do `defaultFrom` abre a lista (a resposta anterior,
            // do Voltar, não: o seletor de opções nunca reabriu com ela).
            if (!padrao && defaultSourcesOf(step).length) {
                const options = Array.isArray(ui.options) ? ui.options.map((o: any) => String(o)) : null;
                const abertura = this.openingAnswer(step, variables, undefined, options, sugestaoDe?.(options));
                if (abertura.fonte === 'defaultFrom' && typeof abertura.value === 'string') {
                    padrao = abertura.value;
                    notaDoPadrao = notaDaOpcaoPadrao(abertura.origem);
                }
            }
            const ordenadas = step.type === 'suggest' ? await this.rankedOptionsFor(step, ui.options) : undefined;
            return { ui, ...(ordenadas !== undefined ? { ordenadas } : {}), ...(padrao ? { padrao } : {}), ...(notaDoPadrao ? { notaDoPadrao } : {}) };
        }
        if (step.type === 'suggest_note') {
            // O filtro pode ler uma resposta anterior (`{{planejamento}}`); o 🌳 traz o
            // par de valores sugerido da semana como resposta padrão (`sugestaoDaSemana`).
            // A nota que veio do formulário (`_valoresIniciais`) vale no lugar do par da semana;
            // sem os dois, a do `defaultFrom` (a sugestão declarada), com o porquê.
            const daNota = stepWithRunCriteria(ui, variables);
            const nome = noteNameOf(inicial);
            if (nome) return { ui, passoDaNota: withFormNoteDefault(daNota, nome) };
            const daSemana = await this.withWeekValueDefault(daNota, variables);
            if (daSemana !== daNota || !defaultSourcesOf(step).length) return { ui, passoDaNota: daSemana };
            const abertura = this.openingAnswer(step, variables, undefined, null, sugestaoDe?.(null));
            const padrao = abertura.fonte === 'defaultFrom' ? noteNameOf(abertura.value) : '';
            return { ui, passoDaNota: padrao ? withNoteDefault(daNota, padrao, abertura.origem) : daNota };
        }
        if (step.type === 'multiselect' && !step.fromDiary) {
            return { ui, abertura: this.openingAnswer(step, variables, previousValue, ui.options, sugestaoDe?.(ui.options)) };
        }
        if (step.type === 'multiselect_note') {
            const opcoes = await this.getFilesByCriteria(step.criteria, variables);
            return { ui, opcoes, abertura: this.openingAnswer(step, variables, previousValue, opcoes, sugestaoDe?.(opcoes)) };
        }
        return { ui };
    }

    /**
     * O que faz: o resultado que o modal daria para a resposta que veio pré-dada (o formulário):
     * no seletor de notas, a nota pelo caminho (`{id}_path`) ou, sem ele, pelo nome, com o nome e
     * o `[[link]]` que o seletor devolve; sem nota, o texto como texto livre; nos outros tipos, o
     * valor como veio (aparado, no passo `trim: true`).
     * Por quê: §5.2, limite 2: a resposta pré-dada passa por `gravarResposta` com o mesmo
     * resultado que o modal daria, e ganha os mesmos derivados.
     * Entra → sai: o passo e as variáveis (só lidas) → o resultado (`status: 'submit'`).
     * Erro e ataque: o caminho que não é nota do cofre cai no nome; o nome que nenhuma nota tem
     * vira texto livre (sem `_path`).
     * Prova: tests/engine/protocolForm.test.ts ("os derivados da resposta pré-dada").
     */
    resultadoPreDado(step: any, variables: any): any {
        const value = variables[step.id];
        // `trim: true`: o texto vai sem o espaço das pontas, como no modal.
        if (step.type !== 'suggest_note' || typeof value !== 'string' || value === '') return trimmedAnswer(step, { status: 'submit', value });
        const path = variables[`${step.id}_path`];
        let file: any = typeof path === 'string' && path ? this.app.vault?.getAbstractFileByPath?.(path) : null;
        if (!(file instanceof TFile)) file = this.app.metadataCache?.getFirstLinkpathDest?.(noteNameOf(value), '') ?? null;
        if (!(file instanceof TFile)) return { status: 'submit', value, display: value };
        const name = noteLinkName(file);
        return { status: 'submit', value: name, display: `[[${name}]]`, item: file, ...(variables[`${step.id}_created`] === true ? { created: true } : {}) };
    }

    /**
     * O que faz: grava nas variáveis da rodada a resposta de um passo e os derivados dela,
     * como o laço sempre gravou: `{id}`; no seletor de notas, `{id}_created` (a nota nasceu no
     * passo) e o que a árvore do agora devolve (`{id}_lugar`…); `{id}_value` (o valor da opção,
     * `optionValues`); `{id}_num` (o número da opção escrita para gente); `{id}_display`; e, com
     * nota escolhida, `{id}_path`, `{id}_folder`, as pastas de contexto (`{id}_area`…) e os
     * campos escalares dela (`{id}_prop_<campo>`).
     * Por quê: o P11 da Missão (arquitetura de 27/10, §5.3, 1, e §5.2, limite 2): a resposta
     * dada no modal e a dada pelo formulário ganham os mesmos derivados pela mesma função.
     * Entra → sai: o passo do JSON, o passo montado (`ui`, de onde vêm as `optionValues` com os
     * marcadores resolvidos), o resultado do modal e as variáveis da rodada, que esta função
     * altera no lugar (são o estado da rodada, do laço) → nada.
     * Erro e ataque: a nota escolhida sem cache não dá `_prop_*`; campo do frontmatter que é
     * objeto ou lista fica de fora (um `_prop_` só guarda escalar); a opção fora da lista dá
     * `_value` vazio.
     * Prova: tests/engine/protocolGolden.test.ts (as variáveis finais de 14 rodadas, com a
     * ordem delas) e tests/engine/protocolForm.test.ts ("os derivados da resposta pré-dada").
     */
    gravarResposta(step: any, uiStep: any, result: any, variables: any): void {
        variables[step.id] = result.value;
        // A nota escolhida foi criada agora (allowCreate)? Uma escolha nova no Voltar
        // limpa a marca, para o `ifCreated` não valer para uma tarefa que já existia.
        if (step.type === 'suggest_note') {
            if (result.created) variables[`${step.id}_created`] = true;
            else delete variables[`${step.id}_created`];
            // A árvore do agora devolve o lugar, o tempo e o porquê da escolha
            // (`{id}_lugar`, `{id}_tempo`, `{id}_tempo_min`, `{id}_motivo`, `{id}_pontos`).
            if (result.vars && typeof result.vars === 'object') {
                for (const [key, value] of Object.entries(result.vars)) variables[`${step.id}_${key}`] = value;
            }
        }
        // `optionValues`: a opção escrita para gente ("📅 Hoje", "seg 19/10") grava o
        // valor de máquina da mesma posição (a data, os minutos) em `{id}_value`.
        if (Array.isArray(uiStep.optionValues)) {
            variables[`${step.id}_value`] = this.optionValueFor(uiStep, result.value);
        }
        // Opção escrita para gente ("50 minutos") também vira número em `{id}_num`,
        // para alimentar um campo numérico (ex.: timeEstimate) sem manter uma segunda
        // lista de opções só com os minutos crus.
        if ((step.type === 'suggest' || step.type === 'select') && typeof result.value === 'string') {
            const numeric = result.value.match(/-?\d+(?:[.,]\d+)?/);
            if (numeric) variables[`${step.id}_num`] = Number(numeric[0].replace(',', '.'));
        }
        if (result.value === "" && typeof step.skipDisplay === 'string') {
            // O passo pulado diz o que aconteceu nele (o 🌙 sem compromisso grava
            // "sem compromisso agora"), não o texto genérico do seletor de nota.
            variables[`${step.id}_display`] = step.skipDisplay;
        } else if (result.display !== undefined) {
            variables[`${step.id}_display`] = result.display;
        } else if (result.value === "") {
            variables[`${step.id}_display`] = "Sem conexão contextual";
        } else {
            variables[`${step.id}_display`] = result.value;
        }
        if (result.item?.path) {
            const parentPath = result.item.parent?.path || result.item.path.split("/").slice(0, -1).join("/");
            variables[`${step.id}_path`] = result.item.path;
            variables[`${step.id}_folder`] = parentPath;

            const derivedFolders = this.deriveContextFoldersFromPath(result.item.path);
            for (const [suffix, folderPath] of Object.entries(derivedFolders)) {
                variables[`${step.id}_${suffix}`] = folderPath;
            }

            // Campos do frontmatter da nota escolhida viram `{id}_prop_<campo>`: é o que
            // permite um passo seguinte LER o que já foi decidido nela (estimativa,
            // prioridade, projeto) em vez de perguntar tudo de novo às cegas.
            const selectedCache = this.app.metadataCache.getFileCache(result.item as TFile);
            for (const [key, value] of Object.entries(selectedCache?.frontmatter || {})) {
                if (value === null || value === undefined || typeof value === 'object') continue;
                variables[`${step.id}_prop_${key}`] = value;
            }
        }
    }

    /**
     * O que faz: a entrada da fila (`queue`) para o protocolo `id`: as variáveis que ele
     * receberia se fosse o próximo agora (`carry` ou `getNextProtocolVariables`), com a
     * semana-alvo desta rodada fixada (`_target_week_pin`): quando ele rodar, a nota
     * ativa será outra (a do protocolo do meio), e a semana não pode mudar por isso.
     */
    queuedEntry(id: string, variables: any, runContextDate: string): { id: string; vars: any } {
        const carry = this.def.carry?.[id];
        const vars = carry ? this.carryVariables(carry, variables, runContextDate) : this.getNextProtocolVariables(id, variables, runContextDate);
        delete vars._then;
        if (ehSemana(String(variables?._target_week ?? ''))) vars._target_week_pin = variables._target_week;
        return { id, vars };
    }

    /**
     * Tira do modelo as linhas `**Rótulo:** {{passo}}` que ficariam sem conteúdo com
     * as respostas desta rodada, e a seção cujo corpo é só de respostas vazias
     * (`dropEmptyTokenSections`). Só linha com token: o rótulo fixo do modelo (campo
     * para preencher à mão) não é resposta e fica.
     */
    dropUnansweredLabelLines(template: string, variables: any): string {
        const empty = (name: string) => String(variables?.[name] ?? '').trim() === '';
        return dropEmptyTokenSections(String(template ?? ''), empty)
            .split('\n')
            .filter(line => {
                if (!/{{[^}]+}}/.test(line)) return true;
                const rendered = this.processTemplate(line, variables);
                if (rendered.trim() === '') return true;
                if (this.isOnlyMarkupOfUnasked(line, rendered, variables)) return false;
                return dropEmptyLabelLines(rendered) !== '';
            })
            .join('\n');
    }

    /**
     * A linha do modelo só tinha respostas de passos não perguntados nesta rodada e
     * sobrou só marcação: `- [ ] ` (um checkbox vazio que ficaria aberto para sempre),
     * `****`, `| |`. Ex.: a ação comprometida da Defusão na rodada que não soltou.
     * Linha com qualquer resposta preenchida, ou com letra ou número, fica.
     */
    isOnlyMarkupOfUnasked(line: string, rendered: string, variables: any): boolean {
        const names = [...String(line).matchAll(/{{([a-zA-Z0-9_]+)}}/g)].map(m => m[1]);
        if (names.length === 0) return false;
        const allEmpty = names.every(name => String(variables?.[name] ?? '').trim() === '');
        return allEmpty && !/[\p{L}\p{N}]/u.test(rendered);
    }

    /**
     * `continueFromDay: { when, doneField, skipSteps }` (raiz do protocolo): quando o
     * modo `when` casa e a Day da data de contexto já tem `doneField` preenchido (o 🌙
     * já fechou o dia), devolve os passos de `skipSteps`, que esta rodada não pergunta
     * de novo. Sem a Day ou com o campo vazio, devolve `null`: começa do primeiro passo.
     */
    continuationOf(variables: any): Set<string> | null {
        if (!this.def?.continueFromDay) return null;
        return passosContinuados(this.def.continueFromDay, variables, this.frontmatterDaDayDaRodada());
    }

    /**
     * O que faz: as semanas da rodada: a semana-alvo (`_target_week`, a de `{{targetweek}}`, com
     * o pino e o deslocamento das variáveis) e a da data de contexto (`_context_week`).
     * Por quê: a mesma conta no `run()` e no contexto do formulário (`contextoDaRodada`).
     */
    semanasDaRodada(variables: any): Record<string, string> {
        return {
            _target_week: this.getTargetWeekDate(variables).format('GGGG-[W]WW'),
            _context_week: this.getContextDate().format('GGGG-[W]WW'),
        };
    }

    /**
     * O que faz: o contexto com que o formulário mostra os passos: as variáveis de sistema que o
     * `run()` calcularia para estas variáveis (as datas explícitas do formulário) e para a nota
     * ativa (`_active_*`, `_target_week`, `_context_week`), o frontmatter da Day da data de
     * contexto (o que o `continueFromDay` lê) e, se o protocolo tem o "📖 Pelo diário", as
     * opções dele (`opcoesDoDiario`).
     * Por quê: P12a da Missão (follow-ups 2 e 4 do P11): as condições e a continuação do registro
     * de hoje valem igual no formulário e na rodada. Só lê; a data de contexto da rodada que
     * estiver no meio não muda (é restaurada no fim).
     * Entra → sai: as variáveis iniciais (com `_context_date`, os pinos e os deslocamentos) e a
     * nota ativa (sem ela, a do espaço de trabalho, como no `run()`) → o contexto.
     * Prova: tests/engine/protocolForm.test.ts ("o contexto da rodada").
     */
    async contextoDaRodada(iniciais: Record<string, unknown> = {}, opts: { ativa?: TFile | null } = {}): Promise<ContextoDaRodada> {
        const antes = this.contextDateOverride;
        this.contextDateOverride = this.parseContextDateOverride(iniciais?._context_date);
        let variaveis: Record<string, unknown>;
        let frontmatterDoDia: Record<string, unknown> | null;
        let dia: string;
        try {
            const ativa = opts.ativa !== undefined ? opts.ativa : this.app.workspace.getActiveFile();
            variaveis = { ...variaveisDaNotaAtiva(ativa) };
            Object.assign(variaveis, this.semanasDaRodada({ ...iniciais, ...variaveis }));
            frontmatterDoDia = this.frontmatterDaDayDaRodada();
            dia = this.getContextDate().format('YYYY-MM-DD');
        } finally {
            // Restaurada antes de qualquer espera: uma rodada no meio não vê esta data.
            this.contextDateOverride = antes;
        }
        const temDiario = (this.def?.steps || []).some((step: any) => step?.type === 'multiselect' && step.fromDiary);
        const diario = temDiario ? await this.opcoesDoDiario(dia) : null;
        return { variaveis, frontmatterDoDia, diario: diario ? diario.map(option => option.label) : null };
    }

    /** O frontmatter da Day da data de contexto (o que o `continueFromDay` lê), ou `null` sem ela. */
    frontmatterDaDayDaRodada(): Record<string, unknown> | null {
        try {
            const day = this.getDailyNoteFile(this.getContextDate().format('YYYY-MM-DD'));
            if (!day) return null;
            return this.app.metadataCache?.getFileCache?.(day)?.frontmatter ?? null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Índice do passo para onde a opção `answer` do passo volta (`returnTo`), ou
     * `null`. Só vale passo anterior ao atual: para a frente seria pular, não refazer.
     */
    returnIndexOf(step: any, answer: any, steps: any[], currentIndex: number): number | null {
        const target = step?.returnTo && typeof answer === 'string' ? step.returnTo[answer] : undefined;
        if (typeof target !== 'string' || !target) return null;
        const index = (steps || []).findIndex((s: any) => s?.id === target);
        return index >= 0 && index < currentIndex ? index : null;
    }

    /** Algum passo de texto foi escrito NESTA rodada (resposta não vazia). */
    hasWrittenAnswer(steps: any[], variables: any, answeredHere: Set<string>): boolean {
        return (steps || []).some((s: any) => (s?.type === 'text' || s?.type === 'textarea')
            && answeredHere.has(s.id)
            && String(variables?.[s.id] ?? '').trim() !== '');
    }

    /** O router para onde o mapa do JSON manda a opção `answer` do passo `stepId` (só router). */
    backRouterOf(stepId: string, answer: string): string | null {
        const raw = this.def.dynamicNextProtocol;
        const routers = Array.isArray(raw) ? raw : raw ? [raw] : [];
        for (const router of routers) {
            if (router?.stepId !== stepId) continue;
            const target = router.map?.[answer];
            return typeof target === 'string' && this.isRouterProtocol(target) ? target : null;
        }
        return null;
    }

    /**
     * Monta o contexto da próxima execução sem deixar uma recursão herdar respostas
     * que fariam as etapas serem ignoradas. É especialmente importante para
     * protocolos com a opção "fazer outra rodada".
     *
     * A nova rodada leva só a data de contexto da anterior (`_context_date`), para
     * continuar no mesmo dia e na mesma semana. Outro protocolo não a herda: ele lê o
     * contexto da nota que ficou aberta (ex.: a semana que o planejamento acabou de abrir).
     */
    getNextProtocolVariables(nextProtocolId: string, variables: any, contextDate?: string) {
        const chain = this.chainOf(variables);
        if (nextProtocolId === this.id) {
            const next: any = { _previousNote: variables._currentNote };
            if (contextDate) next._context_date = contextDate;
            if (chain.length) next._chain = chain;
            // Router que reabre o próprio menu (o 🔙 Voltar de um submenu): o contexto
            // já escolhido segue, como no Voltar vindo de um router filho. Sem ele, o
            // passo `contexto` era perguntado de novo a cada volta.
            if (this.isRouterProtocol(this.id)) Object.assign(next, this.contextOnly(variables, [...chain, this.id]));
            // A semana-alvo também segue: a 1ª SMART saiu da Week aberta (`targetweek`),
            // e na 2ª a nota ativa já é a SMART criada.
            if (ehSemana(String(variables?._target_week ?? ''))) next._target_week_pin = variables._target_week;
            return next;
        }
        // Router (ou alias de router) no destino, ou protocolo por onde a cadeia já
        // passou: leva só o contexto. Com as respostas junto, o menu chegava já
        // respondido e o destino repetia a rodada anterior sem pergunta nenhuma —
        // crise → 🔙 Voltar → 🆘 → crise…, medo → defusão → 🦁 → medo → defusão…,
        // regravando a nota e criando uma tarefa a cada volta. As `redirectVariables`
        // de um alias continuam valendo: são aplicadas por cima, no run() do alias.
        if (this.isRouterProtocol(nextProtocolId) || this.alreadyInChain(nextProtocolId, chain)) {
            const next: any = { _previousNote: variables._currentNote, ...this.contextOnly(variables, [...chain, this.id, nextProtocolId]) };
            if (variables?._context_date) next._context_date = variables._context_date;
            if (chain.length) next._chain = chain;
            return next;
        }
        // O deslocamento de semana/trimestre e a semana fixada valem para o protocolo que
        // os recebeu: o 🌳 "Planejar a próxima" abre a semana nova, e a 🎯 SMART encadeada
        // somaria a semana de novo a partir dela.
        // As variáveis do formulário (`_respondidos`, `_valoresIniciais`) valem só para esta rodada.
        const { _context_date, _semana_offset, _trimestre_offset, _target_week_pin, _target_quarter_pin, [RESPONDIDOS]: _respondidos, [VALORES_INICIAIS]: _valoresIniciais, ...rest } = variables || {};
        // Router que encadeia para a frente não leva as próprias respostas: o passo
        // `intencao` do 💡 ("📝 Outro registro") pulava a pergunta `intencao` do roteiro
        // de vídeo, e o `pilar` do router ACT a do exercício livre. O contexto segue.
        if (this.id.startsWith('router_')) {
            for (const step of this.def.steps || []) {
                const id = step?.id;
                if (!id || id === 'contexto') continue;
                for (const key of Object.keys(rest)) {
                    if (key === id || key.startsWith(`${id}_`)) delete rest[key];
                }
            }
        } else {
            // Protocolo comum que abre outro: a resposta de um passo com o mesmo id no
            // destino pulava a pergunta dele (a técnica da Defusão chegava com a da
            // Aceitação; o "O que fazer com esse loop?" do mental_cleanup, com a decisão do
            // PPP). Saem as respostas deste protocolo e dos anteriores da cadeia cujo id
            // também é passo do destino; o contexto segue. O que deve seguir de propósito
            // vai declarado em `carry`.
            const destination = this.stepIdsOf(nextProtocolId);
            const sources = new Set<string>();
            for (const id of [...chain, this.id]) for (const stepId of this.stepIdsOf(id)) sources.add(stepId);
            const allSteps = new Set<string>([...sources, ...destination]);
            for (const id of destination) {
                if (id === 'contexto' || !sources.has(id)) continue;
                for (const key of Object.keys(rest)) {
                    // `{id}_display`, `_value`, `_path`, `_prop_*`… são da mesma resposta;
                    // `valor_hyadhuad` (outro passo) não é derivado de `valor`.
                    if (key === id || (key.startsWith(`${id}_`) && !allSteps.has(key))) delete rest[key];
                }
            }
        }
        return { ...rest, _previousNote: variables._currentNote };
    }

    /**
     * Só o contexto escolhido: `contexto` e o que deriva dele (`contexto_display`,
     * `_path`, `_folder`, `_prop_*`, `_area`…). Fica de fora a resposta de um passo
     * cujo id também começa com `contexto_` nos protocolos `ids` (o `contexto_trabalho`
     * do ⚙️ Operacional): levada ao router de cima e trazida de volta, ela chegava já
     * respondida — o Voltar mandava de volta sem pergunta, e o tipo de trabalho não
     * podia ser trocado.
     */
    contextOnly(variables: any, ids: string[]): Record<string, any> {
        const stepIds = new Set<string>();
        for (const id of ids) for (const stepId of this.stepIdsOf(id)) if (stepId !== 'contexto') stepIds.add(stepId);
        const answerOfStep = (key: string) => [...stepIds].some(id => key === id || key.startsWith(`${id}_`));
        const out: Record<string, any> = {};
        for (const [key, value] of Object.entries(variables || {})) {
            if ((key === 'contexto' || key.startsWith('contexto_')) && !answerOfStep(key)) out[key] = value;
        }
        return out;
    }

    /** Ids dos passos do protocolo `id` (o destino, se for alias). */
    stepIdsOf(id: string): string[] {
        let def = id === this.id ? this.def : this.plugin?.manager?.get?.(id)?.def;
        if (typeof def?.redirect === 'string') def = this.plugin?.manager?.get?.(def.redirect)?.def;
        return (def?.steps || []).map((s: any) => s?.id).filter((s: any) => typeof s === 'string' && s);
    }

    /**
     * O que faz: a nota escolhida no passo `passo` (o `{passo}_path`) pertence ao projeto,
     * subindo pelos `projects` dela (a peça 📤 → a SMART → o projeto)?
     * Por quê: é a pergunta de `registroQuando` com `notaDoPasso` e `projeto`. A nota vem
     * pelo caminho (o seletor grava `{passo}_path`) ou só pelo nome (o aviso de conclusão
     * da peça 📤 abre o protocolo com `peca_tarefa: <nome>`).
     * Sem nota escolhida (o passo pulado) → `false`.
     */
    selectedNoteBelongsTo(variables: any, passo: string, projeto: string): boolean {
        const path = typeof variables?.[`${passo}_path`] === 'string' ? variables[`${passo}_path`] : '';
        const inicio = noteNameOf(path || variables?.[passo]);
        if (!inicio) return false;
        const start = path ? this.app.vault?.getAbstractFileByPath?.(path) : null;
        const paisDe = (nome: string): string[] => {
            const file = nome === inicio && start instanceof TFile
                ? start
                : this.app.metadataCache?.getFirstLinkpathDest?.(nome, path);
            const projects = file ? this.app.metadataCache?.getFileCache?.(file)?.frontmatter?.projects : undefined;
            return (Array.isArray(projects) ? projects : projects ? [projects] : []).map(noteNameOf).filter(Boolean);
        };
        return pertenceAoProjeto(inicio, projeto, paisDe);
    }

    /**
     * Nota pré-escolhida (menu DFM do canvas, `carry`, botão) chega com `{id}_path`, mas
     * sem os `{id}_prop_*` que o seletor gravaria: o passo seguinte que lê a nota
     * (`contextFrom`) dizia "ainda não tem estimativa" de uma tarefa que tinha. Aqui os
     * campos escalares do frontmatter dela entram, sem cobrir o que já veio declarado.
     */
    hydrateSelectedNoteProps(variables: any) {
        for (const step of this.def.steps || []) {
            if (step?.type !== 'suggest_note' || !step.id) continue;
            const path = variables[`${step.id}_path`];
            if (typeof path !== 'string' || !path) continue;
            const file = this.app.vault?.getAbstractFileByPath?.(path);
            if (!(file instanceof TFile)) continue;
            const fm = this.app.metadataCache?.getFileCache?.(file)?.frontmatter || {};
            for (const [key, value] of Object.entries(fm)) {
                if (value === null || value === undefined || typeof value === 'object') continue;
                const name = `${step.id}_prop_${key}`;
                if (variables[name] === undefined) variables[name] = value;
            }
        }
    }

    /**
     * O router que abriu ESTA rodada (topo de `_callers`), ou `null`. Não é o último
     * router de toda a `_chain`: um router reaberto pelo Voltar de um filho mandaria
     * de volta a esse filho.
     */
    callerRouterOf(variables: any): string | null {
        const callers = this.callersOf(variables);
        const top = callers[callers.length - 1];
        return top && top !== this.id && this.isRouterProtocol(top) ? top : null;
    }

    /** Pilha dos routers que abriram cada rodada até aqui (`_callers`), do mais antigo ao atual. */
    callersOf(variables: any): string[] {
        const raw = variables?._callers;
        return Array.isArray(raw) ? raw.filter((id: any) => typeof id === 'string' && id) : [];
    }

    /**
     * Grava a pilha `_callers` nas variáveis da próxima rodada (sem a chave, se vazia).
     * Com `from`, a situação do primeiro menu do 🧭 (`_rota_situacao`) segue junto
     * enquanto o 🧭 estiver na pilha; fora dela, sai (Fase D, seção 5).
     */
    setCallers(next: any, callers: string[], from?: any) {
        if (callers.length) next._callers = callers;
        else delete next._callers;
        const situacao = from?._rota_situacao;
        if (typeof situacao === 'string' && situacao && callers.includes(this.idDaSituacao ?? '')) next._rota_situacao = situacao;
        else delete next._rota_situacao;
    }

    /**
     * O que faz: a linha da rota (a data, a hora, a situação do primeiro menu e o
     * protocolo) no registro do mês (`plugin.rotas`, `routeLog.ts`). Sem situação ou sem
     * o serviço, nada; a falha vai ao console e não para o protocolo que abre.
     */
    registerRoute(situacao: unknown, next: any) {
        const rotas: any = this.plugin?.rotas;
        if (!rotas?.registrar || typeof situacao !== 'string' || !situacao || !next?.id) return;
        try {
            const now = window.moment();
            Promise.resolve(rotas.registrar({
                data: now.format('YYYY-MM-DD'),
                hora: now.format('HH:mm'),
                situacao,
                protocolo: next.id,
                nome: next.name || next.id,
                via: this.id,
            })).catch((e: any) => console.error('DFM 🧭 rotas: registro não gravado:', e));
        } catch (e) {
            console.error('DFM 🧭 rotas: registro não gravado:', e);
        }
    }

    /**
     * O que faz: as opções de um passo `suggest` com `rankOptions: "<domínio>"` na ordem
     * dos pesos do domínio, com a linha do porquê (`protocolRank.ts`). Só as opções que
     * levam a protocolo trocam de lugar entre si; o resto fica onde está.
     * Sem a chave, sem o núcleo, sem modelo ou sem destino: `null` (a ordem do JSON).
     * Problema no modelo ou nos pontos vira aviso, como no `rankWith`.
     */
    async rankedOptionsFor(step: any, options: any[]): Promise<RankedOptions | null> {
        const dominio = typeof step?.rankOptions === 'string' ? step.rankOptions : '';
        const nucleo: any = this.plugin?.nucleo;
        if (!dominio || !nucleo?.loadDomain || !nucleo?.camposDosProtocolos || !Array.isArray(options)) return null;
        const targets = rankableTargets(options, stepTargets(this.def, step.id), this.id);
        const ids = [...new Set(Object.values(targets))];
        if (!ids.length) return null;
        try {
            const load = await nucleo.loadDomain(dominio);
            if (Array.isArray(load?.problemas) && load.problemas.length) {
                const tail = load.modelo ? 'o que falta vale 0' : 'as opções seguem na ordem de sempre';
                new Notice(`⚠️ Ordem por pesos (${dominio}): ${load.problemas.slice(0, 3).join('; ')} — ${tail}.`, 8000);
            }
            if (!load?.modelo) return null;
            const defOf = (id: string) => this.plugin?.manager?.get?.(id)?.def ?? null;
            const hoje = window.moment().format('YYYY-MM-DD');
            const campos = await nucleo.camposDosProtocolos(ids, defOf, hoje);
            // O nível da reputação de cada destino, citado na linha do porquê; o grau dele desempata a ordem (02/11).
            let niveis: Record<string, string> = {};
            let graus: Record<string, number> = {};
            try { if (nucleo.niveisDaReputacao) niveis = (await nucleo.niveisDaReputacao(ids, hoje)) || {}; } catch (e) { niveis = {}; }
            try { if (nucleo.grausDaReputacao) graus = (await nucleo.grausDaReputacao(ids, hoje)) || {}; } catch (e) { graus = {}; }
            return rankOptions(options, targets, (id: string) => campos?.[id] || {}, load.modelo.escolher, load.tabela, (id: string) => niveis[id], (id: string) => graus[id]);
        } catch (e) {
            console.error('DFM rankOptions: a ordem por pesos não abriu; as opções seguem na ordem de sempre.', e);
            return null;
        }
    }

    /** Ids dos protocolos que já rodaram nesta cadeia (`_chain`), em ordem. */
    chainOf(variables: any): string[] {
        const raw = variables?._chain;
        return Array.isArray(raw) ? raw.filter((id: any) => typeof id === 'string' && id) : [];
    }

    /** O protocolo `id` (ou o destino do alias `id`) já rodou nesta cadeia. */
    alreadyInChain(id: string, chain: string[]): boolean {
        if (!id || chain.length === 0) return false;
        if (chain.includes(id)) return true;
        const redirect = this.plugin?.manager?.get?.(id)?.def?.redirect;
        return typeof redirect === 'string' && chain.includes(redirect);
    }

    /** O protocolo `id` é um router — ou um alias (`redirect`) que leva a um router. */
    isRouterProtocol(id: string): boolean {
        if (!id) return false;
        if (id.startsWith('router_')) return true;
        const target = this.plugin?.manager?.get?.(id);
        const redirect = target?.def?.redirect;
        return typeof redirect === 'string' && redirect.startsWith('router_');
    }

    /**
     * `carry` (por protocolo seguinte): o encadeamento leva SÓ as respostas
     * declaradas, já resolvidas (`{"tarefa_smart": "{{_currentNote}}"}`), mais a
     * data de contexto desta rodada. É o que permite "decompor esta SMART agora":
     * o protocolo seguinte já começa com a SMART escolhida, e nenhuma outra
     * resposta (o `titulo` da SMART, por exemplo) pula um passo dele por engano.
     */
    carryVariables(carry: Record<string, any>, variables: any, contextDate?: string) {
        const next: any = {};
        // Tokens de data no `carry` seguem o dia desta rodada, não a nota recém-aberta.
        const savedOverride = this.contextDateOverride;
        if (contextDate) this.contextDateOverride = contextDate;
        try {
            for (const [key, value] of Object.entries(carry || {})) {
                const rendered = typeof value === 'string' ? this.processTemplate(value, variables) : value;
                if (rendered === '' || rendered === null || rendered === undefined) continue;
                next[key] = rendered;
            }
        } finally {
            this.contextDateOverride = savedOverride;
        }
        if (contextDate) next._context_date = contextDate;
        const chain = this.chainOf(variables);
        if (chain.length) next._chain = chain;
        return next;
    }

    /** `_context_date` válido (`AAAA-MM-DD`) ou nada. */
    parseContextDateOverride(raw: any): string | null {
        return typeof raw === "string" && DIA.test(raw) ? raw : null;
    }

    /**
     * Loop Closing genérico: transforma a resposta de um step (ex: acao_imediata)
     * em uma tarefa real no TaskNotes.
     * Config (def.createTask — objeto ou array):
     * {
     *   "titleVar": "acao_imediata",          // variável que vira o título (obrigatório; `stepId` é aceito como sinônimo)
     *   "condition": { "variable": "vai_fazer", "value": ["⚔️ Sim"] },    // opcional
     *   "prefix": "🦁 ",                      // opcional
     *   "priority": "high",                   // opcional (default: normal)
     *   "impacto": 8,                         // opcional (1-10)
     *   "impactoVar": "impacto_da_acao",     // opcional, le um step
     *   "due": "today",                       // opcional: "today" | "tomorrow"
     *   "scheduled": "today",                 // opcional: "today" | "tomorrow"
     *   "tag": "coragem",                     // opcional (default: protocolo)
     *   "project": "{{titulo}}",              // opcional: nome do projeto em `projects` (default: `contexto`)
     *   "lugar": "{{cidade}}",                // opcional: a nota da cidade ou do país (nome ou link) em `lugar: "[[…]]"`
     *   "peca": "soltar",                     // opcional: peça do fluxo de criação (ignicao | soltar)
     *   "blockedByCreated": true,             // opcional: a nota criada pelo protocolo bloqueia esta tarefa
     *   "timeEstimateVar": "estimativa_value", // opcional: minutos lidos de uma variável
     *   "week": "{{scheduled:GGGG-[W]WW}}",   // opcional: semana (tokens; `scheduled:` = a do dia da tarefa)
     *   "onlyWithDate": true,                 // opcional: sem data válida em `scheduledVar`, a tarefa não nasce
     *   "withoutDateNotice": "…",             // opcional: o aviso nesse caso
     *   "weekSemDia": "{{date:GGGG-[W]WW}}",  // opcional: a semana quando o `week` é `{{scheduled:…}}` e não há dia
     *   "naoRepetir": true,                   // opcional: a tarefa aberta com o mesmo título não nasce de novo
     *   "contextsVar": "onde_fazer_soltar_value", // opcional: onde dá para fazer, lido de um passo
     *   "contexts": "📱 Celular",             // opcional: onde dá para fazer, fixo
     *   "askContext": false,                  // opcional: sem passo nem valor fixo, o motor
     *                                         // pergunta "🧭 Onde dá para fazer?" (default);
     *                                         // `false` desliga a pergunta
     *   "bodyVars": { "next_action": "➡️ Próxima ação" }, // opcional: respostas a mais no corpo
 *   "titleFromNoteName": true             // opcional: a resposta é nome de nota; o título sugerido sai limpo
     * }
     */
    /**
     * Serializa um valor escalar para o frontmatter sem quebrar o YAML.
     *
     * Necessário porque as properties dos protocolos carregam TEXTO LIVRE digitado
     * pelo usuário. Sem isto:
     *   - `execucao_desafio: resultado: vídeo publicado` é YAML inválido;
     *   - `execucao_desafio: usei #coragem` perde tudo depois do `#` (vira comentário);
     *   - `hora: 16:45` é sexagesimal em YAML 1.1, não string.
     *
     * Valores que o protocolo já citou de propósito (ex: `"[[Nota]]"`) passam intactos.
     */
    serializeYamlScalar(value: any): string {
        if (value === null || value === undefined) return "";
        if (typeof value === "number" || typeof value === "boolean") return String(value);

        const text = String(value);
        if (text === "") return "";

        // Já vem citado do protocolo — não citar duas vezes.
        if (
            text.length >= 2 &&
            text.startsWith('"') &&
            text.endsWith('"') &&
            !text.slice(1, -1).includes('"')
        ) {
            return text;
        }

        if (/^-?\d+(\.\d+)?$/.test(text)) return text;      // número puro
        if (DIA.test(text)) return text;  // data ISO

        const precisaAspas =
            /^\s|\s$/.test(text) ||                 // espaço nas pontas
            /[\n\r]/.test(text) ||                  // multilinha
            /[:"\[\]{}|>&*!%@`]/.test(text) ||      // estrutural em qualquer posição
            /^[-?#']/.test(text) ||                 // estrutural no início
            /\s#/.test(text);                       // início de comentário

        if (!precisaAspas) return text;

        return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }

    /**
     * Cria — ou REUSA — uma nota-entidade a partir da resposta de um step, e expõe
     * `{var}_entity`, `{var}_entity_display` e `{var}_entity_path` para o template e as
     * properties do protocolo.
     *
     * Existe porque agregar por texto livre não funciona: "rolar o feed" e "Rolar o Feed"
     * viram grupos diferentes, e sinônimos nunca se juntam. Com entidade, o vínculo é um
     * wikilink estável — e a nota da entidade vira o lugar onde a prática substituta mora
     * depois que o diagnóstico fecha.
     *
     * Config (def.createEntity — objeto ou array):
     * {
     *   "titleVar": "estrategia",              // variável que vira o título (ou `stepId`)
     *   "folder": "400 - MEMORY/.../Estrategias",
     *   "type": "act_strategy",                // frontmatter type da entidade
     *   "properties": { "status": "observando" },  // opcional, aceita {{tokens}}
     *   "template": "# {{estrategia}}\n",      // opcional
     *   "condition": { "variable": "x", "value": "y" },  // opcional
     *   "minLength": 3                         // opcional
     * }
     */
    async createEntityFromVariable(config: any, variables: any) {
        try {
            const titleVar = config?.titleVar || config?.stepId;
            if (!titleVar || !config?.folder) return;

            if (config.condition) {
                const { variable, value } = config.condition;
                const target = variables[variable];
                const ok = Array.isArray(value) ? value.includes(target) : target === value;
                if (!ok) return;
            }

            const raw = variables[titleVar];
            const minLength = typeof config.minLength === 'number' ? config.minLength : 3;
            if (!raw || typeof raw !== 'string' || raw.trim().length < minLength) return;

            const title = this.sanitizeFilename(raw.trim()).slice(0, 120);
            if (!title) return;

            const folder = this.resolveFolderPath(config.folder, variables);
            const path = `${folder}/${title}.md`;

            if (!this.app.vault.getAbstractFileByPath(path)) {
                if (!this.app.vault.getAbstractFileByPath(folder)) {
                    try { await this.app.vault.createFolder(folder); } catch (e) { }
                }

                // Só passa pelo processTemplate o que realmente tem token: evita puxar
                // contexto de data (e o arquivo ativo) para montar um frontmatter estático.
                const render = (value: string) =>
                    value.includes("{{") ? this.processTemplate(value, variables) : value;

                const props: any = { type: config.type || 'entidade', ...(config.properties || {}) };
                let content = "---\n";
                for (const [key, value] of Object.entries(props)) {
                    content += `${key}: ${render(String(value))}\n`;
                }
                content += "---\n\n";
                content += config.template ? render(config.template) : `# ${title}\n`;

                await this.app.vault.create(path, content);
                new Notice(`🧩 Entidade criada: ${title}`, 3000);
            }

            variables[`${titleVar}_entity`] = title;
            variables[`${titleVar}_entity_display`] = `[[${title}]]`;
            variables[`${titleVar}_entity_path`] = path;
        } catch (e) {
            console.error('DFM createEntity:', e);
        }
    }

    /**
     * O que faz: `appendToSection` (02/11, a revisão do trecho): para cada nota da lista (`path`, dentro da
     * `allowedFolder`), as linhas (`linhas: [{ section, line, condition }]`) que valem nesta rodada entram no fim
     * da lista da seção delas (`acrescentarNaSecao`), numa gravação por nota; devolve os nomes das notas que
     * mudaram.
     * Por quê: a lição de cada função vai para o 🔄 Revisar da nota dela, com a data (proposta da viagem nos
     * ciclos, §4); a nota e a seção já existem, e a revisão só acrescenta a linha.
     * Erro e ataque: a pasta permitida é obrigatória e o caminho tem que estar nela (nunca um editor genérico do
     * cofre); a nota que não existe não nasce aqui, e a seção que falta não se cria (o aviso diz qual); a
     * condição de uma nota ou de uma linha (um objeto ou uma lista, todas valendo) que não vale pula; a linha já
     * na seção não entra de novo; uma nota que falha não derruba as outras nem o registro da rodada.
     * Prova: tests/engine/jsonProtocol.test.ts ("appendToSection").
     */
    async appendToSectionFromConfig(config: any, variables: any): Promise<string[]> {
        const valem = (c: any) => !c || (Array.isArray(c) ? c.every(x => conditionMatches(x, variables)) : conditionMatches(c, variables));
        const mudaram: string[] = [];
        const faltou: string[] = [];
        for (const nota of Array.isArray(config) ? config : [config]) {
            try {
                if (!valem(nota?.condition)) continue;
                const allowedFolder = String(nota?.allowedFolder || '').replace(/\/+$/, '');
                const path = nota?.path ? this.processTemplate(String(nota.path), variables).trim() : '';
                if (!allowedFolder || !path.startsWith(`${allowedFolder}/`)) {
                    console.error('DFM appendToSection: caminho ausente ou fora da pasta permitida', { path, allowedFolder });
                    continue;
                }
                const linhas = (Array.isArray(nota.linhas) ? nota.linhas : []).filter((l: any) => valem(l?.condition));
                if (!linhas.length) continue;
                const file = this.app.vault.getAbstractFileByPath(path);
                if (!(file instanceof TFile)) { faltou.push(path.split('/').pop()!.replace(/\.md$/, '')); continue; }
                const antes = await this.app.vault.read(file);
                let texto = antes;
                for (const l of linhas) {
                    const r = acrescentarNaSecao(texto, String(l.section ?? ''), this.processTemplate(String(l.line ?? ''), variables));
                    if ('texto' in r) texto = r.texto;
                    else if (r.problema === 'sem-secao') faltou.push(`${file.basename} (${String(l.section ?? '').replace(/^#+\s*/, '')})`);
                }
                if (texto !== antes) {
                    await this.app.vault.modify(file, texto);
                    mudaram.push(file.basename);
                }
            } catch (e) {
                console.error('DFM appendToSection:', e);
                faltou.push(String(nota?.path ?? ''));
            }
        }
        if (mudaram.length) new Notice(`✅ Gravado em: ${mudaram.join(', ')}`, 6000);
        if (faltou.length) new Notice(`⚠️ Não gravado (a nota ou a seção não existe): ${faltou.join(', ')}`, 8000);
        return mudaram;
    }

    /**
     * Atualiza somente o frontmatter de uma nota que acabou de ser escolhida por
     * `suggest_note`. A pasta permitida é obrigatória e impede que uma definição
     * de protocolo transforme isto em editor genérico do vault.
     *
     * `activeLimit` é opcional e serve para capacidades escassas (ex.: no máximo
     * duas práticas ACT em treino). A nota selecionada é retirada da contagem,
     * portanto reafirmar o estado atual não bloqueia.
     */
    async updateSelectedNoteFromVariable(config: any, variables: any): Promise<boolean> {
        try {
            const pathVar = config?.pathVar;
            const allowedFolder = String(config?.allowedFolder || "").replace(/\/+$/, "");
            const path = pathVar ? String(variables?.[pathVar] || "") : "";

            if (!pathVar || !path || !allowedFolder || !path.startsWith(`${allowedFolder}/`)) {
                // `optional` existe para atualizações acessórias: o passo pode ter sido
                // respondido com texto livre, e nesse caso não há nota para atualizar —
                // isso não pode derrubar o registro principal do protocolo.
                if (config?.optional) return true;
                console.error("DFM updateSelectedNote: caminho ausente ou fora da pasta permitida", { pathVar, path, allowedFolder });
                new Notice("⚠️ Não foi possível atualizar a nota escolhida com segurança.");
                return false;
            }

            const file = this.app.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) {
                if (config?.optional) return true;
                new Notice("⚠️ A nota escolhida não existe mais.");
                return false;
            }

            const limit = config.activeLimit;
            const limitTarget = limit?.when ? variables?.[limit.when.variable] : undefined;
            const limitApplies = Boolean(limit) && (
                !limit.when || (Array.isArray(limit.when.value)
                    ? limit.when.value.includes(limitTarget)
                    : limitTarget === limit.when.value)
            );
            if (limitApplies) {
                const max = Number(limit.max);
                const propertyKey = limit.property?.key;
                const propertyValue = limit.property?.value;
                const files = this.app.vault.getMarkdownFiles()
                    .filter((candidate: TFile) => candidate.path !== path && candidate.path.startsWith(`${allowedFolder}/`));
                const active = files.filter((candidate: TFile) => {
                    const fm = this.app.metadataCache.getFileCache(candidate)?.frontmatter || {};
                    const typeMatches = !limit.type || fm.type === limit.type;
                    return typeMatches && propertyKey && fm[propertyKey] === propertyValue;
                }).length;

                if (Number.isFinite(max) && active >= max) {
                    new Notice(`⚠️ Limite de ${max} práticas em treino já atingido. Pause ou integre uma antes de ativar outra.`, 6000);
                    return false;
                }
            }

            // `ifCreated`: propriedades só para a nota que o próprio passo criou (o
            // `{passo}_created` do suggest_note). Ex.: a tarefa criada no ▶️ passa a
            // in-progress só quando o ▶️ termina; uma tarefa já existente escolhida não
            // tem o status mexido (o dia não sobrescreve decisão da semana).
            const createdVar = `${String(pathVar).replace(/_path$/, '')}_created`;
            const properties = this.processProperties({
                ...(config.properties || {}),
                ...(variables?.[createdVar] === true ? (config.ifCreated || {}) : {}),
            }, variables);
            const numericKeys = new Set<string>(Array.isArray(config.numericProperties) ? config.numericProperties : []);
            // `onlyIfEmpty` é o que permite PREENCHER um campo sem SOBRESCREVER decisão
            // alheia: o dia pode dar a estimativa que faltava a uma tarefa, mas nunca
            // reescrever a que a triagem semanal já definiu.
            const onlyIfEmpty = config.onlyIfEmpty === true
                ? new Set<string>(Object.keys(properties))
                : new Set<string>(Array.isArray(config.onlyIfEmpty) ? config.onlyIfEmpty : []);

            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                for (const [key, value] of Object.entries(properties)) {
                    // Passo não respondido não apaga o que a nota já tem.
                    if (value === "" || value === null || value === undefined) continue;

                    if (onlyIfEmpty.has(key)) {
                        const current = frontmatter[key];
                        const filled = current !== undefined && current !== null && String(current).trim() !== "";
                        if (filled) continue;
                    }

                    if (numericKeys.has(key)) {
                        const numeric = Number(value);
                        if (!Number.isFinite(numeric)) continue;
                        frontmatter[key] = numeric;
                        continue;
                    }

                    frontmatter[key] = value;
                }
            });
            variables._updatedNotePath = path;
            return true;
        } catch (e) {
            console.error("DFM updateSelectedNote:", e);
            new Notice("⚠️ Não foi possível atualizar a nota escolhida.");
            return false;
        }
    }

    /**
     * Atualiza um conjunto escolhido por `multiselect_note`. Os nomes são
     * resolvidos apenas dentro da pasta permitida e precisam ser inequívocos;
     * assim o planejamento pode ligar tarefas à semana/projetos ao trimestre
     * sem transformar o protocolo em editor arbitrário do vault.
     */
    async updateSelectedNotesFromVariable(config: any, variables: any): Promise<boolean> {
        try {
            // `variable` é um passo ou uma lista deles (o 🧭: as centrais e os auxiliares).
            const variableList: string[] = (Array.isArray(config?.variable) ? config.variable : [config?.variable])
                .filter((v: any) => typeof v === 'string' && v);
            const allowedFolder = String(config?.allowedFolder || "").replace(/\/+$/, "");
            const raw = variableList
                .map(v => String(variables?.[v] || ""))
                .filter(value => value && value !== "Nenhum")
                .join(", ");
            if (variableList.length === 0 || !allowedFolder || !raw) return true;

            const names = [...new Set([...raw.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)]
                .map(match => match[1].split("/").pop())
                .filter(Boolean))];
            if (names.length === 0) return true;

            const candidates = this.app.vault.getMarkdownFiles()
                .filter((file: TFile) => file.path.startsWith(`${allowedFolder}/`));
            const selected: TFile[] = [];
            for (const name of names) {
                // Pelo nome da nota; senão, pela pasta cuja nota-índice é README.md
                // (o seletor grava o projeto só-README pelo nome da pasta).
                let matches = candidates.filter((file: TFile) => file.basename === name);
                if (matches.length === 0) matches = candidates.filter((file: TFile) => file.basename.toLowerCase() === 'readme' && noteLinkName(file) === name);
                if (matches.length !== 1) {
                    new Notice(`⚠️ Seleção ambígua ou ausente: ${name}. Nenhuma nota foi alterada.`);
                    return false;
                }
                selected.push(matches[0]);
            }

            const properties = this.processProperties(config.properties || {}, variables);
            // `clear: { campo: "<valor com tokens>" }`: o campo sai da nota só se ainda tem
            // aquele valor (a revisão tira o `quarter` do trimestre que fecha dos projetos a
            // pausar, sem tocar no que já foi planejado para o seguinte; 4.4).
            const clear = this.processProperties(config.clear && typeof config.clear === 'object' ? config.clear : {}, variables);
            const today = (window as any).moment().format('YYYY-MM-DD');
            // A conclusão vai pelo caminho único do quadro (02/11, diagnóstico P1): a linha do dia e o
            // registro da reputação saem dele, como no painel e no 📖. Sem o quadro, o frontmatter.
            const board = (this.plugin as any)?.board;
            const concluirPeloQuadro = typeof board?.completeTask === 'function' && (properties as Record<string, unknown>).status === 'done';
            for (const file of selected) {
                await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                    for (const [key, value] of Object.entries(clear)) {
                        if (value === "" || value === null || value === undefined) continue;
                        if (String(frontmatter[key] ?? '') === String(value)) delete frontmatter[key];
                    }
                    for (const [key, value] of Object.entries(properties)) {
                        // Mesma guarda do caminho irmão (updateSelectedNote): passo não
                        // respondido não apaga o que a nota já tem.
                        if (value === "" || value === null || value === undefined) continue;
                        // Concluir pelo mesmo caminho do painel: `completedDate` e
                        // `dateModified` juntos. Sem eles, a SMART cumprida no 📅 caía
                        // em "sem data" (ou na data de criação) nos ciclos fechados.
                        if (key === 'status' && value === 'done') {
                            if (concluirPeloQuadro) continue;
                            if (completeTaskFrontmatter(frontmatter, today).status === 'refused') {
                                new Notice(`⚠️ ${file.basename} é recorrente: conclua pelo TaskNotes.`);
                            } else {
                                frontmatter.dateModified = new Date().toISOString();
                            }
                            continue;
                        }
                        frontmatter[key] = value;
                    }
                });
                if (concluirPeloQuadro) await board.completeTask(file.path, { when: { choice: 'agora', date: today, time: null } });
            }
            variables._updatedNotePaths = selected.map(file => file.path);
            return true;
        } catch (e) {
            console.error("DFM updateSelectedNotes:", e);
            new Notice("⚠️ Não foi possível atualizar as notas escolhidas.");
            return false;
        }
    }

    resolveCycleTargetPath(target: string, properties: Record<string, any>): string | null {
        const ctx = this.getContextDate();
        if (target === "weekly") {
            const week = String(properties?.week || "");
            const id = ehSemana(week)
                ? week
                : `${ctx.format("GGGG")}-W${ctx.format("WW")}`;
            return `300 - RUNTIME/302 - Daymiss/Week/${id}.md`;
        }
        if (target === "quarterly") {
            const quarter = String(properties?.quarter || "");
            const id = ehTrimestre(quarter)
                ? quarter
                : `${ctx.format("YYYY")}-Q${ctx.format("Q")}`;
            return `300 - RUNTIME/302 - Daymiss/Quarterly/${id}.md`;
        }
        return null;
    }

    addCycleContextProperties(properties: Record<string, any>) {
        const normalizedFolder = String(this.targetFolder || '');
        const isWeeklyMemory = normalizedFolder.includes('400 - MEMORY/200 - WEEKLY');
        const isQuarterlyMemory = normalizedFolder.includes('400 - MEMORY/400 - QUARTERLY');
        if (!isWeeklyMemory && !isQuarterlyMemory) return;

        const active = this.app.workspace.getActiveFile();
        const activeFm = active ? this.app.metadataCache.getFileCache(active)?.frontmatter || {} : {};
        const activeWeek = semanaOuVazio(active?.basename) || undefined;
        const activeQuarter = trimestreOuVazio(active?.basename) || undefined;
        const context = this.getContextDate();
        const week = String(activeFm.week || activeWeek || `${context.format('GGGG')}-W${context.format('WW')}`);
        const weekMoment = (window as any).moment(week, 'GGGG-[W]WW', true);
        const quarter = String(
            activeFm.quarter ||
            activeQuarter ||
            (weekMoment.isValid()
                // O trimestre de uma semana é o da quinta-feira dela (a W40/2026 é do Q4).
                ? (quarterOfWeek(week) ?? `${weekMoment.format('YYYY')}-Q${weekMoment.format('Q')}`)
                : `${context.format('YYYY')}-Q${context.format('Q')}`)
        );

        if (isWeeklyMemory && !properties.week) properties.week = week;
        if (!properties.quarter) properties.quarter = quarter;
    }

    async createTaskFromVariable(config: any, variables: any, createdFile: any) {
        try {
            // `stepId` é sinônimo aceito de `titleVar`: 6 protocolos (ACT, via_negativa,
            // conceito_operacional) foram escritos com essa chave e saíam daqui em
            // silêncio, sem NUNCA criar a tarefa. Aceitar as duas evita que a mesma
            // divergência de nomenclatura volte a matar um loop-closing sem aviso.
            const titleVar = config?.titleVar || config?.stepId;
            if (!titleVar) return;

            if (config.condition) {
                const { variable, value } = config.condition;
                const target = variables[variable];
                const ok = Array.isArray(value) ? value.includes(target) : target === value;
                if (!ok) return;
            }

            const raw = variables[titleVar];
            if (!raw || typeof raw !== 'string' || raw.trim().length < 3) return;

            // `onlyWithDate`: a tarefa só existe com um dia. Sem data válida em
            // `scheduledVar` (texto como "no fechamento do Q4"), a tarefa sem dia nem
            // semana caberia hoje no 🧭 Aqui e agora, todos os dias, meses antes da hora;
            // então não nasce, e o aviso diz que a data fica na nota (a 🔭 revisão da visão).
            if (config.onlyWithDate) {
                const quando = config.scheduledVar ? String(variables[config.scheduledVar] ?? '').trim() : '';
                const comData = quando !== '' && window.moment(quando, ['YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY'], true).isValid();
                if (!comData) {
                    new Notice(config.withoutDateNotice || '📅 Sem data: nenhuma tarefa criada; a data de rever fica na nota.', 8000);
                    return;
                }
            }

            // A resposta inteira vira o CORPO; o título é a versão curta dela. Com
            // `askTitle`, o modal abre já preenchido com essa versão: Enter aceita.
            // `titleFromNoteName`: a resposta é o nome de uma nota (a ideia escolhida), e
            // a sugestão sai legível (`noteNameToTitle`), sem prefixo nem "_".
            let titulo = shortenTaskTitle(config.titleFromNoteName ? (noteNameToTitle(raw) || raw) : raw);
            if (config.askTitle) {
                // O título curto que veio do formulário (`<titleVar>_titulo`, P11 da Missão, §5.3,
                // 5) vale sem perguntar; o do "Abrir o protocolo completo" (`_valoresIniciais`)
                // abre a pergunta no lugar da sugestão.
                const doFormulario = tituloCurtoDe(variables[`${titleVar}_titulo`]);
                if (doFormulario) titulo = doFormulario;
                else {
                    const escolhido = await this.prompt(
                        config.titlePrompt || "✍️ Nome curto para esta tarefa (Enter aceita a sugestão):",
                        "Verbo + objeto. O texto completo já vai para o corpo da tarefa.",
                        false,
                        tituloCurtoDe(valoresIniciaisDe(variables)[`${titleVar}_titulo`]) || titulo
                    );
                    if (escolhido.status === 'submit' && String(escolhido.value || '').trim()) {
                        titulo = String(escolhido.value).trim();
                    }
                }
            }

            const title = this.sanitizeFilename(`${config.prefix || ''}${titulo}`).slice(0, 120);

            // `naoRepetir`: a tarefa aberta com o mesmo título já é esta (a mala do 🌍 Decidir e a da 🧳).
            if (config.naoRepetir === true) {
                const doCofre = this.app.vault.getMarkdownFiles()
                    .filter((f: TFile) => f.path.startsWith('TaskNotes/Tasks/'))
                    .map((f: TFile) => ({ caminho: f.path, titulo: f.basename, status: String(this.app.metadataCache.getFileCache(f)?.frontmatter?.status ?? '') }));
                const ja = tarefaAbertaDeMesmoTitulo(title, doCofre);
                if (ja) {
                    new Notice(`📋 A tarefa já existe: ${ja.slice(ja.lastIndexOf('/') + 1).replace(/\.md$/, '')}. Nenhuma nova.`, 6000);
                    return;
                }
            }

            // 'today'/'tomorrow' contam a partir da data de contexto, como o `week` e os
            // tokens {{date}}/{{tomorrow}}: o 🤝 "Amanhã" às 00:30 na Day de ontem dava
            // scheduled de uma semana e week de outra, e um "amanhã" diferente do 🌙.
            const contextDay = this.getContextDate();
            let due = '';
            if (config.due === 'today') due = contextDay.clone().format('YYYY-MM-DD');
            else if (config.due === 'tomorrow') due = contextDay.clone().add(1, 'day').format('YYYY-MM-DD');
            else if (config.dueVar && variables[config.dueVar]) {
                const parsed = window.moment(String(variables[config.dueVar]).trim(), ['YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY'], true);
                if (parsed.isValid()) due = parsed.format('YYYY-MM-DD');
            }
            // `dueOffsetDays: -2`: o prazo é a data menos 2 dias (pesquisar os candidatos
            // fica pronto dois dias antes da saída). Sem prazo, nada a deslocar.
            const dueOffset = Number(config.dueOffsetDays);
            if (due && Number.isFinite(dueOffset) && dueOffset !== 0) {
                due = window.moment(due, 'YYYY-MM-DD').add(Math.trunc(dueOffset), 'days').format('YYYY-MM-DD');
            }

            let scheduled = '';
            if (config.scheduled === 'today') scheduled = contextDay.clone().format('YYYY-MM-DD');
            else if (config.scheduled === 'tomorrow') scheduled = contextDay.clone().add(1, 'day').format('YYYY-MM-DD');
            else if (config.scheduledVar && variables[config.scheduledVar]) {
                const parsed = window.moment(String(variables[config.scheduledVar]).trim(), ['YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY'], true);
                if (parsed.isValid()) scheduled = parsed.format('YYYY-MM-DD');
            }

            // `week` aceita token: o planejamento semanal precisa da semana-alvo
            // (`{{targetweek:...}}`), não da semana de hoje — ele costuma rodar no
            // domingo anterior. Sem isso a tarefa nasce fora do sprint que a gerou.
            // `{{scheduled:FMT}}`: a semana do dia escolhido para a tarefa (a 🔭 revisão da
            // visão nasce na semana da data de rever, não na de hoje). Sem dia, vazio.
            // `weekSemDia`: sem o dia, a tarefa fica na semana (a Partida e a mala, 29/10, §6).
            const weekSource = modeloDaSemanaDaTarefa(config.week, config.weekSemDia, scheduled);
            const weekTemplate = weekSource
                ? weekSource.replace(/{{scheduled:(.*?)}}/g, (_: string, format: string) => (scheduled ? window.moment(scheduled, 'YYYY-MM-DD').format(format) : ''))
                : '';
            const week = weekTemplate ? this.processTemplate(weekTemplate, variables) : '';

            // Onde dá para fazer: o passo do protocolo (`contextsVar`), o valor fixo
            // (`contexts`) ou, sem nenhum dos dois, a pergunta na hora de criar.
            const contexts = await this.resolveTaskContexts(config, variables, title);

            const rawEstimate = config.timeEstimateVar ? Number(variables[config.timeEstimateVar]) : Number(config.timeEstimate);
            const timeEstimate = Number.isFinite(rawEstimate) && rawEstimate > 0 ? Math.round(rawEstimate) : undefined;

            const rawImpacto = config.impactoVar ? variables[config.impactoVar] : config.impacto;
            const impacto = rawImpacto === undefined || rawImpacto === null || rawImpacto === ''
                ? undefined
                : rawImpacto;

            let taskTitle = title;
            let path = `TaskNotes/Tasks/${taskTitle}.md`;
            let duplicateNumber = 2;
            while (this.app.vault.getAbstractFileByPath(path)) {
                taskTitle = `${title} (${duplicateNumber++})`;
                path = `TaskNotes/Tasks/${taskTitle}.md`;
            }

            // `bodyVars: { "next_action": "➡️ Próxima ação" }`: outras respostas entram no
            // corpo da tarefa, rotuladas. Sem isto, o "respondo até as 15h" do pedido ficava
            // só no log da Day, e a tarefa voltava na Caixa 1 sem ele.
            const extras = Object.entries(config.bodyVars && typeof config.bodyVars === 'object' ? config.bodyVars : {})
                .map(([key, label]) => [String(label || key), String(variables[key] ?? '').trim()])
                .filter(([, value]) => value !== '')
                .map(([label, value]) => `- ${label}: ${value}`);
            // `weekFields: { "frentes_dia": "🗓️ Frentes da semana" }`: campos da nota da
            // semana da tarefa (a de hoje, sem `week`), quando ela existe e o campo tem valor.
            const weekLines = this.weekFieldLines(config.weekFields, week);
            // `bodyText`: um parágrafo fixo do protocolo (com tokens) no fim do corpo.
            const bodyText = typeof config.bodyText === 'string' ? this.processTemplate(config.bodyText, variables).trim() : '';
            const answer = [raw.trim(), ...extras, ...weekLines, ...(bodyText ? ['', bodyText] : [])].join('\n');

            const content = buildTaskNoteContent({
                title: taskTitle,
                answer,
                tag: config.tag,
                // Fix 2026-07-06: 'todo' não existe nos customStatuses do TaskNotes.
                // Desde 2026-08-04 o status é declarado por protocolo — o default segue
                // 'next-action' porque o seletor do Comando do Dia exclui 'inbox'.
                status: config.status || 'next-action',
                priority: config.priority || 'normal',
                impacto,
                due,
                scheduled,
                week,
                contexts,
                timeEstimate,
                peca: config.peca,
                blockedBy: config.blockedByCreated && createdFile ? createdFile.basename : undefined,
                // `project` (template) liga a tarefa ao projeto certo; sem ele, o
                // comportamento antigo (`contexto`) continua valendo.
                // Sem resposta (passo pulado), volta ao comportamento antigo.
                projects: (config.project ? this.processTemplate(String(config.project), variables).trim() : '') || variables.contexto,
                // `lugar` (template): onde a tarefa acontece; sem resposta, a chave não nasce.
                lugar: config.lugar ? this.processTemplate(String(config.lugar), variables) : '',
                origin: createdFile ? createdFile.basename : '',
                now: window.moment().format(),
                bodyTemplate: await this.readTaskBodyTemplate()
            });
            await this.app.vault.create(path, content);
            // Quem escuta `dfm:protocol-complete` acha aqui as tarefas criadas junto.
            variables._createdTasks = [...(Array.isArray(variables._createdTasks) ? variables._createdTasks : []), path];
            // `dailyLinkProperty: "compromisso_act"`: a Day guarda o link da tarefa que
            // nasceu, com o nome final (título curto, sem ":" ou "?", com o " (N)").
            // A propriedade foi gravada antes, com o texto escrito; quem lê (a pauta, o
            // gesto, o 📨) procurava a tarefa por esse texto e não a achava, e um 🤝
            // 🌅 Amanhã aparecia como a única coisa de hoje. O link é a fonte única.
            if (typeof config.dailyLinkProperty === 'string' && config.dailyLinkProperty.trim()) {
                const dailyFile = this.getDailyNoteFile(this.getContextDate().format('YYYY-MM-DD'));
                if (dailyFile) {
                    await this.mergeDailyProperties(dailyFile, {
                        [config.dailyLinkProperty.trim()]: `[[${path.replace(/\.md$/, '')}|${taskTitle}]]`,
                    });
                }
            }
            new Notice(`📋 Tarefa criada: ${taskTitle}`, 4000);
        } catch (e) {
            console.error('DFM createTask:', e);
        }
    }

    /**
     * O que faz: as linhas "- rótulo: valor" dos campos pedidos da nota da semana `week`
     * (`AAAA-Www`; vazia → a semana da data de contexto). Sem a nota ou sem valor, nada.
     * Por quê: a tarefa de buscar grupos na cidade nova lista as frentes da semana, lidas
     * da Week em foco quando existe (plano da viagem, 22/10, seção 6).
     */
    weekFieldLines(fields: any, week: string): string[] {
        if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return [];
        const id = ehSemana(String(week || '')) ? String(week) : this.getContextDate().format('GGGG-[W]WW');
        const file = this.app.vault.getAbstractFileByPath(this.resolveCycleTargetPath('weekly', { week: id }) || '');
        if (!(file instanceof TFile)) return [];
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
        const out: string[] = [];
        for (const [key, label] of Object.entries(fields)) {
            const raw = fm[key];
            const value = Array.isArray(raw) ? raw.map(item => String(item ?? '').trim()).filter(Boolean).join(' · ') : String(raw ?? '').trim();
            if (value) out.push(`- ${String(label || key)}: ${value}`);
        }
        return out;
    }

    /**
     * Onde dá para fazer a tarefa que vai nascer (o campo `contexts` do TaskNotes).
     * Ordem: o passo do protocolo (`contextsVar`), o valor fixo (`contexts`) e, sem
     * nenhum dos dois, a pergunta "🧭 Onde dá para fazer?" — só numa rodada de verdade
     * e só se o protocolo não a desligou (`askContext: false`). Só o vocabulário de
     * `taskContexts.ts` é gravado; "⏭️ Sem contexto" ou Esc criam a tarefa sem contexto.
     */
    async resolveTaskContexts(config: any, variables: any, title: string): Promise<string[]> {
        if (config?.contextsVar) return taskContextsFrom(variables?.[config.contextsVar]);
        if (config?.contexts) return taskContextsFrom(config.contexts);
        if (config?.askContext === false || !this.askTaskContexts) return [];
        return this.askTaskContext(title);
    }

    /** A pergunta, com o nome da tarefa: num protocolo que cria duas, cada uma tem a sua. */
    async askTaskContext(title: string): Promise<string[]> {
        try {
            const nome = String(title ?? '').trim();
            const result = await this.suggest(
                [...TASK_CONTEXTS, TASK_CONTEXT_SKIP],
                nome ? `${TASK_CONTEXT_QUESTION} — ${nome}` : TASK_CONTEXT_QUESTION,
                false,
                TASK_CONTEXT_INFO
            );
            return result?.status === 'submit' ? taskContextsFrom(result.value) : [];
        } catch (e) {
            console.error('DFM contexto da tarefa:', e);
            return [];
        }
    }

    /**
     * Lê o `bodyTemplate` configurado no próprio TaskNotes, para a tarefa criada por
     * protocolo nascer com o mesmo corpo da criada pela UI dele. Mesmo padrão já usado
     * com o periodic-notes em `main.ts` — ler o data.json do outro plugin, com fallback
     * silencioso. Sem template configurado, `buildTaskNoteContent` usa o corpo mínimo.
     */
    async readTaskBodyTemplate(): Promise<string> {
        try {
            const config = JSON.parse(await this.app.vault.adapter.read(TASKNOTES_CONFIG));
            const defaults = config?.taskCreationDefaults;
            if (!defaults?.useBodyTemplate || !defaults?.bodyTemplate) return '';
            const file = this.app.vault.getAbstractFileByPath(defaults.bodyTemplate);
            return file instanceof TFile ? await this.app.vault.read(file) : '';
        } catch (e) {
            return '';
        }
    }

    // ... (processTemplate and processProperties remain unchanged) ...
    // Helper to determine the "Reference Date" based on active file context
    getContextDate() {
        const now = window.moment();
        // Capturas pontuais pertencem ao momento em que foram feitas, mesmo que o
        // usuário esteja com uma nota diária antiga aberta para consulta.
        if (this.def.useCurrentDate === true) {
            return now;
        }

        // Nova rodada do mesmo protocolo: continua no dia da rodada anterior.
        if (this.contextDateOverride) {
            const pinned = window.moment(this.contextDateOverride, "YYYY-MM-DD", true);
            if (pinned.isValid()) {
                return pinned.hour(now.hour()).minute(now.minute()).second(now.second()).millisecond(now.millisecond());
            }
        }

        const activeFile = this.app.workspace?.getActiveFile?.();
        if (activeFile) {
            // Preserve the active daily-note date while keeping the real clock time
            const diaDoNome = diaNoInicio(activeFile.name);
            if (diaDoNome) {
                const contextDate = window.moment(diaDoNome, "YYYY-MM-DD", true);
                if (contextDate.isValid()) {
                    return contextDate
                        .hour(now.hour())
                        .minute(now.minute())
                        .second(now.second())
                        .millisecond(now.millisecond());
                }
            }
            if (ehSemana(activeFile.basename)) {
                // Nota da semana: hoje, se hoje cai nela (como o canvas da semana); senão,
                // a segunda-feira. Com a segunda fixa, o ▶️/🌙 rodado pelo painel com a
                // 2026-W42.md aberta gravava as propriedades na Day de segunda, o log na
                // de hoje, e o "amanhã" do 🌙 virava uma data já passada.
                const day = contextDayOf({ kind: 'week', id: activeFile.basename }, now.format('YYYY-MM-DD'));
                if (day) {
                    const contextDate = (window as any).moment(day, 'YYYY-MM-DD', true);
                    if (contextDate.isValid()) {
                        return contextDate.hour(now.hour()).minute(now.minute()).second(now.second()).millisecond(now.millisecond());
                    }
                }
            }
            if (ehTrimestre(activeFile.basename)) {
                // Nota do trimestre: hoje, se hoje cai nele (como o canvas do trimestre);
                // senão, o dia 1. Com o dia 1 fixo, a 🎯 SMART criada pelo botão da
                // 2026-Q4.md em 15/10 nascia na W40, uma semana já fechada.
                const day = contextDayOf({ kind: 'quarter', id: activeFile.basename }, now.format('YYYY-MM-DD'));
                const contextDate = (window as any).moment(day, 'YYYY-MM-DD', true);
                if (day && contextDate.isValid()) {
                    return contextDate.hour(now.hour()).minute(now.minute()).second(now.second()).millisecond(now.millisecond());
                }
            }
        }
        return now;
    }

    getDailyTimestampFormat() {
        return this.def.dailyTimestampFormat || "HH:mm";
    }

    getDailyLedgerLabel() {
        return this.def.dailyLedgerLabel || this.def.name || this.id;
    }

    _extractSectionText(content, header) {
        const lines = content.split("\n");
        const capture = [];
        let active = false;

        for (const line of lines) {
            if (line.trim() === header) {
                active = true;
                capture.push(line);
                continue;
            }

            if (active && line.startsWith("## ") && line.trim() !== header) {
                break;
            }

            if (active) {
                capture.push(line);
            }
        }

        return capture.join("\n");
    }

    /** Assinatura curta e determinística do conteúdo capturado (djb2). Duas capturas
     *  diferentes produzem marcas diferentes; a mesma captura, no mesmo minuto, produz a
     *  mesma marca — que é o único caso em que deduplicar é correto. */
    _captureSignature(text) {
        const source = String(text ?? '');
        let hash = 5381;
        for (let i = 0; i < source.length; i++) {
            hash = ((hash << 5) + hash + source.charCodeAt(i)) >>> 0;
        }
        return hash.toString(36);
    }

    _insertIntoDailyHeader(content, targetHeader, entry, dedupeFragment = null) {
        let updated = content;
        if (!updated.includes(targetHeader)) {
            updated = updated.trimEnd() + `\n\n${targetHeader}\n`;
        }

        const section = this._extractSectionText(updated, targetHeader);
        if (dedupeFragment && section.includes(dedupeFragment)) {
            return { content: updated, inserted: false };
        }

        const lines = updated.split("\n");
        let headerIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().toLowerCase() === targetHeader.trim().toLowerCase()) {
                headerIndex = i;
                break;
            }
        }

        if (headerIndex === -1) {
            return { content: updated.trimEnd() + `\n\n${targetHeader}\n${entry}\n`, inserted: true };
        }

        let insertIndex = headerIndex + 1;

        while (insertIndex < lines.length && lines[insertIndex] === "") {
            insertIndex += 1;
        }

        if (insertIndex < lines.length && lines[insertIndex].trim().startsWith("```dfm")) {
            for (let j = insertIndex + 1; j < lines.length; j++) {
                if (lines[j].trim() === "```") {
                    insertIndex = j + 1;
                    break;
                }
            }
        }

        lines.splice(insertIndex, 0, entry);
        return { content: lines.join("\n"), inserted: true };
    }

    /**
     * O que faz: onde o registro do protocolo entra na Day: a seção declarada
     * (`dailyNoteSection`), quando a Day a tem; senão o marcador do ledger
     * (`DFM_LOGS_START`); sem o marcador, a seção "## 🗂️ Registros automáticos".
     * Por quê: desde 29/10 (um escritor só da Day) todo protocolo escreve aqui, com ou sem
     * a chave; a chave só fica onde nomeia uma seção de verdade do modelo da Day (o
     * `### 🌙 Noite` do 🌙). Chave que a Day não tem cai no marcador, como antes.
     */
    resolveDailyNoteSection(content) {
        const configured = typeof this.def.dailyNoteSection === 'string' ? this.def.dailyNoteSection : '';
        if (configured.trim()) {
            const hasConfiguredHeader = content.split("\n").some(line =>
                line.trim().toLowerCase() === configured.trim().toLowerCase()
            );
            if (hasConfiguredHeader) return configured;
        }

        // O Day compacto mantém o ledger em <details> — aberto por padrão desde
        // 2026-09-15, porque é onde escrevem os protocolos do loop diário — sem
        // repetir um cabeçalho Markdown visível. O marcador é o contrato estável de
        // inserção: funciona para protocolos append, links/embeds e logs de tarefas.
        const ledgerMarker = "<!-- DFM_LOGS_START -->";
        if (content.includes(ledgerMarker)) return ledgerMarker;

        // Day sem o marcador (modelo antigo): o ledger técnico fica separado da
        // escrita livre, numa seção própria.
        return "## 🗂️ Registros automáticos";
    }

    /** Data-base da semana sendo PLANEJADA: sex(5)/sáb(6)/dom(7) → segunda da próxima
     *  semana ISO; seg–qui → a própria data (semana corrente). Usada por {{planweek:FMT}}. */
    getPlanWeekDate() {
        return planWeekStart(this.getContextDate()) as any;
    }

    /**
     * Semana-alvo de `{{targetweek:FMT}}`: sai da NOTA SEMANAL ABERTA, não do calendário.
     * Estando na 2026-W32, "planejar a próxima" (`_semana_offset: 1`) é sempre a W33 —
     * antes o alvo vinha do dia da semana de hoje e, numa segunda, o botão "Planejar
     * Próxima Semana" reabria o planejamento da semana corrente por cima do que já existia.
     * Fora de uma nota semanal e sem deslocamento, mantém a regra de calendário do
     * {{planweek:FMT}}; com deslocamento, soma à semana da data de contexto.
     */
    getTargetWeekDate(variables: any = {}) {
        // A regra (pino da rodada anterior, nota semanal aberta, deslocamento) vive na
        // função pura `targetWeekStart` (`templateTokens.ts`), a mesma do reparo das
        // notas de período: no domingo da W42, "⏭️ Planejar a próxima semana" é a W43.
        return targetWeekStart(variables, () => this.getContextDate(), () => this.getPlanWeekDate(), (window as any).moment) as any;
    }

    /**
     * Trimestre-alvo de `{{targetquarter:FMT}}`. `getContextDate()` já resolve uma nota
     * `YYYY-Qn` para um dia do trimestre (hoje, se cai nele; senão o dia 1); aqui só se aplica o deslocamento de
     * `_trimestre_offset`. Sem isso, "Planejar Próximo Trimestre" apontava para o
     * trimestre da nota aberta — ou seja, reabria o cockpit corrente por cima.
     */
    /**
     * Data da diária que recebe o LEDGER de execução — o "rodei tal protocolo às HH:mm".
     * Numa nota diária antiga, a data de contexto é intencional (registro retroativo).
     * Numa nota de CICLO ela é a segunda-feira da semana ou o 1º dia do trimestre, datas
     * sem relação com o momento da execução: o review da W31 rodado em 03/08 ia parar no
     * ledger da diária de 27/07, um dia que já tinha passado.
     */
    getLedgerDate() {
        const activeFile = this.app.workspace.getActiveFile();
        const emNotaDeCiclo = activeFile ? (ehSemana(activeFile.basename) || ehTrimestre(activeFile.basename)) : false;
        return emNotaDeCiclo ? (window as any).moment() : this.getContextDate();
    }

    getTargetQuarterDate(variables: any = {}) {
        // Pino (`_target_quarter_pin`) e deslocamento: a regra pura `targetQuarterStart`.
        return targetQuarterStart(variables, () => this.getContextDate(), (window as any).moment) as any;
    }

    /**
     * O relógio dos marcadores desta rodada: a data de contexto (lida agora, uma vez) e
     * as funções da semana planejada, da semana-alvo (a da nota aberta, mais
     * `_semana_offset`), do trimestre-alvo e da semana de uma variável.
     */
    tokenClock(variables: any, contextDate: any = this.getContextDate()): TokenClock {
        return {
            context: contextDate,
            planWeek: () => this.getPlanWeekDate(),
            targetWeek: () => this.getTargetWeekDate(variables),
            targetQuarter: () => this.getTargetQuarterDate(variables),
            now: () => (window as any).moment(),
            weekStartOf: (key: string) => this.weekStartFromVar(variables, key),
        };
    }

    processTemplate(template, variables) {
        if (typeof template !== "string") return "";
        // O renderizador único (`templateTokens.ts`): variáveis, datas ({{planweek}} =
        // a semana sendo planejada; {{targetweek}} = a da nota aberta + `_semana_offset`)
        // e a limpeza final. É o mesmo do reparo das notas de período.
        return renderTemplateTokens(template, variables, this.tokenClock(variables));
    }

    /**
     * O que faz: a resposta de um passo com `comoLista: true` como lista, quando a
     * propriedade é só o token do passo (`"{{temporada}}"`) ou uma lista só de tokens
     * desses passos (`["{{temporada}}", "{{auxiliares}}"]`, unidas sem repetir); senão, `null`.
     * `multiselect_note`: os links `[[Nome]]` escolhidos ("Nenhum" e o rótulo de pular não
     * têm link e dão `[]`). `multiselect`: as opções marcadas. `textarea`/`text`: uma por
     * linha (as habilidades do trimestre, proposta de 27/10, 4.5).
     * Prova: tests/engine/protocolListProperty.test.ts e tests/engine/trimestrePadrao.test.ts.
     */
    listStepAnswer(value: unknown, variables: any): { links: string[] } | null {
        const tokens = typeof value === 'string'
            ? [value]
            : Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string') ? value as string[] : null;
        if (!tokens) return null;
        const steps: any[] = [];
        for (const item of tokens) {
            const token = item.trim().match(/^\{\{([a-zA-Z0-9_]+)\}\}$/);
            const step = token ? (this.def?.steps || []).find((s: any) => s?.id === token[1]) : null;
            if (!step || step.comoLista !== true || !LIST_STEP_TYPES.has(step.type)) return null;
            steps.push(step);
        }
        const links: string[] = [];
        for (const step of steps) {
            const raw = String(variables?.[step.id] ?? '');
            const items = step.type === 'multiselect_note'
                ? [...raw.matchAll(/\[\[[^\[\]]+\]\]/g)].map(match => match[0])
                : listFromAnswer(raw, step.type);
            for (const item of items) if (!links.includes(item)) links.push(item);
        }
        return { links };
    }

    processProperties(props: any, variables: any) {
        if (!props) return {};
        const result = {};
        const clock = this.tokenClock(variables);
        // As notas guardam como número o ECH, o sono, a energia, o flow, o esforço e o nível pessoal
        // (a chave do nome da pessoa nas definições, `chaveDoNivelPessoal`).
        const numericas = new Set([...CHAVES_NUMERICAS_DAS_NOTAS, chaveDoNivelPessoal(definicoesDe(this.plugin))]);

        for (const [key, value] of Object.entries(props)) {
            let val: any = value;

            // `comoLista: true` num `multiselect_note`: a propriedade que é só o token do
            // passo (`"temporada": "{{temporada}}"`) grava a lista dos links escolhidos, e
            // não o texto "[[A]], [[B]]"; nada escolhido grava `[]` (e o merge não apaga).
            const asList = this.listStepAnswer(val, variables);
            if (asList) {
                result[key] = asList.links;
                continue;
            }

            const expandString = (source: string) => {
                let expanded = source;
                // Generic replacement
                for (const [vKey, vVal] of Object.entries(variables)) {
                    // Função de substituição (mesmo motivo de processTemplate): `$&`/`$1`
                    // digitados pelo operador são texto, não padrão de substituição.
                    expanded = expanded.replace(new RegExp(`{{${this.escapeRegExp(vKey)}}}`, 'g'), () => String(vVal));
                }

                // Fix nested legacy brackets
                expanded = expanded.replace(/\[\[\[\[(.*?)\]\]\]\]/g, "[[$1]]");

                // Datas: as mesmas do modelo (`resolveDateTokens`, `templateTokens.ts`).
                expanded = resolveDateTokens(expanded, clock);
                // Propriedade que é só um link citado (`"[[{{passo}}]]"`, ex.: a peça 📤 do
                // registro de criação) com o passo não respondido ou não perguntado fica
                // vazia: sem isto, todo registro sem peça gravava `"[[]]"`.
                if (/^"\[\[\s*\]\]"$/.test(expanded.replace(/{{[a-zA-Z0-9_]+}}/g, "").trim())) return '';
                expanded = expanded.replace(/\[\[\s*\]\]/g, "Sem conexão contextual");
                // Mesma limpeza de órfãos que processTemplate já faz (linha ~996) — sem isso,
                // um {{token}} sem origem ficava literal no frontmatter em vez de ser limpo.
                return expanded.replace(/{{[a-zA-Z0-9_]+}}/g, "");
            };

            if (Array.isArray(val)) {
                val = val.map(item => typeof item === 'string' ? expandString(item) : item);
            } else if (typeof val === 'string') {
                val = expandString(val);
            }

            // Convert numerical attributes from string to pure numbers
            if (numericas.has(key)) {
                if (typeof val === 'string') {
                    // Passo não perguntado (modo curto/normal) fica vazio, e não 0: o 0
                    // apagava o ECH que o 🔎 Aprofundar tinha gravado mais cedo.
                    const match = val.match(/(\d+)/);
                    val = match ? parseInt(match[1], 10) : (val.trim() === '' ? '' : 0);
                } else if (typeof val !== 'number') {
                    val = 0;
                }
            }

            result[key] = val;
        }
        return result;
    }

    /**
     * O que faz: `teleprompter: { notaVar }` (topo do protocolo): lê a nota cujo caminho está na variável `notaVar` (o
     * `<passo>_path` de um suggest_note) e põe nas variáveis o texto falado dela, pronto para o celular (`teleprompter_texto`,
     * de `teleprompterDoRoteiro`), o aviso das faltas (`teleprompter_faltas`) e quantas são (`teleprompter_n_faltas`).
     * Por quê: 03/11, o 📱 Teleprompter: o roteiro "bem estruturado para ler ou colocar em um teleprompter de celular";
     * a nota que o protocolo grava é a irmã do roteiro, e o modelo dela só recebe o texto pronto.
     * Erro e ataque: sem a nota (o caminho vazio, fora do cofre, ou que não é Markdown), ou sem as seções da fala, o
     * aviso diz o motivo e o protocolo para sem gravar nada (`false`).
     * Prova: tests/engine/teleprompter.test.ts (a extração) e tests/contracts/teleprompterProtocolo.test.ts (o protocolo).
     */
    async prepararTeleprompter(config: any, variables: any): Promise<boolean> {
        const caminho = String(variables?.[String(config?.notaVar ?? '')] ?? '').trim();
        const file = caminho ? this.app.vault.getAbstractFileByPath(caminho) : null;
        if (!(file instanceof TFile) || file.extension !== 'md') {
            new Notice('⚠️ 📱 Teleprompter: escolha a nota de um roteiro; nada foi gravado.', 6000);
            return false;
        }
        const r = teleprompterDoRoteiro(await this.app.vault.read(file));
        if (!r.blocos) {
            new Notice(`⚠️ 📱 Teleprompter: "${file.basename}" não tem as seções da fala (🎣 Gancho a 🚀 CTA); nada foi gravado.`, 8000);
            return false;
        }
        variables.teleprompter_texto = r.texto;
        variables.teleprompter_faltas = avisoDasFaltas(r.faltas);
        variables.teleprompter_n_faltas = String(r.faltas.length);
        return true;
    }

    /**
     * O que faz: `registrarFeito: { linhasVar }` (topo do protocolo): cada linha não vazia da
     * resposta do passo `linhasVar` vira um registro do que foi feito fora do plano, no dia
     * da rodada, pela função única (`MissionBoard.registrarFeito`): a TaskNote nasce feita,
     * sem `scheduled` nem `week`, com `origem: registrar_feito`.
     * Por quê: a pergunta opcional do 🌙 (página Missão, §8.11): "Uma linha por coisa".
     * Erro e ataque: sem resposta (o passo não perguntado, "⏭️ Nada"), nada acontece; sem o
     * quadro, o aviso diz que nada foi registrado; a linha que falha não para as outras, e
     * o aviso conta quantas entraram. Sem a chave, nada muda.
     * Prova: tests/engine/registrarFeitoNoite.test.ts.
     */
    async registrarFeitoDasLinhas(config: any, variables: any, dia: string): Promise<number> {
        const linhas = linhasDoRegistro(variables?.[String(config?.linhasVar ?? '')]);
        if (!linhas.length) return 0;
        const board: any = (this.plugin as any).board;
        if (typeof board?.registrarFeito !== 'function') {
            new Notice('⚠️ O registro do que foi feito não está carregado: nada foi registrado.', 6000);
            return 0;
        }
        let feitos = 0;
        const falhas: string[] = [];
        for (const titulo of linhas) {
            try {
                const r = await board.registrarFeito({ titulo, dia });
                if (r?.ok) feitos++;
                else falhas.push(r?.texto ?? titulo);
            } catch (e) {
                console.error('DFM registrarFeito:', e);
                falhas.push(titulo);
            }
        }
        if (falhas.length) new Notice(`⚠️ ${feitos} de ${linhas.length} registrados como feitos no dia. ${falhas.join(' · ')}`, 8000);
        else new Notice(`✅ ${feitos} ${feitos === 1 ? 'registrado' : 'registrados'} como feito no dia.`, 4000);
        return feitos;
    }

    /**
     * O que faz: grava `dayProperties` (com tokens) no frontmatter da Day da data de
     * contexto; campo sem resposta não apaga o que a Day já tem (`mergeDailyProperties`).
     * Por quê: a chegada numa cidade grava `cidade` na Day (plano da viagem, 22/10, 6),
     * e a nota da cidade lê os dias passados nela por esse campo.
     * Erro e ataque: sem a Day, o aviso diz que o campo não foi gravado; falha não
     * derruba a nota já salva.
     * Prova: tests/engine/viagemModelo.test.ts.
     */
    async writeDayProperties(config: Record<string, any>, variables: any): Promise<boolean> {
        try {
            const properties = this.processProperties(config, variables);
            if (!Object.values(properties).some(value => value !== '' && value !== null && value !== undefined)) return false;
            const dateStr = this.getContextDate().format("YYYY-MM-DD");
            const dailyFile = this.getDailyNoteFile(dateStr);
            if (!dailyFile) {
                new Notice(`⚠️ A Day de ${dateStr} não existe: ${Object.keys(properties).join(', ')} não foi gravado nela.`, 6000);
                return false;
            }
            await this.mergeDailyProperties(dailyFile, properties);
            return true;
        } catch (e) {
            console.error('DFM dayProperties:', e);
            return false;
        }
    }

    async mergeDailyProperties(dailyFile: any, properties: Record<string, any>) {
        // processFrontMatter muta o MESMO mapa YAML: campos do template e de outros
        // protocolos permanecem, enquanto a mesma chave é atualizada sem duplicação.
        // type/status pertencem à nota diária, e a data já é o nome YYYY-MM-DD.
        const protectedKeys = new Set(['type', 'status', 'date']);
        // `clearIfUnanswered`: campo que só vale junto da resposta desta rodada. A
        // `entrega_reduzida` do ▶️ só existe com "↘️ reduzir"; o ▶️ seguinte respondido
        // com "✅ Levo junto" deixava a da ação anterior no "Suficiente agora" da nova.
        const clearKeys = new Set<string>(Array.isArray(this.def?.clearIfUnanswered) ? this.def.clearIfUnanswered : []);
        await this.app.fileManager.processFrontMatter(dailyFile, (frontmatter) => {
            for (const [key, value] of Object.entries(properties || {})) {
                if (protectedKeys.has(key)) continue;
                const empty = value === '' || value === null || value === undefined;
                if (empty && clearKeys.has(key)) {
                    delete frontmatter[key];
                    continue;
                }
                // Mesma guarda dos caminhos irmãos (updateSelectedNote, merge_frontmatter):
                // passo não perguntado não apaga o que a diária já tem — o ▶️ curto depois
                // do 🧭 completo apagava valor, contribuição e barreira da manhã.
                if (empty) continue;
                frontmatter[key] = value;
            }
        });
    }

    resolvePropertyFilter(propertyFilter: any) {
        if (!propertyFilter) return null;
        const resolveOne = (criterion: any) => {
            if (!criterion || typeof criterion !== 'object') return criterion;
            // Lista de valores aceitos (qualquer um vale) também passa pelos tokens: é o
            // que deixa o ⚡ aceitar a SMART da semana corrente E a da semana planejada.
            const value = typeof criterion.value === 'string'
                ? this.processTemplate(criterion.value, {})
                : Array.isArray(criterion.value)
                    ? [...new Set(criterion.value.map((v: any) => typeof v === 'string' ? this.processTemplate(v, {}) : v))]
                    : criterion.value;
            return { ...criterion, value };
        };
        return Array.isArray(propertyFilter)
            ? propertyFilter.map(resolveOne)
            : resolveOne(propertyFilter);
    }

    getDailyCommandSyncPayload(variables: any) {
        const payload: any = {};
        if (variables.unica_coisa !== undefined) {
            payload.unicaCoisa = variables.unica_coisa_display || variables.unica_coisa;
        }
        if (variables.valor_hyadhuad !== undefined) {
            // Prefere o wikilink da entidade: o valor do dia aponta para a nota onde
            // o trabalho da Bússola sobre ele acumula, em vez de virar texto solto.
            payload.valor = variables.valor_hyadhuad_entity_display
                || variables.valor_hyadhuad_display
                || variables.valor_hyadhuad;
        }
        if (variables.acao_comando !== undefined || variables.tarefa_smart !== undefined) {
            payload.tarefaSmart = variables.acao_comando_display
                || variables.acao_comando
                || variables.tarefa_smart_display
                || variables.tarefa_smart;
            payload.commandTaskPath = variables.acao_comando_path || variables.tarefa_smart_path;
        }
        if (variables.macro_foco !== undefined) {
            payload.macroFoco = variables.macro_foco_display || variables.macro_foco;
        }
        return payload;
    }

    // UI Helpers Wrappers
    async prompt(text: string, placeholder: string, showBack = false, initialValue?: string, info?: string): Promise<any> {
        return new Promise((resolve) => {
            new InputModal(this.app, text, placeholder, (result) => resolve(result), showBack, initialValue, info).open();
        });
    }

    async promptTextarea(text: string, placeholder: string, showBack = false, initialValue?: string, info?: string): Promise<any> {
        return new Promise((resolve) => {
            new TextAreaModal(this.app, text, placeholder, (result) => resolve(result), showBack, initialValue, info).open();
        });
    }

    async suggest(items: any[], placeholder: string, showBack = false, info?: string, notes?: Record<string, string>, padrao?: string): Promise<any> {
        return new Promise((resolve) => {
            const modal = new DFM_Suggester(this.app, items, (result) => resolve(result), showBack, placeholder, info, notes, padrao);
            // O placeholder do campo de busca fica só com a primeira linha; o prompt
            // inteiro (e o `info`) aparece no cabeçalho montado pelo próprio modal.
            modal.setPlaceholder(String(placeholder || "Selecione...").split('\n')[0]);
            modal.open();
        });
    }

    /**
     * O que faz: a resposta com que o passo abre: a anterior desta rodada (Voltar), senão a
     * do formulário (`_valoresIniciais`), senão a primeira fonte de `defaultFrom` que tem valor
     * (o campo da nota, caminho com tokens; sem `path`, a nota de `def.defaultFromNote`),
     * senão, num `multiselect_note` com `preselectAll: true`, todas as opções marcadas. A
     * regra é a função pura `aberturaDoPasso` (a mesma do formulário); aqui só a leitura do cofre.
     * Por quê: o 🧭 rodado de novo na 2026-Q4 abre cada campo com o que já está nela (Enter
     * mantém); os auxiliares vêm marcados e desmarcar deixa de fora; o 🌳 abre o Bloco
     * Sagrado com o da semana ou o padrão do trimestre (proposta de 27/10, 4.2 e 5).
     * Entra → sai: o passo, as variáveis, a resposta anterior e as opções (quando há) →
     * `{ value, origem, kind, fonte }` (`origem` vazia = nada para dizer).
     * Erro e ataque: nota ausente, campo vazio ou fonte malformada → a próxima fonte; a
     * marca sem opção visível sai (`answerFromField`).
     * Prova: tests/engine/trimestrePadrao.test.ts ("abre com o que está na nota").
     */
    openingAnswer(step: any, variables: any, previousValue: any, options: readonly string[] | null, sugestaoDe?: ResolvedorDeSugestao | null): Abertura {
        const fmOf = (path: string) => {
            const file = this.app?.vault?.getAbstractFileByPath?.(path);
            if (!(file instanceof TFile)) return null;
            return this.app.metadataCache?.getFileCache?.(file)?.frontmatter ?? null;
        };
        const fontes = () => fontesDaAbertura(step, this.def?.defaultFromNote, path => this.processTemplate(path, variables));
        return aberturaDoPasso(step, previousValue, valoresIniciaisDe(variables)[step?.id], fontes, fmOf, options, sugestaoDe);
    }

    /**
     * O que faz: o leitor do formulário (`LeitorDoFormulario`) para as variáveis de uma rodada: o
     * frontmatter das notas, o caminho com os marcadores da rodada (as datas do formulário e as
     * variáveis de sistema de `contextoDaRodada`), as sugestões declaradas de cada passo (as mesmas
     * fontes puras do modal, com o compromisso deixado pelo 🌙 de cada passo que o lê) e o par da
     * semana do 🌳 (`sugestaoDaSemana`), como o modal abre.
     * Por quê: P12a da Missão (§5.5): a gaveta abre cada campo com o mesmo valor e o mesmo porquê
     * que o modal; `aberturaDoCampo` com este leitor é a abertura do modal.
     * Entra → sai: as variáveis iniciais (com `_context_date` e os pinos) → o leitor. A data de
     * contexto da rodada que estiver no meio não muda.
     * Prova: tests/engine/sugestoesDoPasso.test.ts ("o formulário abre como o modal").
     */
    async leitorDoFormulario(variaveis: Record<string, unknown> = {}): Promise<LeitorDoFormulario> {
        const rodada = await this.contextoDaRodada(variaveis);
        const vars = { ...variaveis, ...rodada.variaveis };
        const comData = <T,>(fn: () => T): T => {
            const antes = this.contextDateOverride;
            this.contextDateOverride = this.parseContextDateOverride(variaveis?._context_date);
            try { return fn(); } finally { this.contextDateOverride = antes; }
        };
        const base = await comData(() => this.contextoDasSugestoes(vars));
        const deixadas = new Map<string, ContextoDaSugestao['deixada']>();
        for (const step of this.def?.steps || []) {
            if (!step?.pinFromYesterday || deixadas.has(step.pinFromYesterday)) continue;
            const left = comData(() => this.leftCommitment(step.pinFromYesterday));
            deixadas.set(step.pinFromYesterday, left ? { nome: left.name, quando: left.when } : null);
        }
        const pares = new Map<string, any>();
        const nucleo: any = this.plugin?.nucleo;
        if (typeof nucleo?.parDaSemana === 'function') {
            try { pares.set('alvo', await nucleo.parDaSemana(String(vars._target_week ?? ''))); } catch (e) { pares.set('alvo', null); }
        }
        const fmOf = (path: string) => {
            const file = this.app?.vault?.getAbstractFileByPath?.(path);
            return file instanceof TFile ? this.app.metadataCache?.getFileCache?.(file)?.frontmatter ?? null : null;
        };
        return {
            frontmatter: fmOf,
            caminho: (modelo: string) => comData(() => this.processTemplate(modelo, vars)),
            sugestao: (nome, step, opcoes) => {
                const s = sugestaoDoPasso(nome, step, { ...base, deixada: step?.pinFromYesterday ? deixadas.get(step.pinFromYesterday) ?? null : null }, opcoes);
                return s ? { valor: s.valor, porque: s.porque } : null;
            },
            daSemana: (grupo) => {
                const par = pares.get('alvo');
                const nome = par?.padrao?.[grupo];
                if (!nome) return null;
                return { nome: String(nome), origem: par?.daNota?.[grupo] && par.daNota[grupo] === nome ? 'o que a nota da semana já tem' : 'sugestão desta semana' };
            },
        };
    }

    /**
     * O que faz: o resolvedor das sugestões declaradas de um passo: para as opções do passo
     * montado, a função que dá, pelo nome da fonte, o valor e o porquê (`sugestaoDoPasso`, com o
     * contexto que o cofre dá agora, `contextoDasSugestoes`).
     * Por quê: P12a da Missão (§5.5): a mesma função pura no modal (a resposta de abertura) e no
     * formulário (`leitorDoFormulario`).
     * Entra → sai: o passo e as variáveis da rodada → (opções) → o resolvedor.
     */
    async resolvedorDeSugestao(step: any, variables: any): Promise<(opcoes: readonly string[] | null) => ResolvedorDeSugestao> {
        const ctx = await this.contextoDasSugestoes(variables, step);
        return (opcoes) => (nome) => {
            const s = sugestaoDoPasso(nome, step, ctx, opcoes);
            return s ? { valor: s.valor, porque: s.porque } : null;
        };
    }

    /**
     * O que faz: o que as sugestões declaradas leem do cofre, para a rodada: o dia e as semanas, as
     * tarefas (TaskNotes, com o arquivo), os pontos de cada aberta pela tabela única (com os pesos
     * que contaram; sem o serviço dos pesos, nenhum), a Temporada do trimestre da semana-alvo, as
     * estadias (as Days com `cidade` e as notas de cidade), o valor da semana do dia (o par do
     * núcleo) e, para o passo com `pinFromYesterday`, o compromisso que o 🌙 deixou.
     * Por quê: a borda das fontes puras de `sugestoesDoPasso.ts` (§5.5); o porquê da ação vem dos
     * pesos de `pesos_decisao.json`, pela `scoreTask` de sempre (nenhum peso declarado aqui).
     * Entra → sai: as variáveis da rodada e o passo → o contexto. Cada leitura que falha fica
     * vazia (a fonte que depende dela devolve `null`).
     */
    async contextoDasSugestoes(variables: any, step?: any): Promise<ContextoDaSugestao> {
        const moment = (window as any).moment;
        const dia = this.getContextDate().format('YYYY-MM-DD');
        const hoje = moment().format('YYYY-MM-DD');
        const semanaAlvo = ehSemana(String(variables?._target_week ?? '')) ? String(variables._target_week) : this.getTargetWeekDate(variables).format('GGGG-[W]WW');
        const semanaDoDia = ehSemana(String(variables?._context_week ?? '')) ? String(variables._context_week) : this.getContextDate().format('GGGG-[W]WW');
        const fmDe = (file: any) => this.app.metadataCache?.getFileCache?.(file)?.frontmatter ?? null;
        const arquivos: TFile[] = this.app.vault.getMarkdownFiles?.() || [];
        const tarefas = arquivos.filter(f => f.path.startsWith('TaskNotes/Tasks/') || f.path.startsWith('TaskNotes/Archive/'))
            .map(f => taskUnitFrom(fmDe(f), f.path));
        const pontos = new Map<string, PontosDaTarefa>();
        const tree: any = this.plugin?.nowTree;
        if (typeof tree?.loadWeights === 'function' && typeof tree?.decisionContext === 'function') {
            try {
                const { table } = await tree.loadWeights();
                const decisao = await tree.decisionContext(tarefas, { hoje: dia });
                const relacoes = buildTaskRelations(tarefas);
                for (const unit of tarefas) {
                    if (isClosedUnit(unit)) continue;
                    const score = scoreTask(unit, decisao, table, relacoes);
                    pontos.set(unit.path, { pontos: score.pontos, motivo: nowReasonLine({ motivos: score.motivos, marcas: [] }) });
                }
            } catch (e) {
                console.error('DFM sugestões do passo: os pesos não foram lidos', e);
                pontos.clear();
            }
        }
        let temporada: string[] = [];
        const trimestre = quarterOfWeek(semanaAlvo);
        if (trimestre) {
            const nota = this.app.vault.getAbstractFileByPath(`${QUARTERLY_DIR}/${trimestre}.md`);
            if (nota instanceof TFile) temporada = temporadaFrom(fmDe(nota));
        }
        let estadias: ContextoDaSugestao['estadias'] = null;
        try {
            const dias: Record<string, { caminho: string; campos: Record<string, unknown> }> = {};
            const cidades: Array<{ caminho: string; nome: string; campos: Record<string, unknown> }> = [];
            for (const f of arquivos) {
                const fm = fmDe(f);
                if (!fm) continue;
                if (f.path.startsWith(`${CANONICAL_DAYMISS_DIR}/`) && DIA.test(f.basename) && fm.cidade) dias[f.basename] = { caminho: f.path, campos: fm };
                if (fm.type === 'hub_cidade') cidades.push({ caminho: f.path, nome: f.basename, campos: fm });
            }
            estadias = lerEstadias(dias, cidades);
        } catch (e) {
            estadias = null;
        }
        let valorDaSemana: ContextoDaSugestao['valorDaSemana'] = null;
        const nucleo: any = this.plugin?.nucleo;
        if (typeof nucleo?.parDaSemana === 'function') {
            try {
                const par = await nucleo.parDaSemana(semanaDoDia);
                const nome = par?.padrao?.valor;
                if (nome) valorDaSemana = { nome: String(nome), daNota: Boolean(par?.daNota?.valor && par.daNota.valor === nome) };
            } catch (e) {
                valorDaSemana = null;
            }
        }
        const left = step?.pinFromYesterday ? this.leftCommitment(step.pinFromYesterday) : null;
        return {
            hoje, dia, semanaAlvo, semanaDoDia, tarefas, pontos, temporada, estadias, valorDaSemana,
            deixada: left ? { nome: left.name, quando: left.when } : null,
        };
    }

    /**
     * O que faz: o passo `herancaDoTrimestre` com o texto da Herança no corpo da pergunta:
     * o trimestre planejado, a lição, o ajuste mínimo e a palavra da revisão do trimestre
     * anterior e os projetos do foco dele que seguem (`herancaDoFoco`, `herancaText`).
     * Por quê: a revisão de um ciclo é a primeira tela do planejamento do seguinte
     * (proposta de 27/10, 2.5 e 4.2, passo 0).
     * Erro e ataque: sem revisão nem projetos, o texto diz isso em palavras.
     * Prova: tests/engine/trimestrePadrao.test.ts ("a Herança primeiro").
     */
    withQuarterInheritance(step: any, variables: any): any {
        try {
            const alvo = this.getTargetQuarterDate(variables).format('YYYY-[Q]Q');
            const anterior = shiftQuarter(alvo, -1);
            if (!anterior) return step;
            const files: TFile[] = this.app?.vault?.getMarkdownFiles?.() ?? [];
            const fmOf = (f: TFile) => this.app.metadataCache?.getFileCache?.(f)?.frontmatter ?? {};
            const review = quarterReviewOf(files
                .filter(f => f.basename.includes(anterior) || String(fmOf(f).type ?? '') === 'quarterly_review')
                .map(f => ({ path: f.path, basename: f.basename, frontmatter: fmOf(f) })), anterior);
            // O foco é da nota do trimestre (Passo 0 da Missão, 0c): a lista do anterior,
            // sem os que a revisão dele cortou, só os projetos que seguem ativos.
            const fold = (name: string) => String(name ?? '').normalize('NFC').toLowerCase();
            const ativos = new Set(files
                .filter(f => f.path.startsWith('100 - AREAS/'))
                .filter(f => {
                    const fm = fmOf(f);
                    return fm.status === 'active' && ['iniciativa', 'projeto', 'departamento'].includes(String(fm.type ?? ''));
                })
                .map(f => fold(noteLinkName(f))));
            const carregando = herancaDoFoco({
                foco: this.quarterFocusNames(anterior),
                cortes: linkNames(review?.frontmatter?.projetos_cortes),
                ativo: name => ativos.has(fold(name)),
            });
            const body = [`Planejando o ${alvo}.`, herancaText({ anterior, review: review?.frontmatter ?? null, reviewName: review?.basename ?? null, carregando })].join('\n');
            return { ...step, prompt: `${String(step.prompt ?? '')}\n${body}` };
        } catch (e) {
            console.error('DFM herancaDoTrimestre:', e);
            return step;
        }
    }

    /**
     * Retorna uma cópia do passo com o contexto da nota escolhida embutido na pergunta.
     * `contextFrom: { variable, property, label, emptyLabel }` lê `{variable}_prop_{property}`
     * e acrescenta uma linha ao prompt — `{value}` é substituído pelo valor encontrado.
     * Sem valor, cai no `emptyLabel` (ou não escreve nada).
     */
    applyStepContext(step: any, variables: any) {
        const cfg = step?.contextFrom;
        if (!cfg?.variable || !cfg?.property) return step;

        const raw = variables[`${cfg.variable}_prop_${cfg.property}`];
        const hasValue = raw !== undefined && raw !== null && String(raw).trim() !== "";
        const line = hasValue
            ? String(cfg.label || "{value}").replace(/\{value\}/g, () => String(raw))
            : String(cfg.emptyLabel || "");
        if (!line) return step;

        return { ...step, prompt: step.prompt ? `${step.prompt}\n\n${line}` : line };
    }

    /**
     * `countFrom: { criteria, label }` — quantas notas atendem ao critério, como linha
     * de contexto na pergunta (`{count}` no rótulo; tokens resolvidos). Ex.: o "criar
     * outra SMART?" mostra quantas a semana-alvo já tem; antes era preciso contar de
     * cabeça, com a nota da semana nem à vista. Contexto, não decisão.
     */
    async applyStepCount(step: any, variables: any) {
        const cfg = step?.countFrom;
        if (!cfg?.criteria || !cfg?.label) return step;
        let count = 0;
        try {
            count = (await this.getFilesByCriteria(cfg.criteria, variables)).length;
        } catch (e) {
            return step;
        }
        const line = this.processTemplate(String(cfg.label), variables).replace(/\{count\}/g, String(count));
        return { ...step, prompt: step.prompt ? `${step.prompt}\n\n${line}` : line };
    }

    /**
     * Opções que dependem do contexto. `options` e `optionValues` (lista paralela,
     * mesma posição) passam pelos tokens (`{{date:…}}`, `{{weekday:VAR:N:FMT}}`):
     * a pergunta pode mostrar "seg 19/10" e gravar `2026-10-19`. Com
     * `hidePastDates: true`, sai a opção cujo valor é uma data anterior a hoje.
     * Passo sem `optionValues` e sem token nas opções volta intacto.
     */
    applyStepOptions(rawStep: any, variables: any) {
        const step = withOptionsWhen(rawStep, variables);
        const options = Array.isArray(step?.options) ? step.options : null;
        const values = Array.isArray(step?.optionValues) ? step.optionValues : null;
        if (!options || (!values && !options.some((o: any) => String(o).includes('{{')))) return step;
        const render = (v: any) => (typeof v === 'string' && v.includes('{{') ? this.processTemplate(v, variables) : v);
        let labels: any[] = options.map(render);
        let rendered: any[] | null = values ? values.map(render) : null;
        if (rendered && step.hidePastDates) {
            const today = window.moment().format('YYYY-MM-DD');
            const keep = rendered.map(v => !(typeof v === 'string' && DIA.test(v) && v < today));
            labels = labels.filter((_, i) => keep[i]);
            rendered = rendered.filter((_, i) => keep[i]);
        }
        // `onlyWeekOf: "VAR"`: sai a opção cuja data cai fora da semana em `VAR` (a da
        // SMART). Sem isto, "📅 Hoje" numa SMART da semana seguinte gravava `scheduled`
        // numa semana e `week` em outra, e a grade punha a ação em "sem dia".
        // `todayOptions: N`: as N primeiras opções são atalhos do relógio (Hoje, Amanhã);
        // com hoje fora da semana, saem juntas — os dias seg…dom já cobrem a semana, e
        // `🌅 Amanhã · 19/10` ao lado de `seg 19/10` só repetia o dia.
        if (rendered && typeof step.onlyWeekOf === 'string') {
            const start = this.weekStartFromVar(variables, step.onlyWeekOf);
            const first = start.format('YYYY-MM-DD');
            const last = start.clone().add(6, 'days').format('YYYY-MM-DD');
            const todayReal = window.moment().format('YYYY-MM-DD');
            const todayOutside = todayReal < first || todayReal > last;
            const shortcuts = Number(step.todayOptions) || 0;
            const keep = rendered.map((v, i) => {
                if (todayOutside && i < shortcuts) return false;
                return !(typeof v === 'string' && DIA.test(v) && (v < first || v > last));
            });
            labels = labels.filter((_, i) => keep[i]);
            rendered = rendered.filter((_, i) => keep[i]);
        }
        return { ...step, options: labels, ...(rendered ? { optionValues: rendered } : {}) };
    }

    /**
     * `{{hoje:FMT}}` e `{{amanha:FMT}}` — o dia do RELÓGIO, não o de contexto. Com a
     * nota da W43 aberta no domingo 18/10, `{{date}}` é a segunda 19/10; o "📅 Hoje"
     * do ⚡ mostrava 19/10 e gravava segunda-feira.
     */
    resolveRealDateTokens(text: string): string {
        return resolveClockTokens(text, () => (window as any).moment());
    }

    /**
     * Semana (AAAA-Www) guardada em `key`, ou a semana sendo planejada se a variável
     * estiver vazia ou inválida — a mesma regra de `{{weekday:VAR:N:FMT}}`.
     */
    weekStartFromVar(variables: any, key: string) {
        return weekStartFromValue(key ? variables?.[key] : '', (window as any).moment, () => this.getPlanWeekDate()) as any;
    }

    /** O valor de máquina da opção escolhida; opção fora da lista → `''`. */
    optionValueFor(uiStep: any, answer: any): any {
        const index = Array.isArray(uiStep?.options) ? uiStep.options.indexOf(answer) : -1;
        const value = index >= 0 && Array.isArray(uiStep.optionValues) ? uiStep.optionValues[index] : undefined;
        return value === undefined || value === null ? '' : value;
    }

    /**
     * `{{weekday:VAR:N:FMT}}` — o dia N (1 = segunda … 7 = domingo) da semana
     * guardada em `VAR` (`AAAA-Www`, ex.: `tarefa_smart_prop_week`); VAR vazia ou
     * inválida → a semana sendo planejada (`{{planweek}}`). É o que deixa a
     * pergunta "em que dia?" oferecer os dias da semana da SMART escolhida.
     */
    resolveWeekdayTokens(text: string, variables: any): string {
        return resolveWeekdayTokens(text, key => this.weekStartFromVar(variables, key));
    }

    async suggestNote(step: any, showBack = false): Promise<any> {
        if (step?.nowTree) return this.suggestNow(step, showBack);
        // `rankWith: "<domínio>"` (núcleo, 21/10): as candidatas na ordem da função de
        // escolher, com a linha dos motivos. Sem a chave, nada muda.
        const ranker = typeof step?.rankWith === 'string' && step.rankWith ? await this.choiceRankerFor(step.rankWith) : null;
        for (;;) {
            const result = await this.openNoteSuggester(ranker ? { ...step, choiceRanker: ranker } : step, showBack);
            if (ranker && result?.status === 'submit' && result.item?.path) {
                // O porquê da escolha fica na rodada, como no gesto: `{id}_motivo`, `{id}_pontos`.
                const chosen = ranker.last.find(item => item.path === result.item.path);
                return { ...result, vars: { motivo: chosen?.motivo ?? '', pontos: chosen?.pontos ?? 0 } };
            }
            if (result.status !== 'create') return result;

            // O seletor devolve o texto já digitado; sem texto, pergunta o nome agora.
            // O ⬅️ Voltar desse nome reabre o seletor de onde a pessoa veio (o passo
            // ainda não está no histórico do run(): devolver 'back' pularia para o
            // passo anterior).
            let title = typeof result.value === 'string' ? result.value.trim() : "";
            if (!title) {
                const asked = await this.prompt(
                    step.createPrompt || "✍️ Qual o nome da nova nota?",
                    step.createPlaceholder || "Descreva de forma concreta...",
                    true
                );
                if (asked.status === 'back') continue;
                if (asked.status !== 'submit') return asked;
                title = String(asked.value || "").trim();
            }
            if (!title) return { status: 'cancel' };

            const made = await this.createNoteFromStep(step, title);
            if (!made) return { status: 'cancel' };
            // `created`: a nota nasceu neste passo (não era uma existente com o mesmo
            // nome). O `updateSelectedNote.ifCreated` do protocolo só vale para ela.
            return { status: 'submit', value: made.file.basename, display: `[[${made.file.basename}]]`, item: made.file, created: made.created };
        }
    }

    /**
     * O que faz: `sugestaoDaSemana: "valor" | "relacao"` num `suggest_note` (o 🌳, 25/10/2026):
     * o valor do grupo que vale para a semana-alvo (`_target_week`) abre a lista como
     * resposta padrão (Enter aceita) e o prompt diz qual é. É o da nota da semana, quando
     * ela já tem; senão, a sugestão do núcleo (`nucleo.parDaSemana`: sorteio com peso pela
     * ordem do trimestre, sem repetir a semana anterior, fixo para a semana). Escolher
     * outro é o uso normal. Sem a chave, sem o núcleo ou sem sugestão, o passo fica como está.
     */
    async withWeekValueDefault(step: any, variables: any): Promise<any> {
        const grupo = step?.sugestaoDaSemana;
        if (grupo !== 'valor' && grupo !== 'relacao') return step;
        const nucleo: any = this.plugin?.nucleo;
        if (typeof nucleo?.parDaSemana !== 'function') return step;
        let par: any = null;
        try { par = await nucleo.parDaSemana(String(variables?._target_week ?? '')); } catch (e) { par = null; }
        const nome = par?.padrao?.[grupo];
        if (!nome) return step;
        const daNota = par?.daNota?.[grupo] && par.daNota[grupo] === nome;
        const origem = daNota ? 'o que a nota da semana já tem' : 'sugestão desta semana';
        return {
            ...step,
            defaultNote: nome,
            prompt: `${String(step.prompt ?? '')}\n⭐ ${nome} (${origem}): Enter aceita; escolher outro é uso normal.`,
        };
    }

    /**
     * O que faz: o ordenador do passo `rankWith`: lê o modelo do domínio e os pontos dele
     * (pelo serviço do núcleo) e devolve a função que transforma as notas candidatas do
     * seletor nas linhas da escolha. `last` guarda as linhas da última chamada (o motivo
     * e os pontos da nota escolhida). Modelo que não abre → `null` e um aviso: a lista
     * segue na ordem de sempre. Problema menor (um ponto faltando) só avisa.
     */
    async choiceRankerFor(dominio: string): Promise<((files: TFile[]) => ChoiceRankItem[]) & { last: ChoiceRankItem[] } | null> {
        const nucleo: any = this.plugin?.nucleo;
        if (!nucleo?.loadDomain) return null;
        let load: any;
        try { load = await nucleo.loadDomain(dominio); } catch (e) { load = { modelo: null, problemas: ['o modelo não foi lido'] }; }
        if (Array.isArray(load?.problemas) && load.problemas.length) {
            const tail = load.modelo ? 'o que falta vale 0' : 'a lista segue na ordem de sempre';
            new Notice(`⚠️ Escolha por pesos (${dominio}): ${load.problemas.slice(0, 3).join('; ')} — ${tail}.`, 8000);
        }
        if (!load?.modelo) return null;
        const contexto = nucleo.contextOf(load.modelo);
        const rank: any = (files: TFile[]) => {
            const candidatos = (files || []).map(file => ({
                id: file.path,
                titulo: file.basename,
                campos: this.app.metadataCache.getFileCache(file)?.frontmatter || {},
            }));
            rank.last = choiceRankItems(escolher(candidatos, load.modelo.escolher, load.tabela, contexto));
            return rank.last;
        };
        rank.last = [];
        return rank;
    }

    /**
     * A árvore do agora no passo `suggest_note` (`nowTree: {}`; arquitetura 4.2):
     * 1. "🧭 Onde estou agora?" (os 6 contextos, o último usado primeiro);
     * 2. "⏳ Quanto tempo tenho?" (15 min, 30 min, 1 h, 2 h ou mais; o último primeiro);
     * 3. a lista do que cabe, pela ordem da tabela de pesos, com a linha do porquê, as 3
     *    primeiras em destaque, as "📥 a triar" no fim e "✨ Trabalhar numa tarefa nova",
     *    que abre o formulário do TaskNotes e torna a tarefa salva a escolhida.
     * O ⬅️ Voltar de cada pergunta volta à anterior. O resultado leva em `vars` o lugar,
     * o tempo e o porquê, que o run() grava como `{id}_lugar`, `{id}_tempo`,
     * `{id}_tempo_min`, `{id}_motivo` e `{id}_pontos`.
     * Sem o serviço (`plugin.nowTree`), o passo volta a ser o seletor comum.
     */
    async suggestNow(step: any, showBack = false): Promise<any> {
        const tree: any = this.plugin?.nowTree;
        if (!tree) {
            const { nowTree: _ignored, ...plain } = step || {};
            return this.suggestNote(plain, showBack);
        }
        const cfg = step.nowTree && typeof step.nowTree === 'object' ? step.nowTree : {};
        const hoje = this.getContextDate().format('YYYY-MM-DD');
        let last: { lugar?: string; bloco_min?: number | null } = {};
        try { last = (await tree.lastChoices(hoje)) || {}; } catch (e) { last = {}; }
        let phase = 0;
        let lugar = '';
        let tempo: ReturnType<typeof timeChoiceOf> = null;
        for (;;) {
            if (phase === 0) {
                const asked = await this.suggest(placeOptions(last.lugar), cfg.placePrompt || NOW_PLACE_PROMPT, showBack, cfg.placeInfo || NOW_PLACE_INFO);
                if (asked?.status !== 'submit') return asked;
                lugar = String(asked.value);
                phase = 1;
                continue;
            }
            if (phase === 1) {
                const asked = await this.suggest(timeOptions(last.bloco_min), cfg.timePrompt || NOW_TIME_PROMPT, true, cfg.timeInfo || NOW_TIME_INFO);
                if (asked?.status === 'back') { phase = 0; continue; }
                if (asked?.status !== 'submit') return asked;
                tempo = timeChoiceOf(asked.value);
                phase = 2;
                continue;
            }
            // `tipo`: tarefa ou hábito (o 🔁 em treino, 2.29); o "⏱️ Quando?" e a gravação leem.
            const vars = { lugar, tempo: tempo?.label ?? '', tempo_min: tempo?.minutes ?? '', tipo: 'tarefa' };
            // A tarefa já veio escolhida (o 🤝 do canvas): sem a lista. O porquê dos pesos
            // que veio com ela fica (`{id}_motivo`, `{id}_pontos` não são tocados).
            if (step.nowPreChosen) {
                const chosen = step.nowPreChosen;
                const item = chosen.path ? this.app.vault.getAbstractFileByPath(String(chosen.path)) : null;
                return {
                    status: 'submit',
                    value: chosen.value,
                    display: chosen.display ?? `[[${chosen.value}]]`,
                    ...(item instanceof TFile ? { item } : {}),
                    vars,
                };
            }
            let ranking: any;
            try {
                const left = this.leftCommitment(step.pinFromYesterday);
                ranking = await tree.rank({
                    hoje,
                    lugar,
                    blocoMin: tempo?.minutes ?? null,
                    tempoCap: tempo ? tempo.cap : null,
                    folder: step.folder,
                    pinned: left ? [left.name] : [],
                    pinnedWhen: left?.when,
                });
            } catch (e) {
                console.error('DFM árvore do agora:', e);
                ranking = { sugestoes: [], aTriar: [], problemas: ['a lista não foi montada'] };
            }
            if (Array.isArray(ranking?.problemas) && ranking.problemas.length) {
                new Notice(`⚠️ Tabela de pesos: ${ranking.problemas.slice(0, 3).join(', ')} vale 0 até ser corrigido.`, 6000);
            }
            const items = [...(ranking?.sugestoes || []), ...(ranking?.aTriar || [])];
            const result = await this.openNoteSuggester({
                ...step,
                limit: Math.max(Number(step.limit) || 0, items.length, 1),
                nowRanking: { items, newTaskLabel: cfg.newTaskLabel || NOW_NEW_TASK_LABEL },
                pinFromYesterday: undefined,
                preferProperty: undefined,
            }, true);
            if (result?.status === 'back') { phase = 1; continue; }
            if (result?.status === 'newtask') {
                const typed = typeof result.value === 'string' ? result.value.trim() : '';
                const mae = await this.chooseNewTaskParent(tree, hoje);
                if (mae === null) continue; // fechou a escolha: volta à lista
                const path = await tree.createTaskWithForm({
                    contexts: lugar ? [lugar] : [],
                    timeEstimate: tempo?.minutes ?? undefined,
                    projects: mae ? [mae] : [],
                    ...(typed ? { title: typed } : {}),
                });
                const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
                if (!(file instanceof TFile)) continue; // fechou sem salvar: volta à lista
                return {
                    status: 'submit', value: file.basename, display: `[[${file.basename}]]`, item: file, created: true,
                    vars: { ...vars, motivo: '✨ tarefa nova', pontos: 0 },
                };
            }
            if (result?.status === 'create') {
                // `allowCreate` no mesmo passo: a criação por nome continua valendo.
                const title = typeof result.value === 'string' ? result.value.trim() : '';
                const made = title ? await this.createNoteFromStep(step, title) : null;
                if (!made) continue;
                return { status: 'submit', value: made.file.basename, display: `[[${made.file.basename}]]`, item: made.file, created: made.created, vars: { ...vars, motivo: '', pontos: 0 } };
            }
            if (result?.status !== 'submit') return result;
            const chosen = items.find((item: any) => item.path === result.item?.path);
            return {
                ...result,
                vars: {
                    ...vars,
                    tipo: chosen?.tipo === 'habito' ? 'habito' : 'tarefa',
                    motivo: chosen ? nowReasonLine(chosen) : '',
                    pontos: chosen ? Math.round(chosen.pontos * 10) / 10 : 0,
                },
            };
        }
    }

    /**
     * O que faz: antes do formulário da tarefa nova (✨), pergunta "De qual SMART?": as SMART
     * da semana (a da vez primeiro), "➖ Nenhuma, solta" e "📁 Outro projeto" (abre a lista
     * de projetos ativos). Devolve o nome da mãe, "" para solta, ou null se fechou.
     * Por quê: decisão de 19/10 ("Talvez se desse as opções de smart da semana para colocar
     * ou nao fosse melhor"); a escolha é dele, e o formulário nunca recebe a Day como projeto.
     */
    private async chooseNewTaskParent(tree: any, hoje: string): Promise<string | null> {
        const OUTRO = '📁 Outro projeto';
        const SOLTA = '➖ Nenhuma, solta';
        const pick = async (items: string[], prompt: string, info?: string): Promise<string | null> => {
            const r: any = await this.suggest(items, prompt, false, info);
            return r?.status === 'submit' && typeof r.value === 'string' ? r.value : null;
        };
        const smarts: string[] = typeof tree?.smartsDaSemana === 'function' ? tree.smartsDaSemana(hoje) : [];
        const escolha = await pick([...smarts.map(n => `🎯 ${n}`), SOLTA, OUTRO], '✨ De qual SMART é a tarefa nova?', 'A da vez vem primeiro. O formulário do TaskNotes abre com a escolha no projeto.');
        if (escolha === null) return null;
        if (escolha === SOLTA) return '';
        if (escolha === OUTRO) {
            const projetos: string[] = typeof tree?.projetosAtivos === 'function' ? tree.projetosAtivos() : [];
            const projeto = await pick(projetos, '📁 De qual projeto?');
            return projeto === null ? null : projeto;
        }
        return escolha.replace(/^🎯 /, '');
    }

    /**
     * "📖 Pelo diário" (`multiselect` com `fromDiary`; o 🌙, em teste, plano de 22/10): lê
     * o diário da Day do dia da rodada e mostra, para marcar com um toque cada, as tarefas
     * da semana e os hábitos em treino que o texto cita (`opcoesDoDiario`). O que ele marcar
     * conclui no dia que está sendo fechado ou recebe a marca do dia (`aplicarDiario`); nada é
     * marcado sem o toque. Sem o serviço, sem texto ou sem nada citado → `{ status: 'skip' }`:
     * o passo não aparece.
     */
    async diaryStep(step: any, showBack = false, previousValue?: string): Promise<any> {
        const dia = this.getContextDate().format('YYYY-MM-DD');
        const options = await this.opcoesDoDiario(dia);
        if (!options || options.length === 0) return { status: 'skip' };
        const labels = options.map(option => option.label);
        const result: any = await this.multiSelect(labels, step.prompt, showBack, previousValue, step.info);
        if (result?.status !== 'submit') return result;
        return this.aplicarDiario(options, result, dia);
    }

    /**
     * O que faz: as opções do "📖 Pelo diário" de um dia: as tarefas da semana e os hábitos em
     * treino que o diário da Day cita (`plugin.diario.reading` + `diaryOptions`), cada uma com o
     * rótulo, o tipo e o caminho.
     * Por quê: P12a da Missão (follow-up 1 do P11): o modal e o formulário mostram as mesmas
     * opções, da mesma função; o 🌙 cabe inteiro no formulário (§5.5).
     * Entra → sai: o dia `AAAA-MM-DD` → as opções (`[]` sem nada citado), ou `null` sem o serviço
     * ou com a leitura que falhou (o passo não aparece, nos dois casos).
     * Prova: tests/engine/protocolForm.test.ts ("o 📖 Pelo diário pelo formulário").
     */
    async opcoesDoDiario(dia: string): Promise<Array<{ label: string; tipo: 'tarefa' | 'habito'; path: string }> | null> {
        const diario: any = this.plugin?.diario;
        if (typeof diario?.reading !== 'function') return null;
        try {
            return diaryOptions((await diario.reading(dia)) || { tarefas: [], habitos: [] });
        } catch (e) {
            console.error('DFM 📖 Pelo diário:', e);
            return null;
        }
    }

    /**
     * O que faz: grava o que foi marcado no "📖 Pelo diário": a tarefa marcada conclui no dia que
     * está sendo fechado (`diaryCompletionWhen`: o relógio vai junto só para o mesmo dia), o
     * hábito marcado recebe a marca do dia (`plugin.diario.applyReading`), com o aviso; e devolve
     * a resposta do passo (os rótulos marcados, ou "Nenhum").
     * Por quê: a gravação do meio da pergunta do 🌙, numa função só: o modal a chama ao confirmar
     * o passo, e o `run()` a chama no mesmo ponto do laço quando o passo veio respondido pelo
     * formulário (`_respondidos`). Assim as mesmas marcas gravam o mesmo, na mesma ordem (P12a).
     * Entra → sai: as opções do dia, a resposta (`value` "A, B" ou `values`) e o dia → o resultado
     * do passo (`status: 'submit'`). Só o rótulo que está nas opções do momento conta.
     * Erro e ataque: rótulo que o diário não cita mais é ignorado (nada se grava por ele); a falha
     * de uma gravação fica no serviço, que segue com as outras.
     * Prova: tests/engine/protocolForm.test.ts ("o 📖 Pelo diário pelo formulário").
     */
    async aplicarDiario(options: Array<{ label: string; tipo: 'tarefa' | 'habito'; path: string }>, result: { value?: unknown; values?: unknown }, dia: string): Promise<{ status: 'submit'; value: string; display: string }> {
        const labels = options.map(option => option.label);
        const chosen = chosenDiaryLabels(result, labels);
        const selected = options.filter(option => chosen.includes(option.label));
        if (selected.length) {
            const diario: any = this.plugin?.diario;
            const now = (window as any).moment();
            const done = await diario.applyReading(selected.map(option => ({ tipo: option.tipo, path: option.path })), dia,
                { date: now.format('YYYY-MM-DD'), time: now.format('HH:mm') });
            new Notice(diaryNoticeText(done), 5000);
        }
        const value = selected.length ? selected.map(option => option.label).join(', ') : 'Nenhum';
        return { status: 'submit', value, display: value };
    }

    /**
     * O passo da árvore do agora chegou com a tarefa já escolhida (o 🤝 Fazer agora do
     * nó no canvas, `doNowVariables`), mas sem onde e quanto tempo? Então pergunta só as
     * duas primeiras fases (`suggestNow` com `nowPreChosen`). Sem o serviço, nada a fazer.
     */
    needsNowPlaceTime(step: any, variables: any): boolean {
        return step?.type === 'suggest_note'
            && Boolean(step.nowTree)
            && Boolean(this.plugin?.nowTree)
            && typeof variables?.[`${step.id}_path`] === 'string'
            && variables[`${step.id}_path`] !== ''
            && variables[`${step.id}_lugar`] === undefined;
    }

    /**
     * `pauseFront: { exceptVar, condition? }` (raiz do protocolo; o 🔀 Mudei de frente):
     * as frentes em andamento que ficam em pausa — a do bloco aberto ou a do pomodoro em
     * curso, nunca a escolhida agora (`exceptVar`). Grava os nomes em `frente_pausada`
     * (`[[nome]]`, para a linha da Day). Só lê; sem o serviço, nenhuma.
     */
    async frontsToPause(config: any, variables: any): Promise<string[]> {
        try {
            const except = String(variables?.[config?.exceptVar] ?? '');
            let paths: string[] = (await this.plugin?.nowTree?.frontToPause?.(except || undefined)) || [];
            // Mais de uma frente em andamento: a pessoa diz qual fica em pausa.
            if (paths.length > 1) paths = await this.choosePausedFronts(paths);
            const names = paths.map(path => String(path).split('/').pop()!.replace(/\.md$/, ''));
            if (names.length) variables.frente_pausada = names.map(name => `[[${name}]]`).join(', ');
            return paths;
        } catch (e) {
            console.error('DFM 🔀 frente anterior:', e);
            return [];
        }
    }

    /**
     * O que faz: com mais de uma frente em andamento, pergunta qual fica em pausa (uma
     * delas, todas, ou nenhuma). Fechar sem escolher não pausa nada.
     */
    async choosePausedFronts(paths: string[]): Promise<string[]> {
        const names = paths.map(path => String(path).split('/').pop()!.replace(/\.md$/, ''));
        const result = await this.suggest([...names, PAUSE_ALL_FRONTS, PAUSE_NO_FRONT], PAUSE_WHICH_PROMPT, false, PAUSE_WHICH_INFO);
        if (result?.status !== 'submit' || result.value === PAUSE_NO_FRONT) return [];
        if (result.value === PAUSE_ALL_FRONTS) return paths;
        const index = names.indexOf(String(result.value));
        return index >= 0 ? [paths[index]] : [];
    }

    /** A pausa das frentes lidas em `frontsToPause` (próxima ação, sem data). Falha não perde o registro. */
    async pauseFronts(paths: string[]): Promise<void> {
        try {
            await this.plugin?.nowTree?.pauseFront?.(paths);
        } catch (e) {
            console.error('DFM 🔀 pausa da frente anterior:', e);
            new Notice('⚠️ A frente anterior não foi pausada; a tarefa nova e a linha na Day seguem.', 5000);
        }
    }

    /**
     * `openBlock: { pathVar, placeVar, minutesVar, condition? }` (raiz do protocolo): a
     * tarefa escolhida vira o bloco aberto (o pomodoro do TaskNotes nela e a linha da
     * reputação contextual), pelo serviço `plugin.nowTree`. A pasta é a das tarefas.
     */
    async openBlockFromVariable(config: any, variables: any): Promise<void> {
        try {
            const path = String(variables?.[config?.pathVar] ?? '');
            // A tarefa, ou o hábito escolhido no gesto (o 🔁 em treino, 2.29).
            if (!path.startsWith('TaskNotes/Tasks/') && !path.startsWith(`${HABIT_TRACKER_FOLDER}/`)) return;
            const minutes = Number(variables?.[config?.minutesVar]);
            const result = await this.plugin?.nowTree?.openBlock?.({
                taskPath: path,
                lugar: String(variables?.[config?.placeVar] ?? ''),
                blocoMin: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
                dia: this.getContextDate().format('YYYY-MM-DD'),
            });
            if (result && result.pomodoro === false && !result.habito) {
                new Notice('ℹ️ O pomodoro do TaskNotes não começou: o bloco fica registrado com o tempo estimado.', 5000);
            }
        } catch (e) {
            console.error('DFM bloco aberto:', e);
            new Notice('⚠️ O bloco não foi registrado; a tarefa e a linha na Day seguem.', 5000);
        }
    }

    /**
     * Cria a nota que o próprio passo ofereceu criar (`allowCreate` + `createNote`).
     * A pasta vem da definição do passo, nunca do texto digitado, e uma nota existente
     * com o mesmo nome é reaproveitada em vez de duplicada.
     */
    async createNoteFromStep(step: any, rawTitle: string): Promise<{ file: TFile; created: boolean } | null> {
        try {
            const cfg = step.createNote || {};
            const folder = this.resolveFolderFilter(cfg.folder || step.folder);
            if (!folder) {
                new Notice("⚠️ Este passo não define pasta para criar a nota.");
                return null;
            }

            const title = this.sanitizeFilename(rawTitle).slice(0, 120);
            if (!title) return null;

            const path = `${folder}/${title}.md`;
            const existing = this.app.vault.getAbstractFileByPath(path);
            if (existing instanceof TFile) {
                new Notice("ℹ️ Já existia uma nota com esse nome — seguindo com ela.", 4000);
                return { file: existing, created: false };
            }

            if (!this.app.vault.getAbstractFileByPath(folder)) {
                try { await this.app.vault.createFolder(folder); } catch (e) { }
            }

            const localVars = { ...(step.id ? { [step.id]: title } : {}), titulo: title };
            const props: Record<string, any> = this.processProperties(cfg.properties || {}, localVars);
            // Tarefa criada no meio de um passo (a que falta no ▶️, o compromisso de
            // amanhã do 🌙, a da sessão de Deep Work) também nasce com onde dá para fazer.
            if (folder.startsWith('TaskNotes/') && props.contexts === undefined) {
                const contexts = taskContextsYaml(await this.resolveTaskContexts(cfg, localVars, title));
                if (contexts) props.contexts = contexts;
            }
            let content = "---\n";
            for (const [key, value] of Object.entries(props)) {
                if (value === "" || value === null || value === undefined) continue;
                content += `${key}: ${value}\n`;
            }
            content += "---\n\n";
            content += cfg.template ? this.processTemplate(cfg.template, localVars) : `# ${title}\n`;

            const file = await this.app.vault.create(path, content);
            new Notice(`✅ Nota criada: ${title}`, 4000);
            return { file: file as TFile, created: true };
        } catch (e) {
            console.error("DFM createNoteFromStep:", e);
            new Notice("⚠️ Não foi possível criar a nota.");
            return null;
        }
    }

    async openNoteSuggester(step: any, showBack = false): Promise<any> {
        return new Promise((resolve) => {
            const resolvedFolder = this.resolveFolderFilter(step.folder);
            const stepPrompt = typeof step.prompt === "string" ? step.prompt : "";
            // O passo de contexto genérico aceita qualquer nota e deixa pular (a mesma regra do formulário).
            const isGenericContextStep = ehPassoDeContextoGenerico(step);
            const preferredFolders = Array.isArray(step.preferredFolders)
                ? step.preferredFolders.map(folder => this.resolveFolderFilter(folder)).filter(Boolean)
                : [];
            const automaticPreferred = this.getAutomaticPreferredFolders();
            const mergedPreferredFolders = [...new Set([...automaticPreferred, ...preferredFolders])];

            const modal = new NoteSuggester(this.app, {
                folderFilter: resolvedFolder,
                preferredFolders: mergedPreferredFolders,
                allowAnyNote: step.allowAnyNote ?? isGenericContextStep,
                allowFreeText: step.allowFreeText ?? true,
                allowCreate: step.allowCreate ?? false,
                createLabel: step.createLabel || "➕ Criar uma nota nova",
                allowSkip: pulaNoSeletorDeNota(step),
                skipLabel: step.skipLabel || "⏭️ Seguir sem conectar contexto",
                limit: step.limit,
                // Opt-in por passo: o 📤 concluído vai para TaskNotes/Archive na hora, e o
                // "Qual tarefa 📤 saiu?" precisa achá-lo lá.
                excludeArchive: step.excludeArchive,
                stepPrompt,
                stepInfo: step.info,
                propertyFilter: this.resolvePropertyFilter(step.criteria?.property),
                pinnedBasenames: this.pinnedFromYesterday(step.pinFromYesterday),
                // A resposta padrão do passo (o par de valores da semana no 🌳): primeira
                // linha, antes do ⬅️ Voltar, para o Enter aceitar.
                defaultBasename: typeof step.defaultNote === 'string' && step.defaultNote ? step.defaultNote : null,
                preferredProperty: step.preferProperty?.key
                    ? { key: String(step.preferProperty.key), value: this.processTemplate(String(step.preferProperty.value ?? ''), {}) }
                    : null,
                nowRanking: step.nowRanking ?? null
            }, (result) => resolve(result), showBack);

            // Passo que depende de outro protocolo ter rodado antes (ex.: "qual prática
            // você executou?" antes de existir qualquer prática) abria um modal com zero
            // linhas e nenhuma explicação — só dava para apertar Esc e adivinhar o motivo.
            // Quando não há candidato NEM válvula de escape, o passo diz o que falta.
            // A árvore do agora sempre tem saída: "✨ Trabalhar numa tarefa nova".
            const semValvula = !modal.allowFreeText && !modal.allowCreate && !modal.allowAnyNote && !modal.allowSkip && !modal.nowRanking;
            if (semValvula && modal.getCandidateFiles().length === 0) {
                new Notice(
                    step.emptyMessage || `⚠️ Nada disponível em "${resolvedFolder}" para este passo ainda.`,
                    9000
                );
                // `onEmpty: "end"` (opt-in do passo): sem candidata, a rodada termina limpa,
                // só com o aviso. Sem a chave, segue o cancelamento de sempre (que guarda o
                // rascunho quando já há resposta).
                resolve({ status: step.onEmpty === 'end' ? 'end' : 'cancel' });
                return;
            }

            // `rankWith`: as candidatas do seletor na ordem da escolha, com os motivos.
            if (typeof step.choiceRanker === 'function') {
                modal.setChoiceRanking(step.choiceRanker(modal.getCandidateFiles()));
            }

            // Só a primeira linha vai para o campo de busca — o prompt completo já está
            // no cabeçalho do modal, onde dá para lê-lo.
            modal.setPlaceholder(String(step.prompt || "Selecione uma nota...").split('\n')[0]);
            modal.open();
        });
    }

    /**
     * `pinFromYesterday: "gatilho_amanha"` — o compromisso deixado pelo 🌙 abre a lista:
     * a nota que a última Day antes da data de contexto aponta nesse campo, pela mesma
     * regra da pauta (`lastLeftCommitment`): depois de um dia sem Day, vale a noite
     * anterior a ele; a noite mais recente que pulou o compromisso decide que não há.
     * Devolve o nome da nota e quando foi deixado ("ontem" ou `DD/MM`); sem nada, `null`.
     */
    leftCommitment(key: any): { name: string; when: string } | null {
        if (typeof key !== 'string' || !key) return null;
        try {
            const today = this.getContextDate().format('YYYY-MM-DD');
            const yesterday = this.getContextDate().clone().subtract(1, 'days').format('YYYY-MM-DD');
            const days = new Map<string, TFile>();
            const dayFolders = [`${CANONICAL_DAYMISS_DIR}/`, `${LEGACY_DAYMISS_DIR}/`];
            for (const file of this.app.vault.getMarkdownFiles?.() || []) {
                if (!DIA.test(file.basename) || file.basename >= today) continue;
                const inDayFolder = dayFolders.some(folder => file.path.startsWith(folder) && !file.path.slice(folder.length).includes('/'));
                if (inDayFolder && !days.has(file.basename)) days.set(file.basename, file);
            }
            const yesterdayFile = this.getDailyNoteFile(yesterday);
            if (yesterdayFile) days.set(yesterday, yesterdayFile);
            const found = lastLeftCommitment(
                [...days.entries()].map(([name, file]) => ({ name, value: this.app.metadataCache.getFileCache(file)?.frontmatter?.[key] })),
                today,
            );
            const name = found ? commitmentNoteName(found.raw) : null;
            return name && found ? { name, when: leftWhenLabel(found.dia, today) } : null;
        } catch (e) {
            return null;
        }
    }

    /** O nome da nota do compromisso deixado pelo 🌙 (`leftCommitment`), como lista; sem ele, vazia. */
    pinnedFromYesterday(key: any): string[] {
        const left = this.leftCommitment(key);
        return left ? [left.name] : [];
    }

    async suggestTask(step: any, showBack = false): Promise<any> {
        const tasks = await this.getPendingTasks(step.criteria || {});
        const items = [
            ...(showBack ? [{ isBack: true }] : []),
            { isCreate: true, label: step.createLabel || "✍️ Criar nova tarefa para esta sessão" },
            ...tasks
        ];

        return new Promise((resolve) => {
            const modal = new TaskSuggester(this.app, items, async (result) => {
                if (result.status === 'create') {
                    const created = await this.prompt(
                        step.createPrompt || "✍️ Qual a nova tarefa que você quer criar agora?",
                        step.createPlaceholder || "Descreva a tarefa de forma concreta...",
                        showBack
                    );

                    if (created.status !== 'submit') {
                        resolve(created);
                        return;
                    }

                    const taskText = created.value.trim();
                    if (!taskText) {
                        resolve({ status: 'cancel' });
                        return;
                    }

                    await this.captureTaskToDailyContext(taskText, step);
                    resolve({ status: 'submit', value: taskText });
                    return;
                }

                resolve(result);
            }, showBack);

            modal.setPlaceholder(step.prompt || "Selecione uma tarefa...");
            modal.open();
        });
    }

    async multiSelect(options: any[], promptText: string, showBack = false, initialValue?: string, info?: string): Promise<any> {
        return new Promise((resolve) => {
            new MultiSelectModal(this.app, promptText, options, (result) => resolve(result), showBack, initialValue, info).open();
        });
    }

    buildFallbackTemplate(variables: any) {
        const contextDate = this.getContextDate().format("YYYY-MM-DD HH:mm");
        const body = Object.entries(variables)
            .filter(([key, value]) => !key.startsWith('_') && value !== undefined && value !== null && value !== "")
            .map(([key, value]) => `- **${key}:** ${value}`);

        return [
            `# ${this.def.name || this.id}`,
            "",
            `> **Data:** ${contextDate}`,
            "",
            "## 📋 Registro",
            ...(body.length > 0 ? body : ["- Sem dados adicionais."]),
            "",
            "---",
            "*DFM Protocol*"
        ].join("\n");
    }

    async captureTaskToDailyContext(taskText: string, step: any = {}) {
        const contextDate = this.getContextDate();
        const targetDateStr = contextDate.format("YYYY-MM-DD");
        const taskStatus = step.taskStatus || "I";
        const targetHeader = step.targetHeader || "## 📝 Notas Rápidas";
        const entry = `- [${taskStatus}] ${taskText}`;
        let targetFile = this.getDailyNoteFile(targetDateStr);

        if (!targetFile) {
            targetFile = this.app.workspace.getActiveFile();
        }

        if (!targetFile) {
            new Notice("⚠️ Nenhum arquivo ativo para registrar a nova tarefa.");
            return;
        }

        const content = await this.app.vault.read(targetFile);
        const result = this._insertIntoDailyHeader(content, targetHeader, entry, taskText);
        if (result.inserted) {
            await this.app.vault.modify(targetFile, result.content);
            new Notice("✅ Nova tarefa adicionada ao contexto atual.");
        }
    }

    async saveNote(filename: string, content: string, properties: any = {}, previousNote: any = null, variables: any = {}) {
        // Allow variables to override targetFolder (Critical for Contextual Creation)
        let folderPath = this.resolveFolderPath(variables.targetFolder || this.targetFolder, variables);

        const fullPath = `${folderPath}/${filename}`;

        // Ensure folder exists
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            try {
                await this.app.vault.createFolder(folderPath);
            } catch (e) {
                // Ignore "Folder already exists" error race condition, but interrompa
                // a execução em qualquer outra falha para não pontuar uma nota ausente.
                if (!e.message.includes("exists")) {
                    throw new Error(`Não foi possível criar a pasta de destino (${folderPath}): ${e.message}`);
                }
            }
        }

        // Parse frontmatter from content if it already exists, to prevent duplication
        let templateProperties: Record<string, any> = {};
        let strippedContent = content;

        const trimmedContent = content.trimStart();
        if (trimmedContent.startsWith("---")) {
            const lines = trimmedContent.split("\n");
            let closingIndex = -1;
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim() === "---") {
                    closingIndex = i;
                    break;
                }
            }

            if (closingIndex !== -1) {
                const frontmatterLines = lines.slice(1, closingIndex);
                // Lista em bloco (`tags:` seguido de `  - weekly`) vira array da chave
                // anterior. Lida linha a linha como "chave: valor", a lista se perdia e a
                // Week nascia com `tags: ""` em vez da tag `weekly` do modelo.
                let lastKey: string | null = null;
                for (const line of frontmatterLines) {
                    const item = line.match(/^\s+-\s*(.*)$/);
                    if (item && lastKey) {
                        const current = templateProperties[lastKey];
                        const list = Array.isArray(current) ? current : [];
                        const cleanItem = item[1].trim().replace(/^['"]|['"]$/g, '');
                        if (cleanItem) list.push(cleanItem);
                        templateProperties[lastKey] = list;
                        continue;
                    }
                    const colonIndex = line.indexOf(":");
                    if (colonIndex !== -1) {
                        const key = line.substring(0, colonIndex).trim();
                        const value = line.substring(colonIndex + 1).trim();
                        // Remove leading/trailing quotes from parsed value if present
                        const cleanValue = value.replace(/^['"]|['"]$/g, '');
                        if (key) {
                            templateProperties[key] = cleanValue === '[]' ? [] : cleanValue;
                            lastKey = key;
                        }
                    }
                }
                strippedContent = lines.slice(closingIndex + 1).join("\n").trimStart();
            }
        }

        const mergedProperties = { ...templateProperties, ...properties };

        // Generate Frontmatter
        let fileContent = "";
        if (Object.keys(mergedProperties).length > 0) {
            fileContent += "---\n";
            for (const [key, value] of Object.entries(mergedProperties)) {
                if (key === 'impacto' && (value === '' || value === null || value === undefined)) {
                    // O impacto é número de 1 a 10 (os modelos da tarefa e da SMART); sem
                    // valor não se grava: o ⚡ herda o da SMART (`{{tarefa_smart_prop_impacto}}`),
                    // e a SMART sem impacto deixava `impacto:` vazio, onde antes não havia nada.
                    continue;
                } else if (key === 'contexts') {
                    // Onde dá para fazer: só o vocabulário; passo pulado não grava
                    // `contexts: ""` (o TaskNotes leria um contexto vazio).
                    const contexts = taskContextsFrom(value);
                    if (contexts.length > 0) {
                        fileContent += `${key}:\n`;
                        for (const item of contexts) fileContent += `  - "${item}"\n`;
                    }
                } else if (key === 'projects' || key === 'tags' || key === 'blockedBy' || key === 'blocking') {
                    // Check if it's already an array, or a comma-separated string
                    let arr: string[] = [];
                    if (Array.isArray(value)) {
                        arr = value;
                    } else if (typeof value === 'string') {
                        if (value.startsWith('[') && value.endsWith(']')) {
                            arr = value.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
                        } else if (value.trim() && value !== 'Nenhum' && value !== '""' && value !== '[]') {
                            arr = value.split(',').map(s => s.trim());
                        }
                    }
                    if (arr.length > 0 && arr[0] !== "") {
                        fileContent += `${key}:\n`;
                        for (const item of arr) {
                            const quoted = (item.startsWith('"') && item.endsWith('"')) ? item : `"${item}"`;
                            fileContent += `  - ${quoted}\n`;
                        }
                    } else if (key !== 'blockedBy' && key !== 'blocking') {
                        // Dependência vazia não é gravada: `blockedBy: ""` seria uma
                        // dependência sem nome (o 📤 da ⚡ sem 🔥 par escolhida).
                        fileContent += `${key}: ""\n`;
                    }
                } else if (Array.isArray(value)) {
                    // Lista do modelo (`objetivos: []`, `habilidades:` com itens): continua lista.
                    const items = value.filter(item => item !== null && item !== undefined && String(item) !== '');
                    if (items.length === 0) {
                        fileContent += `${key}: []\n`;
                    } else {
                        fileContent += `${key}:\n`;
                        for (const item of items) fileContent += `  - ${this.serializeYamlScalar(item)}\n`;
                    }
                } else {
                    fileContent += `${key}: ${this.serializeYamlScalar(value)}\n`;
                }
            }
            fileContent += "---\n\n";
        }

        // Adicionar link para nota anterior se existir
        if (previousNote) {
            fileContent += `> 🔗 **Continuação de:** [[${previousNote}]]\n\n`;
        }

        fileContent += strippedContent;

        try {
            const existingFile = this.app.vault.getAbstractFileByPath(fullPath);
            if (existingFile instanceof TFile && this.saveDef.onExisting === "suffix") {
                // Outra nota com o mesmo nome (a "Roteiro do vídeo" de outra SMART): a
                // nova nasce como "Nome (2)", como o createTask já faz. Preservar a antiga
                // deixava a ação nova sem nota e o 📤 par bloqueado pela tarefa errada.
                const base = filename.replace(/\.md$/, '');
                let n = 2;
                let candidate = `${folderPath}/${base} (${n}).md`;
                while (this.app.vault.getAbstractFileByPath(candidate)) candidate = `${folderPath}/${base} (${++n}).md`;
                const file = await this.app.vault.create(candidate, fileContent);
                new Notice(`✅ Nota criada: ${base} (${n}) — já havia uma "${base}".`);
                return file;
            }
            if (existingFile instanceof TFile) {
                if (this.saveDef.overwriteExisting === false) {
                    // Sinaliza para o run(): nada foi criado, então nada deve pontuar.
                    // Sem isto, rodar o protocolo 5x no mesmo dia preserva um registro
                    // mas concede recompensa cinco vezes.
                    variables._notePreserved = true;
                    new Notice(`ℹ️ Nota já existe e foi preservada: ${filename}`);
                    return existingFile;
                }
                if (this.saveDef.onExisting === "merge_frontmatter") {
                    // Nota de ciclo já em uso (semana/trimestre): reabrir o protocolo
                    // atualiza as propriedades e NÃO troca o corpo pelo modelo em branco.
                    // Sem isto, replanejar uma semana já escrita apagava foco, SMART e
                    // tudo o que tinha sido anotado nela.
                    // `onlyIfEmpty` (mesmo sentido do updateSelectedNote): o campo só é
                    // preenchido se a nota ainda não tem valor — registrar de novo uma pessoa
                    // não troca a lista de pendências dela por uma frase.
                    const onlyIfEmpty = new Set<string>(Array.isArray(this.def.onlyIfEmpty) ? this.def.onlyIfEmpty : []);
                    await this.app.fileManager.processFrontMatter(existingFile, (frontmatter: any) => {
                        for (const [key, value] of Object.entries(properties || {})) {
                            if (value === "" || value === null || value === undefined) continue;
                            if (Array.isArray(value) && value.length === 0) continue;
                            if (onlyIfEmpty.has(key)) {
                                const current = frontmatter[key];
                                const filled = Array.isArray(current) ? current.length > 0 : current !== undefined && current !== null && String(current).trim() !== "";
                                if (filled) continue;
                            }
                            // Tags somam: a nota que já tinha outras não perde nenhuma.
                            if (key === 'tags') {
                                const bare = (tag: any) => String(tag ?? '').trim().replace(/^#/, '');
                                const current = Array.isArray(frontmatter.tags) ? frontmatter.tags : (frontmatter.tags ? [frontmatter.tags] : []);
                                const merged = [...current];
                                for (const tag of Array.isArray(value) ? value : [value]) {
                                    if (bare(tag) && !merged.some(existing => bare(existing) === bare(tag))) merged.push(tag);
                                }
                                frontmatter.tags = merged;
                                continue;
                            }
                            frontmatter[key] = value;
                        }
                    });
                    variables._noteMerged = true;
                    // `onMergeAppend`: o que foi respondido agora entra num bloco datado no
                    // topo da nota. Sem isto, registrar de novo a mesma pessoa jogava fora
                    // insights e impressões do segundo encontro, que só existem no corpo.
                    const block = this.def.onMergeAppend ? this.renderMergeAppend(this.def.onMergeAppend, variables) : null;
                    if (block) {
                        const raw = await this.app.vault.read(existingFile);
                        await this.app.vault.modify(existingFile, this.insertBelowHeader(raw, block, existingFile.basename));
                        new Notice(`✅ ${filename} atualizada — o encontro de agora foi acrescentado no topo; o conteúdo que já existia foi mantido.`, 6000);
                    } else {
                        new Notice(`✅ ${filename} atualizada — o conteúdo que já existia foi mantido.`, 6000);
                    }
                    return existingFile;
                }
                await this.app.vault.modify(existingFile, fileContent);
                new Notice(`✅ Nota atualizada: ${filename}`);
                return existingFile;
            }
            const file = await this.app.vault.create(fullPath, fileContent);
            new Notice(`✅ Nota criada: ${filename}`);
            return file;
        } catch (error) {
            console.error(error);
            throw error;
        }
    }

    /**
     * O bloco de `onMergeAppend`: linha com resposta (`{{variável}}`) só fica se alguma
     * resposta dela veio preenchida; linha sem resposta (título, data) fica. Sem
     * nenhuma resposta preenchida, não há bloco (null).
     */
    renderMergeAppend(template: string, variables: any): string | null {
        let answered = 0;
        const kept = String(template).split('\n').filter(line => {
            const names = [...line.matchAll(/{{([a-zA-Z0-9_]+)}}/g)].map(m => m[1]);
            if (names.length === 0) return true;
            const filled = names.some(name => {
                const value = variables?.[name];
                return value !== undefined && value !== null && String(value).trim() !== '';
            });
            if (filled) answered++;
            return filled;
        });
        if (answered === 0) return null;
        return this.processTemplate(kept.join('\n'), variables).trim();
    }

    /** Põe `block` logo depois do frontmatter (e do título `# <nome>`, se a nota abre
     *  com ele), mais recente no topo. O resto da nota não muda. */
    insertBelowHeader(raw: string, block: string, title: string): string {
        const lines = raw.split('\n');
        let at = 0;
        if (lines[0]?.trim() === '---') {
            const close = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
            if (close !== -1) at = close + 1;
        }
        let next = at;
        while (next < lines.length && lines[next].trim() === '') next++;
        if (lines[next]?.trim() === `# ${title}`) at = next + 1;
        const insert = at === 0 ? [block, ''] : ['', block];
        if (at > 0 && at < lines.length && lines[at].trim() !== '') insert.push('');
        lines.splice(at, 0, ...insert);
        return lines.join('\n');
    }

    /** Insere `entry` no topo de uma nota fixa (mais recente primeiro), criando-a se
     *  necessário. Mesmo padrão de marcador usado no DFM_LOGS da nota diária. Usado por
     *  protocolos "lista corrente" via `prependToNote` (ex.: act_micropraticas, act_painel_valores). */
    async prependToNote(notePath: string, entry: string): Promise<TFile> {
        const startMarker = "<!-- LISTA_START -->";
        const endMarker = "<!-- LISTA_END -->";
        let file = this.app.vault.getAbstractFileByPath(notePath);

        if (!(file instanceof TFile)) {
            const folder = notePath.substring(0, notePath.lastIndexOf('/'));
            if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
                try { await this.app.vault.createFolder(folder); } catch (e) { }
            }
            const title = notePath.split('/').pop().replace('.md', '');
            const initial = `# ${title}\n\n> Mais recentes no topo. Promova uma entrada para nota própria quando fizer sentido desenvolver.\n\n${startMarker}\n${endMarker}\n`;
            file = await this.app.vault.create(notePath, initial);
        }

        const raw = await this.app.vault.read(file as TFile);
        const lines = raw.split("\n");
        let idx = lines.findIndex(l => l.trim() === startMarker);
        if (idx === -1) {
            lines.push(startMarker, endMarker);
            idx = lines.length - 2;
        }
        lines.splice(idx + 1, 0, entry.trim(), "");
        await this.app.vault.modify(file as TFile, lines.join("\n"));
        return file as TFile;
    }

    /**
     * O que faz: guarda o rascunho do motor (`savePartialProgress`: a nota na Caixa de entrada com
     * o botão "▶️ Continuar" e a linha na Day) com as variáveis do formulário, no dia delas
     * (`_context_date`). Devolve se o rascunho foi escrito: sem resposta que conte (só vazios e
     * variáveis de sistema) ou num router, nada é escrito, como no Esc do modal.
     * Por quê: §5.6, "Guardar rascunho usa o rascunho do motor, que já vai para a Caixa de
     * entrada com o botão de continuar" (P12a): um jeito só de guardar o meio do caminho. O
     * "Continuar" roda o protocolo com estas variáveis: o respondido no formulário (`_respondidos`)
     * não é perguntado de novo.
     * Entra → sai: as variáveis de `rodadaDoFormulario` → `true` se escreveu.
     * Erro e ataque: a data de contexto da rodada que estiver no meio volta ao fim; a falha de
     * escrita é a do rascunho de sempre (o aviso, e as respostas ficam no formulário).
     * Prova: tests/engine/protocolForm.test.ts ("o rascunho pelo formulário").
     */
    async guardarRascunho(variaveis: Record<string, unknown>): Promise<boolean> {
        if (this.id.startsWith('router_') || this.getMeaningfulVariableEntries(variaveis || {}).length === 0) return false;
        const antes = this.contextDateOverride;
        this.contextDateOverride = this.parseContextDateOverride(variaveis?._context_date);
        try {
            await this.savePartialProgress({ ...variaveis });
            return true;
        } finally {
            this.contextDateOverride = antes;
        }
    }

    /**
     * O que faz: cria a nota que um passo do seletor oferece criar (`allowCreate` + `createNote`,
     * o "➕ Criar a tarefa que falta" do ▶️), pela mesma função do modal (`createNoteFromStep`),
     * no dia da rodada (`_context_date`), e devolve as respostas do passo como o formulário as
     * manda ao `run()`: o nome, o caminho e a marca de criada (`{id}`, `{id}_path`, `{id}_created`).
     * Por quê: P12a da Missão (follow-up 3 do P11): o ▶️ cabe inteiro no formulário, e criar pelo
     * formulário grava o mesmo que criar no modal (a nota, o frontmatter, o `ifCreated`).
     * Entra → sai: o id do passo, o título, as variáveis da rodada (as datas) e os contextos da
     * tarefa (`contextos`: sem eles, a pergunta "Onde dá para fazer?" de sempre) → as respostas e
     * a nota, ou `null` (passo que não cria, título vazio, a criação que falhou).
     * Erro e ataque: a pasta vem do passo, nunca do título; nota com o mesmo nome é reaproveitada
     * (`created: false`); a data de contexto e a pergunta dos contextos voltam ao estado de antes.
     * Prova: tests/engine/protocolForm.test.ts ("criar a nota do passo pelo formulário").
     */
    async criarNotaDoPasso(stepId: string, titulo: string, variaveis: Record<string, unknown> = {}, opts: { contextos?: string[] } = {}): Promise<{ respostas: Record<string, unknown>; caminho: string; criada: boolean } | null> {
        const step = (this.def?.steps || []).find((s: any) => s?.id === stepId);
        if (!step || step.type !== 'suggest_note' || step.allowCreate !== true) return null;
        if (!String(titulo ?? '').trim()) return null;
        const antes = { data: this.contextDateOverride, perguntar: this.askTaskContexts };
        this.contextDateOverride = this.parseContextDateOverride(variaveis?._context_date);
        this.askTaskContexts = true;
        try {
            const passo = Array.isArray(opts.contextos)
                ? { ...step, createNote: { ...(step.createNote || {}), contexts: opts.contextos.length ? opts.contextos : undefined, askContext: opts.contextos.length ? undefined : false } }
                : step;
            const made = await this.createNoteFromStep(passo, String(titulo).trim());
            if (!made) return null;
            const nome = made.file.basename;
            return {
                respostas: { [stepId]: nome, [`${stepId}_path`]: made.file.path, ...(made.created ? { [`${stepId}_created`]: true } : {}) },
                caminho: made.file.path,
                criada: made.created,
            };
        } finally {
            this.contextDateOverride = antes.data;
            this.askTaskContexts = antes.perguntar;
        }
    }

    async savePartialProgress(variables) {
        const meaningfulEntries = this.getMeaningfulVariableEntries(variables);
        if (meaningfulEntries.length === 0) {
            return;
        }

        // O rascunho pertence ao dia da rodada (a data de contexto), não ao relógio: o 🌙
        // pausado às 00:40 na Day de ontem, retomado, gravava na Day de hoje e punha o
        // compromisso para depois de amanhã. A data vai no nome e em `_context_date`, que
        // o run() da retomada lê (parseContextDateOverride). Captura com `useCurrentDate`
        // segue o relógio, como sempre.
        const contextDate = this.getContextDate();
        const contextDay = contextDate.format("YYYY-MM-DD");
        const draftVariables = this.def.useCurrentDate === true || this.parseContextDateOverride(variables?._context_date)
            ? variables
            : { ...variables, _context_date: contextDay };

        // Nome cru com "/" ou ":" faz o vault recusar o caminho — e o rascunho sumia
        // sem aviso. Todo o resto do motor já passa por sanitizeFilename.
        // A data de contexto já vem com a hora do relógio.
        const filename = `${contextDate.format("YYYY-MM-DD HH-mm")} - ${this.sanitizeFilename(this.def.name)} - RASCUNHO.md`;

        // O cabeçalho diz de que protocolo e de que dia é o rascunho (proposta de
        // organização de 27/10, item 5): a triagem da Missão o acha pelo tipo e mostra
        // os que passaram de 7 dias. O corpo, que a retomada lê, não muda.
        let content = draftFrontmatter(this.id, contextDay);
        content += `# 📝 Rascunho: ${this.def.name}\n`;
        content += `> **Status:** ⏸️ Em Progresso\n`;
        content += `> **Data:** ${window.moment().format("DD/MM/YYYY HH:mm")}\n\n`;

        if (variables._previousNote) {
            content += `> 🔗 **Continuação de:** [[${variables._previousNote}]]\n\n`;
        }

        content += `---\n\n## 📋 Dados Coletados\n`;

        for (const [key, value] of meaningfulEntries) {
            content += `- **${key}:** ${value}\n`;
        }

        // Codifica as variáveis coletadas em base64 (UTF-8 safe) para que o botão
        // "Continuar" consiga retomar o protocolo com as respostas já dadas, em vez
        // de reiniciar do zero. Base64 evita que valores com "|" (ex: [[Nota|Display]])
        // colidam com o parser de botões em tabela do dfm-code-block (main.ts), que
        // detecta esse formato checando se QUALQUER linha do bloco contém "|".
        const encodedVars = this.encodeVariablesForButton(draftVariables);

        content += `\n---\n\n## ▶️ Continuar Protocolo\n`;
        content += `\`\`\`dfm\nbutton: ▶️ Continuar ${this.def.name}\nid: ${this.id}\nvars: ${encodedVars}\n\`\`\`\n`;
        content += `\n---\n*Protocolo interrompido - Use o botão acima para continuar*`;

        let folder = this.resolveFolderPath(variables.targetFolder || this.targetFolder, variables) || definicoesDe(this.plugin).pastas.inbox;
        if (this.def.logMode === "append") {
            folder = definicoesDe(this.plugin).pastas.inbox;
        }
        const fullPath = `${folder}/${filename}`;

        try {
            // Ensure folder exists
            if (!this.app.vault.getAbstractFileByPath(folder)) {
                await this.app.vault.createFolder(folder);
            }

            await this.app.vault.create(fullPath, content);
            new Notice(`📝 Rascunho salvo em ${folder}`);

            // Registrar na nota diária para que o rascunho não fique invisível
            const draftBasename = filename.replace('.md', '');
            await this.plugin.logToDailyTimeline(
                'protocol',
                this.getDailyLedgerLabel(),
                `${draftBasename}|▶️ Continuar`,
                true,
                this.getContextDate(),
                'interrompido (rascunho)'
            );
        } catch (e) {
            console.error("Erro ao salvar rascunho:", e);
            new Notice("⚠️ O rascunho não foi salvo — as respostas deste protocolo podem se perder.", 8000);
        }
    }

    /**
     * O que faz: fecha o rascunho que abriu esta rodada (`closeDraftText`): o Status diz
     * concluído e aponta a nota (ou a Day, no registro em `append`), e o botão sai. Só o
     * rascunho deste protocolo; falha de leitura ou gravação não interrompe a rodada.
     */
    async closeResumedDraft(path: string, target: string): Promise<void> {
        try {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) return;
            const text = await this.app.vault.read(file);
            const closed = closeDraftText(text, this.id, target, window.moment().format('DD/MM/YYYY'));
            if (closed !== text) await this.app.vault.modify(file, closed);
        } catch (e) {
            console.error('DFM: não foi possível marcar o rascunho como concluído:', e);
        }
    }

    /** Serializa variáveis para uma string base64 segura para uso dentro de um bloco
     *  ```dfm (sem quebras de linha, sem "|" — ver comentário em savePartialProgress). */
    encodeVariablesForButton(variables: any): string {
        try {
            return btoa(unescape(encodeURIComponent(JSON.stringify(variables))));
        } catch (e) {
            console.error("DFM: Falha ao codificar variáveis do rascunho:", e);
            return "";
        }
    }

    /**
     * `logSuffix` (template do protocolo, partes separadas por " · "): um resumo de uma
     * linha depois do link no registro do dia (ex.: a origem e o destino da 💡 ideia).
     * Parte sem resposta sai, e a seta "→" sem destino também; sem nenhuma, não há sufixo.
     */
    renderLogSuffix(variables: any): string {
        const template = this.def?.logSuffix;
        if (typeof template !== 'string' || !template.trim() || !variables) return '';
        const rendered = this.processTemplate(template, variables)
            .replace(/Sem conexão contextual/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        // Parte sem resposta (sem letra nem número) sai; seta que ficou sem destino também.
        return rendered.split(/\s*·\s*/)
            .map(part => part.replace(/\s*→\s*$/u, '').trim())
            .filter(part => /[\p{L}\p{N}]/u.test(part))
            .join(' · ');
    }

    /**
     * O que faz: o escritor único do registro de um protocolo na Day: acha (ou cria) a Day
     * da rodada, escolhe o lugar (`resolveDailyNoteSection`: a seção declarada que a Day tem,
     * senão o marcador do ledger) e insere a linha de `protocolDayEntry`, sem repetir no
     * mesmo dia a mesma nota.
     * Por quê: havia dois escritores. Os protocolos com `dailyNoteSection` escreviam a linha
     * limpa no ledger; os outros caíam no `logToDailyTimeline`, com "- " na frente, sem a
     * conferência do mesmo dia e sem o embutido. Decisão de 29/10 (harmonização H3, item 1,
     * "o recomendado"): um escritor só, o formato limpo, para todo protocolo. O
     * `logToDailyTimeline` fica para as tarefas e o rascunho interrompido.
     * Prova: tests/engine/escritorDaDay.test.ts e a gravação de referência.
     */
    async logToDailyNote(createdFilename, templateContent = "", variables: any = null) {
        const contextDate = this.getLedgerDate();
        const targetDateStr = contextDate.format("YYYY-MM-DD");
        let dailyNote = this.getDailyNoteFile(targetDateStr);

        // Toda diária faltante é criada pelo plugin, com a configuração do Periodic
        // Notes (pasta, modelo, formato) relida do vault. O comando do Periodic Notes
        // não entra aqui: executeCommandById não espera a criação dele, e os dois
        // `vault.create` no mesmo caminho corriam — o registro do protocolo se perdia.
        // Se outra criação chegou antes (create devolve null), a Day dela serve.
        if (!dailyNote) {
            dailyNote = await this.plugin.createDailyNote(targetDateStr);
            if (!dailyNote) dailyNote = this.getDailyNoteFile(targetDateStr);
        }

        if (!dailyNote) {
            console.log(`DFM: Nota diária (${targetDateStr}) não encontrada para log.`);
            return;
        }

        const createdNote = createdFilename ? createdFilename.replace('.md', '') : '';
        const content = await this.app.vault.read(dailyNote);
        const targetSection = this.resolveDailyNoteSection(content);
        const timestamp = contextDate.format(createdNote ? this.getDailyTimestampFormat() : "HH:mm");
        // Nota-lista (`prependToNote`) recebe VÁRIAS capturas no mesmo dia, mas o nome
        // dela é constante: deduplicar por esse nome engolia a 2ª captura do dia (a
        // captura ia para a lista, o diário não registrava). A marca invisível dá um
        // fragmento único por captura, mantendo `[[nota-lista]]` no texto visível.
        const marca = createdNote && this.def.prependToNote
            ? ` <!-- dfm-captura:${timestamp}#${this._captureSignature(templateContent)} -->`
            : '';
        const { entry, dedupe } = protocolDayEntry({
            label: this.getDailyLedgerLabel(),
            timestamp,
            createdNote,
            embed: this.def.logMode === "embed",
            block: templateContent,
            suffix: createdNote ? this.renderLogSuffix(variables) : '',
            marca,
            id: this.id,
        });
        const result = this._insertIntoDailyHeader(content, targetSection, entry, dedupe);
        if (result.inserted) {
            await this.app.vault.modify(dailyNote, result.content);
        }
    }

    async logToWeeklyNote(createdFilename, targetDate = null) {
        // A semana do REGISTRO: a data pedida, se for data de verdade; senão, a data de
        // contexto (a Day ou a nota semanal aberta). O relógio mandava o review da W42,
        // rodado na segunda, para a W43.
        const requested = targetDate ? window.moment(targetDate) : null;
        const m = requested && requested.isValid?.() ? requested : this.getContextDate();
        const currentWeek = m.format("GGGG-[W]WW"); // Ex: 2025-W47

        const weeklyNote = this.app.vault.getMarkdownFiles().find(f => f.name === `${currentWeek}.md`);

        // A nota da semana nasce SÓ pelo planejamento (🌳), com week, quarter e o corpo
        // respondidos. Criada aqui, ela nascia do modelo em branco (week: "", Valor e
        // Direção vazios, às vezes com o título da semana seguinte), e o 🌳 depois só
        // fundia o frontmatter. Sem a nota, o link fica na Day, onde já foi registrado.
        if (!weeklyNote) {
            console.log(`DFM: nota da semana ${currentWeek} ainda não existe — o link fica só na nota do dia.`);
            return;
        }

        // Log into Weekly Note
        if (weeklyNote) {
            const content = await this.app.vault.read(weeklyNote);
            if (!content.includes(createdFilename.replace('.md', ''))) {
                // O título do log na Week tem chave própria (`weeklyNoteSection`): o
                // `dailyNoteSection` servia às duas notas, e uma chave com dois sentidos fere
                // o princípio de um nome por dono (harmonização H3, 29/10). Sem ela, "### 📅 Log".
                const declared = this.def.weeklyNoteSection;
                const section = typeof declared === 'string' && declared.trim() ? declared : "### 📅 Log";

                let newContent = content;
                if (content.includes(section)) {
                    newContent = content.replace(section, () => `${section}\n- [[${createdFilename.replace('.md', '')}]]`);
                } else {
                    newContent = content + `\n\n${section}\n- [[${createdFilename.replace('.md', '')}]]`;
                }

                await this.app.vault.modify(weeklyNote, newContent);
            }
        }
    }

    async logToMonthlyNote(filename: string, targetDate: any = null) { /* Placeholder if needed */ }

    /**
     * O que faz: põe o link da nota criada na nota do trimestre só quando ela não aparece
     * em lugar nenhum dela (`quarterLogContent`): sem seção inventada no fim da nota.
     * O trimestre é o da quinta-feira da semana da data (a regra única de período).
     */
    async logToQuarterlyNote(createdFilename: string, targetDate: any = null, createdPath: string | null = null) {
        const requested = targetDate ? window.moment(targetDate) : null;
        // Data livre ("semana que vem") não é data: sem esta guarda o trimestre virava
        // "Invalid date" e o caminho criava um arquivo-lixo em Quarterly/.
        const m = requested && requested.isValid?.() ? requested : this.getContextDate();
        const currentQuarter = quarterOfWeek(String(m.format("GGGG-[W]WW"))) ?? m.format("YYYY-[Q]Q"); // Ex: 2025-Q1
        const folder = "300 - RUNTIME/302 - Daymiss/Quarterly";
        const expectedPath = `${folder}/${currentQuarter}.md`;

        let quarterlyNote: any = this.app.vault.getAbstractFileByPath(expectedPath);
        if (!quarterlyNote) {
            quarterlyNote = this.app.vault.getMarkdownFiles().find(f => f.name === `${currentQuarter}.md`);
        }
        // A nota do trimestre nasce SÓ pelo planejamento trimestral. Sem a nota, o link
        // fica na Day.
        if (!quarterlyNote) {
            console.log(`DFM: nota do trimestre ${currentQuarter} ainda não existe — o link fica só na nota do dia.`);
            return;
        }
        const content = await this.app.vault.read(quarterlyNote);
        // O título do log no trimestre tem chave própria (`quarterNoteSection`), como o da
        // Week: o `dailyNoteSection` servia às três notas (um nome, um dono, 29/10). Nenhum
        // protocolo a declara hoje, e sem título nada se escreve (`quarterLogContent`).
        const next = quarterLogContent({ content, created: createdFilename, createdPath, section: this.def.quarterNoteSection });
        if (next !== null) await this.app.vault.modify(quarterlyNote, next);
    }

    async logToAnnualNote(filename: string, targetDate: any = null) { /* Placeholder if needed */ }
}

export class ProtocolManager {
    public plugin: DFMPlugin;
    public protocols: Map<string, JSONProtocol>;
    /** O arquivo de cada protocolo carregado (id → caminho no vault), da última carga. */
    public sources: Map<string, string> = new Map();
    /** Os arquivos que não viraram protocolo na última carga (JSON inválido, id repetido), com o motivo. */
    public failures: Array<{ path: string; error: string }> = [];
    private marcarCarregado: () => void = () => {};
    /**
     * Resolve quando a primeira carga termina (com ou sem protocolos): quem lê os protocolos antes
     * dela (a Missão aberta logo depois de recarregar o plugin) espera por aqui (`esperarProtocolos`).
     */
    public readonly carregado: Promise<void> = new Promise<void>(resolve => { this.marcarCarregado = resolve; });

    constructor(plugin: DFMPlugin) {
        this.plugin = plugin;
        this.protocols = new Map();
    }

    /**
     * Pasta dos protocolos das definições (`pastas.protocolos`, a aba "Definições do sistema"; o
     * `folderProtocols` do salvamento de antes continua lido por baixo). Vazia ou fora do cofre cai
     * no padrão (o leitor das definições).
     */
    getProtocolsFolderPath(): string {
        return definicoesDe(this.plugin).pastas.protocolos;
    }

    /** Lê os protocolos da pasta (`lerProtocolos`) e marca a primeira carga como feita (`carregado`), mesmo se falhar. */
    async loadProtocols() {
        try {
            await this.lerProtocolos();
        } finally {
            this.marcarCarregado();
        }
    }

    private async lerProtocolos() {
        if (!this.plugin.app.vault) return;
        const folderPath = this.getProtocolsFolderPath();
        const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            console.error(`DFM System: Pasta de protocolos não encontrada: ${folderPath}`);
            return;
        }

        const files = [];
        const scan = (folder) => {
            if (!folder || !folder.children) return; // Prevent TypeError if folder is actually a file
            folder.children.forEach(child => {
                if (child.name.startsWith('_')) return; // Ignore Agent / Archived folders for Obsidian UI
                if (child.extension === 'json') files.push(child);
                if (child.children) scan(child);
            });
        };
        scan(folder);

        // Os passos comuns (`_comuns/`, núcleo de 21/10): não são protocolos; o `usar` de
        // um protocolo se expande aqui, na carga, nos passos do comum.
        const commons = await this.loadCommons(folderPath);

        // A carga monta o registro novo ao lado e só troca no fim: quem pede um protocolo
        // durante a releitura (o painel de Protocolos relê depois de gravar a fase) acha o
        // registro anterior inteiro, nunca um vazio.
        const next = new Map<string, JSONProtocol>();
        const sources = new Map<string, string>();
        const failures: Array<{ path: string; error: string }> = [];
        for (const file of files) {
            try {
                const content = await this.plugin.app.vault.read(file);
                const definition = JSON.parse(content);
                if (Array.isArray(definition?.steps)) {
                    const expanded = expandCommonSteps(definition.steps, commons);
                    if (expanded.problemas.length) console.warn(`DFM: passos comuns em ${file.name}:`, expanded.problemas);
                    definition.steps = expanded.steps;
                }
                const protocol = new JSONProtocol(this.plugin, definition);
                // O último arquivo com o mesmo id vence, como sempre; o repetido fica registrado.
                if (sources.has(protocol.id)) failures.push({ path: sources.get(protocol.id)!, error: `id repetido: '${protocol.id}' também está em ${file.path}` });
                next.set(protocol.id, protocol);
                sources.set(protocol.id, file.path);
            } catch (e) {
                console.error(`Erro ao carregar protocolo ${file.name}:`, e);
                failures.push({ path: String(file.path ?? file.name), error: e instanceof Error ? e.message : String(e) });
                new Notice(`⚠️ Protocolo ignorado (JSON inválido): ${file.name}`, 8000);
            }
        }
        this.protocols.clear();
        for (const [id, protocol] of next) this.protocols.set(id, protocol);
        this.sources = sources;
        this.failures = failures;

        console.log(`DFM: ${this.protocols.size} protocolos carregados.`);
    }

    /**
     * O que faz: os comuns de `<pasta de protocolos>/_comuns/`, por nome. Arquivo com
     * problema fica de fora e o problema vai para o console (o juiz de protocolos o acusa).
     */
    async loadCommons(folderPath: string): Promise<Map<string, CommonDef>> {
        const commons = new Map<string, CommonDef>();
        const folder: any = this.plugin.app.vault.getAbstractFileByPath(`${folderPath}/${COMMONS_FOLDER}`);
        for (const child of folder?.children || []) {
            if (child?.extension !== 'json') continue;
            try {
                const stem = String(child.name).replace(/\.json$/, '');
                const { comum, problemas } = parseCommon(JSON.parse(await this.plugin.app.vault.read(child)), stem);
                if (problemas.length) console.warn(`DFM: passo comum ${child.name}:`, problemas);
                if (comum) commons.set(comum.comum, comum);
            } catch (e) {
                console.error(`DFM: passo comum ignorado (JSON inválido): ${child?.name}`, e);
            }
        }
        return commons;
    }

    get(id) {
        return this.protocols.get(id);
    }

    /**
     * O que faz: a tabela papel → id deste cofre: a das definições lidas (`plugin.definicoes`, por
     * `lerDefinicoes`: os padrões da v0, as camadas de partida dos módulos e o bloco salvo).
     * Por quê: D1 do mapa da v0: o código pede o protocolo pelo papel; a tabela é uma só para o
     * plugin inteiro, e o que a aba gravar vale no próximo pedido.
     * Erro e ataque: sem o leitor do plugin (um gerente montado à parte), lê o salvamento sem camadas
     * (`definicoesDe`).
     */
    tabelaDosPapeis(): TabelaDosPapeis {
        return definicoesDe(this.plugin).protocolos_por_papel;
    }

    /**
     * O que faz: o id do protocolo carregado que faz o papel, ou `null` (o papel desligado, ou o
     * cofre sem o protocolo): quem desenha um botão ou uma opção pergunta aqui e, com `null`, não desenha.
     */
    idDoPapel(papel: Papel): string | null {
        return protocoloDoPapel(papel, this.tabelaDosPapeis(), id => this.protocols.has(id));
    }

    /** O protocolo carregado que faz o papel (`idDoPapel`), ou `undefined`. */
    doPapel(papel: Papel): JSONProtocol | undefined {
        const id = this.idDoPapel(papel);
        return id ? this.protocols.get(id) : undefined;
    }

    /** O id dado é o de um dos papéis (pela tabela, carregado ou não): os ouvintes do fim de um protocolo. */
    ehDoPapel(id: unknown, papeis: readonly Papel[]): boolean {
        return ehDoPapel(id, papeis, this.tabelaDosPapeis());
    }

    getAll() {
        return Array.from(this.protocols.values());
    }
}
