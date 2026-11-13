/* After a new release, a tab still running the old one asks for script files that no longer exist
   (each release names its files differently). The fix is to load the new release: reload the page,
   but only once in a short while, so a release that is genuinely missing a file can't reload forever. */
const KEY = 'transit-regina:reloaded-for-update';
const WITHIN_MS = 10_000;

/** true: reload now. false: the page just reloaded for this (or can't remember that it did), so don't. */
export function shouldReloadForUpdate(storage: () => Pick<Storage, 'getItem' | 'setItem'>, now: number): boolean {
    try {
        const store = storage();   // reading sessionStorage itself can throw in some private modes
        if (now - (Number(store.getItem(KEY)) || 0) < WITHIN_MS) return false;
        store.setItem(KEY, String(now));
        return true;
    } catch {
        return false;   // storage blocked: without a memory of the last reload, never risk a loop
    }
}
