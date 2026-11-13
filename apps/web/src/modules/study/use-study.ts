import { useQueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, type ofFeatureFlags } from '@trpc/tanstack-react-query';
import type { AnyRouter, inferRouterOutputs } from '@trpc/server';
import type { studyModule } from '../../../../server/src/modules/study/server.ts';
import { createModuleClient } from '../../lib/module-client.ts';

type StudyRouter = Extract<ReturnType<typeof studyModule.create>['router'], AnyRouter>;
export type StudyIndex = NonNullable<inferRouterOutputs<StudyRouter>['index']>;
export type StudyHeader = inferRouterOutputs<StudyRouter>['active'][number];
export type StudyDayBody = inferRouterOutputs<StudyRouter>['daysById'][number];
export type StudyDay = StudyIndex['days'][number] | StudyIndex['hiddenDays'][number];
const client = createModuleClient<typeof studyModule>('study');

/** Every subject of the active plans, keyed `<planId>:<subjectId>` like the server's index (decision 15). */
export type StudySubject = { key: string; planId: string; id: string; name: string; label: string };
export function studySubjects(headers: StudyHeader[]): StudySubject[] {
  return headers.flatMap((header) =>
    header.subjects.map((subject) => ({
      key: `${header.id}:${subject.id}`,
      planId: header.id,
      id: subject.id,
      name: subject.name,
      // One plan: the subject's name. Several: the plan names its course, plus the subject when it has more than one.
      label:
        headers.length === 1
          ? subject.name
          : header.subjects.length === 1
            ? header.title
            : `${header.title} · ${subject.name}`,
    })),
  );
}

/** Subject shades for the day strip and the row marks, by subject position: greys only (AGENTS.md aesthetic). */
const shades = ['bg-foreground/30', 'bg-foreground/10', 'bg-foreground/50', 'bg-foreground/20'];
export function subjectShade(subjects: StudySubject[], key: string) {
  return shades[
    Math.max(
      0,
      subjects.findIndex((item) => item.key === key),
    ) % shades.length
  ];
}

export function useStudyTRPC() {
  const queryClient = useQueryClient();
  return createTRPCOptionsProxy<StudyRouter, ofFeatureFlags<{ keyPrefix: true }>>({
    client,
    queryClient,
    keyPrefix: 'study',
  });
}
