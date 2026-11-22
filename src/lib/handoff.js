// Passing things between pages in this tab without putting them in the URL or storage: photos picked on
// Join or Add go to the Upload page; a night built from photos goes to the Add page's full form.
let files = null;
let night = null;

export function handOffFiles(list) { files = list && list.length ? Array.from(list) : null; }
export function takeFiles() { const f = files; files = null; return f; }

export function handOffNight(n) { night = n; }
export function takeNight() { const n = night; night = null; return n; }
