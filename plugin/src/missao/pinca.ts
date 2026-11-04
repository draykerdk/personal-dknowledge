/**
 * A pinça do toque: dois dedos que se abrem ou se fecham viram um passo de nível do terceiro eixo
 * (a profundidade, "quanto"), como a pinça do trackpad e o ⌘ com a roda (`movimento.ts`).
 *
 * Por quê: a proposta da pinça (29/10) e o pedido, no mesmo dia, de que no celular ela seja quase
 * igual. Valem as mesmas regras da roda: um gesto dá um nível só; o sentido é o mesmo
 * (`DEDOS_QUE_SE_ABREM`: abrir os dedos aproxima, entra no ramo; fechá-los afasta, para o
 * panorama); um dedo só continua sendo rolagem; e dois dedos que andam juntos, sem mudar a
 * distância, são uma rolagem a dois, não uma pinça. O limiar é relativo à distância do começo,
 * para que um tremor pequeno não troque nada, com os dedos perto ou longe.
 *
 * Os eventos chegam como dados: um evento de ponteiro (`pointerType` `touch`) ou cada toque de um
 * `TouchEvent` (o `identifier` como `id`), com o instante. Módulo puro: sem DOM nem relógio.
 * Prova: tests/missao/pinca.test.ts ("a pinça do toque").
 */
import { DEDOS_QUE_SE_ABREM, PAUSA_DO_GESTO } from './movimento';
import type { PassoDeNivel } from './tempo';

/** Quanto a distância entre os dedos muda, em fração da do começo, para dar o nível (18%). */
export const LIMIAR_RELATIVO_DA_PINCA = 0.18;
/** Quantos px o centro dos dois dedos anda, sem a distância mudar mais que isso, para ser rolagem a dois. */
export const MINIMO_DA_ROLAGEM_A_DOIS = 24;
/** A menor distância do começo que conta (dedos colados não dão razão estável). */
export const DISTANCIA_MINIMA = 8;

/** Um evento de um dedo: desceu, moveu ou subiu (o cancelado sobe), onde e quando. */
export interface ToqueDoDedo {
    tipo: 'desce' | 'move' | 'sobe';
    /** O `pointerId`, ou o `identifier` do toque. */
    id: number;
    x: number;
    y: number;
    /** O instante, em ms. */
    t: number;
    /** O `pointerType` do evento de ponteiro; sem ele (o `TouchEvent`), é toque. */
    pointerType?: string;
}

/** O eixo de um gesto a dois dedos: `z` a pinça, `rolagem` os dois dedos andando juntos. */
export type EixoDoToque = 'z' | 'rolagem';

export interface EstadoDaPinca {
    /** Os dedos na tela agora, pelo id. */
    dedos: ReadonlyArray<{ id: number; x: number; y: number }>;
    /** A distância e o centro de quando o segundo dedo desceu; `null` = não há gesto a dois. */
    inicio: { distancia: number; x: number; y: number } | null;
    eixo: EixoDoToque | null;
    /** O gesto já deu o nível dele. */
    deu: boolean;
    /** O instante do último nível dado e, quando os dedos sobem, o do fim do gesto dele (a pausa do gesto conta daí). */
    ultimoNivel: number;
}

export const PINCA_PARADA: EstadoDaPinca = { dedos: [], inicio: null, eixo: null, deu: false, ultimoNivel: -Infinity };

/** O que um toque dá: o estado seguinte, o eixo do gesto a dois e o nível (uma vez por gesto). */
export interface PassoDaPinca {
    estado: EstadoDaPinca;
    eixo: EixoDoToque | null;
    nivel: PassoDeNivel | 0;
}

const distancia = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** O que faz: o começo de um gesto a dois dedos: a distância entre eles e o centro; `null` sem dois dedos. */
function inicioDe(dedos: EstadoDaPinca['dedos']): EstadoDaPinca['inicio'] {
    if (dedos.length !== 2) return null;
    const [a, b] = dedos;
    return { distancia: distancia(a, b), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * O que faz: um toque → o estado seguinte e, uma vez por gesto a dois dedos, o passo de nível:
 * os dedos que se abrem dão `DEDOS_QUE_SE_ABREM`; os que se fecham, o contrário.
 * Por quê: no celular, a pinça é quase igual à do trackpad (29/10): a pinça do toque segue a regra da roda (um gesto, um
 * eixo e um nível) e o mesmo sentido.
 * Entra → sai: o estado e o toque → `PassoDaPinca` (o estado de entrada não é mutado).
 * Erro e ataque: o ponteiro que não é de toque (mouse, caneta) não muda nada; um dedo só não é
 * pinça (fica rolagem, sem eixo aqui); três dedos ou mais desfazem o gesto; o tremor abaixo de
 * `LIMIAR_RELATIVO_DA_PINCA` não troca nada; os dois dedos que andam juntos viram `rolagem` e o
 * gesto não dá nível até levantar; depois do nível, o resto do gesto não dá outro; um segundo
 * gesto dentro de `PAUSA_DO_GESTO` do último nível não dá nível (o quique dos dedos); coordenada
 * não finita é ignorada; dedos colados no começo (menos de `DISTANCIA_MINIMA`) não dão razão.
 * Prova: tests/missao/pinca.test.ts ("a pinça do toque").
 */
export function passoDaPinca(estado: EstadoDaPinca, toque: ToqueDoDedo): PassoDaPinca {
    const fica = (s: EstadoDaPinca = estado): PassoDaPinca => ({ estado: s, eixo: s.eixo, nivel: 0 });
    if (toque.pointerType !== undefined && toque.pointerType !== 'touch') return fica();
    if (!Number.isFinite(toque.x) || !Number.isFinite(toque.y) || !Number.isFinite(toque.t)) return fica();
    const outros = estado.dedos.filter(d => d.id !== toque.id);
    if (toque.tipo === 'sobe') {
        // Com menos de dois dedos, o gesto acabou: o próximo a dois começa do zero.
        // O gesto que deu o nível acaba quando os dedos sobem: a pausa conta daí.
        const dedos = outros;
        if (dedos.length === 2) return fica({ ...estado, dedos });
        return fica({ ...estado, dedos, inicio: null, eixo: null, deu: false, ultimoNivel: estado.deu ? toque.t : estado.ultimoNivel });
    }
    const dedos = [...outros, { id: toque.id, x: toque.x, y: toque.y }];
    if (toque.tipo === 'desce') {
        // O segundo dedo começa o gesto a dois; o terceiro o desfaz.
        return fica({ ...estado, dedos, inicio: inicioDe(dedos), eixo: null, deu: false });
    }
    if (!estado.dedos.some(d => d.id === toque.id)) return fica();
    const s: EstadoDaPinca = { ...estado, dedos };
    const ini = s.inicio;
    if (dedos.length !== 2 || !ini || s.deu || s.eixo === 'rolagem') return fica(s);
    if (ini.distancia < DISTANCIA_MINIMA) return fica(s);
    const agora = inicioDe(dedos)!;
    const mudanca = agora.distancia / ini.distancia - 1;
    const desvio = Math.abs(agora.distancia - ini.distancia);
    const andou = distancia(agora, ini);
    if (andou >= MINIMO_DA_ROLAGEM_A_DOIS && andou > desvio) return fica({ ...s, eixo: 'rolagem' });
    if (Math.abs(mudanca) < LIMIAR_RELATIVO_DA_PINCA) return fica(s);
    const z: EstadoDaPinca = { ...s, eixo: 'z', deu: true };
    if (toque.t - estado.ultimoNivel <= PAUSA_DO_GESTO) return fica(z);
    const nivel: PassoDeNivel = mudanca > 0 ? DEDOS_QUE_SE_ABREM : (-DEDOS_QUE_SE_ABREM as PassoDeNivel);
    return { estado: { ...z, ultimoNivel: toque.t }, eixo: 'z', nivel };
}
