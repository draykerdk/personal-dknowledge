/**
 * O grupo de um protocolo pelo prefixo do id (Roteadores, Revisões, Planejamento…).
 *
 * Mora aqui, sem Obsidian, para que os modelos puros do quadro (`board/protocolModel.ts`)
 * agrupem como o snapshot; `missionControl.ts` reexporta `protocolGroup`.
 */
const PROTOCOL_GROUPS: Array<{ prefix: string; label: string }> = [
    { prefix: 'router_', label: 'Roteadores' },
    { prefix: 'review_', label: 'Revisões' },
    { prefix: 'planejamento_', label: 'Planejamento' },
    { prefix: 'act_', label: 'Instrumentos ACT' },
    { prefix: 'protocolo_', label: 'Protocolos' },
];

/** O que faz: o rótulo do grupo do id; sem prefixo conhecido, "Outros". */
export function protocolGroup(id: string): string {
    return PROTOCOL_GROUPS.find(group => id.startsWith(group.prefix))?.label ?? 'Outros';
}

/* ------------------------------------------------- o id do protocolo na linha da Day */

/**
 * O que faz: a marca invisível com o id do protocolo, que vai no fim da linha que ele escreve na Day
 * (` <!-- dfm-protocolo:planejamento_semanal -->`, o comentário que o Obsidian não mostra na leitura).
 * Por quê: a fila do §6, item 5 (o rastro da reputação; MAPA_Tipos_de_Funcao §4.3, item 3): a linha
 * levava só o rótulo, e um nome trocado apagava o histórico ("Planejamento Semanal (Oficial)" e mais
 * quatro, nas Days de 2026). Com o id, trocar o nome não apaga o uso; o rótulo continua visível.
 * Erro e ataque: id fora da forma do id de protocolo (letras minúsculas, números e `_`) não gera marca
 * (''), para nada estranho entrar no texto da Day.
 * Prova: tests/engine/escritorDaDay.test.ts ("o id do protocolo").
 */
export function marcaDoProtocolo(id: string): string {
    const t = String(id ?? '').trim();
    return /^[a-z0-9_]+$/.test(t) ? ` <!-- dfm-protocolo:${t} -->` : '';
}

/**
 * O que faz: o id do protocolo marcado numa linha da Day; sem marca, ''.
 * Por quê: os leitores do uso (o 🧭, a reputação, o painel da semana) acham a rodada pelo id primeiro e,
 * só na linha antiga sem marca, pelo rótulo.
 * Erro e ataque: a marca de captura (`dfm-captura`) não conta; a primeira marca de protocolo vale.
 * Prova: tests/engine/escritorDaDay.test.ts ("o id do protocolo").
 */
export function protocoloDaMarca(linha: string): string {
    return /<!-- dfm-protocolo:([a-z0-9_]+) -->/.exec(String(linha ?? ''))?.[1] ?? '';
}

