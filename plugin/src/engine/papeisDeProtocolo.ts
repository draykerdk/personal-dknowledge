/**
 * Os papéis de protocolo: o código pede um protocolo pelo que ele faz (planejar a semana,
 * abrir o dia, criar o projeto), nunca pelo id; a tabela papel → id diz qual protocolo do
 * cofre faz o papel.
 *
 * Por quê: o mapa da v0 (D1, 03/11/2026): o plugin aberto não traz os protocolos do cofre de
 * origem, e um botão que chama um id que o cofre não tem é um botão quebrado. Pelo papel, o
 * botão (ou a opção) só aparece quando o cofre tem um protocolo para ele; sem, some, sem aviso
 * nem erro. Este módulo é o dono da lista dos papéis (`PAPEIS`); nenhum id mora aqui. A tabela
 * vem das definições do sistema (`protocolos_por_papel`, lida por `lerDefinicoes` em
 * `src/definicoes.ts`): os padrões da v0 dão os protocolos do ciclo e o resto `null`; o módulo
 * do cofre (`src/opcionais/cofre.ts`) traz os ids dele como camada de partida.
 *
 * Módulo puro, folha: não importa nada (a lista da ponte do agente e o leitor das definições
 * leem daqui).
 * Prova: tests/engine/papeisDeProtocolo.test.ts.
 */

/** Os papéis, na ordem em que a aba de configurações os mostra. */
export const PAPEIS = Object.freeze([
    // O ciclo: os botões ▶️ 🌙 🌳 📅 📨 🧭 🔄, as portas do painel e a inicialização.
    'abrir_dia',
    'fechar_dia',
    'planejar_dia',
    'planejar_semana',
    'planejar_proxima_semana',
    'revisar_semana',
    'planejar_trimestre',
    'revisar_trimestre',
    'inicializar',
    // A situação: o primeiro menu e os menus que a ponte do agente pode abrir.
    'perguntar_a_situacao',
    'menu_operacional',
    'menu_dos_ciclos',
    'menu_da_captura',
    // As práticas que a ponte do agente pode conduzir.
    'micro_revisao',
    'desbloquear',
    'coragem',
    'vitoria',
    'sessao_de_foco',
    // Criar: o projeto, o departamento, a SMART, a tarefa da SMART, o gesto do agora.
    'criar_projeto',
    'criar_departamento',
    'criar_smart',
    'nova_tarefa_do_projeto',
    'fazer_agora',
    // A Missão: a visão, o destino da ideia na triagem, os donos das casas e o registro do conceito
    // (o `type` das notas que ele grava é o id dele, e a casa das ideias as lê como ideias).
    'visao',
    'destino_da_ideia',
    'criar_cidade',
    'criar_pais',
    'registrar_pessoa',
    'capturar_ideia',
    'registrar_conceito',
    // As peças: o registro de onde a peça saiu; o inventário que gera o canvas próprio.
    'registrar_publicacao',
    'inventariar_sofrimento',
] as const);

/** Um papel de protocolo (um item de `PAPEIS`). */
export type Papel = typeof PAPEIS[number];

/** A tabela vigente: cada papel com o id que o faz, ou `null` (o papel está desligado). */
export type TabelaDosPapeis = Readonly<Record<Papel, string | null>>;

/** O id de um protocolo como o cofre o escreve (o `id` do JSON): letras, números, `_` e `-`. */
const ID_DE_PROTOCOLO = /^[A-Za-z0-9_-]+$/;

const CONJUNTO_DOS_PAPEIS: ReadonlySet<string> = new Set(PAPEIS);

/**
 * O que faz: diz se um texto é um papel conhecido.
 * Por quê: as definições vêm do `data.json` e de quem escreve um pacote; só os papéis da lista entram.
 * Entra → sai: qualquer valor → `true` só para um item de `PAPEIS`.
 * Erro e ataque: `__proto__`, `constructor` e `toString` não são papéis (a busca é num conjunto, não num objeto).
 * Prova: tests/engine/papeisDeProtocolo.test.ts ("ehPapel").
 */
export function ehPapel(valor: unknown): valor is Papel {
    return typeof valor === 'string' && CONJUNTO_DOS_PAPEIS.has(valor);
}

/**
 * O que faz: diz se um texto serve de id de protocolo (letras, números, `_` e `-`, sem espaço).
 * Por quê: o id escolhido vira o nome de um arquivo lido do cofre; a aba e o leitor das definições
 * recusam pelo mesmo critério.
 * Entra → sai: qualquer valor → `true` só para um id válido (já aparado).
 * Erro e ataque: vazio, espaço, barra, ponto (`../x`) e o que não é texto dão `false`.
 * Prova: tests/engine/papeisDeProtocolo.test.ts ("tabelaDosPapeis").
 */
export function ehIdDeProtocolo(valor: unknown): valor is string {
    return typeof valor === 'string' && ID_DE_PROTOCOLO.test(valor);
}

/**
 * O que faz: uma tabela nova: a base, com o que o bloco declarado traz por cima: um id troca o
 * protocolo do papel; `null` desliga o papel.
 * Por quê: o esquema das definições (`protocolos_por_papel`, B1 do mapa da v0): cada camada (os
 * padrões, o módulo do cofre, o bloco salvo) diz o que muda, e o resto fica o da camada de baixo.
 * É o único lugar que lê um bloco de papéis; o leitor das definições chama este.
 * Entra → sai: a base (uma tabela inteira) e o bloco declarado (qualquer valor) → uma tabela nova,
 * congelada, com todos os papéis.
 * Erro e ataque: bloco que não é objeto (ou é lista) vale como ausente; papel desconhecido,
 * `_porque` e as chaves de protótipo ficam de fora; id vazio, com espaço, barra ou ponto
 * (`../x`) não entra (fica o da base); nem a base nem o bloco são mutados.
 * Prova: tests/engine/papeisDeProtocolo.test.ts ("tabelaDosPapeis").
 */
export function tabelaDosPapeis(base: TabelaDosPapeis, declarada?: unknown): TabelaDosPapeis {
    const tabela: Record<string, string | null> = {};
    for (const papel of PAPEIS) tabela[papel] = base[papel] ?? null;
    if (!declarada || typeof declarada !== 'object' || Array.isArray(declarada)) return Object.freeze(tabela) as TabelaDosPapeis;
    for (const [papel, valor] of Object.entries(declarada as Record<string, unknown>)) {
        if (!ehPapel(papel)) continue;
        if (valor === null) tabela[papel] = null;
        else if (typeof valor === 'string' && ehIdDeProtocolo(valor.trim())) tabela[papel] = valor.trim();
    }
    return Object.freeze(tabela) as TabelaDosPapeis;
}

/**
 * O que faz: o id do protocolo que faz o papel neste cofre, ou `null` (papel desligado, ou o
 * cofre não tem o protocolo).
 * Por quê: D1 do mapa da v0: o botão só aparece quando o protocolo existe; quem desenha pergunta
 * aqui e, com `null`, não desenha.
 * Entra → sai: o papel, a tabela vigente e o "existe?" do gerente → o id, ou `null`.
 * Erro e ataque: papel desconhecido dá `null`; o "existe?" que lança conta como ausente.
 * Prova: tests/engine/papeisDeProtocolo.test.ts ("protocoloDoPapel").
 */
export function protocoloDoPapel(papel: string, tabela: TabelaDosPapeis, existe: (id: string) => boolean): string | null {
    if (!ehPapel(papel)) return null;
    const id = tabela[papel];
    if (!id) return null;
    try { return existe(id) ? id : null; } catch (e) { return null; }
}

/**
 * O que faz: diz se o id que terminou (ou que roda) é o protocolo de um dos papéis dados.
 * Por quê: os ouvintes do `dfm:protocol-complete` (o fim do 🌳, do 🧭, do 🌙) reagem pelo papel, não pelo id.
 * Entra → sai: o id, os papéis e a tabela vigente → `true` se algum papel aponta o id.
 * Erro e ataque: id vazio ou que não é texto dá `false`; papel desligado (`null`) não casa com nada.
 * Prova: tests/engine/papeisDeProtocolo.test.ts ("ehDoPapel").
 */
export function ehDoPapel(id: unknown, papeis: readonly Papel[], tabela: TabelaDosPapeis): boolean {
    if (typeof id !== 'string' || !id) return false;
    return papeis.some(papel => tabela[papel] === id);
}
