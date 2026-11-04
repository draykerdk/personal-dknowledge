/**
 * O cartão do centro (o nó do dia, da semana e do trimestre) não deixa texto estourar a
 * caixa.
 *
 * Por quê: na conferência do P4 (28/10/2026): "um pouco do texto estoura do quadrado ali
 * no nó do dia". O cartão é um botão, e o botão do Obsidian não quebra linha
 * (`white-space: nowrap`); as linhas "out 2026 · nada agendado", "nada no dia · 12
 * pendentes de antes", "sem registro de dinheiro", a do bloco e a da forma de mostrar
 * passavam da borda direita. A medida no app (larguras de 320 a 1468) é a prova de uso;
 * esta guarda fixa as regras que a fazem valer.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

/** As regras de nível de topo: [seletores, corpo], fora das @media (o centro vale em toda largura). */
function regras(texto: string): Array<[string[], string]> {
    const semComentario = texto.replace(/\/\*[\s\S]*?\*\//g, '');
    const out: Array<[string[], string]> = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(semComentario))) {
        out.push([m[1].split(',').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean), m[2]]);
    }
    return out;
}

const decl = (corpo: string, prop: string) => corpo.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`))?.[1].trim() ?? null;
const do_ = (seletor: string) => regras(css).filter(([sels]) => sels.includes(seletor)).map(([, corpo]) => corpo);

describe('o cartão do centro quebra o texto dentro da caixa', () => {
    it('o cartão quebra linha, encolhe na coluna e quebra palavra longa', () => {
        const corpo = do_('.dfm-missao .period').join(';');
        expect(decl(corpo, 'white-space')).toBe('normal');
        expect(decl(corpo, 'min-width')).toBe('0');
        expect(decl(corpo, 'max-width')).toBe('100%');
        expect(decl(corpo, 'overflow-wrap')).toBe('anywhere');
    });

    it('cada linha do cartão encolhe com ele (min-width: 0 nos filhos do flex)', () => {
        const corpo = do_('.dfm-missao .period > *').join(';');
        expect(decl(corpo, 'min-width')).toBe('0');
        expect(decl(corpo, 'max-width')).toBe('100%');
    });

    it('as linhas que podem ser longas quebram (a data e o lugar, a forma de mostrar, o dinheiro e o bloco)', () => {
        for (const linha of ['.dfm-missao .period .sub', '.dfm-missao .period .gl', '.dfm-missao .period .cap']) {
            const corpo = do_(linha).join(';');
            expect(decl(corpo, 'white-space'), linha).toBe('normal');
            expect(decl(corpo, 'overflow-wrap'), linha).toBe('anywhere');
        }
    });

    it('nenhuma regra do cartão volta a pôr nowrap numa linha que pode ser longa', () => {
        // Só o título grande (`.big`, que já quebra entre as partes) e a etiqueta "hoje" ficam numa linha.
        const curtas = new Set(['.dfm-missao .period .big', '.dfm-missao .tag-hoje']);
        const ruins = regras(css)
            .flatMap(([sels, corpo]) => sels.filter(s => /\.dfm-missao .*\.period\b/.test(s) && !curtas.has(s) && decl(corpo, 'white-space') === 'nowrap'));
        expect(ruins).toEqual([]);
    });
});
