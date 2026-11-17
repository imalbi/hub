import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useContext } from 'react';
import { RecordSourcesContext } from '../../lib/record-sources.ts';
import type { Note } from './days.ts';

export function AboutLink({ about }: { about: NonNullable<Note['about']> }) {
  const router = useRouter();
  const source = useContext(RecordSourcesContext).find((item) => item.id === about.source);
  const record = useQuery({
    queryKey: ['note-record', about.source, about.id],
    queryFn: ({ signal }) => source?.get?.(about.id, signal) ?? Promise.resolve(null),
    enabled: !!source?.get,
    retry: false,
  });
  const href = source?.get ? record.data?.href : undefined;
  return href ? (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        router.history.push(href);
      }}
      className="text-caption text-muted-foreground underline"
    >
      {about.title}
    </a>
  ) : (
    <span className="text-caption text-muted-foreground">{about.title}</span>
  );
}
