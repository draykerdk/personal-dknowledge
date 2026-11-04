/**
 * A ação de sistema `acao: "inicializar"` dos protocolos: a árvore de pastas e as notas de
 * partida de um cofre vazio, a partir das definições.
 *
 * Por quê: o mapa da v0 (C0, 03/11/2026): o protocolo de inicialização (C, a rodada 4) pergunta
 * as definições e monta o cofre; o motor grava notas, e montar o cofre pede também pastas. As
 * perguntas ficam em JSON, como em qualquer protocolo; o passo final é esta ação, que o motor
 * (`JSONProtocol`, o `acao`) entrega a estas funções pelo cofre que ele dá.
 *
 * O que ela cria: o esqueleto, a pasta de cada área com a nota dela e uma nota de valor para cada
 * valor das definições (a 🌳 sugere o valor da semana dessas notas, `type: valor`).
 *
 * As regras: só cria o que falta (rodar duas vezes não muda nada); nunca apaga nem sobrescreve;
 * só cria dentro do cofre (o caminho absoluto, com `..`, com barra invertida ou na pasta de
 * configuração é recusado); e relata o que criou, o que já existia e o que recusou.
 *
 * Funções puras (o plano, o caminho, as definições da rodada, o bloco das definições respondidas)
 * e um aplicador que só usa o cofre que recebe. Prova: tests/engine/inicializacao.test.ts, com um
 * cofre falso em memória, e tests/engine/inicializacaoDefinicoes.test.ts.
 */
import { lerDefinicoes } from '../definicoes';
import { blocoComMudanca, editarLista, editarTexto, SEPARADOR, type Edicao } from '../ui/definicoesDaAba';

/** Uma área como as definições a descrevem: o nome e, se já tem, a pasta dela em `100 - AREAS/`. */
export interface AreaDaInicializacao { nome: string; pasta?: string }

/** Um valor como as definições o descrevem: o nome e o porquê. */
export interface ValorDaInicializacao { nome: string; porque?: string }

/** O que a inicialização lê das definições. */
export interface DefinicoesDaInicializacao {
    areas: readonly AreaDaInicializacao[];
    /** Os valores da pessoa, na ordem; cada um ganha uma nota de valor. Sem a chave, nenhum. */
    valores?: readonly ValorDaInicializacao[];
    /** A pasta das notas de valor; sem a chave, `PASTA_DOS_VALORES`. */
    pastaDosValores?: string;
    /** As pastas do esqueleto; sem a chave, `ESQUELETO_PADRAO`. */
    esqueleto?: readonly string[];
}

/** Um passo do plano: uma pasta, ou uma nota com o conteúdo de partida. */
export type PassoDaInicializacao =
    | { tipo: 'pasta'; caminho: string }
    | { tipo: 'nota'; caminho: string; conteudo: string };

/** O plano: os passos, na ordem (cada pasta antes do que mora nela), e os problemas das definições. */
export interface PlanoDaInicializacao { passos: PassoDaInicializacao[]; problemas: string[] }

/** O cofre que o aplicador usa: o motor dá o do Obsidian; o teste, um em memória. */
export interface CofreDaInicializacao {
    existe(caminho: string): boolean;
    criarPasta(caminho: string): Promise<void>;
    criarNota(caminho: string, conteudo: string): Promise<void>;
}

/** O que a ação relata: o que criou, o que já existia (e ficou intacto) e o que recusou, com o motivo. */
export interface RelatorioDaInicializacao {
    criados: string[];
    existiam: string[];
    recusados: Array<{ caminho: string; motivo: string }>;
}

/** A pasta das áreas. */
export const PASTA_DAS_AREAS = '100 - AREAS';

/** As pastas do esqueleto de um cofre novo: as mesmas do `cofre-modelo/` do pacote. */
export const ESQUELETO_PADRAO: readonly string[] = Object.freeze([
    '000 - KERNEL',
    PASTA_DAS_AREAS,
    '200 - FUNCTIONS/Config',
    '200 - FUNCTIONS/Config/dominios',
    '200 - FUNCTIONS/Config/ramos',
    '200 - FUNCTIONS/Habits/Tracker',
    '200 - FUNCTIONS/Models',
    '200 - FUNCTIONS/Protocolos',
    '200 - FUNCTIONS/Scripts',
    '200 - FUNCTIONS/Templates',
    '300 - RUNTIME/000 - COCKPIT',
    '300 - RUNTIME/001 - INBOX',
    '300 - RUNTIME/302 - Daymiss/Day',
    '300 - RUNTIME/302 - Daymiss/Week',
    '300 - RUNTIME/302 - Daymiss/Month',
    '300 - RUNTIME/302 - Daymiss/Quarterly',
    '300 - RUNTIME/302 - Daymiss/Year',
    '300 - RUNTIME/302 - Daymiss/Long-Term',
    '400 - MEMORY/100 - DAILY',
    '400 - MEMORY/100 - DAILY/Reputação contextual',
    '400 - MEMORY/200 - WEEKLY',
    '400 - MEMORY/200 - WEEKLY/Roteiros',
    '400 - MEMORY/400 - QUARTERLY',
    '400 - MEMORY/500 - LONG-TERM',
    '400 - MEMORY/Valores',
    '500 - RESOURCES/Ideias',
    '500 - RESOURCES/Lições',
    '500 - RESOURCES/Pessoas',
    '900 - ARCHIVE',
    'TaskNotes/Tasks',
    'TaskNotes/Archive',
    'TaskNotes/Views',
]);

/** O que cada área ganha, dentro da pasta dela: o índice, as seis colunas dos projetos, os departamentos e o arquivo. */
export const PASTAS_DA_AREA: readonly string[] = Object.freeze([
    '000 - INDEX',
    '100 - PROJECTS/1 - Backlog',
    '100 - PROJECTS/2 - Active',
    '100 - PROJECTS/3 - Waiting',
    '100 - PROJECTS/4 - Review',
    '100 - PROJECTS/5 - Done',
    '100 - PROJECTS/6 - Integration',
    '200 - DEPARTMENTS',
    '300 - ARCHIVES',
]);

/** A nota da área, dentro da pasta dela (o `type: area` é o que faz o sistema reconhecer a área). */
export const NOTA_DA_AREA = '000 - INDEX/README.md';

/** O modelo da nota da área no cofre (o `Areas_template`), lido pelo motor quando existe. */
export const MODELO_DA_AREA = '200 - FUNCTIONS/Templates/Areas_template.md';

/** A pasta das notas de valor, a de partida das definições (`pastas.valores`). */
export const PASTA_DOS_VALORES = '400 - MEMORY/Valores';

/** O modelo da nota de valor no cofre (o `Valor_template`), lido pelo motor quando existe. */
export const MODELO_DO_VALOR = '200 - FUNCTIONS/Templates/Valor_template.md';

/** As pastas de primeiro nível que a inicialização nunca toca: a configuração do Obsidian, o git e a lixeira. */
const RESERVADAS = new Set(['.obsidian', '.git', '.trash']);

/** O teto de um caminho e de um nome (o resto é entrada hostil ou engano). */
const MAXIMO_DO_CAMINHO = 400;
const MAXIMO_DO_NOME = 80;

/**
 * O que faz: o caminho relativo dentro do cofre, normalizado (sem barra no começo nem no fim),
 * ou o motivo de recusar.
 * Por quê: C0: só se cria dentro do cofre; o caminho vem das definições, que a pessoa escreve
 * (e um pacote de terceiros pode escrever), então a borda confere antes de qualquer gravação.
 * Entra → sai: qualquer valor → `{ caminho }` ou `{ motivo }`.
 * Erro e ataque: não-texto, vazio ou longo demais; absoluto (`/x`, `~`, `C:`); barra invertida;
 * caractere de controle; segmento vazio (`a//b`), `.` ou `..`; a pasta de configuração, o git
 * ou a lixeira no primeiro nível: tudo recusado com o motivo.
 * Prova: tests/engine/inicializacao.test.ts ("caminhoNoCofre").
 */
export function caminhoNoCofre(bruto: unknown): { caminho: string } | { motivo: string } {
    if (typeof bruto !== 'string') return { motivo: 'o caminho não é texto' };
    const texto = bruto.trim();
    if (!texto) return { motivo: 'o caminho está vazio' };
    if (texto.length > MAXIMO_DO_CAMINHO) return { motivo: 'o caminho é longo demais' };
    if (/[\u0000-\u001f\u007f]/.test(texto)) return { motivo: 'o caminho tem um caractere de controle' };
    if (texto.includes('\\')) return { motivo: 'o caminho usa barra invertida' };
    if (texto.startsWith('/') || texto.startsWith('~') || /^[A-Za-z]:/.test(texto)) return { motivo: 'o caminho é absoluto (fora do cofre)' };
    const partes = texto.replace(/\/+$/, '').split('/');
    if (partes.some(p => p === '' || p.trim() !== p)) return { motivo: 'o caminho tem um segmento vazio ou com espaço nas pontas' };
    if (partes.some(p => p === '.' || p === '..')) return { motivo: 'o caminho sai do lugar (. ou ..)' };
    if (RESERVADAS.has(partes[0])) return { motivo: `o caminho entra em ${partes[0]}, que a inicialização não toca` };
    return { caminho: partes.join('/') };
}

/**
 * O que faz: o nome de uma área, conferido para virar pasta, ou `null`.
 * Por quê: o nome vira `NN - <Nome>`: barra, ponto no começo e caractere de controle fariam outra pasta.
 * Entra → sai: qualquer valor → o nome sem espaços nas pontas, ou `null`.
 * Erro e ataque: não-texto, vazio, longo demais, com `/`, `\`, `:` ou controle, começando por `.`: `null`.
 * Prova: tests/engine/inicializacao.test.ts ("planoDaInicializacao").
 */
export function nomeDaArea(bruto: unknown): string | null {
    if (typeof bruto !== 'string') return null;
    const nome = bruto.trim();
    if (!nome || nome.length > MAXIMO_DO_NOME || nome.startsWith('.')) return null;
    if (/[\\/:\u0000-\u001f\u007f]/.test(nome)) return null;
    return nome;
}

/**
 * O que faz: a pasta de cada área: a declarada (`pasta`), senão a que já existe em `100 - AREAS/`
 * com o mesmo nome depois do número (`03 - Saúde` para "Saúde"), senão `NN - <Nome>` com o
 * primeiro número livre.
 * Por quê: rodar de novo não pode criar `02 - Saúde` ao lado do `01 - Saúde` que já existe; e
 * a pessoa que já tem áreas numeradas não perde a numeração dela.
 * Entra → sai: as áreas e as pastas que já existem em `100 - AREAS/` → `[nome, pasta]` na ordem
 * das áreas, e os problemas.
 * Erro e ataque: nome inválido ou repetido (sem caixa nem acento) sai com o problema; pasta
 * declarada inválida (com `/`, `..`) sai com o problema; a comparação com as existentes ignora
 * caixa e acento.
 * Prova: tests/engine/inicializacao.test.ts ("planoDaInicializacao").
 */
export function pastasDasAreas(areas: readonly AreaDaInicializacao[], existentes: readonly string[]): { pastas: Array<[string, string]>; problemas: string[] } {
    const dobrar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const semNumero = (pasta: string) => pasta.replace(/^\d+\s*-\s*/, '');
    const problemas: string[] = [];
    const pastas: Array<[string, string]> = [];
    const numeros = new Set(existentes.map(p => Number(/^(\d+)\s*-/.exec(p)?.[1] ?? NaN)).filter(n => Number.isFinite(n)));
    const vistos = new Set<string>();
    (Array.isArray(areas) ? areas : []).forEach((area, i) => {
        const nome = nomeDaArea(area?.nome);
        if (!nome) { problemas.push(`a área ${i + 1} não tem um nome que vire pasta`); return; }
        if (vistos.has(dobrar(nome))) { problemas.push(`a área ${nome} se repete`); return; }
        vistos.add(dobrar(nome));
        if (area.pasta !== undefined) {
            const pasta = nomeDaArea(area.pasta);
            if (!pasta) { problemas.push(`a pasta da área ${nome} não é um nome de pasta`); return; }
            pastas.push([nome, pasta]);
            return;
        }
        const existente = existentes.find(p => dobrar(semNumero(p)) === dobrar(nome));
        if (existente) { pastas.push([nome, existente]); return; }
        let n = 1;
        while (numeros.has(n)) n++;
        numeros.add(n);
        const pasta = `${String(n).padStart(2, '0')} - ${nome}`;
        pastas.push([nome, pasta]);
    });
    return { pastas, problemas };
}

/**
 * O que faz: o conteúdo de partida da nota de uma área: o modelo do cofre com `{{nome}}` trocado
 * pelo nome, ou, sem modelo, uma nota mínima com `type: area` e o nome no título.
 * Por quê: C, "o que grava": a nota da área pelo `Areas_template`; o `type: area` é o que o
 * sistema lê para reconhecer a área.
 * Entra → sai: o nome e o modelo (ou `null`) → o texto da nota.
 * Erro e ataque: o modelo sem `type: area` ganha a nota mínima (sem o tipo, a área não seria
 * reconhecida); o nome entra como texto, sem virar marcador.
 * Prova: tests/engine/inicializacao.test.ts ("planoDaInicializacao").
 */
export function notaDaArea(nome: string, modelo: string | null): string {
    if (typeof modelo === 'string' && /^type:\s*area\s*$/m.test(modelo)) return modelo.split('{{nome}}').join(nome);
    return `---\ntype: area\n---\n\n# ${nome}\n`;
}

/**
 * O que faz: o conteúdo de partida da nota de um valor: o modelo do cofre com `{{nome}}` e
 * `{{porque}}` trocados e a linha `ordem:` do frontmatter com o número (ou posta depois do
 * `type: valor`), ou, sem modelo, uma nota mínima com `type: valor`, a `ordem`, `grupo: individual`,
 * o nome no título e o porquê no corpo.
 * Por quê: a 🌳 sugere o valor da semana das notas `type: valor` com `grupo: individual` da pasta
 * dos valores, pela `ordem`; sem a nota, o passo obrigatório do valor fica sem opção e a semana
 * não se planeja. O porquê é o que a pessoa respondeu na inicialização.
 * Entra → sai: o nome, o porquê, a ordem (1 = o primeiro) e o modelo (ou `null`) → o texto da nota.
 * Erro e ataque: o modelo sem `type: valor` e `grupo: individual` ganha a nota mínima (sem eles, o
 * valor não seria sugerido); o nome e o porquê entram como texto, numa linha só (a quebra de linha
 * vira espaço), sem virar marcador nem frontmatter.
 * Prova: tests/engine/inicializacao.test.ts ("notaDoValor").
 */
export function notaDoValor(nome: string, porque: string, ordem: number, modelo: string | null): string {
    const linha = (s: string) => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim();
    const [n, p] = [linha(nome), linha(porque)];
    if (typeof modelo === 'string' && /^type:\s*valor\s*$/m.test(modelo) && /^grupo:\s*individual\s*$/m.test(modelo)) {
        // A ordem é número no frontmatter: a linha vazia do modelo (`ordem:`) ganha o número, sem marca `{{…}}` no YAML.
        const comOrdem = /^ordem:.*$/m.test(modelo) ? modelo.replace(/^ordem:.*$/m, `ordem: ${ordem}`) : modelo.replace(/^type:\s*valor\s*$/m, linha => `${linha}\nordem: ${ordem}`);
        return comOrdem.split('{{nome}}').join(n).split('{{porque}}').join(p);
    }
    return `---\ntype: valor\nordem: ${ordem}\ngrupo: individual\n---\n\n# ${n}\n${p ? `\n**Por quê:** ${p}\n` : ''}`;
}

/**
 * O que faz: o plano da inicialização: as pastas do esqueleto, a pasta de cada área com o que
 * ela ganha e a nota dela, e a nota de cada valor, na ordem em que se criam (cada pasta antes do
 * que mora nela), sem repetir caminho.
 * Por quê: C0 e C ("o que grava"): o plano é puro e se confere inteiro antes de gravar; o
 * aplicador só cria o que falta, e o que existe fica intacto.
 * Entra → sai: as definições, as pastas que já existem em `100 - AREAS/` e os modelos da nota da
 * área e da nota de valor (ou `null`) → `{ passos, problemas }`.
 * Erro e ataque: as definições sem áreas nem valores dão só o esqueleto; esqueleto com caminho
 * inválido (fora do cofre) entra no plano e o aplicador o recusa e relata; área inválida sai com o
 * problema; o valor cujo nome não vira nome de arquivo (a mesma regra do nome da área) ou se repete
 * sai com o problema; a pasta dos valores inválida é recusada pelo aplicador; a entrada não é mutada.
 * Prova: tests/engine/inicializacao.test.ts ("planoDaInicializacao").
 */
export function planoDaInicializacao(definicoes: DefinicoesDaInicializacao, areasExistentes: readonly string[] = [], modeloDaArea: string | null = null, modeloDoValor: string | null = null): PlanoDaInicializacao {
    const passos: PassoDaInicializacao[] = [];
    const vistos = new Set<string>();
    const pasta = (caminho: string) => {
        // Cada ancestral antes: o cofre pode não criar a pasta do meio sozinho.
        const partes = caminho.split('/');
        for (let i = 1; i <= partes.length; i++) {
            const c = partes.slice(0, i).join('/');
            if (c && !vistos.has(c)) { vistos.add(c); passos.push({ tipo: 'pasta', caminho: c }); }
        }
    };
    const esqueleto = Array.isArray(definicoes?.esqueleto) ? definicoes.esqueleto : ESQUELETO_PADRAO;
    for (const c of esqueleto) {
        const ok = caminhoNoCofre(c);
        // O inválido entra como está, para o aplicador recusar e relatar com o motivo.
        if ('caminho' in ok) pasta(ok.caminho);
        else if (!vistos.has(String(c))) { vistos.add(String(c)); passos.push({ tipo: 'pasta', caminho: String(c) }); }
    }
    const { pastas, problemas } = pastasDasAreas(definicoes?.areas ?? [], areasExistentes);
    for (const [nome, nomeDaPasta] of pastas) {
        const raiz = `${PASTA_DAS_AREAS}/${nomeDaPasta}`;
        pasta(raiz);
        for (const sub of PASTAS_DA_AREA) pasta(`${raiz}/${sub}`);
        const nota = `${raiz}/${NOTA_DA_AREA}`;
        if (!vistos.has(nota)) { vistos.add(nota); passos.push({ tipo: 'nota', caminho: nota, conteudo: notaDaArea(nome, modeloDaArea) }); }
    }
    const valores = Array.isArray(definicoes?.valores) ? definicoes.valores : [];
    if (valores.length) {
        const casa = typeof definicoes.pastaDosValores === 'string' && definicoes.pastaDosValores.trim() ? definicoes.pastaDosValores.trim().replace(/\/+$/, '') : PASTA_DOS_VALORES;
        const ok = caminhoNoCofre(casa);
        // A pasta inválida fica como está nos caminhos das notas, para o aplicador recusar e relatar.
        const raiz = 'caminho' in ok ? ok.caminho : casa;
        if ('caminho' in ok) pasta(raiz);
        const dobrar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const vistosDosValores = new Set<string>();
        valores.forEach((valor, i) => {
            // O nome do valor vira o nome do arquivo: a mesma regra do nome da pasta da área.
            const nome = nomeDaArea(valor?.nome);
            if (!nome) { problemas.push(`o valor ${i + 1} não tem um nome que vire nota`); return; }
            if (vistosDosValores.has(dobrar(nome))) { problemas.push(`o valor ${nome} se repete`); return; }
            vistosDosValores.add(dobrar(nome));
            const nota = `${raiz}/${nome}.md`;
            if (!vistos.has(nota)) { vistos.add(nota); passos.push({ tipo: 'nota', caminho: nota, conteudo: notaDoValor(nome, String(valor?.porque ?? ''), vistosDosValores.size, modeloDoValor) }); }
        });
    }
    return { passos, problemas };
}

/**
 * O que faz: aplica o plano no cofre dado: cria cada pasta e cada nota que falta, deixa intacto
 * o que existe, recusa o caminho fora do cofre e relata as três listas.
 * Por quê: C0: idempotente (a segunda rodada não cria nada), nunca sobrescreve, só dentro do
 * cofre; o relatório é o que o protocolo mostra à pessoa.
 * Entra → sai: o plano e o cofre → o relatório (a promessa não rejeita).
 * Erro e ataque: o caminho é conferido de novo aqui (`caminhoNoCofre`), mesmo vindo do plano;
 * uma nota cujo caminho já existe (nota ou pasta) não é tocada; a pasta pai recusada recusa o que
 * mora nela; a criação que falha vira recusa com o motivo, e o resto do plano segue.
 * Prova: tests/engine/inicializacao.test.ts ("aplicarInicializacao").
 */
export async function aplicarInicializacao(plano: PlanoDaInicializacao, cofre: CofreDaInicializacao): Promise<RelatorioDaInicializacao> {
    const relatorio: RelatorioDaInicializacao = { criados: [], existiam: [], recusados: [] };
    const recusadas: string[] = [];
    for (const passo of plano?.passos ?? []) {
        const ok = caminhoNoCofre(passo?.caminho);
        if (!('caminho' in ok)) { relatorio.recusados.push({ caminho: String(passo?.caminho ?? ''), motivo: ok.motivo }); continue; }
        const caminho = ok.caminho;
        const pai = recusadas.find(r => caminho.startsWith(`${r}/`));
        if (pai) { relatorio.recusados.push({ caminho, motivo: `a pasta ${pai} não foi criada` }); continue; }
        try {
            if (cofre.existe(caminho)) { relatorio.existiam.push(caminho); continue; }
            if (passo.tipo === 'pasta') await cofre.criarPasta(caminho);
            else await cofre.criarNota(caminho, passo.conteudo);
            relatorio.criados.push(caminho);
        } catch (e) {
            if (passo.tipo === 'pasta') recusadas.push(caminho);
            relatorio.recusados.push({ caminho, motivo: `o cofre não criou: ${e instanceof Error ? e.message : String(e)}` });
        }
    }
    return relatorio;
}

/**
 * O que faz: as definições da rodada: as áreas respondidas no protocolo (`areas`, lista ou texto
 * de uma por linha, ou `areas_selected`), senão as das definições do plugin.
 * Por quê: C: as perguntas do protocolo de inicialização dão as áreas; refeita pela aba, a
 * inicialização usa as definições que já estão gravadas.
 * Entra → sai: as variáveis da rodada e as definições do plugin (qualquer valor) → as definições.
 * Erro e ataque: valor que não é lista nem texto vale como ausente; linha vazia sai; o item das
 * definições sem `nome` sai (o plano o acusaria); nada da entrada é mutado.
 * Prova: tests/engine/inicializacao.test.ts ("definicoesDaRodada").
 */
export function definicoesDaRodada(variaveis: Record<string, unknown> | null | undefined, doPlugin: unknown): DefinicoesDaInicializacao {
    const daResposta = (v: unknown): AreaDaInicializacao[] | null => {
        if (Array.isArray(v)) return v.filter(x => typeof x === 'string' && x.trim()).map(x => ({ nome: (x as string).trim() }));
        if (typeof v === 'string' && v.trim()) return v.split('\n').map(l => l.trim()).filter(Boolean).map(nome => ({ nome }));
        return null;
    };
    const respondidas = daResposta(variaveis?.areas) ?? daResposta(variaveis?.areas_selected);
    if (respondidas) return { areas: respondidas };
    const lista = (doPlugin as any)?.areas;
    const areas = Array.isArray(lista)
        ? lista.filter((a: any) => a && typeof a.nome === 'string').map((a: any) => ({ nome: a.nome, ...(typeof a.pasta === 'string' && a.pasta.trim() ? { pasta: a.pasta.trim() } : {}) }))
        : [];
    return { areas };
}

/**
 * O que faz: a frase do relatório para o aviso e para a nota do protocolo.
 * Por quê: C0, "relata o que criou": a pessoa vê quanto foi criado, quanto já estava e o que foi recusado.
 * Entra → sai: o relatório → uma linha curta (o detalhe fica nas listas).
 * Erro e ataque: listas vazias dizem "nada a criar"; a recusa aparece sempre que houver.
 * Prova: tests/engine/inicializacao.test.ts ("aplicarInicializacao").
 */
export function fraseDoRelatorio(relatorio: RelatorioDaInicializacao): string {
    const partes = [relatorio.criados.length ? `${relatorio.criados.length} criado(s)` : 'nada a criar'];
    if (relatorio.existiam.length) partes.push(`${relatorio.existiam.length} já existia(m)`);
    if (relatorio.recusados.length) partes.push(`${relatorio.recusados.length} recusado(s)`);
    return `Inicialização: ${partes.join(', ')}.`;
}

/**
 * O que faz: o bloco `definicoes` do salvamento com as respostas da inicialização: o nome
 * (`nome`), os valores (`valores`, um por linha, `nome | porquê`), as áreas respondidas com a
 * pasta que o plano deu a cada uma, o foco do trimestre (`foco`, um por linha) e `inicializado: true`.
 * Por quê: C do mapa da v0: o protocolo pergunta as definições e grava as respostas nas definições
 * do plugin. Cada campo passa pela mesma edição da aba (`editarTexto`, `editarLista`), então vale o
 * que o leitor aceita, e só o que mudou entra no bloco.
 * Entra → sai: o salvamento, as camadas de partida, as variáveis da rodada e as pastas das áreas
 * (`[nome, pasta]`, de `pastasDasAreas`) → o bloco, se mudou e os problemas.
 * Erro e ataque: resposta vazia não mexe no campo; a área só entra quando foi respondida na rodada
 * (refeita sem respostas, as áreas gravadas ficam como estão); a edição que o leitor recusaria
 * (uma linha fora do formato) fica de fora com o problema; rodar de novo com as mesmas respostas
 * não muda nada; a entrada não é mutada.
 * Prova: tests/engine/inicializacaoDefinicoes.test.ts.
 */
export function definicoesRespondidas(
    salvo: unknown,
    partida: ReadonlyArray<unknown>,
    variaveis: Record<string, unknown> | null | undefined,
    pastas: ReadonlyArray<readonly [string, string]>,
): { bloco: Record<string, unknown>; mudou: boolean; problemas: string[] } {
    const ehObjeto = (v: unknown): v is Record<string, unknown> => Object.prototype.toString.call(v) === '[object Object]';
    const textoDe = (v: unknown) => (Array.isArray(v) ? v.filter(x => typeof x === 'string').join('\n') : typeof v === 'string' ? v : '');
    let atual: Record<string, unknown> = ehObjeto(salvo) ? { ...salvo } : {};
    const problemas: string[] = [];
    const aplicar = (edicao: Edicao) => {
        if ('erro' in edicao) problemas.push(edicao.erro);
        else if (edicao.bloco) atual = { ...atual, definicoes: edicao.bloco };
    };
    const nome = textoDe(variaveis?.nome).trim();
    if (nome) aplicar(editarTexto(atual, partida, 'pessoa.nome', nome));
    const valores = textoDe(variaveis?.valores);
    if (valores.trim()) aplicar(editarLista(atual, partida, 'valores', valores));
    if (textoDe(variaveis?.areas).trim() && pastas.length) aplicar(editarLista(atual, partida, 'areas', pastas.map(([n, p]) => `${n}${SEPARADOR}${p}`).join('\n')));
    const foco = textoDe(variaveis?.foco);
    if (foco.trim()) aplicar(editarLista(atual, partida, 'trimestre.foco', foco));
    const antes = ehObjeto(salvo) && ehObjeto(salvo.definicoes) ? salvo.definicoes : {};
    let bloco: Record<string, unknown> = ehObjeto(atual.definicoes) ? atual.definicoes : {};
    if (lerDefinicoes(atual, partida).inicializado !== true) bloco = blocoComMudanca(bloco, 'inicializado', true);
    return { bloco, mudou: JSON.stringify(bloco) !== JSON.stringify(antes), problemas };
}
