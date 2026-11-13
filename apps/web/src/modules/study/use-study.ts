import { useQueryClient } from '@tanstack/react-query';
import { createTRPCOptionsProxy, type ofFeatureFlags } from '@trpc/tanstack-react-query';
import type { AnyRouter, inferRouterOutputs } from '@trpc/server';
import type { studyModule } from '../../../../server/src/modules/study/server.ts';
import { createModuleClient } from '../../lib/module-client.ts';

type StudyRouter = Extract<ReturnType<typeof studyModule.create>['router'], AnyRouter>;
export type StudyIndex = NonNullable<inferRouterOutputs<StudyRouter>['index']>;
export type StudyHeader = NonNullable<inferRouterOutputs<StudyRouter>['active']>;
export type StudyDayBody = inferRouterOutputs<StudyRouter>['daysById'][number];
export type StudyDay = StudyIndex['days'][number] | StudyIndex['hiddenDays'][number];
const client = createModuleClient<typeof studyModule>('study');

/** Subject shades for the day strip and the row marks, by subject position: greys only (AGENTS.md aesthetic). */
const shades = ['bg-foreground/30', 'bg-foreground/10', 'bg-foreground/50'];
export function subjectShade(header: StudyHeader, subject: string) {
  return shades[
    Math.max(
      0,
      header.subjects.findIndex((item) => item.id === subject),
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
