/**
 * As propostas do agente: o agente propõe (ligar uma tarefa a uma SMART ou a um projeto, pôr na semana,
 * agendar num dia, criar uma ação), a proposta cai na triagem da Missão, e ele aceita com uma tecla; a
 * gravação é a das setas e do Ligar (`intencaoDeSoltar` e as gravações do quadro), com o Desfazer.
 *
 * Por quê: a proposta do agente pessoal (02/11/2026, integração 2), aprovada: o agente propõe, o
 * sistema confere e grava pelos caminhos que já existem, com Desfazer. A ponte nunca grava direto: a
 * escolha do agente é de uma lista fechada (`ACOES_DA_PROPOSTA`), o alvo é conferido pela mesma função
 * que confere o arrasto (o problema volta na hora, em palavras), e quem grava é a tela, quando a pessoa diz sim.
 *
 * Módulo puro: a fila recebe a leitura e a gravação do arquivo, o modelo da Missão e as gravações do
 * quadro pela borda (`DepsDasPropostas`); sem Obsidian. Prova: tests/engine/propostasDoAgente.test.ts.
 */
import { fold } from '../project/projectCanvasModel';
import { intencaoDeSoltar } from '../missao/intencoes';
import { chaveDeHoje } from '../missao/tempo';
import { ehDia } from './dia';
import type { Avisar, Destino, ItemDaTriagem, MissaoModelo, ResultadoDaGravacao, ResultadoDoDesfazer } from '../missao/tipos';
import { SEMANA } from './periodo';

/** O que o agente pode propor (a escolha fechada da tool). */
export const ACOES_DA_PROPOSTA = ['ligar_smart', 'ligar_projeto', 'semana', 'dia', 'criar_tarefa'] as const;
export type AcaoDaProposta = typeof ACOES_DA_PROPOSTA[number];

/**
 * A `origem` de toda tarefa que nasce de um agente (02/11): a proposta aceita e a criação que ele aprovou no
 * celular. Só diz de onde veio ("Veio de: agente" no painel); não é um estado nem pede outra revisão. O
 * modelo da tarefa a declara (`tarefa.json`, `origem.conhecidos`), e o texto da `origem` segue livre.
 */
export const ORIGEM_DO_AGENTE = 'agente';
/** A `origem` da tarefa que a Árvore de Progressão propõe ao desbloquear um nível (02/11). */
export const ORIGEM_DA_ARVORE = 'arvore';

/** O arquivo da fila, na raiz do cofre (runtime, fora do Git, como o journal da ponte). */
export const ARQUIVO_DAS_PROPOSTAS = '.dfm-dsh-propostas.json';
/** Quantas propostas esperam no máximo: a triagem é dele, e uma fila longa vira ruído. */
export const MAXIMO_DE_PROPOSTAS = 20;
/** O tamanho do porquê do agente (uma linha que ele lê na triagem). */
export const PORQUE_MAXIMO = 200;
/** O grupo da triagem onde as propostas esperam. */
export const GRUPO_DAS_PROPOSTAS = 'propostas';

export interface PropostaDoAgente {
    id: string;
    acao: AcaoDaProposta;
    /** O caminho da TaskNote que muda; `null` em `criar_tarefa`. */
    tarefa: string | null;
    /** O id do nó alvo na Missão: `s:` (SMART), `p:` (projeto), `d:AAAA-MM-DD`, `w:AAAA-Www`. */
    alvo: string;
    /** O título da tarefa que muda, ou da que nasce. */
    titulo: string;
    /** A semana da tarefa que nasce (`criar_tarefa`). */
    semana?: string;
    /** O que aceitar faz, em palavras (o texto do gesto: "Ligar à SMART X"). */
    texto: string;
    /** Por que o agente propõe, numa linha. */
    porque: string;
    /** Quando chegou (ISO). */
    criada: string;
    /** De onde veio, quando não é o agente (a Árvore, 02/11): vira a `origem` da tarefa que nasce. */
    origem?: string;
    /** Os campos que a tarefa nasce com, além do título, da semana e do pai (os da Árvore: `arvore_id`…). */
    campos?: Record<string, string | number | string[]>;
}

/** O pedido da Árvore de Progressão: a tarefa do nível desbloqueado, para ele aceitar na triagem. */
export interface PedidoDaArvore {
    titulo: string;
    /** O nome do projeto da árvore. */
    projeto: string;
    semana?: string;
    campos: Record<string, string | number | string[]>;
    porque: string;
}

/** Uma recusa da proposta, com o código e o porquê em palavras (o gateway a devolve ao agente). */
export class RecusaDaProposta extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
        this.name = 'RecusaDaProposta';
    }
}

const recusa = (code: string, message: string): never => { throw new RecusaDaProposta(code, message); };

function texto(valor: unknown, campo: string, max: number, obrigatorio = true): string {
    if (valor === undefined || valor === null || valor === '') {
        if (obrigatorio) recusa('invalid_input', `${campo} é obrigatório.`);
        return '';
    }
    if (typeof valor !== 'string') recusa('invalid_input', `${campo} deve ser texto.`);
    const t = (valor as string).trim().replace(/\s+/g, ' ');
    if (!t && obrigatorio) recusa('invalid_input', `${campo} é obrigatório.`);
    if (t.length > max) recusa('invalid_input', `${campo} excede ${max} caracteres.`);
    return t;
}

/** O que faz: o nó de uma TaskNote aberta pelo caminho (ou pelo título exato, quando ele é único). */
function tarefaDe(m: MissaoModelo, valor: string, tipo: 'acao' | 'smart' | null, campo: string): { id: string; titulo: string } {
    const porCaminho = m.noDaNota(valor);
    let t = porCaminho ? m.indice.porId.get(porCaminho.id) : undefined;
    if (!t) {
        const nome = fold(valor.replace(/^\[\[|\]\]$/g, '').replace(/\.md$/, '').split('/').pop() ?? '');
        const iguais = m.indice.vivas.filter(x => x.aberta && (!tipo || x.tipo === tipo) && fold(x.titulo) === nome);
        if (iguais.length > 1) recusa('proposal_ambiguous', `${campo}: há ${iguais.length} com o título "${valor}"; mande o caminho.`);
        t = iguais[0];
    }
    if (!t) return recusa('proposal_target_not_found', `${campo}: nenhuma ${tipo === 'smart' ? 'SMART' : 'tarefa'} aberta com "${valor}".`);
    if (tipo && t.tipo !== tipo) recusa('proposal_invalid', `${campo}: "${t.titulo}" não é ${tipo === 'smart' ? 'uma SMART' : 'uma ação'}.`);
    if (!t.aberta) recusa('proposal_invalid', `${campo}: "${t.titulo}" não está aberta.`);
    return { id: t.id, titulo: t.titulo };
}

/** O que faz: o projeto pelo nome (ou pela nota-índice), entre os que não terminaram. */
function projetoDe(m: MissaoModelo, valor: string): { id: string; nome: string } {
    const nome = fold(valor.replace(/^\[\[|\]\]$/g, '').replace(/\.md$/, '').split('/').pop() ?? '');
    const p = [...m.indice.projetos.values()].find(x => !x.encerrado && (fold(x.nome) === nome || (x.nota && x.nota === valor)));
    return p ? { id: p.id, nome: p.nome } : recusa('proposal_target_not_found', `valor: nenhum projeto ou departamento ativo chamado "${valor}".`);
}

/** O que faz: o pai de uma ação nova: a SMART aberta (pelo caminho ou título) ou o projeto pelo nome. */
function paiDe(m: MissaoModelo, valor: string): { id: string; nome: string; smart: string | null } {
    const porCaminho = m.noDaNota(valor);
    const t = porCaminho ? m.indice.porId.get(porCaminho.id) : undefined;
    if (t?.tipo === 'smart' && t.aberta) return { id: t.id, nome: t.titulo, smart: t.caminho };
    const nome = fold(valor.replace(/^\[\[|\]\]$/g, '').replace(/\.md$/, '').split('/').pop() ?? '');
    const smarts = m.indice.vivas.filter(x => x.tipo === 'smart' && x.aberta && fold(x.titulo) === nome);
    if (smarts.length === 1) return { id: smarts[0].id, nome: smarts[0].titulo, smart: smarts[0].caminho };
    const p = projetoDe(m, valor);
    return { id: p.id, nome: p.nome, smart: null };
}


/**
 * O que faz: confere o pedido do agente contra o modelo da Missão e devolve a proposta (sem `id` nem
 * `criada`): a tarefa e o alvo pelo caminho ou pelo nome, o texto do gesto pela função do arrasto
 * (`intencaoDeSoltar`), e o problema dela vira recusa na hora.
 * Entra → sai: o modelo, o pedido cru e hoje → a proposta.
 * Erro e ataque: campo a mais, ação fora da lista, data fora da forma, alvo que não existe ou ambíguo, o
 * gesto que não muda nada ("já está nesta SMART"), a ação nova com título repetido: tudo recusa, com o
 * porquê, e nada entra na fila.
 * Prova: tests/engine/propostasDoAgente.test.ts.
 */
export function conferirProposta(m: MissaoModelo, raw: Record<string, unknown>, hoje: string): Omit<PropostaDoAgente, 'id' | 'criada'> {
    const permitidos = new Set(['acao', 'tarefa', 'valor', 'titulo', 'semana', 'porque']);
    for (const k of Object.keys(raw)) if (!permitidos.has(k)) recusa('invalid_input', `Campo não permitido: ${k}.`);
    const acao = texto(raw.acao, 'acao', 20) as AcaoDaProposta;
    if (!(ACOES_DA_PROPOSTA as readonly string[]).includes(acao)) recusa('invalid_input', `acao deve ser uma de: ${ACOES_DA_PROPOSTA.join(', ')}.`);
    const porque = texto(raw.porque, 'porque', PORQUE_MAXIMO);
    const valor = texto(raw.valor, 'valor', 300);
    if (acao === 'criar_tarefa') {
        if (raw.tarefa !== undefined) recusa('invalid_input', 'criar_tarefa não recebe tarefa: o título vai em titulo.');
        const titulo = texto(raw.titulo, 'titulo', 140);
        const semana = texto(raw.semana, 'semana', 8, false) || chaveDeHoje('semana', hoje);
        if (!SEMANA.test(semana)) recusa('invalid_input', 'semana deve usar AAAA-Www.');
        if (m.indice.vivas.some(t => t.aberta && fold(t.titulo) === fold(titulo))) recusa('task_exists', `Já existe uma tarefa aberta chamada "${titulo}".`);
        const pai = paiDe(m, valor);
        return { acao, tarefa: null, alvo: pai.id, titulo, semana, texto: `Criar a ação "${titulo}" em ${pai.smart ? 'SMART ' : ''}${pai.nome} (${semana})`, porque };
    }
    if (raw.titulo !== undefined || raw.semana !== undefined) recusa('invalid_input', 'titulo e semana são só de criar_tarefa.');
    const tarefa = tarefaDe(m, texto(raw.tarefa, 'tarefa', 500), null, 'tarefa');
    let alvo: string;
    switch (acao) {
        case 'ligar_smart': alvo = tarefaDe(m, valor, 'smart', 'valor').id; break;
        case 'ligar_projeto': alvo = projetoDe(m, valor).id; break;
        case 'semana': if (!SEMANA.test(valor)) recusa('invalid_input', 'valor deve usar AAAA-Www.'); alvo = `w:${valor}`; break;
        default: if (!ehDia(valor) || Number.isNaN(Date.parse(`${valor}T00:00:00Z`))) recusa('invalid_input', 'valor deve usar AAAA-MM-DD.'); alvo = `d:${valor}`;
    }
    const i = intencaoDeSoltar(m, tarefa.id, alvo);
    if ('problema' in i) return recusa('proposal_invalid', i.problema || 'nada a mudar: já está assim');
    return { acao, tarefa: m.indice.porId.get(tarefa.id)!.caminho, alvo, titulo: tarefa.titulo, texto: i.texto, porque };
}

/** O que aceitar uma proposta grava: um gesto da tabela das setas, ou a ação nova pelo Novo. */
export type PedidoDoAceite =
    | { via: 'mover'; caminho: string; destino: Destino; texto: string }
    | { via: 'criar'; valores: Record<string, unknown>; smart: string | null; texto: string }
    | { problema: string };

/**
 * O que faz: o que aceitar a proposta grava agora, conferido de novo sobre o modelo de agora (o cofre pode
 * ter mudado desde que ela chegou): o gesto do arrasto (`intencaoDeSoltar`), ou o pedido do Novo (o título,
 * o status de partida, a semana, o pai e a `origem` do agente; com a SMART, a herança dela fica com o Novo).
 * Erro e ataque: a tarefa que sumiu, o alvo que fechou, o título que alguém já criou: o problema, em palavras.
 */
export function pedidoDoAceite(m: MissaoModelo, p: PropostaDoAgente): PedidoDoAceite {
    if (p.acao === 'criar_tarefa') {
        if (m.indice.vivas.some(t => t.aberta && fold(t.titulo) === fold(p.titulo))) return { problema: `já existe uma tarefa aberta chamada "${p.titulo}"` };
        const smart = m.indice.porId.get(p.alvo);
        const projeto = m.indice.projetos.get(p.alvo);
        // A ação nova diz de onde veio (02/11): `origem: agente`, como toda tarefa que nasce de um agente;
        // a da Árvore, `origem: arvore`, com os campos dela. Os campos nunca trocam o título, o status nem o pai.
        const base = { ...(p.campos ?? {}), title: p.titulo, status: 'next-action', week: p.semana, origem: p.origem ?? ORIGEM_DO_AGENTE };
        if (smart?.tipo === 'smart' && smart.aberta) {
            return { via: 'criar', valores: base, smart: smart.caminho, texto: p.texto };
        }
        if (projeto && !projeto.encerrado) {
            return { via: 'criar', valores: { ...base, projects: [`[[${projeto.nome}]]`] }, smart: null, texto: p.texto };
        }
        return { problema: 'o pai da ação nova não está mais aberto' };
    }
    const no = p.tarefa ? m.noDaNota(p.tarefa) : null;
    if (!no) return { problema: 'a tarefa não está mais no cofre' };
    const i = intencaoDeSoltar(m, no.id, p.alvo);
    if ('problema' in i) return { problema: i.problema || 'nada a mudar: já está assim' };
    return { via: 'mover', caminho: i.caminho, destino: i.destino, texto: i.texto };
}

/** O que faz: o item da triagem de uma proposta (o grupo das propostas, com o texto e o porquê). */
export function itemDaProposta(p: PropostaDoAgente): ItemDaTriagem {
    return {
        id: `a:${p.id}`, tipo: 'proposta', titulo: p.titulo, caminho: p.tarefa ?? '',
        grupo: GRUPO_DAS_PROPOSTAS as ItemDaTriagem['grupo'], marcas: [],
        proposta: { id: p.id, texto: p.texto, porque: p.porque },
    };
}

/** O que faz: lê a fila do arquivo; o que não se lê, ou não tem a forma, fica de fora (nunca quebra). */
export function lerFila(textoDoArquivo: string | null): PropostaDoAgente[] {
    if (!textoDoArquivo) return [];
    try {
        const v = JSON.parse(textoDoArquivo);
        const lista = Array.isArray(v?.propostas) ? v.propostas : [];
        return lista.filter((p: any) => p && typeof p.id === 'string' && (ACOES_DA_PROPOSTA as readonly string[]).includes(p.acao)
            && typeof p.alvo === 'string' && typeof p.titulo === 'string' && typeof p.texto === 'string' && typeof p.porque === 'string')
            .slice(-MAXIMO_DE_PROPOSTAS);
    } catch {
        return [];
    }
}

/** O que faz: a chave da proposta da Árvore que ele recusou (o projeto e o título), para ela não voltar. */
export function chaveDaRecusa(p: Pick<PropostaDoAgente, 'alvo' | 'titulo'>): string {
    return `${p.alvo}|${fold(p.titulo)}`;
}

/** O que faz: as recusas da Árvore guardadas no arquivo da fila (o que não se lê fica de fora). */
export function lerRecusadas(textoDoArquivo: string | null): string[] {
    if (!textoDoArquivo) return [];
    try {
        const v = JSON.parse(textoDoArquivo);
        return Array.isArray(v?.recusadas) ? v.recusadas.filter((x: unknown) => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

/** O que a fila usa da borda: o arquivo, o modelo da Missão, as gravações do quadro e o Desfazer. */
export interface DepsDasPropostas {
    ler(): Promise<string | null>;
    gravar(texto: string): Promise<void>;
    /** O modelo da Missão de agora (o leitor do quadro). */
    modelo(): Promise<MissaoModelo>;
    /** A gravação das setas (`board.gravacoes.mover`), com o Desfazer na pilha única. */
    mover(caminho: string, destino: Destino, avisar?: Avisar): Promise<ResultadoDaGravacao>;
    /** A ação nova pelo Novo (`board.novo.tarefa`), com a herança da SMART e o Desfazer. */
    criar(valores: Record<string, unknown>, smart: string | null, avisar?: Avisar): Promise<ResultadoDaGravacao>;
    /** Registra na pilha única do Desfazer (o recusar volta a proposta). */
    registrarDesfazer(rotulo: string, desfazer: () => Promise<ResultadoDoDesfazer>, avisar?: Avisar): void;
    /** A Missão passa à versão seguinte (a triagem mostra a fila nova). */
    aoMudar(): void;
    agora(): string;
}

/**
 * A fila das propostas do agente.
 * O que faz: guarda as propostas no arquivo da fila, entrega os itens da triagem, e aceita (pela gravação
 * das setas ou do Novo) ou recusa (com o Desfazer que a devolve).
 * Erro e ataque: a mesma proposta duas vezes entra uma vez (a segunda devolve a primeira); a fila cheia
 * recusa; o aceite cujo alvo mudou não grava e a proposta fica, com o problema no aviso.
 */
export class FilaDePropostas {
    private fila: PropostaDoAgente[] | null = null;
    /** As propostas da Árvore que ele recusou: a reavaliação não as propõe de novo (o Desfazer as solta). */
    private recusadas: string[] = [];
    private seq = 0;

    constructor(private readonly deps: DepsDasPropostas) {}

    /** O que faz: a fila de agora (lida do arquivo na primeira vez). */
    async listar(): Promise<PropostaDoAgente[]> {
        if (!this.fila) {
            const texto = await this.deps.ler();
            this.fila = lerFila(texto);
            this.recusadas = lerRecusadas(texto);
        }
        return [...this.fila];
    }

    /** O que faz: a fila já lida, sem esperar (a triagem a pede ao montar o modelo); vazia antes da primeira leitura. */
    itens(): ItemDaTriagem[] {
        return (this.fila ?? []).map(itemDaProposta);
    }

    private async salvar(): Promise<void> {
        await this.deps.gravar(JSON.stringify({ versao: 1, propostas: this.fila ?? [], recusadas: this.recusadas }, null, 2));
        this.deps.aoMudar();
    }

    /**
     * O que faz: confere o pedido do agente e põe a proposta na fila (a triagem a mostra na versão seguinte).
     * Entra → sai: o pedido cru → a proposta e se já estava lá.
     */
    async propor(raw: Record<string, unknown>): Promise<{ proposta: PropostaDoAgente; repetida: boolean; pendentes: number }> {
        const fila = await this.listar();
        const m = await this.deps.modelo();
        const nova = conferirProposta(m, raw, m.hoje);
        const igual = fila.find(p => p.acao === nova.acao && p.tarefa === nova.tarefa && p.alvo === nova.alvo && fold(p.titulo) === fold(nova.titulo));
        if (igual) return { proposta: igual, repetida: true, pendentes: fila.length };
        if (fila.length >= MAXIMO_DE_PROPOSTAS) recusa('proposals_full', `A triagem já tem ${MAXIMO_DE_PROPOSTAS} propostas esperando o operador; espere ele decidir.`);
        const agora = this.deps.agora();
        const proposta: PropostaDoAgente = { ...nova, id: `${agora.replace(/\D/g, '').slice(0, 14)}-${++this.seq}`, criada: agora };
        this.fila = [...fila, proposta];
        await this.salvar();
        return { proposta, repetida: false, pendentes: this.fila.length };
    }

    /**
     * O que faz: põe na fila a tarefa de um nível desbloqueado da Árvore de Progressão (02/11/2026): o pai é
     * o projeto da árvore, a semana a da linha (ou a de hoje), e os campos dela viajam até o aceite.
     * Por quê: sem a criação automática, o desbloqueio propõe; a proposta espera no mesmo grupo das do
     * agente, com o Y e o X de sempre. Esta porta é do plugin, não da tool do agente (que só passa por `propor`).
     * Entra → sai: o pedido da árvore → `true` se entrou (a repetida, a fila cheia, a tarefa que já existe
     * aberta e o projeto que não está ativo dão `false`, sem erro).
     */
    async proporDaArvore(pedido: PedidoDaArvore): Promise<boolean> {
        const fila = await this.listar();
        const m = await this.deps.modelo();
        const titulo = texto(pedido.titulo, 'titulo', 140);
        if (m.indice.vivas.some(t => t.aberta && fold(t.titulo) === fold(titulo))) return false;
        let projeto: { id: string; nome: string };
        try { projeto = projetoDe(m, pedido.projeto); } catch { return false; }
        if (fila.some(p => p.acao === 'criar_tarefa' && p.alvo === projeto.id && fold(p.titulo) === fold(titulo))) return false;
        if (this.recusadas.includes(chaveDaRecusa({ alvo: projeto.id, titulo }))) return false;
        if (fila.length >= MAXIMO_DE_PROPOSTAS) return false;
        const semana = pedido.semana && SEMANA.test(pedido.semana) ? pedido.semana : chaveDeHoje('semana', m.hoje);
        const agora = this.deps.agora();
        const proposta: PropostaDoAgente = {
            id: `${agora.replace(/\D/g, '').slice(0, 14)}-${++this.seq}`, acao: 'criar_tarefa', tarefa: null, alvo: projeto.id, titulo, semana,
            texto: `Criar a ação "${titulo}" em ${projeto.nome} (${semana})`, porque: texto(pedido.porque, 'porque', PORQUE_MAXIMO),
            criada: agora, origem: ORIGEM_DA_ARVORE, campos: { ...pedido.campos },
        };
        this.fila = [...fila, proposta];
        await this.salvar();
        return true;
    }

    private async tirar(id: string): Promise<PropostaDoAgente | null> {
        const fila = await this.listar();
        const p = fila.find(x => x.id === id) ?? null;
        if (!p) return null;
        this.fila = fila.filter(x => x.id !== id);
        await this.salvar();
        return p;
    }

    /**
     * O que faz: aceita: grava pelo caminho de sempre (o gesto das setas ou o Novo, cada um com o Desfazer
     * dele) e, se gravou, a proposta sai da fila.
     * Erro e ataque: a proposta que já saiu; o alvo que mudou (a proposta fica, o aviso diz o problema).
     */
    async aceitar(id: string, avisar?: Avisar): Promise<ResultadoDaGravacao> {
        const p = (await this.listar()).find(x => x.id === id);
        if (!p) return this.falha('Esta proposta já foi decidida', avisar);
        const pedido = pedidoDoAceite(await this.deps.modelo(), p);
        if ('problema' in pedido) return this.falha(`Não aceitou: ${pedido.problema}`, avisar);
        const r = pedido.via === 'mover'
            ? await this.deps.mover(pedido.caminho, pedido.destino, avisar)
            : await this.deps.criar(pedido.valores, pedido.smart, avisar);
        if (r.ok) await this.tirar(id);
        return r;
    }

    /** O que faz: recusa: a proposta sai da fila; o Desfazer a devolve (se a fila tem lugar). */
    async recusar(id: string, avisar?: Avisar): Promise<ResultadoDaGravacao> {
        const fila0 = await this.listar();
        const da = fila0.find(x => x.id === id);
        // A recusa da Árvore fica lembrada (a reavaliação não a propõe de novo); grava junto com a saída.
        const chave = da?.origem === ORIGEM_DA_ARVORE ? chaveDaRecusa(da) : null;
        if (chave && !this.recusadas.includes(chave)) this.recusadas = [...this.recusadas, chave];
        const p = await this.tirar(id);
        if (!p) return this.falha('Esta proposta já foi decidida', avisar);
        const rotulo = `Proposta recusada: ${p.texto}`;
        this.deps.registrarDesfazer(rotulo, async () => {
            const fila = await this.listar();
            if (fila.some(x => x.id === p.id)) return { feito: false, texto: 'A proposta já voltou' };
            if (fila.length >= MAXIMO_DE_PROPOSTAS) return { feito: false, texto: 'A fila das propostas está cheia' };
            if (chave) this.recusadas = this.recusadas.filter(x => x !== chave);
            this.fila = [...fila, p];
            await this.salvar();
            return { feito: true, texto: `Desfeito: ${rotulo}` };
        }, avisar);
        return { ok: true, texto: rotulo };
    }

    private falha(texto: string, avisar?: Avisar): ResultadoDaGravacao {
        avisar?.(texto);
        return { ok: false, texto };
    }
}
