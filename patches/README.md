# Dependency patches

`cmdk-1.1.1.patch` fixes the missing or stale active descendant described in
[cmdk #413](https://github.com/dip/cmdk/issues/413) and
[#373](https://github.com/dip/cmdk/issues/373). It derives the selected ID from the
same item registry and visibility state used by the rows, at store emission,
instead of reading the previous selection from the DOM during a scheduled flush.
Group IDs and filtered-out rows are excluded. Both ESM and CommonJS builds are
patched; package license notices remain intact.

Remove the patch when a released cmdk version passes the palette regression for
initial selection, filtering, keyboard navigation and clearing a search. The
upstream [PR #411](https://github.com/dip/cmdk/pull/411) remains open and does not
cover the group/visibility cases discussed in #413.

The patch includes distributed cmdk code. Its original MIT copyright and
permission notice are preserved in [cmdk-LICENSE.md](cmdk-LICENSE.md).
