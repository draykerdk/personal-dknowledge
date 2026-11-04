/**
 * Os sinais da direção do trabalho: a ação para fora que espera enquanto o projeto ganha ações para dentro
 * (`pronto-para-exposicao`, na tarefa) e a SMART com verbo sem fim e sem a condição de fim declarada
 * (`sem-condicao-de-fim`, na SMART).
 *
 * Por quê: o inventário do painel antigo aposentado (02/11/2026, itens 3 e 7: a função que se encaixa bem
 * na Missão se implementa). As contas mudaram de casa para o motor
 * (`engine/direcao.ts`), que a intenção antiga também lê; aqui elas viram sinais da Missão, na forma de
 * todos: o fato, a data e o próximo passo (um gesto que já existe). Descrevem o plano (os verbos, as datas
 * de criação, os campos), nunca a pessoa. A prioridade do trimestre é o que vai ao mundo: o sinal da ação
 * para fora põe à vista a que espera.
 *
 * Módulo puro (chamado por `sinais`, do mesmo módulo). Prova: tests/missao/sinaisDaDirecao.test.ts.
 */
import { classificarDirecao, externaQueEspera, infiniteVerb, type Direcao } from '../engine/direcao';
import type { MissaoEntrada } from './entrada';
import type { MissaoIndice, MissaoTarefa, Sinal } from './tipos';
import { diaMes } from './tempo';

/** Os estados de quem dá para fazer agora: a mesa do selo antigo (a que espera alguém, `waiting-on`, não entra). */
const EXECUTAVEIS = new Set(['next-action', 'in-progress']);

/**
 * O que faz: o sinal da SMART aberta cujo título tem um verbo sem fim ("melhorar", "pesquisar") e que não
 * declara `entrega_observavel` nem `criterio_suficiente`.
 * Por quê: o verbo sem fim não diz quando a SMART acaba; os dois campos do modelo da SMART dizem, e o
 * painel os edita ali mesmo. A ação não entra: o fim dela é a entrega suficiente que o ▶️ pergunta no bloco.
 * Entra → sai: a tarefa → `Sinal[]` (zero ou um).
 * Erro e ataque: a feita, a de algum dia e a ação não dão sinal; um dos dois campos preenchido basta.
 */
export function sinalDoFimDaSmart(t: MissaoTarefa): Sinal[] {
    if (t.tipo !== 'smart' || !t.aberta) return [];
    if (t.record.entregaObservavel || t.record.criterioSuficiente) return [];
    const verbo = infiniteVerb(t.titulo);
    if (!verbo) return [];
    return [{
        tipo: 'sem-condicao-de-fim', alvo: t.id,
        fato: `"${verbo}" não diz quando acaba, e a SMART não declara entrega observável nem critério de suficiente`,
        desde: null, proximoPasso: { acao: 'dar-condicao', rotulo: 'Entrega observável' },
    }];
}

/**
 * O que faz: em cada projeto, a ação para fora mais antiga que dá para fazer agora, quando o mesmo projeto
 * tem duas ou mais ações para dentro criadas depois dela (`externaQueEspera`, do motor).
 * Por quê: era o "pronto para exposição" do painel antigo; a ação para fora é a que traz a resposta do
 * mundo (vender, enviar, publicar). O sinal fica na própria tarefa, com o "Mover para…" para lhe dar um dia.
 * Entra → sai: o índice e os pesos da direção (`entrada.direcao`) → `Sinal[]`.
 * Erro e ataque: sem os pesos, nenhuma tarefa tem direção e nada aparece (a falta da tabela não vira sinal);
 * as candidatas são as ações executáveis do projeto (next-action, in-progress); a para fora com um bloqueio
 * nomeado (`blockedBy`) não espera (a regra do selo antigo); a para fora sem data de criação diz isso no
 * fato, sem inventar a data.
 */
export function sinaisDaParaFora(indice: MissaoIndice, entrada: Partial<Pick<MissaoEntrada, 'direcao'>>): Sinal[] {
    const pesos = entrada.direcao;
    if (!pesos) return [];
    const direcoes = new Map<string, Direcao>();
    const direcao = (t: MissaoTarefa): Direcao => {
        let d = direcoes.get(t.id);
        if (!d) { d = classificarDirecao({ title: t.titulo, status: t.status, blockedBy: t.record.blockedBy }, pesos).nucleo; direcoes.set(t.id, d); }
        return d;
    };
    // A mesa de cada projeto: as ações dele (direto ou pela SMART) que dão para fazer agora, como no selo antigo.
    const porProjeto = new Map<string, MissaoTarefa[]>();
    for (const t of indice.vivas) {
        if (t.tipo !== 'acao' || !t.aberta || !t.projeto || !EXECUTAVEIS.has(t.status)) continue;
        porProjeto.set(t.projeto, [...(porProjeto.get(t.projeto) ?? []), t]);
    }
    const out: Sinal[] = [];
    for (const cands of porProjeto.values()) {
        const espera = externaQueEspera(cands, { direcao, bloqueada: t => (t.record.blockedBy ?? []).length > 0, criada: t => t.record.created ?? '', titulo: t => t.titulo, chave: t => t.id });
        if (!espera) continue;
        const n = espera.internasDepois;
        const fato = espera.desde
            ? `ação para fora aberta desde ${diaMes(espera.desde)}, e ${n} ações para dentro do projeto nasceram depois dela`
            : `ação para fora sem data de criação, e ${n} ações para dentro abertas no projeto`;
        out.push({ tipo: 'pronto-para-exposicao', alvo: espera.tarefa.id, fato, desde: espera.desde || null, proximoPasso: { acao: 'mover-para', rotulo: 'Mover para…' } });
    }
    return out;
}
