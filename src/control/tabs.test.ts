import { describe, it, expect, beforeEach } from 'vitest';
import { setupTabs } from './tabs';

describe('setupTabs', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div role="tablist">
        <button class="tab-button active" data-tab="images">画像</button>
        <button class="tab-button" data-tab="params">パラメーター</button>
      </div>
      <section id="tab-images"></section>
      <section id="tab-params"></section>
    `;
    setupTabs();
  });

  const panel = (id: string) => document.getElementById(id) as HTMLElement;
  const button = (tab: string) =>
    document.querySelector(`.tab-button[data-tab="${tab}"]`) as HTMLButtonElement;

  it('初期状態では active なタブのパネルだけが表示されること', () => {
    expect(panel('tab-images').hidden).toBe(false);
    expect(panel('tab-params').hidden).toBe(true);
    expect(button('images').getAttribute('aria-selected')).toBe('true');
  });

  it('タブをクリックすると対応するパネルに切り替わること', () => {
    button('params').click();
    expect(panel('tab-images').hidden).toBe(true);
    expect(panel('tab-params').hidden).toBe(false);
    expect(button('params').classList.contains('active')).toBe(true);
    expect(button('images').classList.contains('active')).toBe(false);
  });
});
