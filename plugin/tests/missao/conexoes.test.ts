/**
 * Prova das conexões de um nó (P10c, `conexoes.ts`): os campos de link do modelo pelo rótulo
 * dele, as outras chaves como estão, o texto, as notas que apontam agrupadas pelo tipo, a
 * ausência em palavras e o limite do grupo; e as ligações da linha do tempo de um nó.
 */
import { describe, expect, it } from 'vitest';
import { conexoesDaNota, nosDaLinha, relacoesNaLinha, type AchaNos, type LigacoesDaNota } from '../../src/missao/conexoes';
import type { DomainModel } from '../../src/engine/domainModel';
import type { LinhaAberta } from '../../src/missao/tipos';

const MODELO = {
    dominio: 'coisa', descricao: '', candidatos: { pasta: 'X', type: 'coisa_teste' }, registros: [], contagens: [], estados: [], legado: [], situacoes: [], sinais: {},
    campos: [
        { nome: 'dono', rotulo: 'Quem cuida', tipo: 'link', dono: 'nota' },
        { nome: 'titulo', rotulo: 'Título', tipo: 'texto', dono: 'nota' },
        { nome: 'onde', rotulo: 'Onde fica', tipo: 'link', dono: 'nota' },
    ],
} as unknown as DomainModel;

const NOS: Record<string, { id: string; titulo: string }> = {
    'P/Ana.md': { id: 'pe:P/Ana.md', titulo: 'Ana' },
    'D/2026-10-28.md': { id: 'd:2026-10-28', titulo: 'qua 28/10/2026' },
};
const acha: AchaNos = {
    noDaNota: c => NOS[c] ?? { id: `n:${c}`, titulo: c.split('/').pop()!.replace(/\.md$/, '') },
    noDoNome: nome => (nome === 'Vietnam' ? { id: 'c:paises:vietnam', titulo: 'Vietnam' } : null),
    resolver: nome => (nome === 'Ana' ? 'P/Ana.md' : null),
    rotuloDoType: t => (t === 'daily_note' ? 'Dia' : t ?? 'Sem tipo'),
};

describe('as conexões de uma nota', () => {
    const lig: LigacoesDaNota = {
        saem: [
            { chave: 'onde', nome: 'Vietnam', caminho: null },
            { chave: 'outra', nome: 'Pasta/Coisa B', caminho: 'Pasta/Coisa B.md' },
            { chave: null, nome: 'Coisa B', caminho: 'Pasta/Coisa B.md' },
            { chave: null, nome: 'Fantasma', caminho: null },
            { chave: null, nome: 'Eu', caminho: 'X/Eu.md' },
        ],
        entram: [
            { caminho: 'D/2026-10-28.md', type: 'daily_note' },
            { caminho: 'X/Eu.md', type: 'coisa_teste' },
            { caminho: 'Y/b.md', type: null },
            { caminho: 'Y/a.md', type: null },
            { caminho: 'D/2026-10-27.md', type: 'daily_note' },
        ],
    };
    const fm = { type: 'coisa_teste', dono: 'Ana', onde: 'Vietnam', titulo: 'x', outra: '[[Pasta/Coisa B]]' };

    it('os campos de link do modelo pelo rótulo dele, na ordem dele; o texto solto do campo acha a nota', () => {
        const g = conexoesDaNota('X/Eu.md', fm, MODELO, lig, acha, { noTexto: 'No texto' });
        expect(g.map(x => [x.sentido, x.rotulo, x.itens.map(i => i.id ?? `?${i.titulo}`)])).toEqual([
            ['sai', 'Quem cuida', ['pe:P/Ana.md']],
            ['sai', 'Onde fica', ['c:paises:vietnam']],
            ['sai', 'outra', ['n:Pasta/Coisa B.md']],
            // A mesma nota não se repete em outro grupo; o nome sem nota fica escrito; a própria nota não conta.
            ['sai', 'No texto', ['?Fantasma']],
            ['entra', 'Dia', ['d:2026-10-28', 'n:D/2026-10-27.md']],
            ['entra', 'Sem tipo', ['n:Y/a.md', 'n:Y/b.md']],
        ]);
    });

    it('sem modelo, cada chave do frontmatter pelo nome dela; sem ligação, nenhum grupo', () => {
        const g = conexoesDaNota('X/Eu.md', fm, null, { saem: lig.saem.slice(0, 2), entram: [] }, acha, { noTexto: 'No texto' });
        expect(g.map(x => [x.rotulo, x.itens.map(i => i.id)])).toEqual([['onde', ['c:paises:vietnam']], ['outra', ['n:Pasta/Coisa B.md']]]);
        expect(conexoesDaNota('X/Eu.md', {}, null, { saem: [], entram: [] }, acha, { noTexto: 'No texto' })).toEqual([]);
    });

    it('o grupo grande mostra até o limite e conta o resto', () => {
        const entram = Array.from({ length: 5 }, (_, i) => ({ caminho: `Z/n${i}.md`, type: 'daily_note' }));
        const [g] = conexoesDaNota('X/Eu.md', {}, null, { saem: [], entram }, acha, { noTexto: 'No texto' }, 3);
        expect([g.itens.length, g.mais]).toEqual([3, 2]);
    });
});

describe('as ligações da linha do tempo de um nó', () => {
    const no = (id: string, titulo: string) => ({ id, tipo: 'nota', titulo, linha: '', ramo: -1 }) as any;
    const linha = {
        centro: no('d:2026-10-29', 'qui 29'), areas: [no('a:x', 'Área X')], projetos: [no('p:y', 'Projeto Y')], smarts: [], horarios: [], asa: [no('w:2026-W44', 'W44')],
        trimestres: [], passagens: [], trechos: [], faixas: [{ projeto: 'p:y', rotulo: 'Y', ramo: 0, nos: [no('t:a.md', 'A')] }], pendentes: [], colecoes: { coisas: [no('n:c.md', 'C')] },
        ligacoes: [{ de: 'a:x', para: 'p:y', tipo: 'estrutura' }, { de: 'p:y', para: 't:a.md', tipo: 'estrutura' }, { de: 't:a.md', para: 'd:2026-10-29', tipo: 'tempo' }, { de: 'p:y', para: 'fora', tipo: 'estrutura' }],
    } as unknown as LinhaAberta;
    it('o outro lado de cada ligação, nas duas direções, sem a ponta que a linha não mostra', () => {
        expect(relacoesNaLinha(linha, 'p:y')).toEqual([{ id: 'a:x', titulo: 'Área X' }, { id: 't:a.md', titulo: 'A' }]);
        expect(relacoesNaLinha(linha, 'nada')).toEqual([]);
        expect(relacoesNaLinha(null, 'p:y')).toEqual([]);
        expect([...nosDaLinha(linha).keys()]).toEqual(['d:2026-10-29', 'a:x', 'p:y', 'w:2026-W44', 't:a.md', 'n:c.md']);
    });
});
