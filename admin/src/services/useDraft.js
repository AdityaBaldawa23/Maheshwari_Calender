import { useCallback, useEffect, useState } from 'react';
import { getPublished, loadDraft, publishDataset, saveDraft, validateDataset } from './api.js';
import { canonicalJson } from '../../../src/shared/hash.js';

const META_KEYS = ['version', 'schemaVersion', 'updatedAt', 'updatedBy'];
const strip = (d) => (d ? Object.fromEntries(Object.entries(d).filter(([k]) => !META_KEYS.includes(k))) : d);

/**
 * Draft → Validate → Preview → Publish for one small dataset (emergency,
 * content, occasions_<year>). Drafts live in drafts/{name} (admin-only) and are
 * never visible to app users until published.
 */
export function useDraft(name, makeDefault, uid) {
  const [state, setState] = useState({ loading: true, draft: null, published: null, error: null });
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [draft, published] = await Promise.all([loadDraft(name), getPublished(name)]);
      setState({ loading: false, draft: strip(draft) ?? strip(published) ?? (await makeDefault()), published, error: null });
      setDirty(false);
    } catch (err) {
      setState({ loading: false, draft: null, published: null, error: err.message });
    }
  }, [name, makeDefault]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (fn) => {
    setState((s) => ({ ...s, draft: typeof fn === 'function' ? fn(s.draft) : fn }));
    setDirty(true);
  };

  const problems = state.draft ? validateDataset(name, state.draft) : [];
  const hasUnpublished = Boolean(state.draft) && canonicalJson(state.draft) !== canonicalJson(strip(state.published) ?? null);

  return {
    ...state,
    dirty,
    problems,
    hasUnpublished,
    update,
    reload: load,
    async save() {
      await saveDraft(name, state.draft, uid);
      setDirty(false);
    },
    async publish() {
      await saveDraft(name, state.draft, uid);
      const published = await publishDataset(name, state.draft, uid);
      setState((s) => ({ ...s, published }));
      setDirty(false);
      return published;
    },
  };
}

/** Human-readable list of entries that differ between draft and published (for the preview step). */
export function diffLists(draftList = [], publishedList = [], keyOf, labelOf) {
  const before = new Map(publishedList.map((x) => [keyOf(x), x]));
  const after = new Map(draftList.map((x) => [keyOf(x), x]));
  const changes = [];
  for (const [k, x] of after) {
    if (!before.has(k)) changes.push(`+ ${labelOf(x)}`);
    else if (canonicalJson(before.get(k)) !== canonicalJson(x)) changes.push(`~ ${labelOf(x)}`);
  }
  for (const [k, x] of before) if (!after.has(k)) changes.push(`− ${labelOf(x)}`);
  return changes;
}
