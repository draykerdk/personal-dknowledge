/**
 * O que gravar hoje: a peça pronta para gravar e a fala da peça, para ler no celular, perto do topo da Day.
 *
 * Por quê: sem o roteiro à mão na hora de sair, a gravação não acontece. Quem grava longe do computador (o hábito
 * 🎥) precisa achar na nota do dia a peça e o teleprompter.
 *
 * Tudo vem do modelo do tipo (`Config/dominios/<tipo>.json`), sem nome de estado no código:
 * - a gravação é o primeiro estado com `habito` (o que marca o hábito no dia em que a peça entra nele); o pronto para
 *   gravar é o estado logo antes dele na tabela, e o roteiro, o de antes deste;
 * - só os formatos que marcam hábito (`habitos` diferente de false: o vídeo) entram, os outros não se gravam;
 * - o dia de ir ao ar é o campo de data que as publicações pedem (`campoDaDataDePublicacao`);
 * - o protocolo do teleprompter é o da situação do estado pronto (`situacoes`, `quando: estado:<pronto>`), o campo
 *   que guarda o link dele é o campo cujo dono é esse protocolo, e as respostas do botão vêm do `preencher` dele;
 * - o protocolo que escreve um roteiro novo é o do `criar` do modelo.
 * Nada aqui grava: o bloco só mostra (a semana é dele), e a gravação continua marcada pelo estado da peça.
 *
 * Módulo puro: sem Obsidian. Prova: tests/engine/paraGravar.test.ts.
 */
import { DIA } from './dia';
import { camposComApelidos, campoDaDataDePublicacao, formatoDaNota, type DomainModel, type DomainState } from './domainModel';

/** Os pedaços do modelo que a leitura usa. */
export type ModeloDaPeca = Pick<DomainModel, 'estados' | 'campos' | 'formatos' | 'situacoes' | 'protocolos' | 'criar'>;

/** Uma nota do tipo, como o cofre a dá: o caminho, o nome do arquivo e o frontmatter. */
export interface NotaDaPeca { caminho: string; nome: string; campos: Record<string, unknown> }

/** Os nomes dos campos da peça que a linha mostra (o título, o canal e os destinos); os rótulos vêm do modelo. */
export interface CamposDaLinha { titulo: string; canal: string; destinos: string; criado: string }

/** Os campos de sempre da peça de criação (o `titulo` do 🎬, o `canal`, os `destinos` e o `created`). */
export const CAMPOS_DA_PECA: CamposDaLinha = { titulo: 'titulo', canal: 'canal', destinos: 'destinos', criado: 'created' };

/** Os estados da gravação pelo modelo: o pronto para gravar e o de antes dele (o roteiro). */
export interface EstadosDaGravacao { pronto: DomainState; antes: DomainState | null }

/** Uma peça a gravar, com o que a linha do bloco mostra. */
export interface PecaParaGravar {
    caminho: string;
    nome: string;
    titulo: string;
    estado: DomainState;
    /** Está no estado pronto (e não no de antes dele). */
    pronta: boolean;
    canal: string | null;
    /** O rótulo do formato (o do modelo). */
    formato: string | null;
    destinos: string[];
    /** O dia de ir ao ar (`AAAA-MM-DD`), ou `null`. */
    publicarEm: string | null;
    /** O dia em que a peça nasceu (`AAAA-MM-DD`), ou `null`: a ordem das sem dia de ir ao ar. */
    criado: string | null;
    /** O alvo do link do teleprompter (o valor do campo dele), ou `null` sem teleprompter. */
    teleprompter: string | null;
}

/** O que o leitor do cofre acrescenta a uma peça: a nota do teleprompter (o caminho e a fala) e as faltas do roteiro. */
export interface PecaLida extends PecaParaGravar {
    /** O caminho da nota do teleprompter, quando o link resolve; `null` quando falta. */
    teleprompterCaminho: string | null;
    /** A fala do teleprompter (o texto da nota, sem o cabeçalho); `null` sem a nota. */
    fala: string | null;
    /** Os trechos do roteiro que ainda faltam preencher (os do 📱). */
    faltas: string[];
}

/** Um botão do bloco: o protocolo e as respostas que ele já leva. */
export interface BotaoParaGravar { rotulo: string; protocolo: string; variaveis: Record<string, string> }

/** O protocolo de um botão, com o rótulo (o nome dele) e as fichas do `preencher`. */
export interface ProtocoloDoBotao { id: string; rotulo: string; preencher: Record<string, string> }

/** O que faz: o dia `AAAA-MM-DD` de um valor de campo (texto ou data do YAML), ou `null`. */
function diaDe(v: unknown): string | null {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    const t = String(v ?? '').trim().slice(0, 10);
    return DIA.test(t) ? t : null;
}

/** O que faz: os itens de um campo como textos, sem o link vazio (`[[]]`) e sem os colchetes do link. */
function textosDe(v: unknown): string[] {
    return (Array.isArray(v) ? v : [v])
        .map(x => String(x ?? '').trim().replace(/^"|"$/g, '').replace(/^\[\[([^\]|]*)(?:\|[^\]]*)?\]\]$/, '$1').trim())
        .filter(Boolean);
}

/**
 * O que faz: os estados da gravação de um modelo: o pronto para gravar (o estado logo antes do primeiro que marca o
 * hábito) e o de antes dele.
 * Por quê: os estados vêm do modelo, nunca do código; a gravação é o que marca o hábito 🎥.
 * Entra → sai: a tabela de estados → os dois estados, ou `null` (nenhum estado com hábito, ou ele é o primeiro).
 * Erro e ataque: o estado com hábito na primeira linha não tem pronto antes dele: `null`; o de antes do pronto que é
 * oculto não vale (fica `null`).
 * Prova: tests/engine/paraGravar.test.ts ("os estados pelo modelo").
 */
export function estadosDaGravacao(modelo: Pick<DomainModel, 'estados'>): EstadosDaGravacao | null {
    const i = modelo.estados.findIndex(e => !!e.habito);
    if (i < 1) return null;
    const antes = i >= 2 && modelo.estados[i - 2].mostrar !== 'oculto' ? modelo.estados[i - 2] : null;
    return { pronto: modelo.estados[i - 1], antes };
}

/** O que faz: o protocolo do teleprompter pelo modelo: o da situação do estado pronto; sem ela, `null`. */
export function protocoloDoTeleprompter(modelo: Pick<DomainModel, 'situacoes'>, pronto: DomainState): string | null {
    return modelo.situacoes.find(s => s.quando === `estado:${pronto.valor}`)?.protocolos[0] ?? null;
}

/** O que faz: o campo que guarda o link da nota de um protocolo (o campo cujo dono é ele); sem ele, `null`. */
export function campoDoProtocolo(modelo: Pick<DomainModel, 'campos'>, protocolo: string | null): string | null {
    if (!protocolo) return null;
    return modelo.campos.find(c => c.dono === `protocolo:${protocolo}` || c.dono.startsWith(`protocolo:${protocolo}#`))?.nome ?? null;
}

/** O que faz: a ordem das peças a gravar: o dia de ir ao ar primeiro (o mais perto), depois as sem dia, a mais antiga primeiro. */
export function ordemParaGravar(a: PecaParaGravar, b: PecaParaGravar): number {
    if (a.publicarEm && b.publicarEm) return a.publicarEm.localeCompare(b.publicarEm) || a.titulo.localeCompare(b.titulo);
    if (a.publicarEm) return -1;
    if (b.publicarEm) return 1;
    const ca = a.criado ?? '9999-99-99';
    const cb = b.criado ?? '9999-99-99';
    return ca.localeCompare(cb) || a.nome.localeCompare(b.nome);
}

/**
 * O que faz: a ordem final das peças lidas: a que já tem a fala do teleprompter, sem faltas, vem antes; no resto, a
 * ordem de `ordemParaGravar` fica (a ordenação é estável).
 * Por quê: 05/11, o vídeo que não saiu "por não ter claro o roteiro": a primeira peça do bloco é a que dá para gravar
 * agora, lendo no celular; a pronta sem teleprompter vem depois, com o botão do 📱.
 * Entra → sai: duas peças lidas (a fala e as faltas) → o comparador.
 * Prova: tests/engine/paraGravar.test.ts ("a fala pronta vem antes").
 */
export function ordemPelaFala(a: { fala: string | null; faltas: readonly unknown[] }, b: { fala: string | null; faltas: readonly unknown[] }): number {
    const pronta = (p: { fala: string | null; faltas: readonly unknown[] }) => (p.fala && !p.faltas.length ? 0 : 1);
    return pronta(a) - pronta(b);
}

/**
 * O que faz: as peças a gravar: as do estado pronto, pelo dia de ir ao ar mais perto (e as sem dia, a mais antiga
 * primeiro); sem nenhuma pronta, as do estado de antes (o roteiro), na mesma ordem.
 * Por quê: a Day mostra o que gravar hoje; sem nada pronto, o roteiro que falta terminar.
 * Entra → sai: o modelo, as notas do tipo e os nomes dos campos da linha → `{ prontas, pecas }` (`prontas` diz se a
 * lista é a das prontas); sem os estados da gravação no modelo, a lista vazia.
 * Erro e ataque: o formato que não marca hábito (o artigo, o post) fica de fora; a nota sem formato conhecido também;
 * o status em outra caixa vale; o nome antigo de um campo (`antes`, o `plataforma`) vale pelo de agora; a entrada não
 * muda.
 * Prova: tests/engine/paraGravar.test.ts ("a ordem", "o roteiro quando nada está pronto", "nenhuma peça").
 */
export function pecasParaGravar(modelo: ModeloDaPeca, notas: readonly NotaDaPeca[], nomes: CamposDaLinha = CAMPOS_DA_PECA): { prontas: boolean; pecas: PecaParaGravar[] } {
    const estados = estadosDaGravacao(modelo);
    if (!estados) return { prontas: false, pecas: [] };
    const data = campoDaDataDePublicacao(modelo);
    const campoTele = campoDoProtocolo(modelo, protocoloDoTeleprompter(modelo, estados.pronto));
    const lidas: PecaParaGravar[] = [];
    for (const n of notas) {
        const campos = camposComApelidos(modelo, n.campos ?? {});
        const status = String(campos.status ?? '').trim().toLowerCase();
        const estado = [estados.pronto, estados.antes].find(e => e && e.valor.toLowerCase() === status);
        if (!estado) continue;
        const formato = formatoDaNota(modelo.formatos, campos);
        if (!formato || formato.formato.habitos === false) continue;
        lidas.push({
            caminho: n.caminho,
            nome: n.nome,
            titulo: textosDe(campos[nomes.titulo])[0] ?? n.nome,
            estado,
            pronta: estado === estados.pronto,
            canal: textosDe(campos[nomes.canal])[0] ?? null,
            formato: formato.formato.rotulo,
            destinos: textosDe(campos[nomes.destinos]),
            publicarEm: data ? diaDe(campos[data]) : null,
            criado: diaDe(campos[nomes.criado]),
            teleprompter: campoTele ? textosDe(campos[campoTele])[0] ?? null : null,
        });
    }
    const prontas = lidas.filter(p => p.pronta);
    const lista = prontas.length ? prontas : lidas.filter(p => !p.pronta);
    return { prontas: prontas.length > 0, pecas: [...lista].sort(ordemParaGravar) };
}

/**
 * O que faz: a fala de uma nota de teleprompter: o texto depois da primeira linha `---` do corpo (o molde do 📱 põe o
 * título, a linha de onde vem e as faltas antes dela); sem a linha, o corpo sem os títulos.
 * Entra → sai: o texto inteiro da nota → a fala (sem linhas em branco nas pontas), ou `''`.
 * Erro e ataque: o frontmatter sai; a nota vazia dá `''`.
 * Prova: tests/engine/paraGravar.test.ts ("a fala do teleprompter").
 */
export function falaDoTeleprompter(nota: string): string {
    const corpo = String(nota ?? '').replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');
    const linhas = corpo.split('\n');
    const i = linhas.findIndex(l => /^-{3,}\s*$/.test(l.trim()));
    const fala = i >= 0 ? linhas.slice(i + 1) : linhas.filter(l => !/^#\s/.test(l.trim()));
    return fala.join('\n').trim();
}

/** O que faz: `AAAA-MM-DD` → `dd/mm`. */
const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** O que faz: um link de nota pelo caminho inteiro, com o rótulo. */
const link = (caminho: string, rotulo: string) => `[[${caminho.replace(/\.md$/, '')}|${rotulo.replace(/[|\]]/g, ' ')}]]`;

/** O que faz: a linha de um campo da peça (o canal, o formato, os destinos, o dia de ir ao ar), sem os vazios. */
function linhaDaPeca(p: PecaParaGravar, dia: string, vazios: { destinos: string; publicar: string }): string {
    const ar = p.publicarEm ? `vai ao ar em ${diaMes(p.publicarEm)}${p.publicarEm === dia ? ' (hoje)' : ''}` : `vai ao ar: ${vazios.publicar}`;
    return [p.canal, p.formato, p.destinos.length ? p.destinos.join(', ') : vazios.destinos, ar].filter(Boolean).join(' · ');
}

/** O que faz: cada linha dentro de um aviso do Obsidian (`> `), com a quebra de linha mantida. */
const noAviso = (texto: string) => texto.split('\n').map(l => (l.trim() ? `> ${l}  ` : '>')).join('\n');

/** O que faz: as respostas de um botão pelas fichas do `preencher` (`{{no.nome}}`, `{{no.caminho}}`). */
function respostas(preencher: Record<string, string>, p: Pick<PecaParaGravar, 'nome' | 'caminho'>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [passo, ficha] of Object.entries(preencher)) out[passo] = String(ficha).replace(/\{\{no\.nome\}\}/g, p.nome).replace(/\{\{no\.caminho\}\}/g, p.caminho);
    return out;
}

/**
 * O que faz: o bloco "🎥 Para gravar hoje" em Markdown e os botões dele: a primeira peça aberta (o título, o estado,
 * a linha, os links do roteiro e do teleprompter, a fala num aviso para ler no celular e as faltas), as outras como
 * links; sem peça, "nada pronto para gravar" e o botão do roteiro novo.
 * Por quê: ver o cabeçalho do módulo. O bloco só mostra: nenhum botão grava sem a pessoa abrir o protocolo.
 * Entra → sai: o dia, a leitura (as peças lidas e se são as prontas), os protocolos dos botões e os textos de vazio do
 * modelo → `{ texto, botoes }`.
 * Erro e ataque: a peça sem teleprompter diz que falta e leva o botão do 📱 (só quando o modelo diz o protocolo); a
 * peça do estado de antes diz "roteiro ainda não pronto"; o rótulo com `|` ou `]` não quebra o link.
 * Prova: tests/engine/paraGravar.test.ts.
 */
export function blocoParaGravar(
    dia: string,
    leitura: { prontas: boolean; pecas: readonly PecaLida[] },
    protocolos: { teleprompter: ProtocoloDoBotao | null; roteiro: ProtocoloDoBotao | null },
    vazios: { destinos: string; publicar: string } = { destinos: 'sem destino', publicar: 'a definir' },
): { texto: string; botoes: BotaoParaGravar[] } {
    const [primeira, ...outras] = leitura.pecas;
    if (!primeira) {
        const botoes = protocolos.roteiro ? [{ rotulo: protocolos.roteiro.rotulo, protocolo: protocolos.roteiro.id, variaveis: {} }] : [];
        return { texto: 'Nada pronto para gravar.', botoes };
    }
    const partes: string[] = [];
    if (!leitura.prontas) partes.push(`*Nada pronto para gravar: ${leitura.pecas.length === 1 ? 'esta peça está' : 'estas peças estão'} em ${primeira.estado.rotulo}.*`);
    const estado = primeira.pronta ? primeira.estado.rotulo : 'roteiro ainda não pronto';
    partes.push([
        `**${primeira.titulo}** · ${estado}`,
        linhaDaPeca(primeira, dia, vazios),
        [
            `📝 ${link(primeira.caminho, 'Roteiro')}`,
            primeira.teleprompterCaminho ? `📱 ${link(primeira.teleprompterCaminho, 'Teleprompter')}` : '📱 falta o teleprompter',
        ].join(' · '),
    ].join('  \n'));
    if (primeira.faltas.length) {
        partes.push(`> [!warning] Falta preencher no roteiro (${primeira.faltas.length})\n${noAviso(primeira.faltas.map((f, i) => `${i + 1}. ${f}`).join('\n'))}`);
    }
    if (primeira.fala) partes.push(`> [!quote] 📱 A fala\n${noAviso(primeira.fala)}`);
    if (outras.length) {
        const titulo = leitura.prontas ? `Outras prontas para gravar (${outras.length})` : `Outros roteiros (${outras.length})`;
        partes.push([`> [!note]- ${titulo}`, ...outras.map(p => `> - ${link(p.caminho, p.titulo)} · ${linhaDaPeca(p, dia, vazios)}${p.teleprompterCaminho ? '' : ' · falta o teleprompter'}`)].join('\n'));
    }
    const botoes: BotaoParaGravar[] = [];
    if (!primeira.teleprompterCaminho && protocolos.teleprompter) {
        botoes.push({ rotulo: protocolos.teleprompter.rotulo, protocolo: protocolos.teleprompter.id, variaveis: respostas(protocolos.teleprompter.preencher, primeira) });
    }
    return { texto: partes.join('\n\n'), botoes };
}
