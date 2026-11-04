/**
 * O motor dos protocolos no lugar (P12b): o que a gaveta do ciclo lê do cofre e do motor, dado pelo
 * lugar à gaveta (missao/gavetaDoMotor.ts).
 *
 * Por quê: o passo `motor` da divisão da Missão (H5, tests/missao/modeloDfm.test.ts). A gaveta lia o
 * cofre pelo `app` do motor (`app.vault.getMarkdownFiles`, `app.metadataCache`) e importava o título
 * curto do jsonProtocol, que chega ao Obsidian, ao lado das gravações que recebem tudo pelas
 * dependências. A leitura e o título moram aqui, no lugar (liga.lugares), e chegam à gaveta pelas
 * dependências dela (`DepsDaGavetaDoMotor`).
 *
 * Só lê. Prova: tests/missao/componenteGaveta.test.ts (a gaveta grava o mesmo que o passo a passo).
 */
import { notasCandidatas } from '../../engine/noteCandidates';
import { noteNameToTitle, shortenTaskTitle } from '../../engine/jsonProtocol';
import { ehPassoDeContextoGenerico } from '../../engine/stepRules';
import type { DatasDaRodada } from '../../engine/protocolForm';
import { gavetaDoProtocolo, type MotorDaGaveta } from '../gavetaDoMotor';
import type { NotaCandidata, ProtocoloDaGaveta } from '../gaveta';

/**
 * O que faz: o título curto que o modal sugere para a tarefa de um `askTitle`: a versão curta da
 * resposta (`shortenTaskTitle`), legível quando ela é o nome de uma nota (`titleFromNoteName`).
 * Por quê: a mesma conta do motor (`jsonProtocol.ts`, a criação da tarefa), para a gaveta mostrar
 * o título que Enter aceitaria no modal.
 */
export function tituloCurtoDoMotor(resposta: string, config: any): string {
    return shortenTaskTitle(config?.titleFromNoteName ? (noteNameToTitle(resposta) || resposta) : resposta);
}

/** Quantas notas o seletor de um passo oferece na gaveta (a caixa sugere; escrever outra continua valendo). */
export const NOTAS_NA_GAVETA = 80;

/**
 * O que faz: as notas que o seletor de um passo oferece, pela filtragem única do modal
 * (`notasCandidatas`), com a nota padrão do passo primeiro e o resto da mais nova para a mais velha.
 * Erro e ataque: sem o cofre, `null`; no máximo `NOTAS_NA_GAVETA`.
 */
export function notasDoPasso(motor: MotorDaGaveta, passo: any): NotaCandidata[] | null {
    const app = motor.app;
    if (!app?.vault?.getMarkdownFiles) return null;
    const fm = (f: any) => app.metadataCache?.getFileCache?.(f)?.frontmatter;
    const pasta = motor.resolveFolderFilter ? motor.resolveFolderFilter(passo?.folder) : String(passo?.folder ?? '');
    const lista = notasCandidatas(app.vault.getMarkdownFiles(), {
        agora: null, habitoDoAgora: () => false, excludeArchive: !!passo?.excludeArchive, folderFilter: pasta || '',
        allowAnyNote: passo?.allowAnyNote ?? ehPassoDeContextoGenerico(passo),
        propertyFilter: motor.resolvePropertyFilter ? motor.resolvePropertyFilter(passo?.criteria?.property) : null,
    }, fm) as any[];
    const padrao = typeof passo?.defaultNote === 'string' ? passo.defaultNote : '';
    lista.sort((a, b) => (a.basename === padrao ? -1 : b.basename === padrao ? 1 : (b.stat?.mtime ?? 0) - (a.stat?.mtime ?? 0)));
    return lista.slice(0, NOTAS_NA_GAVETA).map(f => ({ nome: String(f.basename), caminho: String(f.path) }));
}

/**
 * O que faz: o protocolo da gaveta para um botão, com o que o lugar dá: as notas de cada passo,
 * lidas do cofre do motor (`notasDoPasso`), e o título curto do motor quando vem.
 * Por quê: a gaveta (`gavetaDoProtocolo`) não lê o cofre; quem lê é o lugar, e a chamada continua a
 * mesma para quem abre a gaveta (o lugar e os testes).
 * Entra → sai: o id, as datas, as variáveis do botão, quem acha o motor e o título curto → o
 * protocolo da gaveta, ou `null`.
 * Prova: tests/missao/componenteGaveta.test.ts.
 */
export function protocoloDaGaveta(
    id: string,
    datas: DatasDaRodada,
    doBotao: Record<string, unknown>,
    achar: (id: string) => MotorDaGaveta | null | undefined,
    tituloCurto?: (resposta: string, config: any) => string,
): Promise<ProtocoloDaGaveta | null> {
    return gavetaDoProtocolo(id, datas, doBotao, achar, { tituloCurto, notas: notasDoPasso });
}
