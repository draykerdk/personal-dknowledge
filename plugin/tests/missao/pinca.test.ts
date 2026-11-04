/**
 * Prova da pinça, o terceiro eixo da Missão (a proposta de 29/10): a roda com Ctrl ou ⌘ (a pinça
 * do trackpad e o mouse), a pinça do toque, a escada do panorama e a pilha dos zooms.
 */
import { describe, expect, it } from 'vitest';
import {
    DEDOS_QUE_SE_ABREM, DELTA_DOS_DEDOS_QUE_SE_ABREM, LIMIAR_DA_PINCA, PAUSA_DO_GESTO, RODA_PARADA, nivelDoDelta, passoDaRoda,
    type EstadoDaRoda, type EventoDaRoda,
} from '../../src/missao/movimento';
import { LIMIAR_RELATIVO_DA_PINCA, PINCA_PARADA, passoDaPinca, type EstadoDaPinca, type ToqueDoDedo } from '../../src/missao/pinca';
import {
    AFASTA, APROXIMA, ESCADA_DO_PANORAMA, NIVEIS_FUTUROS, PILHA_MAXIMA, PROFUNDIDADE_MAXIMA, degrauDaEscada, escalaDoNivel, navegacaoInicial, partidaDaExpansao, passoDaNavegacao,
    type NivelDaNavegacao, type NivelDoPanorama,
} from '../../src/missao/tempo';

/** Roda uma sequência de eventos (16 ms entre eles) e soma as linhas e os níveis. */
function rodar(eventos: Array<Partial<EventoDaRoda>>, inicio = 1000, estado: EstadoDaRoda = RODA_PARADA) {
    let s = estado, linhas = 0, t = inicio;
    const niveis: number[] = [];
    const eixos: Array<string | null> = [];
    for (const ev of eventos) {
        const r = passoDaRoda(s, { deltaX: 0, deltaY: 0, deltaMode: 0, t, ...ev });
        s = r.estado;
        linhas += r.passos;
        if (r.nivel) niveis.push(r.nivel);
        eixos.push(r.eixo);
        t += 16;
    }
    return { linhas, niveis, eixos, estado: s, fim: t };
}

/** Uma pinça do trackpad no Chromium do macOS: a roda com Ctrl, deltas pequenos que sobem e a cauda que decai. */
const pincaDoTrackpad = (sinal: number, pico = 6) => [
    ...[0.4, 1.2, 2.5, 4, pico].map(d => ({ deltaY: sinal * d, ctrlKey: true })),
    ...Array.from({ length: 30 }, (_, i) => ({ deltaY: sinal * +(pico * (1 - (i + 1) / 31)).toFixed(2), ctrlKey: true })),
];

describe('a pinça na roda (o eixo z)', () => {
    it('o sentido é a constante: abrir os dedos (deltaY < 0 com Ctrl) aproxima, fechá-los afasta', () => {
        expect(DEDOS_QUE_SE_ABREM).toBe(APROXIMA);
        expect(DELTA_DOS_DEDOS_QUE_SE_ABREM).toBe(-1);
        expect(nivelDoDelta(-3)).toBe(APROXIMA);
        expect(nivelDoDelta(3)).toBe(AFASTA);
        expect([nivelDoDelta(0), nivelDoDelta(Number.NaN), nivelDoDelta(Infinity)]).toEqual([0, 0, 0]);
    });

    it('uma pinça do trackpad, com a cauda longa, dá um nível só e nenhuma linha', () => {
        const abre = rodar(pincaDoTrackpad(-1));
        expect(abre.niveis).toEqual([APROXIMA]);
        expect(abre.linhas).toBe(0);
        expect(new Set(abre.eixos)).toEqual(new Set(['z']));
        const fecha = rodar(pincaDoTrackpad(1, 20));
        expect(fecha.niveis).toEqual([AFASTA]);
        expect(fecha.linhas).toBe(0);
    });

    it('a pinça pequena, abaixo do limiar, não troca nada; a que vai e volta também não', () => {
        expect(rodar([0.5, 1, 1.5, 1].map(d => ({ deltaY: -d, ctrlKey: true }))).niveis).toEqual([]);
        const metade = LIMIAR_DA_PINCA / 2 + 1;
        expect(rodar([-metade, metade, -metade, metade].map(deltaY => ({ deltaY, ctrlKey: true }))).niveis).toEqual([]);
    });

    it('depois da pausa, a pinça seguinte dá o seu nível', () => {
        const a = rodar(pincaDoTrackpad(-1));
        const b = rodar(pincaDoTrackpad(-1), a.fim + PAUSA_DO_GESTO + 50, a.estado);
        expect([...a.niveis, ...b.niveis]).toEqual([APROXIMA, APROXIMA]);
    });

    it('o entalhe do ⌘ + roda do mouse dá um nível na hora; os entalhes juntos no mesmo gesto, um só', () => {
        expect(rodar([{ deltaY: -100, metaKey: true, wheelDeltaY: 120 }]).niveis).toEqual([APROXIMA]);
        expect(rodar([{ deltaY: 4, deltaMode: 1, metaKey: true }]).niveis).toEqual([AFASTA]);
        const tres = rodar([1, 2, 3].map(() => ({ deltaY: 100, metaKey: true, wheelDeltaY: -120 })));
        expect(tres.niveis).toEqual([AFASTA]);
        expect(tres.linhas).toBe(0);
    });

    it('a roda sem Ctrl nem ⌘ nunca dá nível (o entalhe, o trackpad, de lado)', () => {
        const r = rodar([...[100, 100, 100].map(deltaY => ({ deltaY })), ...[3, 8, 14, 10, 6, 3].map(deltaY => ({ deltaY: -deltaY }))]);
        expect(r.niveis).toEqual([]);
        expect(rodar([{ deltaX: 30 }, { deltaX: 40 }]).niveis).toEqual([]);
        expect(rodar([{ deltaY: 100, shiftKey: true }]).niveis).toEqual([]);
    });

    it('o gesto misto fica no primeiro eixo: a rolagem que ganha Ctrl não dá nível nem rola com ele', () => {
        // Começa rolando (y), e o Ctrl chega no meio do gesto: nenhum nível, nenhuma linha a mais.
        const misto = rodar([{ deltaY: 100 }, { deltaY: -30, ctrlKey: true }, { deltaY: -30, ctrlKey: true }, { deltaY: -100, metaKey: true, wheelDeltaY: 120 }]);
        expect(misto.niveis).toEqual([]);
        expect(misto.linhas).toBe(1);
        expect(new Set(misto.eixos)).toEqual(new Set(['y']));
        // Começa na pinça (z), e o Ctrl solta antes do fim do gesto: a cauda não rola.
        const solto = rodar([{ deltaY: -20, ctrlKey: true }, { deltaY: -100 }, { deltaY: -100 }, { deltaY: -60 }]);
        expect(solto.niveis).toEqual([APROXIMA]);
        expect(solto.linhas).toBe(0);
        expect(new Set(solto.eixos)).toEqual(new Set(['z']));
        // Começa de lado (x), e o ⌘ chega: fica de lado.
        const lado = rodar([{ deltaX: 30 }, { deltaY: 100, metaKey: true, wheelDeltaY: -120 }]);
        expect(lado.eixos).toEqual(['x', 'x']);
        expect(lado.niveis).toEqual([]);
    });

    it('o evento com Ctrl sem delta não escolhe eixo', () => {
        const r = passoDaRoda(RODA_PARADA, { deltaX: 0, deltaY: 0, deltaMode: 0, t: 0, ctrlKey: true });
        expect([r.eixo, r.nivel, r.passos]).toEqual([null, 0, 0]);
    });
});

/* ------------------------------------------------------------ a pinça do toque */

/** Um gesto de toque: cada passo é [tipo, id, x, y]; 16 ms entre eles. */
function tocar(passos: Array<[ToqueDoDedo['tipo'], number, number, number]>, extra: Partial<ToqueDoDedo> = {}, inicio = 5000, estado: EstadoDaPinca = PINCA_PARADA) {
    let s = estado, t = inicio;
    const niveis: number[] = [];
    let eixo: string | null = null;
    for (const [tipo, id, x, y] of passos) {
        const r = passoDaPinca(s, { tipo, id, x, y, t, ...extra });
        s = r.estado;
        if (r.nivel) niveis.push(r.nivel);
        eixo = r.eixo ?? eixo;
        t += 16;
    }
    return { niveis, eixo, estado: s, fim: t };
}

/** Dois dedos descem a `d0` px um do outro (na horizontal, em torno de 200) e vão abrindo até `d1`. */
function pinca(d0: number, d1: number, passos = 8): Array<[ToqueDoDedo['tipo'], number, number, number]> {
    const out: Array<[ToqueDoDedo['tipo'], number, number, number]> = [['desce', 1, 200 - d0 / 2, 300], ['desce', 2, 200 + d0 / 2, 300]];
    for (let i = 1; i <= passos; i++) {
        const d = d0 + ((d1 - d0) * i) / passos;
        out.push(['move', 1, 200 - d / 2, 300], ['move', 2, 200 + d / 2, 300]);
    }
    out.push(['sobe', 1, 0, 0], ['sobe', 2, 0, 0]);
    return out;
}

describe('a pinça do toque', () => {
    it('abrir os dedos dá um nível só, no sentido da constante (aproxima)', () => {
        const r = tocar(pinca(100, 260));
        expect(r.niveis).toEqual([DEDOS_QUE_SE_ABREM]);
        expect(r.niveis).toEqual([APROXIMA]);
        expect(r.estado.dedos).toEqual([]);
        expect(r.estado.inicio).toBeNull();
    });

    it('fechar os dedos dá um nível só, o contrário (afasta para o panorama)', () => {
        expect(tocar(pinca(260, 80)).niveis).toEqual([AFASTA]);
    });

    it('o tremor dos dedos, abaixo do limiar relativo, não troca nada, perto ou longe', () => {
        const pouco = 1 + LIMIAR_RELATIVO_DA_PINCA / 2;
        expect(tocar(pinca(100, 100 * pouco)).niveis).toEqual([]);
        expect(tocar(pinca(400, 400 / pouco)).niveis).toEqual([]);
        // O mesmo tremor em px que muda pouco os dedos longe muda muito os dedos perto: a razão decide.
        expect(tocar(pinca(400, 430)).niveis).toEqual([]);
        expect(tocar(pinca(60, 90)).niveis).toEqual([APROXIMA]);
    });

    it('dois dedos que andam juntos são rolagem a dois, não pinça: nenhum nível no gesto, mesmo se a distância mudar depois', () => {
        const passos: Array<[ToqueDoDedo['tipo'], number, number, number]> = [['desce', 1, 150, 300], ['desce', 2, 250, 300]];
        for (let i = 1; i <= 8; i++) passos.push(['move', 1, 150, 300 - 10 * i], ['move', 2, 250, 300 - 10 * i]);
        // Já rolagem: depois os dedos se abrem, e o gesto continua sem nível.
        passos.push(['move', 1, 80, 220], ['move', 2, 320, 220]);
        const r = tocar(passos);
        expect(r.eixo).toBe('rolagem');
        expect(r.niveis).toEqual([]);
    });

    it('um dedo só nunca é pinça (continua rolagem da tela, sem eixo aqui)', () => {
        const r = tocar([['desce', 1, 200, 300], ['move', 1, 200, 200], ['move', 1, 200, 50], ['sobe', 1, 0, 0]]);
        expect(r.niveis).toEqual([]);
        expect(r.eixo).toBeNull();
    });

    it('o mouse e a caneta não são toque; o TouchEvent (sem pointerType) é', () => {
        expect(tocar(pinca(100, 260), { pointerType: 'mouse' }).niveis).toEqual([]);
        expect(tocar(pinca(100, 260), { pointerType: 'pen' }).niveis).toEqual([]);
        expect(tocar(pinca(100, 260), { pointerType: 'touch' }).niveis).toEqual([APROXIMA]);
    });

    it('o terceiro dedo desfaz o gesto; e o quique (outra pinça logo depois do nível) não dá o segundo', () => {
        const tres = tocar([['desce', 1, 150, 300], ['desce', 2, 250, 300], ['desce', 3, 200, 400], ['move', 1, 50, 300], ['move', 2, 350, 300]]);
        expect(tres.niveis).toEqual([]);
        const a = tocar(pinca(100, 260));
        const quique = tocar(pinca(100, 260), {}, a.fim, a.estado);
        expect(quique.niveis).toEqual([]);
        const depois = tocar(pinca(100, 260), {}, a.fim + PAUSA_DO_GESTO + 50, a.estado);
        expect(depois.niveis).toEqual([APROXIMA]);
    });

    it('a entrada não é mutada, e a coordenada não finita é ignorada', () => {
        const s = tocar([['desce', 1, 150, 300], ['desce', 2, 250, 300]]).estado;
        const copia = JSON.parse(JSON.stringify(s));
        const r = passoDaPinca(s, { tipo: 'move', id: 1, x: Number.NaN, y: 300, t: 9999 });
        expect(r.estado).toBe(s);
        passoDaPinca(s, { tipo: 'move', id: 1, x: 0, y: 300, t: 9999 });
        expect(JSON.parse(JSON.stringify(s))).toEqual(copia);
    });
});

/* ------------------------------------------------------------ a escada e a pilha */

describe('a escada', () => {
    it('a expansão vai do Dia ao sistema, um degrau por vez; o grafo abre fora da Missão (30/10)', () => {
        expect(ESCADA_DO_PANORAMA).toEqual(['dia', 'semana', 'trimestre', 'ano', 'longo-prazo', 'sistema', 'grafo']);
        expect(NIVEIS_FUTUROS).toEqual([]);
        const subir: NivelDoPanorama[] = [];
        let n: NivelDoPanorama = 'dia';
        for (;;) { const d = degrauDaEscada(n, AFASTA); if (!d.mudou) { expect(d).toEqual({ nivel: 'sistema', mudou: false, porque: 'fora-da-missao', alvo: 'grafo' }); break; } n = d.nivel; subir.push(n); }
        expect(subir).toEqual(['semana', 'trimestre', 'ano', 'longo-prazo', 'sistema']);
    });

    it('o zoom desce do longo prazo ao Dia, e no Dia para (a ponta)', () => {
        expect(degrauDaEscada('sistema', APROXIMA)).toEqual({ nivel: 'longo-prazo', mudou: true });
        expect(degrauDaEscada('longo-prazo', APROXIMA)).toEqual({ nivel: 'ano', mudou: true });
        expect(degrauDaEscada('semana', APROXIMA)).toEqual({ nivel: 'dia', mudou: true });
        expect(degrauDaEscada('dia', APROXIMA)).toEqual({ nivel: 'dia', mudou: false, porque: 'ponta' });
    });

    it('nível desconhecido ou passo que não é ±1 não anda; a escala de cada nível', () => {
        expect(degrauDaEscada('mes' as NivelDoPanorama, AFASTA)).toEqual({ nivel: 'mes', mudou: false, porque: 'ponta' });
        expect(degrauDaEscada('dia', 2 as never)).toMatchObject({ mudou: false, porque: 'ponta' });
        expect(ESCADA_DO_PANORAMA.map(escalaDoNivel)).toEqual(['dia', 'semana', 'trimestre', 'ano', null, null, null]);
    });
});

describe('a pilha', () => {
    const passos = (e: NivelDaNavegacao, lista: Array<[1 | -1, string | null]>) => lista.reduce((s, [p, alvo]) => passoDaNavegacao(s, p, alvo).estado, e);

    it('a expansão sem zoom sobe as escalas; com o Dia de partida', () => {
        const e = navegacaoInicial();
        expect(e).toEqual({ nivel: 'dia', pilha: [] });
        expect(passos(e, [[AFASTA, null], [AFASTA, null], [AFASTA, null], [AFASTA, null], [AFASTA, null]])).toEqual({ nivel: 'sistema', pilha: [], partida: 'dia' });
        const fim = passoDaNavegacao({ nivel: 'sistema', pilha: [] }, AFASTA);
        expect(fim).toMatchObject({ mudou: false, porque: 'fora-da-missao', alvo: 'grafo' });
        // E o zoom desfaz a escada inteira, degrau por degrau, até o Dia.
        expect(passos({ nivel: 'sistema', pilha: [] }, Array.from({ length: 6 }, () => [APROXIMA, null] as [1 | -1, null]))).toEqual({ nivel: 'dia', pilha: [] });
        expect(navegacaoInicial('grafo').nivel).toBe('dia');
        expect(navegacaoInicial('mes' as NivelDoPanorama).nivel).toBe('dia');
    });

    it('o zoom num nó entra no ramo; o seguinte no mesmo nó entra mais fundo; noutro nó, empilha', () => {
        const e = passos(navegacaoInicial('semana'), [[APROXIMA, 't:a.md'], [APROXIMA, 't:a.md'], [APROXIMA, 'p:x']]);
        expect(e).toEqual({ nivel: 'semana', pilha: [{ id: 't:a.md', profundidade: 1 }, { id: 't:a.md', profundidade: 2 }, { id: 'p:x', profundidade: 1 }] });
        // O zoom sem nó, com a pilha cheia de ramo, desce mais no ramo do topo.
        expect(passoDaNavegacao(e, APROXIMA).estado.pilha.at(-1)).toEqual({ id: 'p:x', profundidade: 2 });
    });

    it('depois de um zoom, a expansão volta primeiro pelo ramo, até a escala de onde se partiu, e só então sobe', () => {
        const dentro = passos(navegacaoInicial('dia'), [[APROXIMA, 'l:sapa:2026-10-28'], [APROXIMA, null], [APROXIMA, 'c:paises:vietna']]);
        expect(dentro.pilha).toHaveLength(3);
        const volta: NivelDaNavegacao[] = [];
        let s = dentro;
        for (let i = 0; i < 5; i++) { s = passoDaNavegacao(s, AFASTA).estado; volta.push(s); }
        expect(volta.map(v => [v.nivel, v.pilha.length])).toEqual([['dia', 2], ['dia', 1], ['dia', 0], ['semana', 0], ['trimestre', 0]]);
    });

    it('sem nó e sem pilha, o zoom desce uma escala; no Dia, é a ponta', () => {
        expect(passoDaNavegacao({ nivel: 'ano', pilha: [] }, APROXIMA)).toEqual({ estado: { nivel: 'trimestre', pilha: [] }, mudou: true });
        expect(passoDaNavegacao(navegacaoInicial(), APROXIMA)).toMatchObject({ mudou: false, porque: 'ponta' });
        // O id vazio vale como nenhum nó.
        expect(passoDaNavegacao({ nivel: 'ano', pilha: [] }, APROXIMA, '  ').estado.nivel).toBe('trimestre');
    });

    it('o ramo tem fundo e a pilha tem tamanho; a entrada não é mutada', () => {
        let s = navegacaoInicial();
        for (let i = 0; i < PROFUNDIDADE_MAXIMA; i++) s = passoDaNavegacao(s, APROXIMA, 't:a.md').estado;
        expect(s.pilha.at(-1)).toEqual({ id: 't:a.md', profundidade: PROFUNDIDADE_MAXIMA });
        expect(passoDaNavegacao(s, APROXIMA, 't:a.md')).toMatchObject({ mudou: false, porque: 'fundo-do-ramo' });
        let cheia = navegacaoInicial();
        for (let i = 0; i < PILHA_MAXIMA; i++) cheia = passoDaNavegacao(cheia, APROXIMA, `t:${i}.md`).estado;
        const copia = JSON.parse(JSON.stringify(cheia));
        expect(passoDaNavegacao(cheia, APROXIMA, 't:outra.md')).toMatchObject({ mudou: false, porque: 'pilha-cheia' });
        expect(cheia).toEqual(copia);
    });
});

describe('a volta pelo zoom (30/10: "Na última tela não consigo dar zoom de volta")', () => {
    const sobe = (e: NivelDaNavegacao, n: number) => Array.from({ length: n }).reduce<NivelDaNavegacao>(s => passoDaNavegacao(s, AFASTA).estado, e);

    it('até o Sistema e, de lá, o zoom sobre um cartão desce Sistema → Longo prazo → Ano → … → o Dia; só no Dia entra no ramo', () => {
        const topo = sobe(navegacaoInicial('dia'), 5);
        expect(topo).toEqual({ nivel: 'sistema', pilha: [], partida: 'dia' });
        const volta: NivelDaNavegacao[] = [];
        let s = topo;
        for (const cartao of ['q:2026-Q4', 'q:2026-Q3', 't:a.md', 'p:x', 't:a.md']) { s = passoDaNavegacao(s, APROXIMA, cartao).estado; volta.push(s); }
        expect(volta.map(v => [v.nivel, v.pilha.length])).toEqual([['longo-prazo', 0], ['ano', 0], ['trimestre', 0], ['semana', 0], ['dia', 0]]);
        // Na partida, ela sai do estado: o Dia é o de sempre.
        expect(s).toEqual({ nivel: 'dia', pilha: [] });
        expect(passoDaNavegacao(s, APROXIMA, 't:a.md').estado).toEqual({ nivel: 'dia', pilha: [{ id: 't:a.md', profundidade: 1 }] });
    });

    it('a partida é a escala de onde se expandiu: da Semana, o Ano volta à Semana e ela entra no ramo', () => {
        const ano = sobe(navegacaoInicial('semana'), 2);
        expect(ano).toEqual({ nivel: 'ano', pilha: [], partida: 'semana' });
        const tri = passoDaNavegacao(ano, APROXIMA, 't:a.md').estado;
        expect(tri).toEqual({ nivel: 'trimestre', pilha: [], partida: 'semana' });
        const sem = passoDaNavegacao(tri, APROXIMA, 't:a.md').estado;
        expect(sem).toEqual({ nivel: 'semana', pilha: [] });
        expect(passoDaNavegacao(sem, APROXIMA, 't:a.md').estado.pilha).toEqual([{ id: 't:a.md', profundidade: 1 }]);
        // Na própria escala de partida, o Ano entra no ramo do cartão.
        expect(passoDaNavegacao(navegacaoInicial('ano'), APROXIMA, 'q:2026-Q4').estado).toEqual({ nivel: 'ano', pilha: [{ id: 'q:2026-Q4', profundidade: 1 }] });
    });

    it('descer abaixo da partida faz dela a nova partida; a expansão seguinte volta até lá', () => {
        const dia = passoDaNavegacao(passoDaNavegacao(navegacaoInicial('trimestre'), APROXIMA).estado, APROXIMA).estado;
        expect(dia).toEqual({ nivel: 'dia', pilha: [] });
        const tri = sobe(dia, 2);
        expect(tri).toEqual({ nivel: 'trimestre', pilha: [], partida: 'dia' });
        expect(passoDaNavegacao(tri, APROXIMA, 't:a.md').estado).toEqual({ nivel: 'semana', pilha: [], partida: 'dia' });
    });

    it('o grafo não anda e guarda a partida; uma partida inválida vale como nenhuma; a entrada não é mutada', () => {
        const topo = sobe(navegacaoInicial('dia'), 5);
        expect(passoDaNavegacao(topo, AFASTA)).toMatchObject({ estado: topo, mudou: false, porque: 'fora-da-missao', alvo: 'grafo' });
        expect(partidaDaExpansao(topo)).toBe('dia');
        expect(partidaDaExpansao({ nivel: 'ano', pilha: [], partida: 'mes' as NivelDoPanorama })).toBe('ano');
        expect(partidaDaExpansao({ nivel: 'semana', pilha: [], partida: 'ano' })).toBe('semana');
        // A partida acima do nível vale como nenhuma: o zoom no cartão entra no ramo.
        expect(passoDaNavegacao({ nivel: 'semana', pilha: [], partida: 'ano' }, APROXIMA, 't:a.md').estado.pilha).toHaveLength(1);
        const copia = JSON.parse(JSON.stringify(topo));
        passoDaNavegacao(topo, APROXIMA, 'q:2026-Q4');
        expect(topo).toEqual(copia);
    });

    it('com zoom na pilha acima da partida, a expansão desfaz o zoom e a partida fica', () => {
        const e: NivelDaNavegacao = { nivel: 'ano', pilha: [{ id: 'q:2026-Q4', profundidade: 1 }], partida: 'dia' };
        expect(passoDaNavegacao(e, AFASTA).estado).toEqual({ nivel: 'ano', pilha: [], partida: 'dia' });
        expect(passoDaNavegacao(e, APROXIMA, 'q:2026-Q4').estado.pilha.at(-1)).toEqual({ id: 'q:2026-Q4', profundidade: 2 });
    });
});
