/**
 * O movimento da Missão: a roda e o trackpad viram passos de linha, e a borda do arrasto
 * vira velocidade.
 *
 * Por quê: um pedido de acabamento na rolagem e no movimento (28/10/2026, P7c).
 * Antes, a roda somava os deltas num acumulador que se zerava pelo relógio: um deslize leve
 * do trackpad às vezes pulava duas ou três linhas (a cauda da inércia continuava somando
 * depois do passo), e o mouse precisava de dois entalhes por linha quando o entalhe vinha
 * como 50 px. Aqui, cada gesto (os eventos com menos de `PAUSA_DO_GESTO` entre si) escolhe
 * um eixo no primeiro movimento que conta, e fica nele; o entalhe da roda do mouse é uma
 * linha; o trackpad soma até `LIMIAR` para o primeiro passo, e os seguintes pedem mais
 * (`LIMIAR_SEGUINTE`) e um intervalo, até `MAX_POR_GESTO`; depois de um passo, a cauda da
 * inércia (os deltas que só diminuem) vale metade, e o gesto anda no máximo o que o pico
 * dele pede (`linhasDoPico`): o deslize leve, uma linha, por mais longa que seja a cauda.
 *
 * A borda do arrasto: perto de cima ou de baixo, anda no tempo; perto dos lados, anda entre
 * as asas; a velocidade cresce com a proximidade.
 *
 * A pinça (o terceiro eixo, "quanto", a proposta de 29/10): a roda com Ctrl (é assim que o
 * Chromium do macOS entrega a pinça do trackpad) ou com ⌘ (a roda do mouse) é o eixo `z`, da
 * profundidade, e nunca um passo de linha. Um gesto dá um nível só (`nivel`, ±1), pela mesma
 * pausa do gesto: a cauda da inércia não dá o segundo. O sentido é a constante
 * `DEDOS_QUE_SE_ABREM`, não uma conta escondida. A pinça do toque (dois dedos) mora em `pinca.ts`.
 *
 * Módulo puro: sem DOM nem relógio (o tempo vem no evento). Prova: tests/missao/movimento.test.ts
 * e tests/missao/pinca.test.ts.
 */
import { APROXIMA, type PassoDeNivel } from './tempo';

/**
 * O limiar do arrasto da casa, em px: o deslocamento antes de o gesto virar arrasto. O mesmo no
 * arrasto da Missão (`view/arrasto.ts`), no painel e no canvas. Mudou de casa em 02/11/2026: morava
 * em `ui/mission/dragdrop.ts`, do painel antigo que se aposenta, que agora o lê daqui.
 */
export const DRAG_THRESHOLD = 4;

/**
 * O sentido da pinça: o passo de nível quando os dedos se abrem. Aproximar (`APROXIMA`, entrar no
 * ramo do objeto) é a convenção do macOS, que ele confirmou (29/10): abrir os dedos aproxima,
 * fechá-los afasta para o panorama. Trocar o sentido é trocar esta constante, e só ela.
 */
export const DEDOS_QUE_SE_ABREM: PassoDeNivel = APROXIMA;

/**
 * O sinal do `deltaY` da roda com Ctrl quando os dedos se abrem: no Chromium do macOS, negativo
 * (o mesmo sinal do ⌘ + roda para cima, que amplia). É um fato da plataforma, não uma escolha.
 */
export const DELTA_DOS_DEDOS_QUE_SE_ABREM = -1;

/** Quanto `deltaY` a pinça do trackpad soma antes do nível (uma pinça pequena não troca nada). */
export const LIMIAR_DA_PINCA = 12;

/**
 * O que faz: o passo de nível pelo sinal do `deltaY` de uma roda de profundidade, pela constante do sentido.
 * Por quê: o sentido mora em `DEDOS_QUE_SE_ABREM` e o fato da plataforma em `DELTA_DOS_DEDOS_QUE_SE_ABREM`.
 * Entra → sai: o `deltaY` → `APROXIMA`, `AFASTA` ou 0 (sem delta).
 * Erro e ataque: zero, `NaN` e infinito dão 0.
 * Prova: tests/missao/pinca.test.ts ("a pinça na roda").
 */
export function nivelDoDelta(deltaY: number): PassoDeNivel | 0 {
    if (!deltaY || !Number.isFinite(deltaY)) return 0;
    const abrem = Math.sign(deltaY) === DELTA_DOS_DEDOS_QUE_SE_ABREM;
    return abrem ? DEDOS_QUE_SE_ABREM : (-DEDOS_QUE_SE_ABREM as PassoDeNivel);
}

/** Pixels de trackpad para a primeira linha de um gesto. */
export const LIMIAR = 70;
/** Pixels para cada linha seguinte no mesmo gesto (um deslize forte anda, um leve não). */
export const LIMIAR_SEGUINTE = 160;
/** O máximo de linhas num gesto só (o deslize forte anda um número limitado). */
export const MAX_POR_GESTO = 3;
/** O intervalo mínimo entre dois passos do mesmo gesto, em ms. */
export const INTERVALO_ENTRE_PASSOS = 90;
/**
 * Quantas linhas o gesto pode andar, pelo pico do deslize (px por evento): o leve anda uma,
 * o médio até duas, o forte até `MAX_POR_GESTO`.
 */
export function linhasDoPico(pico: number): number {
    return pico < 40 ? 1 : pico < 100 ? 2 : MAX_POR_GESTO;
}
/** Sem evento por este tempo, o gesto acabou (o próximo começa do zero). */
export const PAUSA_DO_GESTO = 190;
/** O movimento mínimo que escolhe o eixo do gesto. */
export const MINIMO_DO_EIXO = 4;
/** A duração da animação de um passo (o deslize da trilha), em ms. */
export const DURACAO_DO_PASSO = 260;
/** A curva do passo: sai rápido e assenta devagar (ease-out). */
export const CURVA_DO_PASSO = 'cubic-bezier(.2,.8,.2,1)';

export interface EventoDaRoda {
    deltaX: number;
    deltaY: number;
    /** 0 = pixels, 1 = linhas, 2 = páginas (`WheelEvent.deltaMode`). */
    deltaMode: number;
    /** O instante do evento, em ms. */
    t: number;
    shiftKey?: boolean;
    /** Ctrl: a pinça do trackpad no Chromium do macOS (o eixo da profundidade). */
    ctrlKey?: boolean;
    /** ⌘: o ⌘ + roda do mouse (o eixo da profundidade). */
    metaKey?: boolean;
    /** O `wheelDeltaY` do Chromium, quando vem (separa o entalhe do trackpad). */
    wheelDeltaY?: number;
}

/** O eixo de um gesto: `x` de lado (o quê), `y` no tempo (quando), `z` a profundidade (quanto). */
export type EixoDoGesto = 'x' | 'y' | 'z';

export interface EstadoDaRoda {
    /** O eixo do gesto em curso (`null` = ainda não escolhido). */
    eixo: EixoDoGesto | null;
    acumulado: number;
    /** O sentido do que está acumulado (1 desce, −1 sobe; 0 = nada). */
    sentido: number;
    passos: number;
    ultimoEvento: number;
    ultimoPasso: number;
    /** O maior |delta| do gesto: diz quantas linhas ele pode andar (`linhasDoPico`). */
    pico: number;
    /** O |delta| do evento anterior. */
    anterior: number;
    /** O gesto já rolou um bloco por dentro (a lista longa, a coluna alta): ele não dá mais passo (30/10). */
    rolou?: boolean;
}

export const RODA_PARADA: EstadoDaRoda = { eixo: null, acumulado: 0, sentido: 0, passos: 0, ultimoEvento: -Infinity, ultimoPasso: -Infinity, pico: 0, anterior: 0, rolou: false };

/** O que um evento vertical dá diante de um bloco que pode ter conteúdo escondido: rolar o bloco por dentro, dar o passo, ou nada. */
export interface PassoNoBloco { estado: EstadoDaRoda; rolar: boolean; passos: number }

/**
 * O que faz: decide, para um evento vertical da roda, entre rolar o bloco por dentro (pixel a pixel)
 * e dar o passo (a próxima linha, o próximo período, o próximo da cadeia): enquanto o bloco ainda pode
 * rolar naquele sentido, ele rola; na borda, o passo só vem com um gesto novo (depois de
 * `PAUSA_DO_GESTO`), nunca na continuação do gesto que rolou.
 * Por quê: rolar uma lista longa não pode pular para o próximo bloco antes de todas as opções aparecerem
 * na tela (30/10/2026). Um dono só para a regra: o mapa da
 * Missão (a linha alta) e a vista do ramo (a coluna alta) perguntam aqui.
 * Entra → sai: o passo da roda (`passoDaRoda`) e se o bloco ainda rola naquele sentido → `PassoNoBloco`.
 * Erro e ataque: fora do eixo vertical, nada muda; o gesto que rolou e chegou à borda não dá passo
 * (a cauda da inércia não voa para o próximo); o bloco que cabe na tela dá o passo como sempre.
 * Prova: tests/missao/movimento.test.ts ("o bloco antes do passo") e tests/missao/componentePinca.test.ts.
 */
export function rolarNoBloco(r: PassoDaRoda, podeRolar: boolean): PassoNoBloco {
    if (r.eixo !== 'y') return { estado: r.estado, rolar: false, passos: r.passos };
    if (podeRolar) return { estado: { ...r.estado, rolou: true, acumulado: 0 }, rolar: true, passos: 0 };
    if (r.estado.rolou) return { estado: { ...r.estado, acumulado: 0 }, rolar: false, passos: 0 };
    return { estado: r.estado, rolar: false, passos: r.passos };
}

/**
 * O que faz: o evento é o entalhe de uma roda de mouse? Em linhas ou páginas (`deltaMode`);
 * pelo `wheelDelta` do Chromium, que é múltiplo de 120 no entalhe e vale −3 × delta no
 * trackpad; sem ele, um salto redondo de 100 ou 120 px, só num eixo.
 */
export function ehEntalhe(e: Pick<EventoDaRoda, 'deltaX' | 'deltaY' | 'deltaMode' | 'wheelDeltaY'>): boolean {
    if (e.deltaMode === 1 || e.deltaMode === 2) return true;
    if (typeof e.wheelDeltaY === 'number' && e.wheelDeltaY !== 0) return e.wheelDeltaY % 120 === 0 && e.wheelDeltaY !== -3 * e.deltaY;
    const d = Math.abs(e.deltaY || e.deltaX);
    return d >= 100 && Number.isInteger(d) && (d % 100 === 0 || d % 120 === 0) && Math.abs(e.deltaX) * Math.abs(e.deltaY) === 0;
}

/** O que um evento da roda dá: o estado seguinte, as linhas no tempo, o eixo do gesto e o nível da pinça. */
export interface PassoDaRoda {
    estado: EstadoDaRoda;
    /** As linhas a andar no tempo (com sinal: positivo desce); fora do eixo `y`, sempre 0. */
    passos: number;
    eixo: EixoDoGesto | null;
    /** O passo de nível da pinça (`APROXIMA`, `AFASTA`), uma vez por gesto; fora do eixo `z`, sempre 0. */
    nivel: PassoDeNivel | 0;
}

/** O que faz: a roda vem com Ctrl (a pinça do trackpad) ou com ⌘ (o mouse): é do eixo da profundidade. */
export const ehDaProfundidade = (e: Pick<EventoDaRoda, 'ctrlKey' | 'metaKey'>) => !!(e.ctrlKey || e.metaKey);

/**
 * O que faz: um evento da roda ou do trackpad → o estado seguinte e quantas linhas andar
 * (com sinal: positivo desce no tempo), ou o eixo `x` (os painéis de lado: o lugar deixa a
 * rolagem nativa, com o encaixe), ou o eixo `z` (a pinça, ou ⌘ com a roda) e o nível dele.
 * Por quê: P7c (um gesto, um eixo) e a pinça, o terceiro eixo (a proposta de 29/10): "um gesto
 * muda um nível só", e a pinça não rola, nem a rolagem muda o nível.
 * Entra → sai: o estado e o evento → `PassoDaRoda` (o estado de entrada não é mutado).
 * Erro e ataque: a cauda da inércia depois de um passo não anda; trocar de sentido zera o
 * acumulado; o gesto não passa de `MAX_POR_GESTO`; Shift + roda é de lado; o gesto que
 * começou de lado fica de lado (não briga com a trava vertical). A roda com Ctrl ou ⌘ nunca é
 * passo de linha: no começo do gesto ela escolhe o eixo `z`; no meio de um gesto de outro eixo
 * ela não dá nada (o gesto misto fica no primeiro eixo); o gesto `z` dá um nível só, e o resto
 * dele (a cauda, o Ctrl solto antes do fim) não dá outro nem rola.
 * Prova: tests/missao/movimento.test.ts e tests/missao/pinca.test.ts ("a pinça na roda").
 */
export function passoDaRoda(estado: EstadoDaRoda, e: EventoDaRoda): PassoDaRoda {
    const novoGesto = e.t - estado.ultimoEvento > PAUSA_DO_GESTO;
    let s: EstadoDaRoda = novoGesto ? { ...RODA_PARADA } : { ...estado };
    s.ultimoEvento = e.t;
    const nada = (eixo: EixoDoGesto | null): PassoDaRoda => ({ estado: s, passos: 0, eixo, nivel: 0 });
    const profundo = ehDaProfundidade(e);
    const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
    const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
    if (!s.eixo) {
        if (profundo) {
            if (!e.deltaY) return nada(null);
            s.eixo = 'z';
        } else {
            if (Math.abs(dx) < MINIMO_DO_EIXO && Math.abs(dy) < MINIMO_DO_EIXO && !ehEntalhe(e)) return nada(null);
            s.eixo = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        }
    }
    if (s.eixo === 'z') return passoDaProfundidade(s, e);
    // A roda de profundidade no meio de um gesto de outro eixo: o gesto fica no primeiro eixo, e ela não rola.
    if (profundo) return nada(s.eixo);
    if (s.eixo === 'x') return nada('x');
    if (!dy) return nada('y');
    const sentido = Math.sign(dy);
    // O entalhe da roda do mouse: uma linha por entalhe, sem acumular.
    if (ehEntalhe(e)) {
        s = { ...s, acumulado: 0, sentido, passos: s.passos + 1, ultimoPasso: e.t, pico: 0, anterior: 0 };
        return { estado: s, passos: sentido, eixo: 'y', nivel: 0 };
    }
    const mag = Math.abs(dy);
    if (s.sentido && sentido !== s.sentido) s = { ...s, acumulado: 0, pico: 0, passos: 0 };
    s.sentido = sentido;
    // Depois de um passo, a cauda da inércia (o delta que não cresce) vale metade.
    const cauda = s.passos > 0 && mag <= s.anterior;
    s.anterior = mag;
    s.pico = Math.max(s.pico, mag);
    if (s.passos >= linhasDoPico(s.pico)) { s = { ...s, acumulado: 0 }; return nada('y'); }
    s.acumulado += cauda ? mag / 2 : mag;
    const limiar = s.passos ? LIMIAR_SEGUINTE : LIMIAR;
    if (s.acumulado < limiar || e.t - s.ultimoPasso < INTERVALO_ENTRE_PASSOS) return nada('y');
    s = { ...s, acumulado: 0, passos: s.passos + 1, ultimoPasso: e.t };
    return { estado: s, passos: sentido, eixo: 'y', nivel: 0 };
}

/**
 * O que faz: um evento de um gesto já no eixo `z` → no máximo um nível no gesto inteiro: o
 * entalhe do ⌘ + roda dá o nível na hora; a pinça do trackpad soma o `deltaY` até `LIMIAR_DA_PINCA`.
 * Por quê: um gesto muda um nível só, e a cauda da inércia não pula dois (a proposta, 29/10).
 * Entra → sai: o estado (já com o eixo `z` e o instante) e o evento → `PassoDaRoda`.
 * Erro e ataque: depois do nível, o resto do gesto não dá nada; trocar de sentido antes do
 * limiar zera o que estava somado (a pinça que vai e volta não troca nada); delta não finito não conta.
 * Prova: tests/missao/pinca.test.ts ("a pinça na roda").
 */
function passoDaProfundidade(estado: EstadoDaRoda, e: EventoDaRoda): PassoDaRoda {
    let s = estado;
    const nada = (): PassoDaRoda => ({ estado: s, passos: 0, eixo: 'z', nivel: 0 });
    const dy = Number.isFinite(e.deltaY) ? e.deltaY : 0;
    if (s.passos > 0 || !dy) return nada();
    const sentido = Math.sign(dy);
    if (ehEntalhe(e)) {
        s = { ...s, acumulado: 0, sentido, passos: 1, ultimoPasso: e.t };
        return { estado: s, passos: 0, eixo: 'z', nivel: nivelDoDelta(dy) };
    }
    if (s.sentido && sentido !== s.sentido) s = { ...s, acumulado: 0 };
    s = { ...s, sentido, acumulado: s.acumulado + Math.abs(dy) };
    if (s.acumulado < LIMIAR_DA_PINCA) return nada();
    s = { ...s, acumulado: 0, passos: 1, ultimoPasso: e.t };
    return { estado: s, passos: 0, eixo: 'z', nivel: nivelDoDelta(dy) };
}

/**
 * O que faz: a velocidade do arrasto perto de uma borda, de −1 a 1: negativa perto do
 * começo (em cima, à esquerda), positiva perto do fim, zero fora da faixa; cresce em linha
 * com a proximidade (na borda, ou além dela, é 1).
 * Entra → sai: a posição do ponteiro, o começo e o fim da área e a largura da faixa → a velocidade.
 */
export function velocidadeDaBorda(pos: number, inicio: number, fim: number, faixa = 64): number {
    if (!(fim > inicio) || faixa <= 0) return 0;
    const f = Math.min(faixa, (fim - inicio) / 3);
    if (pos < inicio + f) return -Math.min(1, (inicio + f - pos) / f);
    if (pos > fim - f) return Math.min(1, (pos - (fim - f)) / f);
    return 0;
}

/** O que faz: o intervalo entre dois passos no tempo durante o arrasto, pela velocidade (perto da borda, mais rápido). */
export function intervaloDaBorda(v: number): number {
    const a = Math.min(1, Math.abs(v));
    return a ? Math.round(700 - 560 * a) : Infinity;
}

/** O que faz: os pixels de lado por quadro durante o arrasto, pela velocidade (até 22 por quadro). */
export function pixelsDaBorda(v: number): number {
    return Math.round(22 * Math.max(-1, Math.min(1, v)));
}

/** A duração da transição de um nível da pinça, em ms (curta, para o olho seguir de onde se veio). */
export const DURACAO_DA_PINCA = 240;
/** A curva da transição da pinça: sai rápido e assenta devagar (ease-out). */
export const CURVA_DA_PINCA = 'cubic-bezier(.2,.8,.2,1)';

/** Um retângulo na tela (o `getBoundingClientRect`, no que a transição lê). */
export interface Caixa { left: number; top: number; width: number; height: number }

/**
 * O que faz: o `transform` FLIP que põe um elemento, já no lugar final (`para`), sobre o retângulo de
 * onde ele vem (`de`), com a origem no canto de cima à esquerda; a transição o leva de volta ao final.
 * Por quê: o zoom da pinça precisa do efeito de zoom e de uma transição suave (30/10/2026): o cartão sob os
 * dedos cresce do lugar dele no mapa até o centro do ramo, e o contrário na expansão, medindo antes e
 * depois da nova pintura (a pintura troca os elementos, e a medida sobrevive a ela).
 * Entra → sai: as duas caixas → `translate(…) scale(…)`, ou `null` sem tamanho.
 * Erro e ataque: largura ou altura zero, ou valor não finito, dá `null` (nada anima).
 * Prova: tests/missao/componentePinca.test.ts ("a transição").
 */
export function flipDe(de: Caixa, para: Caixa): string | null {
    const ok = (n: number) => Number.isFinite(n);
    if (![de.left, de.top, de.width, de.height, para.left, para.top, para.width, para.height].every(ok) || !de.width || !de.height || !para.width || !para.height) return null;
    const sx = de.width / para.width, sy = de.height / para.height;
    return `translate(${(de.left - para.left).toFixed(1)}px, ${(de.top - para.top).toFixed(1)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
}

/**
 * O que faz: a escala de onde a vista que chega parte, e para onde a que sai vai: no zoom (aproximar),
 * a que chega cresce de menor e a que sai cresce e some; na expansão, o contrário.
 * Entra → sai: o passo → `{ chega, sai }` (os fatores de `scale`).
 */
export function escalasDaPinca(passo: PassoDeNivel): { chega: number; sai: number } {
    return passo === APROXIMA ? { chega: 0.9, sai: 1.12 } : { chega: 1.1, sai: 0.9 };
}

/**
 * O que faz: a classe da transição de um nível da pinça: a entrada no detalhe (`pinca-entra`) ou a
 * abertura para o panorama (`pinca-sai`); nenhuma com o movimento reduzido.
 * Por quê: a transição é curta (cerca de 180 ms) e ancorada no ponto dos dedos (a proposta, 29/10);
 * só o `transform` anima (CSS), a partir do ponto do gesto.
 * Entra → sai: o movimento reduzido e o passo de nível → a classe, ou `null`.
 * Prova: tests/missao/componentePinca.test.ts ("o movimento reduzido").
 */
export function classeDaPinca(reduzido: boolean, passo: PassoDeNivel): 'pinca-entra' | 'pinca-sai' | null {
    if (reduzido) return null;
    return passo === APROXIMA ? 'pinca-entra' : 'pinca-sai';
}

/**
 * O que faz: o ponto de onde a transição da pinça parte, relativo ao elemento que anima (`transform-origin`).
 * Entra → sai: o ponto do gesto e o retângulo do elemento → `Xpx Ypx`; sem ponto, o meio.
 * Erro e ataque: coordenada não finita vale o meio.
 */
export function origemDaPinca(ponto: { x: number; y: number } | null, caixa: { left: number; top: number }): string {
    if (!ponto || !Number.isFinite(ponto.x) || !Number.isFinite(ponto.y)) return '50% 50%';
    return `${Math.round(ponto.x - (caixa.left || 0))}px ${Math.round(ponto.y - (caixa.top || 0))}px`;
}

/** O que faz: a transição da trilha para um passo: animada, ou nenhuma (movimento reduzido). */
export function transicaoDoPasso(reduzido: boolean): string {
    return reduzido ? 'none' : `transform ${DURACAO_DO_PASSO}ms ${CURVA_DO_PASSO}`;
}
