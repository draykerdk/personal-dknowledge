/**
 * A configuração de partida do pacote: os ramos Missão e Projetos, os modelos de tipo do núcleo, a
 * tabela de pesos, a reputação, o ECH e o vocabulário, lidos pelos próprios leitores do plugin.
 *
 * Por quê: estes arquivos são escritos no repositório (`cofre-modelo/`), e não saem do cofre de
 * origem (os de lá levam os protocolos, os routers e a viagem da pessoa). Um cofre novo abre a
 * Missão por eles; sem eles, a Missão não abre (o ramo da raiz falta) e os leitores avisam. A prova
 * confere que:
 * - cada arquivo passa pelo leitor dele sem nenhum problema;
 * - todo protocolo que um botão do ciclo, um modelo de tipo ou um módulo da reputação chama é um
 *   dos que o pacote traz (nenhum botão quebrado);
 * - todo tipo que um ramo pede (o Novo, o amplia, as fontes de modelo) tem o modelo dele;
 * - com o cofre de origem ao lado (`DK_COFRE`), os ramos têm as mesmas colunas e painéis, e os
 *   botões do ciclo são os de lá com protocolo no pacote; os modelos têm os mesmos estados.
 *
 * Onde roda: no pacote, com `cofre-modelo/` ao lado do plugin (a pasta `pacote` dos testes).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseDomainModel, domainModelProblems } from '../../src/engine/domainModel';
import { lerRamoPrincipal, type RamoPrincipal } from '../../src/missao/ramoPrincipal';
import { parseWeightTable } from '../../src/engine/decisionWeights';
import { parsePanelWeights } from '../../src/engine/panelWeights';
import { lerEch } from '../../src/engine/ech';
import { lerReputacao } from '../../src/engine/reputacao';

const RAIZ = join(__dirname, '..', '..', '..');
const CONFIG = join(RAIZ, 'cofre-modelo', '200 - FUNCTIONS', 'Config');
const PROTOCOLOS = join(RAIZ, 'cofre-modelo', '200 - FUNCTIONS', 'Protocolos');
const ORIGEM = process.env.DK_COFRE ? join(process.env.DK_COFRE, '200 - FUNCTIONS', 'Config') : '';
const noPacote = existsSync(join(CONFIG, 'ramos', 'missao.json'));

const json = (caminho: string) => JSON.parse(readFileSync(caminho, 'utf8'));
const jsons = (pasta: string) => readdirSync(pasta).filter(n => n.endsWith('.json')).sort();

describe.skipIf(!noPacote)('a configuração de partida do pacote', () => {
    const idsDosProtocolos = () => new Set(jsons(PROTOCOLOS).map(n => json(join(PROTOCOLOS, n)).id as string));
    const tiposComModelo = () => new Set(jsons(join(CONFIG, 'dominios')).map(n => n.replace(/\.json$/, '')));
    const ramo = (id: string): RamoPrincipal => {
        const lido = lerRamoPrincipal(json(join(CONFIG, 'ramos', `${id}.json`)));
        expect(lido.problemas, id).toEqual([]);
        return lido.ramoPrincipal!;
    };

    it('os ramos Missão e Projetos se leem sem problema, e o da raiz é a Missão', () => {
        expect(ramo('missao').id).toBe('missao');
        expect(ramo('projetos').id).toBe('projetos');
    });

    it('cada botão do ciclo de cada ramo chama um protocolo que o pacote traz', () => {
        const ids = idsDosProtocolos();
        for (const nome of jsons(join(CONFIG, 'ramos'))) {
            const r = ramo(nome.replace(/\.json$/, ''));
            for (const [escala, botoes] of Object.entries(r.ciclos)) for (const b of botoes ?? []) expect(ids.has(b.protocolo), `${nome} ${escala} ${b.emoji}`).toBe(true);
        }
    });

    it('todo tipo que um ramo pede tem o modelo dele', () => {
        const tipos = tiposComModelo();
        for (const nome of jsons(join(CONFIG, 'ramos'))) {
            const cru = json(join(CONFIG, 'ramos', nome));
            const pedidos = [
                ...(cru.novo?.tipos ?? []).map((t: any) => t.tipo),
                ...Object.values(cru.novo?.no ?? {}).flatMap((l: any) => l.map((i: any) => i.tipo)),
                ...[...(cru.trabalho ?? []), ...(cru.tempo ?? [])].flatMap((c: any) => c.amplia?.tipos ?? []),
                ...(cru.colecoes ?? []).flatMap((c: any) => c.fontes ?? []).map((f: any) => f.dominio).filter(Boolean),
            ];
            for (const tipo of pedidos) expect(tipos.has(tipo), `${nome}: ${tipo}`).toBe(true);
        }
    });

    it('os modelos de tipo passam pelo leitor sem problema, com a tabela de pesos do pacote', () => {
        const pesos = json(join(CONFIG, 'pesos_decisao.json'));
        for (const nome of jsons(join(CONFIG, 'dominios'))) {
            const stem = nome.replace(/\.json$/, '');
            expect(domainModelProblems(json(join(CONFIG, 'dominios', nome)), stem, pesos), nome).toEqual([]);
        }
    });

    it('os modelos de tipo só chamam protocolos que o pacote traz', () => {
        const ids = idsDosProtocolos();
        for (const nome of jsons(join(CONFIG, 'dominios'))) {
            const m = parseDomainModel(json(join(CONFIG, 'dominios', nome)), nome.replace(/\.json$/, '')).modelo!;
            const chamados = [m.criar?.protocolo, m.criar?.completo, ...(m.protocolos ?? []).map(p => p.id), ...(m.situacoes ?? []).flatMap(s => s.protocolos)].filter((x): x is string => !!x);
            for (const id of chamados) expect(ids.has(id), `${nome}: ${id}`).toBe(true);
        }
    });

    it('a tarefa e o projeto têm a tabela de estados', () => {
        const estados = (tipo: string) => parseDomainModel(json(join(CONFIG, 'dominios', `${tipo}.json`)), tipo).modelo!.estados.map(e => e.valor);
        expect(estados('tarefa')).toEqual(expect.arrayContaining(['next-action', 'done', 'cancelled']));
        expect(estados('projeto').length).toBeGreaterThan(0);
    });

    it('a tabela de pesos se lê inteira: os pesos do gesto e os do painel', () => {
        const pesos = json(join(CONFIG, 'pesos_decisao.json'));
        expect(parseWeightTable(pesos).problemas).toEqual([]);
        expect(parsePanelWeights(pesos).problemas).toEqual([]);
    });

    it('o ECH e a reputação se leem sem problema, e a reputação só cita fontes do ECH e protocolos do pacote', () => {
        const ech = lerEch(json(join(CONFIG, 'ech.json')));
        expect(ech.problemas).toEqual([]);
        const rep = lerReputacao(json(join(CONFIG, 'reputacao.json')));
        expect(rep.problemas).toEqual([]);
        const cru = json(join(CONFIG, 'reputacao.json'));
        const chaves = new Set([...ech.config!.expansao.map(f => `expansao.${f.id}`), ...ech.config!.complexidade.map(c => `complexidade.${c.fonte}`), 'dias']);
        for (const o of cru.origens.ech) expect(chaves.has(o.fonte), o.fonte).toBe(true);
        const ids = idsDosProtocolos();
        for (const m of cru.modulos) for (const f of m.funcoes) expect(ids.has(f), `${m.id}: ${f}`).toBe(true);
    });

    it('o vocabulário compila: cada termo tem padrão, motivo e lugar declarado', () => {
        const v = json(join(CONFIG, 'vocabulario.json'));
        const lugares = new Set(Object.keys(v.lugares));
        expect(v.termos.length).toBeGreaterThan(0);
        for (const t of v.termos) {
            expect(() => new RegExp(t.padrao, 'u'), t.id).not.toThrow();
            expect(String(t.motivo ?? '').trim(), t.id).not.toBe('');
            for (const o of t.onde) expect(lugares.has(o), `${t.id}: ${o}`).toBe(true);
        }
    });

    it.skipIf(!ORIGEM || !existsSync(join(ORIGEM, 'ramos', 'missao.json')))('as colunas, os painéis e os ciclos são os do cofre de origem; os estados também', () => {
        const ids = idsDosProtocolos();
        for (const id of ['missao', 'projetos']) {
            const origem = lerRamoPrincipal(json(join(ORIGEM, 'ramos', `${id}.json`))).ramoPrincipal!;
            const pacote = ramo(id);
            const colunas = (r: RamoPrincipal) => [...r.trabalho, ...r.tempo].map(c => c.id);
            expect(colunas(pacote), id).toEqual(colunas(origem));
            expect(pacote.paineis.map(p => p.id), id).toEqual(origem.paineis.map(p => p.id));
            const botoes = (r: RamoPrincipal, filtro: (p: string) => boolean) => Object.entries(r.ciclos).flatMap(([e, l]) => (l ?? []).filter(b => filtro(b.protocolo)).map(b => `${e} ${b.protocolo}`));
            expect(new Set(botoes(pacote, () => true)), id).toEqual(new Set(botoes(origem, p => ids.has(p))));
        }
        for (const tipo of ['tarefa', 'projeto']) {
            const estados = (pasta: string) => parseDomainModel(json(join(pasta, 'dominios', `${tipo}.json`)), tipo).modelo!.estados.map(e => e.valor);
            expect(estados(CONFIG), tipo).toEqual(estados(ORIGEM));
        }
    });
});
