// linkedom for a module's HTML work (scraping, cleaning descriptions). A private module cannot resolve `linkedom` from
// its folder (it is not a workspace package), the same reason `z` comes from `module.ts` and drizzle from
// `module-db.ts`: import the parser from here. `parseHTML(html).document` is typed as a DOM `Document`, so code written
// against the DOM API runs unchanged in the browser on `new DOMParser().parseFromString(html, 'text/html')`.
// linkedom's own `DOMParser` is not re-exported: it returns linkedom's `HTMLDocument`, which is not assignable to `Document`.
export { parseHTML } from 'linkedom';
