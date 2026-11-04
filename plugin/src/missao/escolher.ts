/**
 * O "Escolher uma que já existe" do Novo, puro: o que escolher faz a partir do nó de onde o Novo
 * abriu, as notas do tipo que fazem sentido ali (as pendentes primeiro, pelos pesos, com o porquê)
 * e o gesto de cada uma, pronto para a gravação de sempre.
 *
 * Por quê: o Novo oferece escolher uma nota existente ou criar uma nova pelo mesmo adicionar, para a
 * tarefa SMART ou comum e o que mais houver ali, na mesma lógica (29/10/2026). Escolher nunca cria:
 * aplica o gesto que o nó já tem, pelas funções do P6, com o
 * Desfazer da pilha única:
 * - `soltar`: a escolhida solta sobre o nó, pela mesma conta do arrasto (`intencaoDeSoltar`, a
 *   tabela das setas): pôr no dia ou na semana, somar à SMART (com a herança da mãe; as outras mães
 *   ficam, 02/11), mudar de projeto;
 * - `campo`: o campo do painel (`valorDoCampo`, o mesmo que a caixa do painel grava), com o link
 *   do outro lado; só o campo que o painel edita (`comoEdita` → `campo`): o campo de um protocolo
 *   fica com o protocolo.
 * O que escolher faz vem do ramo (`novo.no.<espécie>[].escolher`, §3.8); nenhum nome de tipo nem
 * de campo mora aqui: as notas do tipo saem de `candidatosDoCampo` (o `type` do modelo do tipo,
 * os projetos, as áreas, as passagens), e o campo, do modelo.
 *
 * Compõe (compoe.modelo, passo `escolher` da divisão da Missão): junta o gesto da tabela das setas
 * (`intencaoDeSoltar`), os campos do nó e a lista das pessoas sobre o modelo; a borboleta entrega
 * estas composições à vista pelo próprio modelo (`MissaoModelo.opcoesDeEscolher` e as vizinhas), e a
 * vista não importa daqui. O que não compõe (a escolha do ramo, o título da busca, os tipos do
 * campo) fica nos formulários, em escolha.ts.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/escolher.test.ts e tests/missao/adicionar.test.ts.
 */
import type { WeightReason } from '../engine/decisionWeights';
import type { DomainField, DomainModel } from '../engine/domainModel';
import { comoEdita, valorDoCampo, type RegrasDoValor } from '../engine/fieldModel';
import { motherLink, patchFor, type LinkTask } from '../canvas/edgeLinks';
import { fold, linkTarget } from '../project/projectCanvasModel';
import { listOf } from '../tasks/taskRecord';
import type { MissaoModelo, AdicaoAoCampo, Candidato, EscolhaDoNo, GestoNoCampo, LeitorDoEscolher, ListaDoEscolher, OpcaoDeEscolher, OrigemDoNovo } from './tipos';
import { modeloDaNota, valorEmTexto } from './camposDoNo';
import { intencaoDeSoltar } from './intencoes';
import { comNotaNoCampo } from './pessoas';
import { candidatosDoCampo, especieDoNo, type TipoDoNovo } from './novo';
import { noDaEscolha } from './escolha';
import { chaveNaEscala, periodoDoId } from './tempo';
import { candidatasDoNo } from './ramo';
import { noRecorteDoRamo } from './linhagem';

/** Quantas opções a lista mostra (as primeiras, na ordem); o resto aparece ao digitar. */
export const OPCOES_DO_ESCOLHER = 8;
/** Quantos motivos dos pesos cada opção diz (os maiores, como o "Por que agora" do painel). */
export const MOTIVOS_DO_ESCOLHER = 3;

const nomeDoCaminho = (caminho: string) => caminho.slice(caminho.lastIndexOf('/') + 1).replace(/\.md$/, '');

/** O que faz: o nome com que o nó entra num link (o projeto, a área, a TaskNote, a passagem, o período). */
function nomeDoNo(modelo: MissaoModelo, id: string): string | null {
    const { indice } = modelo;
    const t = indice.porId.get(id);
    return indice.projetos.get(id)?.nome ?? indice.areas.get(id)?.nome ?? (t ? nomeDoCaminho(t.caminho) : null)
        ?? modelo.passagens.find(e => e.id === id)?.cidade ?? periodoDoId(id)?.chave ?? null;
}

/** O que faz: o campo que o painel edita, do modelo dado; `null` = o campo não é do painel (o protocolo, o derivado). */
function campoDoPainel(modelo: DomainModel | null | undefined, nome: string, nomeDoArquivo: string | null | undefined): DomainField | null {
    const campo = modelo?.campos.find(c => c.nome === nome) ?? null;
    return campo && comoEdita(campo, { nomeDoArquivo }).via === 'campo' ? campo : null;
}

/**
 * O que faz: o valor que a caixa do painel gravaria com o link novo: na lista, o que já está, como
 * está, mais o nome no fim (`comNotaNoCampo`, a mesma lista da nota nova); no valor único, o nome.
 * O mesmo `valorDoCampo` da caixa confere.
 * Entra → sai: o campo, o valor de agora e o nome → o valor, ou `null` (já está, ou não vale).
 * Erro e ataque: o objeto `{ uid, reltype }` do TaskNotes fica como está (nunca vira texto).
 */
export function valorComLink(campo: DomainField, atual: unknown, nome: string, regras: RegrasDoValor = {}): unknown | null {
    const nomes = listOf(atual).map(v => linkTarget(v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>).uid : v)).filter(Boolean);
    if (nomes.some(n => fold(n) === fold(nome))) return null;
    const r = valorDoCampo(campo, campo.multiplo ? [...nomes, nome] : nome, regras);
    if ('problema' in r) return null;
    return campo.multiplo ? comNotaNoCampo(atual, nome) : r.valor;
}

/** O que faz: os motivos dos pesos em palavras (os maiores), ou `null` sem peso. */
function porqueDos(motivos: readonly WeightReason[] | null): string | null {
    return motivos?.length ? motivos.slice(0, MOTIVOS_DO_ESCOLHER).map(x => x.texto).join(' · ') : null;
}

/**
 * O que faz: as notas do tipo que se escolhem a partir do nó, cada uma com o gesto: as que o
 * gesto aceita e que ainda não estão ali (a tarefa aberta que não está naquela semana, naquele
 * dia, naquela SMART ou naquele projeto; o projeto que ainda não é auxiliar do nó), as pendentes
 * de antes primeiro, depois as sem data, depois pelos pontos dos pesos, depois pelo nome; e só as
 * que o texto acha.
 * Entra → sai: o modelo, a escolha, o tipo, a origem, o leitor, o texto digitado e o limite →
 * as opções e o total; `null` = a escolha não vale aqui (o nó sem nota, o campo que o painel não
 * edita): o Novo só cria.
 * Erro e ataque: a escolhida que é o próprio nó sai; a tarefa fora do recorte do ramo sai (ela
 * não ficaria à vista ali); a nota sem caminho não se grava (sai); o
 * gesto com problema (o trimestre, a SMART sobre SMART) sai; nada aqui grava.
 */
export function opcoesDeEscolher(
    modelo: MissaoModelo,
    escolha: EscolhaDoNo,
    tipo: Pick<TipoDoNovo, 'dominio' | 'titulo'>,
    origem: OrigemDoNovo,
    leitor: LeitorDoEscolher,
    texto = '',
    limite = OPCOES_DO_ESCOLHER,
): ListaDoEscolher | null {
    const no = noDaEscolha(origem);
    if (!no) return null;
    const { indice } = modelo;
    const doTipo: DomainField = { nome: '', rotulo: tipo.titulo, tipo: 'link', alvo: [tipo.dominio], dono: 'derivado' };
    const candidatos = candidatosDoCampo(modelo, doTipo, leitor.modelos);
    const porCaminho = new Map(indice.vivas.map(t => [t.caminho, t]));
    const out: OpcaoDeEscolher[] = [];

    if (escolha.gesto === 'soltar') {
        const periodo = periodoDoId(no);
        // As candidatas do nó (02/11: elas aparecem nas opções do adicionar, para a tarefa, a SMART e o
        // resto): primeiro, na ordem padrão, com o porquê delas; depois as outras, como sempre.
        const doTipo = new Set(candidatos.map(c => c.caminho).filter(Boolean));
        const candidatas = new Map(candidatasDoNo(modelo, no, t => doTipo.has(t.caminho)).map((c, i) => [c.id, { i, porque: c.porque }]));
        const noRecorte = noRecorteDoRamo(indice, leitor.recorte);
        for (const c of candidatos) {
            const t = c.caminho ? porCaminho.get(c.caminho) : undefined;
            if (!t || !t.aberta || t.id === no) continue;
            if (!noRecorte(t)) continue;
            const jaEsta = periodo ? chaveNaEscala(t.colocacao, periodo.escala) === periodo.chave : t.smart === no || t.projeto === no;
            if (jaEsta) continue;
            const i = intencaoDeSoltar(modelo, t.id, no);
            if ('problema' in i) continue;
            const motivos = modelo.motivos(t.id);
            const cand = candidatas.get(t.id);
            out.push({
                chave: t.caminho, rotulo: t.titulo, no: t.id, porque: [cand?.porque, porqueDos(motivos)].filter(Boolean).join(' · ') || null, pendente: t.deAntes,
                semData: t.colocacao.lugar !== 'linha', pontos: (motivos ?? []).reduce((soma, m) => soma + m.pontos, 0),
                gesto: { via: 'mover', caminho: i.caminho, destino: i.destino, texto: i.texto },
                ...(cand ? { candidata: cand.i } : {}),
            });
        }
    } else {
        const nota = modelo.arquivos(no).nota;
        if (escolha.grava === 'origem') {
            // O campo do nó de onde o Novo abriu: a mesma lista do "＋ Adicionar" do campo, só do tipo.
            if (!nota) return null;
            return opcoesDoCampo(modelo, { no, nota, campo: escolha.campo }, leitor, texto, limite, [tipo.dominio]);
        } else {
            const campo = campoDoPainel(leitor.modelos.find(m => m.dominio === tipo.dominio), escolha.campo, leitor.nomeDoArquivo);
            const nome = nomeDoNo(modelo, no);
            if (!campo || !nome) return null;
            for (const c of candidatos) {
                if (!c.caminho || c.caminho === nota) continue;
                const fm = leitor.camposDaNota(c.caminho) ?? {};
                const valor = valorComLink(campo, fm[campo.nome], nome, { type: String(fm.type ?? ''), nota: fm });
                if (valor === null) continue;
                out.push({ chave: c.caminho, rotulo: c.rotulo, no: modelo.noDaNota(c.caminho)?.id ?? null, porque: null, pendente: false, semData: false, pontos: 0, gesto: { via: 'campo', caminho: c.caminho, campo: campo.nome, valor, rotulo: campo.rotulo, mostrado: valorEmTexto(campo, valor) } });
            }
        }
    }

    return ordenadas(out, texto, limite);
}

/**
 * O que faz: a ordem e o filtro das opções, iguais para o Novo e para o "＋ Adicionar": as candidatas do
 * nó primeiro, na ordem delas (02/11); depois as pendentes de antes, as sem data, pelos pontos dos pesos e
 * pelo nome; só as que o texto acha; as primeiras até o limite, e o total.
 */
function ordenadas(out: OpcaoDeEscolher[], texto: string, limite: number): ListaDoEscolher {
    const posicao = (o: OpcaoDeEscolher) => (o.candidata === undefined ? Infinity : o.candidata);
    out.sort((a, b) => (posicao(a) - posicao(b) || 0) || Number(b.pendente) - Number(a.pendente) || Number(b.semData) - Number(a.semData) || b.pontos - a.pontos || a.rotulo.localeCompare(b.rotulo));
    const q = fold(texto.trim());
    const achadas = q ? out.filter(o => fold(o.rotulo).includes(q)) : out;
    return { opcoes: achadas.slice(0, Math.max(0, limite)), total: achadas.length };
}

/**
 * O que faz: o campo de link que o painel edita, do modelo do tipo da nota; `null` = o campo não é
 * de link, não é do painel (o do protocolo, o derivado) ou a nota não tem modelo.
 * Por quê: cada campo do painel tem o seu próprio adicionar (29/10/2026); o campo
 * de um protocolo fica com o protocolo (um dono por campo, PRINCIPIOS §2.3).
 */
export function campoDoAdicionar(adicao: Pick<AdicaoAoCampo, 'nota' | 'campo' | 'alvo'>, leitor: Pick<LeitorDoEscolher, 'modelos' | 'camposDaNota' | 'nomeDoArquivo'>): DomainField | null {
    const campo = campoDoPainel(modeloDaNota(adicao.nota, leitor.camposDaNota(adicao.nota), leitor.modelos), adicao.campo, leitor.nomeDoArquivo);
    if (!campo || campo.tipo !== 'link') return null;
    if (!adicao.alvo) return campo;
    // Só os tipos pedidos (a triagem: o projeto, ou a SMART); nenhum deles no alvo do campo, nada a adicionar.
    const alvo = (campo.alvo ?? []).filter(a => adicao.alvo!.includes(a));
    return alvo.length ? { ...campo, alvo } : null;
}

/**
 * O que faz: o "＋ Adicionar" do campo do pai de uma tarefa (o campo que a seta da mãe grava, `campoDoPai`),
 * só com os tipos do alvo cujas notas são nós da espécie pedida (`especieDoNo`: o projeto, a SMART).
 * Por quê: um jeito por função (02/11/2026): a triagem escolhe o projeto e a SMART pelo mesmo "＋ Adicionar"
 * do painel (a busca, a ordem, o gesto, o Desfazer), e não por um seletor próprio. A espécie vem da tecla da
 * triagem; os tipos, do modelo da nota e do índice: nenhum nome de tipo mora aqui.
 * Entra → sai: o modelo, o nó da tarefa, a espécie e o leitor → a adição, ou `null` (a tarefa fora do
 * modelo, o campo do pai que não é do painel, nenhuma nota daquela espécie para escolher).
 * Erro e ataque: nada aqui grava; o campo do protocolo fica com o protocolo (`campoDoAdicionar`).
 * Prova: tests/missao/adicionar.test.ts ("o pai pela triagem").
 */
export function adicaoDoPai(modelo: MissaoModelo, no: string, especie: string, leitor: LeitorDoEscolher): AdicaoAoCampo | null {
    const t = modelo.indice.porId.get(no);
    if (!t) return null;
    const nota = t.caminho;
    const campos = modeloDaNota(nota, leitor.camposDaNota(nota), leitor.modelos)?.campos ?? [];
    const campo = campos.map(c => (campoDoPai(c) ? campoDoAdicionar({ nota, campo: c.nome }, leitor) : null)).find((c): c is DomainField => !!c);
    if (!campo) return null;
    const daEspecie = (d: string) => candidatosDoCampo(modelo, { ...campo, alvo: [d] }, leitor.modelos).some(c => especieDoNo(noDoCandidato(modelo, c)) === especie);
    const alvo = (campo.alvo ?? []).filter(daEspecie);
    return alvo.length ? { no, nota, campo: campo.nome, alvo } : null;
}

/** A ponta de sonda para perguntar à tabela das setas qual campo a mãe grava (nenhuma nota de verdade). */
const SONDA: LinkTask = { path: '', basename: '', type: '', projects: [] };

/**
 * O que faz: diz se o campo é o pai da tarefa: o campo que a seta da SMART mãe grava (a tabela das
 * setas, `patchFor` com `motherLink`), o mesmo que a seta do projeto e o "Ligar a uma SMART…".
 * Por quê: o pai é um campo só (PRINCIPIOS §2.3); escolher o pai pelo "＋ Adicionar" tem de dar o
 * frontmatter do arrasto (trocar a mãe, herdar a semana e o impacto vazios), e não acrescentar um
 * link solto. Quem diz qual é o campo é a tabela das setas, não um nome escrito aqui.
 */
export function campoDoPai(campo: Pick<DomainField, 'nome'>): boolean {
    const patch = patchFor({}, motherLink(SONDA, { ...SONDA, basename: '_' }));
    return !!patch && Object.prototype.hasOwnProperty.call(patch, campo.nome);
}

/** O que faz: o nó de um candidato na Missão (a TaskNote, o projeto pelo nome quando não tem nota); `null` = sem nó. */
function noDoCandidato(modelo: MissaoModelo, c: Pick<Candidato, 'nome' | 'caminho'>): string | null {
    const pelaNota = c.caminho ? modelo.noDaNota(c.caminho)?.id ?? modelo.indice.vivas.find(t => t.caminho === c.caminho)?.id ?? null : null;
    if (pelaNota) return pelaNota;
    for (const p of modelo.indice.projetos.values()) if (fold(p.nome) === fold(c.nome)) return p.id;
    return null;
}

/** O que faz: o pai de agora da tarefa, em palavras (a SMART mãe, ou o projeto direto); `null` = sem pai. */
function paiEmPalavras(modelo: MissaoModelo, id: string): string | null {
    const t = modelo.indice.porId.get(id);
    if (!t) return null;
    if (t.smart) return modelo.indice.porId.get(t.smart)?.titulo ?? null;
    return t.projeto ? modelo.indice.projetos.get(t.projeto)?.nome ?? null : null;
}

/**
 * O que faz: o gesto que pôr uma nota no campo de um nó grava, pelas funções que já existem:
 * - o pai da tarefa (`campoDoPai`), com a escolhida que é nó (a SMART, o projeto): o arrasto da
 *   tarefa sobre ela (`intencaoDeSoltar`, a tabela das setas): a SMART se soma às mães que a tarefa
 *   já tem (02/11, `intencaoDeLigarASmart`); o projeto é o "Mudar para", que troca o pai (o aviso diz
 *   o que estava); a regra da seta vale (a SMART não tem SMART mãe);
 * - o resto: o campo do painel (`valorComLink`, o mesmo `valorDoCampo` da caixa): na lista,
 *   acrescenta; no valor só, troca, e o aviso diz o que estava.
 * Entra → sai: o modelo, a adição, o campo, o frontmatter da nota e a nota escolhida → o gesto e o
 * que ele troca, ou o problema; `esperar` = o pai que ainda não é nó (a nota recém-criada que o
 * modelo ainda não leu).
 * Erro e ataque: a própria nota; a que já está no campo; o gesto com problema; nada aqui grava.
 */
export function gestoNoCampo(modelo: MissaoModelo, adicao: AdicaoAoCampo, campo: DomainField, fm: Record<string, unknown>, nota: Pick<Candidato, 'nome' | 'caminho'>): GestoNoCampo {
    if (!nota.nome || (nota.caminho && nota.caminho === adicao.nota)) return { problema: 'é a própria nota' };
    const t = modelo.indice.porId.get(adicao.no);
    if (t && campoDoPai(campo)) {
        const alvo = noDoCandidato(modelo, nota);
        if (!alvo) return { problema: `${nota.nome} ainda não está na Missão`, esperar: true };
        const i = intencaoDeSoltar(modelo, t.id, alvo);
        if ('problema' in i) return { problema: i.problema || 'já está aqui' };
        // Somar uma SMART não troca nada: o aviso só diz "antes" quando o pai muda (o projeto).
        const troca = i.destino.tipo !== 'ligar-smart';
        return { gesto: { via: 'mover', caminho: i.caminho, destino: i.destino, texto: i.texto }, antes: troca ? paiEmPalavras(modelo, t.id) : null };
    }
    const valor = valorComLink(campo, fm[campo.nome], nota.nome, { type: String(fm.type ?? ''), nota: fm });
    if (valor === null) return { problema: `${nota.nome} já está em ${campo.rotulo}` };
    const antes = !campo.multiplo ? valorEmTexto(campo, fm[campo.nome]) || null : null;
    return { gesto: { via: 'campo', caminho: adicao.nota, campo: campo.nome, valor, rotulo: campo.rotulo, mostrado: valorEmTexto(campo, valor) }, antes };
}

/**
 * O que faz: as notas que o "＋ Adicionar" de um campo lista: as do `alvo` do campo
 * (`candidatosDoCampo`) que o gesto aceita e que ainda não estão ali, na ordem do Novo (as
 * pendentes de antes, as sem data, pelos pesos, com o "Por que agora"), e só as que o texto acha.
 * Entra → sai: o modelo, a adição, o leitor, o texto, o limite e, no Novo, só o tipo dele → as
 * opções e o total; `null` = o campo não é do painel (o "＋ Adicionar" não aparece).
 * Erro e ataque: a própria nota sai; a tarefa fora do recorte do ramo sai; a que já está, ou cujo
 * gesto tem problema (a SMART sobre SMART), sai; nada aqui grava nem cria.
 * Prova: tests/missao/adicionar.test.ts.
 */
export function opcoesDoCampo(modelo: MissaoModelo, adicao: AdicaoAoCampo, leitor: LeitorDoEscolher, texto = '', limite = OPCOES_DO_ESCOLHER, alvo?: readonly string[]): ListaDoEscolher | null {
    const campo = campoDoAdicionar(adicao, leitor);
    if (!campo) return null;
    const fm = leitor.camposDaNota(adicao.nota) ?? {};
    const doCampo = alvo ? { ...campo, alvo: (campo.alvo ?? []).filter(a => alvo.includes(a)) } : campo;
    const porCaminho = new Map(modelo.indice.vivas.map(t => [t.caminho, t]));
    const noRecorte = noRecorteDoRamo(modelo.indice, leitor.recorte);
    const out: OpcaoDeEscolher[] = [];
    for (const c of candidatosDoCampo(modelo, doCampo, leitor.modelos)) {
        const t = c.caminho ? porCaminho.get(c.caminho) : undefined;
        if (t && !noRecorte(t)) continue;
        const g = gestoNoCampo(modelo, adicao, campo, fm, c);
        if ('problema' in g) continue;
        const motivos = t ? modelo.motivos(t.id) : null;
        out.push({
            chave: c.caminho ?? c.nome, rotulo: c.rotulo, no: noDoCandidato(modelo, c), porque: porqueDos(motivos),
            pendente: !!t?.deAntes, semData: !!t && t.colocacao.lugar !== 'linha', pontos: (motivos ?? []).reduce((soma, m) => soma + m.pontos, 0),
            gesto: g.gesto, antes: g.antes,
        });
    }
    return ordenadas(out, texto, limite);
}
