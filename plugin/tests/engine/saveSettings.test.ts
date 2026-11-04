import { describe, it, expect, vi } from 'vitest';

const estado = vi.hoisted(() => ({ notices: [] as string[] }));

vi.mock('obsidian', () => {
    return {
        App: class {},
        Notice: class { constructor(message: string) { estado.notices.push(String(message)); } },
        Menu: class {},
        MarkdownView: class {},
        MarkdownRenderChild: class {},
        TFile: class {},
        Modal: class { open() {} close() {} },
        SuggestModal: class { open() {} close() {} },
        FuzzySuggestModal: class { open() {} close() {} },
        ItemView: class {},
        Setting: class {},
        PluginSettingTab: class {},
        Plugin: class {}
    };
});

import DFMPlugin from '../../src/main';

// `saveSettings` é método do plugin: o harness não sobe um DFMPlugin real, então o teste
// chama a implementação verdadeira com um `this` mínimo. Sem o Notice, a falha de
// `saveData` ficava só no console e o XP sumia no reload sem nenhum aviso ao operador.
describe('saveSettings com falha de persistência', () => {
    it('avisa o operador em vez de engolir o erro', async () => {
        estado.notices.length = 0;
        const erro = vi.spyOn(console, 'error').mockImplementation(() => { });
        const fakeThis: any = {
            isSavingSettings: false,
            hasPendingSettingsSave: false,
            settings: { algum: 'valor' },
            saveData: async () => { throw new Error('disco cheio'); }
        };

        await (DFMPlugin.prototype as any).saveSettings.call(fakeThis);

        expect(estado.notices.some(n => n.includes('Não foi possível salvar as configurações'))).toBe(true);
        expect(fakeThis.isSavingSettings).toBe(false);
        erro.mockRestore();
    });

    it('não avisa nada quando a gravação dá certo', async () => {
        estado.notices.length = 0;
        const fakeThis: any = {
            isSavingSettings: false,
            hasPendingSettingsSave: false,
            settings: {},
            saveData: async () => { }
        };

        await (DFMPlugin.prototype as any).saveSettings.call(fakeThis);

        expect(estado.notices).toEqual([]);
    });
});
