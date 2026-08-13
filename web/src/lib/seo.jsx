import { useEffect } from 'react';

export function usePageTitle(title) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} — Loadbyton` : 'Loadbyton — UAE Container Drayage Marketplace';
    return () => {
      document.title = prev;
    };
  }, [title]);
}

export function useMeta(description) {
  useEffect(() => {
    if (!description) return;
    const tag = document.querySelector('meta[name="description"]');
    const prev = tag?.getAttribute('content');
    tag?.setAttribute('content', description);
    return () => {
      if (prev !== undefined) tag?.setAttribute('content', prev);
    };
  }, [description]);
}
