/**
 * O "Ligar" de dois nós, puro: o que ligar um cartão a outro grava (a alça arrastada até outro cartão,
 * ou o "Ligar" e o clique no outro), pelos campos de link dos modelos de tipo e pelo `ramo` de cada
 * campo, com as gravações que já existem: a alça da SMART (`intencaoDaAlca`), o gesto de pôr uma nota
 * no campo de um nó (`gestoNoCampo`, o mesmo do "＋ Adicionar" e do "Escolher uma que já existe") e o
 * soltar (`intencaoDeSoltar`, a tabela das setas).
 *
 * Por quê: o mapa e os ramos não tinham como fazer conexões, e os ramos nem como adicionar componentes
 * (30/10/2026). Uma ligação é um campo de link de um dos dois
 * modelos: o campo `acima` de quem fica embaixo (o ramo), o `lado` (a dependência, as pessoas do dia),
 * o `abaixo`. O campo de um protocolo fica com o protocolo (`comoEdita`), e nenhum campo se inventa:
 * sem campo entre os dois tipos, nem gesto de soltar, o aviso diz.
 *
 * Compõe (compoe.modelo): o modelo entrega `ligacoesEntre` à vista (`MissaoModelo.ligacoesEntre`), e a
 * vista não importa daqui. Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/ligar.test.ts.
 */
import { comoEdita } from '../engine/fieldModel';
import type { BranchDirection } from '../engine/domainModel';
import { modeloDaNota } from './camposDoNo';
import { gestoNoCampo } from './escolher';
import { LIGAR } from './frases';
import { intencaoDaAlca, intencaoDeSoltar, intencaoDeSubtarefa } from './intencoes';
import { nomeParaOLink } from './novo';
import { dominioDoNo } from './ramo';
import type { LeitorDoEscolher, MissaoModelo, OpcaoDeLigar, ResultadoDoLigar } from './tipos';

/** Uma ligação pelo campo, antes da ordem: o grupo (o ramo que a alça desenha primeiro) e a opção. */
interface PeloCampo { grupo: number; opcao: OpcaoDeLigar }

/** As ligações pelos campos de um lado, e o porquê das que o gesto recusou (já ligados, a regra da seta). */
interface DosCampos { opcoes: PeloCampo[]; recusas: string[] }

/**
 * A ordem dos grupos: o alvo fica embaixo de quem tem a alça (o ramo que ela desenha, como a da SMART);
 * quem tem a alça fica embaixo do alvo; o lado (a dependência); o `abaixo` de um dos dois.
 */
const GRUPO = { alvoEmbaixo: 0, origemEmbaixo: 1, lado: 2, abaixo: 3, peloDono: 4 } as const;

/** O que faz: o título de um nó, para os textos (o do cartão, ou o id). */
const tituloDe = (modelo: Pick<MissaoModelo, 'no'>, id: string) => modelo.no(id)?.titulo ?? id;

/**
 * O que faz: as ligações pelos campos de link do modelo de um dos nós (o dono do campo) que apontam a
 * espécie do outro: cada uma é o gesto de pôr o outro no campo do dono (`gestoNoCampo`), só nos campos
 * que o painel edita.
 * Entra → sai: o modelo, o dono do campo, o outro, o leitor e se o dono é o alvo do gesto → as ligações.
 * Erro e ataque: o nó sem nota, o modelo que não se acha e o campo do protocolo não dão ligação; o gesto
 * com problema (o que já está no campo, a regra da seta) também não, e o porquê volta em `recusas`.
 */
function pelosCampos(modelo: MissaoModelo, dono: string, outro: string, leitor: LeitorDoEscolher, donoEhOAlvo: boolean): DosCampos {
    const nada: DosCampos = { opcoes: [], recusas: [] };
    const nota = modelo.arquivos(dono).nota;
    if (!nota) return nada;
    const fm = leitor.camposDaNota(nota) ?? {};
    const tipo = modeloDaNota(nota, fm, leitor.modelos);
    const especie = dominioDoNo(modelo, outro, { camposDaNota: leitor.camposDaNota });
    const nome = nomeParaOLink(modelo, outro);
    if (!tipo || !especie || !nome) return nada;
    const out: PeloCampo[] = [];
    const recusas: string[] = [];
    for (const campo of tipo.campos) {
        if (campo.tipo !== 'link' || !(campo.alvo ?? []).includes(especie)) continue;
        const como = comoEdita(campo, { nomeDoArquivo: leitor.nomeDoArquivo });
        // O campo do protocolo dono (30/10): o Ligar abre o protocolo com o passo do campo já respondido.
        if (como.via === 'protocolo' && como.passo) {
            const nomeDoDono = leitor.nomeDoProtocolo?.(como.protocolo) || como.protocolo;
            out.push({ grupo: GRUPO.peloDono, opcao: { rotulo: LIGAR.peloDono(tituloDe(modelo, dono), campo.rotulo, tituloDe(modelo, outro), nomeDoDono), gesto: { via: 'protocolo', no: dono, protocolo: como.protocolo, valores: { [como.passo]: nome }, texto: `${nomeDoDono}: ${campo.rotulo} ${tituloDe(modelo, outro)}` }, antes: null } });
            continue;
        }
        if (como.via !== 'campo') continue;
        const g = gestoNoCampo(modelo, { no: dono, nota, campo: campo.nome }, campo, fm, { nome, caminho: modelo.arquivos(outro).nota });
        if ('problema' in g) { if (g.problema) recusas.push(`${campo.rotulo}: ${g.problema}`); continue; }
        out.push({ grupo: grupoDo(campo.ramo, donoEhOAlvo), opcao: { rotulo: LIGAR.noCampo(tituloDe(modelo, dono), campo.rotulo, tituloDe(modelo, outro)), gesto: g.gesto, antes: g.antes } });
    }
    return { opcoes: out, recusas };
}

/** O que faz: o grupo de uma ligação pelo campo: o `acima` de quem fica embaixo, o lado, o abaixo. */
function grupoDo(ramo: BranchDirection | undefined, donoEhOAlvo: boolean): number {
    if (ramo === 'acima') return donoEhOAlvo ? GRUPO.alvoEmbaixo : GRUPO.origemEmbaixo;
    if (ramo === 'abaixo') return GRUPO.abaixo;
    return GRUPO.lado;
}

/**
 * O que faz: o que ligar o nó `de` (quem tem a alça, ou o "Ligar") ao nó `para` grava:
 * - a alça da SMART numa ação: acrescenta a mãe, como sempre (`intencaoDaAlca`), direto;
 * - senão, os campos de link dos dois modelos que apontam a espécie do outro, na ordem do ramo que a
 *   alça desenha (o alvo embaixo de quem tem a alça; quem tem a alça embaixo do alvo; o lado; o
 *   abaixo); a primeira vai direto quando o alvo fica embaixo, ou quando é a única;
 * - sem campo, o soltar de um sobre o outro (pôr no dia ou na semana, mudar de projeto, ligar à SMART);
 * - sem nada disso, o porquê: o que o gesto recusou (já estão ligados), ou que nenhum campo liga os dois.
 * Por quê: "a conexão grava o campo certo para os dois tipos, pelos campos de link dos modelos e pelo
 * ramo deles, com o Desfazer; sem campo entre os dois tipos, um aviso curto, sem inventar campo" (30/10).
 * Entra → sai: o modelo, os dois ids e o leitor (os modelos de tipo, o frontmatter) → as ligações e se
 * a primeira vai direto, ou o problema.
 * Erro e ataque: o mesmo nó, o nó que a Missão não conhece, o campo do protocolo e o que já está ligado
 * não gravam; nada aqui grava.
 * Prova: tests/missao/ligar.test.ts.
 */
export function ligacoesEntre(modelo: MissaoModelo, de: string, para: string, leitor: LeitorDoEscolher): ResultadoDoLigar {
    if (!de || !para || de === para) return { problema: LIGAR.mesmo };
    // A SMART e a ação, nos dois sentidos: acrescenta a mãe (a seta SMART → ação); a segunda SMART se soma
    // à primeira, e o Desfazer tira só ela (30/10/2026: a conexão já muda os metadados).
    for (const [smart, acao] of [[de, para], [para, de]] as const) {
        const alca = intencaoDaAlca(modelo, smart, acao);
        if ('caminho' in alca) return { opcoes: [{ rotulo: LIGAR.soltar(tituloDe(modelo, acao), alca.texto), gesto: { via: 'mover', caminho: alca.caminho, destino: alca.destino, texto: alca.texto }, antes: null }], direta: true };
    }
    // Duas ações: a subtarefa, nos dois sentidos (o alvo embaixo de quem tem a alça primeiro), antes das dependências.
    const subtarefas: OpcaoDeLigar[] = [];
    for (const [filha, mae] of [[para, de], [de, para]] as const) {
        const i = intencaoDeSubtarefa(modelo, filha, mae);
        if ('caminho' in i) subtarefas.push({ rotulo: LIGAR.subtarefa(tituloDe(modelo, filha), tituloDe(modelo, mae)), gesto: { via: 'mover', caminho: i.caminho, destino: i.destino, texto: i.texto }, antes: null });
    }
    const doAlvo = pelosCampos(modelo, para, de, leitor, true), daOrigem = pelosCampos(modelo, de, para, leitor, false);
    const campos = [...doAlvo.opcoes, ...daOrigem.opcoes].sort((a, b) => a.grupo - b.grupo);
    if (subtarefas.length) return { opcoes: [...subtarefas, ...campos.map(c => c.opcao)], direta: false };
    // A gravação direta só pelo campo do ramo; o protocolo dono abre a gaveta, e quem escolhe é quem usa.
    if (campos.length) return { opcoes: campos.map(c => c.opcao), direta: campos[0].grupo === GRUPO.alvoEmbaixo || (campos.length === 1 && campos[0].grupo !== GRUPO.peloDono) };
    const soltar: OpcaoDeLigar[] = [];
    for (const [quem, onde] of [[de, para], [para, de]] as const) {
        const i = intencaoDeSoltar(modelo, quem, onde);
        if ('caminho' in i) soltar.push({ rotulo: LIGAR.soltar(tituloDe(modelo, quem), i.texto), gesto: { via: 'mover', caminho: i.caminho, destino: i.destino, texto: i.texto }, antes: null });
    }
    if (soltar.length) return { opcoes: soltar, direta: soltar.length === 1 };
    const recusas = [...doAlvo.recusas, ...daOrigem.recusas];
    if (recusas.length) return { problema: LIGAR.recusada(tituloDe(modelo, de), tituloDe(modelo, para), recusas[0]) };
    return { problema: LIGAR.semCampo(tituloDe(modelo, de), tituloDe(modelo, para)) };
}
