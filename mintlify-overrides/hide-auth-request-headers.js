"use strict";
(function () {
    const HIDDEN_ATTRIBUTE = 'data-aitoearn-auth-headers-hidden';
    const AUTH_HEADER_PATTERN = /\b(?:X-Api-Key|Authorization|x-goog-api-key)\b/i;
    const MAX_SECTION_TEXT_LENGTH = 1600;
    const SECTION_TITLE_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"], button, div, span, p';
    const REQUEST_HEADER_TITLES = new Set(['请求头', 'Request Headers', 'Headers', 'Header Parameters']);
    const OTHER_SECTION_TITLES = new Set([
        '授权',
        '路径参数',
        '查询参数',
        '请求体',
        '响应',
        '响应示例',
        '代码示例',
        'Authentication',
        'Path Parameters',
        'Query Parameters',
        'Request Body',
        'Responses',
        'Response',
        'Examples',
    ]);
    function normalizePath(pathname) {
        let path = pathname.split('?')[0]?.split('#')[0] || '/';
        if (path.length > 1 && path.endsWith('/')) {
            path = path.slice(0, -1);
        }
        return path;
    }
    function isApiReferencePage() {
        const locationPath = normalizePath(window.location.pathname);
        const dataCurrentPath = document.documentElement.getAttribute('data-current-path');
        const currentPath = dataCurrentPath ? normalizePath(dataCurrentPath) : locationPath;
        return currentPath.startsWith('/api-reference/');
    }
    function getText(element) {
        return element.textContent?.replace(/\s+/g, ' ').trim() || '';
    }
    function isRequestHeaderTitle(element) {
        return REQUEST_HEADER_TITLES.has(getText(element));
    }
    function hasOtherApiSectionTitle(container, targetTitle) {
        const titles = container.querySelectorAll(SECTION_TITLE_SELECTOR);
        return Array.from(titles).some((title) => {
            if (title === targetTitle) {
                return false;
            }
            return OTHER_SECTION_TITLES.has(getText(title));
        });
    }
    function findRequestHeaderContainer(title) {
        let current = title.parentElement;
        while (current && current !== document.body) {
            const text = getText(current);
            if (text.length <= MAX_SECTION_TEXT_LENGTH &&
                AUTH_HEADER_PATTERN.test(text) &&
                !hasOtherApiSectionTitle(current, title)) {
                return current;
            }
            current = current.parentElement;
        }
        return null;
    }
    function resetHiddenSections() {
        document.querySelectorAll(`[${HIDDEN_ATTRIBUTE}="true"]`).forEach((element) => {
            element.hidden = false;
            element.removeAttribute(HIDDEN_ATTRIBUTE);
        });
    }
    function hideDuplicateAuthHeaders() {
        resetHiddenSections();
        if (!isApiReferencePage()) {
            return;
        }
        document.querySelectorAll(SECTION_TITLE_SELECTOR).forEach((title) => {
            if (!isRequestHeaderTitle(title)) {
                return;
            }
            const container = findRequestHeaderContainer(title);
            if (!container || !(container instanceof HTMLElement)) {
                return;
            }
            container.hidden = true;
            container.setAttribute(HIDDEN_ATTRIBUTE, 'true');
        });
    }
    function scheduleSync() {
        window.requestAnimationFrame(hideDuplicateAuthHeaders);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleSync, { once: true });
    }
    else {
        scheduleSync();
    }
    window.addEventListener('load', scheduleSync);
    window.addEventListener('popstate', scheduleSync);
    window.setTimeout(scheduleSync, 50);
    window.setTimeout(scheduleSync, 250);
    new MutationObserver(scheduleSync).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-current-path'],
    });
    function observeBodyChanges() {
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', observeBodyChanges, { once: true });
            return;
        }
        new MutationObserver(scheduleSync).observe(document.body, {
            childList: true,
            subtree: true,
        });
    }
    observeBodyChanges();
})();
