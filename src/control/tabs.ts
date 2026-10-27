/**
 * src/control/tabs.ts
 *
 * 設定画面のタブ切り替え。
 * `.tab-button[data-tab="xxx"]` をクリックすると、`#tab-xxx` のパネルだけを表示する。
 */

export function setupTabs(root: ParentNode = document): void {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.tab-button'));

  const select = (tabId: string): void => {
    for (const button of buttons) {
      const active = button.dataset.tab === tabId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      const panel = root.querySelector<HTMLElement>(`#tab-${button.dataset.tab}`);
      if (panel) panel.hidden = !active;
    }
  };

  for (const button of buttons) {
    button.addEventListener('click', () => select(button.dataset.tab ?? ''));
  }

  const initial = buttons.find((b) => b.classList.contains('active')) ?? buttons[0];
  if (initial?.dataset.tab) select(initial.dataset.tab);
}
