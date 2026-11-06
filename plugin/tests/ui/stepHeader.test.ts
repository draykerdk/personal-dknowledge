import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { audiosDaLinha, renderStepHeader } from '../../src/ui/stepHeader';

// O arquivo vem do cofre (três pastas acima do plugin) ou, no pacote aberto, do `cofre-modelo/` ao lado do plugin;
// sem nenhum dos dois, o bloco fica de fora.
const raizCom = (rel: string) => [resolve(process.cwd(), '../../..'), resolve(process.cwd(), '../cofre-modelo')].find(r => existsSync(resolve(r, rel)));
const INGLES = '200 - FUNCTIONS/Protocolos/ingles_de_hoje.json';
const RAIZ_DO_INGLES = raizCom(INGLES);

/**
 * O áudio no cabeçalho do passo (06/11, os áudios dos cartões): o 🗣️ Inglês de hoje mostra "🔊 Áudio da frase:
 * [[Áudios/x.mp3]]" pelo campo de link `audio` do cartão, e o link interno para um áudio do cofre vira um player. O
 * texto que não é link de áudio continua texto; sem o app (o leitor), nada muda. O vitest roda em `node` (sem DOM):
 * o elemento é um gravador mínimo, só com o que o cabeçalho usa.
 */
type El = { tag: string; text: string; cls: string; attrs: Record<string, string>; children: El[]; createEl(t: string, o?: any): El; createDiv(o?: any): El; setAttribute(k: string, v: string): void };
function el(tag: string, o: any = {}): El {
    const n: El = {
        tag, text: o.text ?? '', cls: o.cls ?? '', attrs: { ...(o.attr ?? {}) }, children: [],
        createEl(t, x) { const c = el(t, x); n.children.push(c); return c; },
        createDiv(x) { return n.createEl('div', x); },
        setAttribute(k, v) { n.attrs[k] = v; },
    };
    return n;
}
const todos = (r: El): El[] => [r, ...r.children.flatMap(todos)];

const leitor = {
    metadataCache: { getFirstLinkpathDest: (l: string) => (l === 'Áudios/Where are you from.mp3' ? { path: `Cartões/${l}`, extension: 'mp3' } : null) },
    vault: { getResourcePath: (f: any) => `app://cofre/${f.path}` },
};

describe('o link de áudio de uma linha', () => {
    it('separa o link interno para um áudio, com ou sem rótulo e com ou sem !, e tira os dois-pontos do fim', () => {
        expect(audiosDaLinha('🔊 Áudio da frase: [[Áudios/Where are you from.mp3]]')).toEqual({ texto: '🔊 Áudio da frase', audios: ['Áudios/Where are you from.mp3'] });
        expect(audiosDaLinha('![[a.m4a|ouvir]] e [[b.ogg]]').audios).toEqual(['a.m4a', 'b.ogg']);
    });

    it('o link que não é áudio e o HTML do texto ficam como texto', () => {
        expect(audiosDaLinha('Veja [[Roteiros]] e <audio src="x.mp3">')).toEqual({ texto: 'Veja [[Roteiros]] e <audio src="x.mp3">', audios: [] });
    });
});

describe('o cabeçalho do passo', () => {
    const prompt = 'Como foi?\n🇬🇧 Where are you from\n🔊 Áudio da frase: [[Áudios/Where are you from.mp3]]\n🔊 Áudio da resposta: [[Áudios/Sumiu.mp3]]';

    it('com o app, o áudio que existe no cofre vira um player com o endereço dele; o que não se acha fica como texto', () => {
        const root = el('div');
        renderStepHeader(root as any, prompt, '', leitor);
        const audios = todos(root).filter(n => n.tag === 'audio');
        expect(audios.map(a => a.attrs.src)).toEqual(['app://cofre/Cartões/Áudios/Where are you from.mp3']);
        expect(audios[0].attrs.controls).toBe('true');
        expect(todos(root).find(n => n.cls === 'dfm-step-audio')!.text).toBe('🔊 Áudio da frase');
        expect(todos(root).some(n => n.text === '🔊 Áudio da resposta: [[Áudios/Sumiu.mp3]]')).toBe(true);
    });

    it('sem o app, nada vira player', () => {
        const root = el('div');
        renderStepHeader(root as any, prompt, '');
        expect(todos(root).some(n => n.tag === 'audio')).toBe(false);
    });

    it.skipIf(!RAIZ_DO_INGLES)('o passo do 🗣️ mostra o áudio pelo campo de link do cartão', () => {
        const def = JSON.parse(readFileSync(resolve(RAIZ_DO_INGLES!, INGLES), 'utf8'));
        const ctx = def.steps.find((s: any) => s.id === 'resultado').contextFrom;
        expect(ctx.filter((c: any) => c.property === 'audio' || c.property === 'audio_resposta').length).toBe(2);
    });
});
