/**
 * Os pesos do painel do Mission Control, lidos da tabela única (arquitetura universal
 * de 19/10, 3.7: a tabela de pesos é uma só, num lugar só).
 *
 * Até 25/10/2026 o painel tinha três tabelas próprias no código (`missionIntent.ts`):
 * a direção da tarefa (para dentro ou para fora), a faixa "Agora" e a coluna do quadro
 * na escolha do projeto mais perto de gerar resultado. Elas moram agora em
 * `200 - FUNCTIONS/Config/pesos_decisao.json`, nas categorias `painel_direcao`,
 * `painel_agora` e `painel_projeto_proximo`, com os mesmos números (a ordem do painel
 * não mudou na migração). Ajustar ali vale na próxima atualização do painel.
 *
 * Em 29/10/2026 (o lugar não é a direção, manual 012): saíram os dois pesos que liam o
 * lugar (`contexts`) como direção (`painel_direcao.contexto` e `contexto_misto`), e os
 * pesos da direção na faixa Agora passaram a dizer o que são (`externa`, `interna` e
 * `indeterminada` viraram `para_fora`, `para_dentro` e `direcao_indeterminada`), com os
 * mesmos números.
 *
 * Em 02/11/2026 (o inventário da aposentadoria, item 4): a direção (`painel_direcao`) vale
 * também na Missão, que a lê por `parsePanelWeights` no leitor dela e a passa a
 * `direcao.classificarDirecao` (o sinal da ação para fora que espera). `painel_agora` e
 * `painel_projeto_proximo` ficam só com o painel aposentado: a Missão ordena pela ordem
 * padrão (os pesos do gesto), sem uma segunda ordem; os números ficam na tabela.
 *
 * Este módulo só interpreta a tabela e guarda a que está em uso; quem lê o arquivo é o
 * coletor do painel (`MissionControlService.collect`), a cada atualização. Sem a
 * tabela, todo peso vale 0 e o painel diz o que faltou, como o gesto faz
 * (`parseWeightTable` em `decisionWeights.ts`): nenhum número é inventado aqui.
 */

/**
 * A direção da tarefa: cada evidência soma para dentro ou para fora. Vem só do verbo e
 * da entrega da tarefa; o lugar (`contexts`) não pesa aqui (o lugar não é a direção).
 */
export interface PanelDirectionWeights {
    /** Cada verbo de ato externo no título. */
    verbo_externo: number;
    /** Cada verbo de trabalho interno no título. */
    verbo_interno: number;
    /** `waiting-on`: o ciclo está com terceiro. */
    esperando: number;
    /** Declara entrega observável ou critério suficiente. */
    declara_entrega: number;
    /** Link de saída no corpo. */
    link_de_saida: number;
}

/** O score da faixa "Agora" (ordena a superfície; não muda `priority` nem `impacto`). */
export interface PanelNowWeights {
    /** A tarefa é para fora (o resultado está no mundo). */
    para_fora: number;
    /** A direção não se decide (nada decide ou empate). */
    direcao_indeterminada: number;
    /** A tarefa é para dentro. */
    para_dentro: number;
    impacto_por_ponto: number;
    prazo_vencido: number;
    vence_hoje: number;
    intencao_vencida: number;
    vence_em_breve: number;
    em_andamento: number;
}

/** O projeto mais perto de gerar resultado. */
export interface PanelClosestProjectWeights {
    /** Por status da coluna do quadro (ativo, em revisão, esperando, backlog); ausente vale 0. */
    coluna: Record<string, number>;
    cada_externa: number;
    nota_indice: number;
    foco_da_semana: number;
}

export interface PanelWeights {
    direcao: PanelDirectionWeights;
    agora: PanelNowWeights;
    projeto: PanelClosestProjectWeights;
}

export interface PanelWeightsParse {
    weights: PanelWeights;
    /** O que o arquivo não trouxe ou trouxe errado (vale 0 até ser corrigido). */
    problemas: string[];
}

const DIRECTION_KEYS: ReadonlyArray<keyof PanelDirectionWeights> = [
    'verbo_externo', 'verbo_interno', 'esperando', 'declara_entrega', 'link_de_saida',
];
const NOW_KEYS: ReadonlyArray<keyof PanelNowWeights> = [
    'para_fora', 'direcao_indeterminada', 'para_dentro', 'impacto_por_ponto', 'prazo_vencido', 'vence_hoje',
    'intencao_vencida', 'vence_em_breve', 'em_andamento',
];
const PROJECT_KEYS: ReadonlyArray<'cada_externa' | 'nota_indice' | 'foco_da_semana'> = ['cada_externa', 'nota_indice', 'foco_da_semana'];

/**
 * O que faz: transforma o JSON da tabela única nos pesos do painel.
 * Por quê: a tabela é editada à mão; um número faltando não pode derrubar o painel nem
 * virar um peso inventado no código.
 * Entra → sai: qualquer valor (o arquivo inteiro ou só `pesos`) → { weights, problemas };
 * campo ausente ou não numérico vale 0 e entra na lista dos problemas com o caminho
 * (`painel_agora.para_fora`).
 * Erro e ataque: texto, `null`, lista no lugar de objeto, número negativo (aceito: é
 * escolha de quem edita), coluna com valor não numérico (sai, com problema).
 * Prova: tests/engine/panelWeights.test.ts.
 */
export function parsePanelWeights(raw: unknown): PanelWeightsParse {
    const problemas: string[] = [];
    const root: any = raw && typeof raw === 'object' && (raw as any).pesos && typeof (raw as any).pesos === 'object'
        ? (raw as any).pesos
        : (raw && typeof raw === 'object' ? raw : {});
    const block = (name: string): Record<string, unknown> => {
        const value = root[name];
        if (value && typeof value === 'object' && !Array.isArray(value)) return value;
        problemas.push(name);
        return {};
    };
    const number = (source: Record<string, unknown>, key: string, label: string): number => {
        const n = source[key];
        if (typeof n === 'number' && Number.isFinite(n)) return n;
        problemas.push(`${label}.${key}`);
        return 0;
    };
    const direcaoSrc = block('painel_direcao');
    const agoraSrc = block('painel_agora');
    const projetoSrc = block('painel_projeto_proximo');

    const direcao = {} as PanelDirectionWeights;
    for (const key of DIRECTION_KEYS) direcao[key] = number(direcaoSrc, key, 'painel_direcao');
    const agora = {} as PanelNowWeights;
    for (const key of NOW_KEYS) agora[key] = number(agoraSrc, key, 'painel_agora');

    const coluna: Record<string, number> = {};
    const columnSrc = projetoSrc.coluna;
    if (columnSrc && typeof columnSrc === 'object' && !Array.isArray(columnSrc)) {
        for (const [key, n] of Object.entries(columnSrc as Record<string, unknown>)) {
            if (typeof n === 'number' && Number.isFinite(n)) coluna[key] = n;
            else problemas.push(`painel_projeto_proximo.coluna.${key}`);
        }
    } else if (Object.keys(projetoSrc).length > 0 || root.painel_projeto_proximo) {
        problemas.push('painel_projeto_proximo.coluna');
    }
    const projeto = { coluna } as PanelClosestProjectWeights;
    for (const key of PROJECT_KEYS) projeto[key] = number(projetoSrc, key, 'painel_projeto_proximo');

    return { weights: { direcao, agora, projeto }, problemas: [...new Set(problemas)] };
}

/**
 * O que faz: o status da coluna do quadro (`2 - Active` → `active`), a chave da
 * coluna em `painel_projeto_proximo.coluna` (convenção: coluna → status do projeto).
 * Entra → sai: nome da pasta da coluna → status em minúsculas, ou `''`.
 */
export function columnStatus(column: string): string {
    return String(column ?? '').replace(/^\s*\d+\s*-\s*/, '').trim().toLowerCase();
}

/** A tabela em uso: sem leitura, todo peso vale 0 (e o coletor diz o que faltou). */
let active: PanelWeightsParse = parsePanelWeights({});

/**
 * O que faz: troca a tabela em uso pelo que o coletor leu do arquivo nesta atualização.
 * Por quê: as funções do painel (`missionIntent.ts`) são puras e chamadas de muitos
 * lugares (snapshot, widget do canvas, ponte do agente); o coletor lê o arquivo uma
 * vez por atualização e as funções leem daqui, sem I/O.
 * Entra → sai: o JSON do arquivo (ou `null` se não leu) → a leitura em uso, com os
 * problemas (o arquivo não lido vira um problema).
 */
export function usePanelWeights(raw: unknown, source = '200 - FUNCTIONS/Config/pesos_decisao.json'): PanelWeightsParse {
    active = raw === null || raw === undefined
        ? { ...parsePanelWeights({}), problemas: [`${source} não foi lido`] }
        : parsePanelWeights(raw);
    return active;
}

/** Os pesos do painel em uso. */
export function panelWeights(): PanelWeights {
    return active.weights;
}

/** O que a última leitura não trouxe (vazio = a tabela está completa). */
export function panelWeightProblems(): string[] {
    return [...active.problemas];
}
