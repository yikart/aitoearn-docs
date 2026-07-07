"use strict";
(function () {
    const HOME_PATHS = new Set(['/home', '/zh/home', '/en/home']);
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
        link.removeAttribute(INACTIVE_ATTRIBUTE);
    }
    function muteHomeLink(link) {
        if (!(link instanceof HTMLElement)) {
            return;
        }
        link.removeAttribute('aria-current');
        link.setAttribute(INACTIVE_ATTRIBUTE, 'true');
    }
    function syncHomeNavState() {
        const currentPath = getCurrentPath();
        const isHome = HOME_PATHS.has(currentPath);
        const mainNavLinks = document.querySelectorAll('nav[aria-label="Main"] a');
        mainNavLinks.forEach(resetLink);
        if (!isHome) {
            return;
        }
        mainNavLinks.forEach(muteHomeLink);
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
