"use strict";
(function () {
    const HOME_PATHS = new Set(['/zh/home', '/en/home']);
    const HOME_ACTIVE_FALLBACK_HREFS = new Map([
        ['/zh/home', '/zh/use'],
        ['/en/home', '/en/use'],
    ]);
    const INACTIVE_ATTRIBUTE = 'data-aitoearn-home-inactive';
    function normalizePath(pathname) {
        let path = pathname.split('?')[0]?.split('#')[0] || '/';
        if (path.length > 1 && path.endsWith('/')) {
            path = path.slice(0, -1);
        }
        if (path.endsWith('/index')) {
            path = path.slice(0, -6) || '/';
        }
        return path;
    }
    function getCurrentPath() {
        const locationPath = normalizePath(window.location.pathname);
        const dataCurrentPath = document.documentElement.getAttribute('data-current-path');
        if (HOME_PATHS.has(locationPath)) {
            return locationPath;
        }
        return dataCurrentPath || locationPath;
    }
    function resetLink(link) {
        if (!(link instanceof HTMLElement) || link.getAttribute(INACTIVE_ATTRIBUTE) !== 'true') {
            return;
        }
        link.style.removeProperty('background');
        link.style.removeProperty('color');
        link.classList.remove('!bg-transparent');
        link.removeAttribute(INACTIVE_ATTRIBUTE);
    }
    function muteActiveLink(link) {
        if (!(link instanceof HTMLElement)) {
            return;
        }
        const isDark = document.documentElement.classList.contains('dark');
        link.removeAttribute('aria-current');
        link.setAttribute(INACTIVE_ATTRIBUTE, 'true');
        link.classList.add('!bg-transparent');
        link.style.setProperty('background', 'transparent', 'important');
        link.style.setProperty('color', isDark ? 'rgb(var(--gray-400))' : 'rgb(var(--gray-600))', 'important');
    }
    function syncHomeNavState() {
        const currentPath = getCurrentPath();
        const isHome = HOME_PATHS.has(currentPath);
        const fallbackHref = HOME_ACTIVE_FALLBACK_HREFS.get(currentPath);
        document.querySelectorAll(`nav[aria-label="Main"] a[${INACTIVE_ATTRIBUTE}="true"]`).forEach(resetLink);
        if (!isHome) {
            return;
        }
        document.querySelectorAll('nav[aria-label="Main"] a[aria-current="location"]').forEach(muteActiveLink);
        if (fallbackHref) {
            document.querySelectorAll(`nav[aria-label="Main"] a[href="${fallbackHref}"]`).forEach(muteActiveLink);
        }
    }
    function scheduleSync() {
        window.requestAnimationFrame(syncHomeNavState);
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
        attributeFilter: ['class', 'data-current-path'],
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
