export interface TabHandlingOptions {
    defaultTabId?: string;
    isProtectedTab?: (tabId: string) => boolean;
    onTabClosed?: (tabId: string) => void;
    onTabSwitched?: (tabId: string) => void;
}

export function switchTab(tabId: string): void {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
    document.querySelector(`[data-content="${tabId}"]`)?.classList.add('active');
}

export function initTabHandling(container: HTMLElement, options: TabHandlingOptions = {}): void {
    const defaultTabId = options.defaultTabId ?? 'upload';

    container.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const tabElement = target.closest('.tab') as HTMLElement | null;

        if (!tabElement) {
            return;
        }

        const tabId = tabElement.dataset.tab;
        if (!tabId) {
            return;
        }

        if (target.classList.contains('tab-close')) {
            if (options.isProtectedTab?.(tabId)) {
                return;
            }

            const wasActive = tabElement.classList.contains('active');
            tabElement.remove();
            document.querySelector(`[data-content="${tabId}"]`)?.remove();
            options.onTabClosed?.(tabId);

            if (wasActive) {
                switchTab(defaultTabId);
                options.onTabSwitched?.(defaultTabId);
            }

            e.stopPropagation();
            return;
        }

        switchTab(tabId);
        options.onTabSwitched?.(tabId);
    });
}