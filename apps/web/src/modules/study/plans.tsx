import { useId } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { Link } from '@tanstack/react-router';
import { CaretRightIcon, CheckIcon, FolderIcon } from '@phosphor-icons/react';
import { Panel } from '../../components/panel.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { m } from '../../paraglide/messages.js';
import { useStudyTRPC, type StudyHeader, type StudyIndex } from './use-study.ts';
import { StudyMix } from './mix.tsx';
import { SubjectEstimate } from './subject-estimate.tsx';

const PREVIEW = 4;

function issueText(message: string) {
  if (message === 'Duplicate id') return m.study_issue_duplicate();
  if (message === 'Unknown subject') return m.study_issue_subject();
  if (message === 'Unknown thread') return m.study_issue_thread();
  if (message === 'Unknown day') return m.study_issue_day();
  if (message === 'Invalid phase') return m.study_issue_phase();
  if (message.includes('received undefined')) return m.study_issue_required();
  if (message.startsWith('Unable to read')) return m.study_issue_unreadable();
  return m.study_issue_invalid();
}

export function StudyPlans() {
  const trpc = useStudyTRPC();
  const queries = useQueryClient();
  const active = useQuery(trpc.active.queryOptions());
  const index = useQuery(trpc.index.queryOptions());
  const inbox = useSubscription(trpc.onInbox.subscriptionOptions());
  const activate = useMutation(trpc.activate.mutationOptions({ onSuccess: () => queries.invalidateQueries() }));
  const subject = useMutation(trpc.setSubject.mutationOptions({ onSuccess: () => queries.invalidateQueries() }));
  const current = index.data?.days.find((day) => !day.done);
  const suggested = active.data?.phases.find((phase) => phase.id === current?.phase)?.mix;
  if (active.isError || index.isError || inbox.error) return <p>{m.study_error()}</p>;
  const header = active.data;
  const data = index.data;
  return (
    <div className="grid grid-cols-12 items-start gap-lg">
      <div className="col-span-7 flex flex-col gap-lg">
        {active.data && index.data ? (
          <ActivePlan header={active.data} index={index.data} />
        ) : (
          <Panel>
            <p className="text-body">{m.study_no_plan()}</p>
          </Panel>
        )}
        {inbox.data?.map((item) => (
          <section
            key={item.name}
            aria-label={item.valid ? m.study_found() : m.study_invalid()}
            className={`flex flex-col gap-md rounded-xl border border-dashed bg-surface p-xl ${item.valid ? 'border-accent' : 'border-danger'}`}
          >
            <div className="flex flex-wrap items-center gap-sm">
              <Badge tone={item.valid ? 'primary' : 'danger'}>{item.valid ? m.study_found() : m.study_invalid()}</Badge>
              {item.valid && (
                <span className="flex items-center gap-2xs text-caption text-muted-foreground">
                  <CheckIcon aria-hidden="true" className="size-icon-sm" />
                  {m.study_valid()}
                </span>
              )}
              <span className="flex-1" />
              <span className="text-caption text-muted-foreground">{m.study_from({ name: item.name })}</span>
            </div>
            <h3 className="text-heading">{item.title ?? item.name}</h3>
            {item.valid ? (
              <>
                <p className="text-caption text-muted-foreground tabular-nums">
                  {m.study_found_meta({ days: item.days, version: item.version ?? 1 })}
                </p>
                <ol>
                  {item.preview.map((title, i) => (
                    <li
                      key={`${i}-${title}`}
                      className="flex items-center gap-md border-b border-dashed border-border py-xs last:border-b-0"
                    >
                      <span className="w-2xl text-muted-foreground tabular-nums">G{i + 1}</span>
                      <span className="text-body">{title}</span>
                    </li>
                  ))}
                </ol>
                {item.days > PREVIEW && (
                  <p className="text-caption text-muted-foreground">
                    {m.study_more_days({ count: item.days - PREVIEW })}
                  </p>
                )}
                <div className="flex items-center gap-md">
                  <RegistryButton label={m.study_activate()} action={() => activate.mutateAsync({ name: item.name })} />
                  {active.data && (
                    <p className="flex-1 text-caption text-muted-foreground">{m.study_activate_note()}</p>
                  )}
                </div>
              </>
            ) : (
              <ul className="flex flex-col gap-2xs">
                {item.issues.map((issue, i) => (
                  <li key={`${issue.path}-${i}`} className="text-caption text-muted-foreground">
                    {[item.name, issue.file, issue.path].filter(Boolean).join(' / ')}: {issueText(issue.message)}
                  </li>
                ))}
                {item.remainingIssues > 0 && (
                  <li className="text-caption">{m.study_more_issues({ count: item.remainingIssues })}</li>
                )}
              </ul>
            )}
          </section>
        ))}
      </div>
      <div className="col-span-5 flex flex-col gap-lg">
        {header && data && (
          <Panel title={m.study_subjects()}>
            <ul>
              {header.subjects.map((item) => {
                const paused = data.states[item.id] === 'paused';
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-md border-b border-dashed border-border py-sm last:border-b-0"
                  >
                    <span className="flex flex-col gap-2xs">
                      <span className="flex items-center gap-sm text-body">
                        {item.name}
                        <Badge outline size="sm">
                          {paused ? m.study_paused() : m.study_active()}
                        </Badge>
                      </span>
                      <SubjectEstimate id={item.id} index={data} />
                    </span>
                    <RegistryButton
                      secondary
                      label={paused ? m.study_resume() : m.study_pause()}
                      action={() => subject.mutateAsync({ id: item.id, state: paused ? 'active' : 'paused' })}
                    />
                  </li>
                );
              })}
            </ul>
            <StudyMix
              key={`${header.id}-${JSON.stringify(data.mix)}`}
              subjects={header.subjects}
              mix={data.mix}
              hours={data.weeklyHours}
              suggested={suggested}
              states={data.states}
            />
          </Panel>
        )}
        <section className="flex flex-col gap-sm rounded-xl border border-dashed border-border p-lg">
          <h3 className="flex items-center gap-xs text-caption text-muted-foreground uppercase">
            <FolderIcon aria-hidden="true" className="size-icon" />
            {m.study_folder()}
          </h3>
          <div className="flex items-center gap-sm">
            <Badge outline>{m.study_folder_name()}</Badge>
            <span className="text-caption text-muted-foreground">{m.study_schema()}</span>
          </div>
          <p className="text-caption text-muted-foreground">{m.study_folder_hint()}</p>
        </section>
      </div>
    </div>
  );
}

function ActivePlan({ header, index }: { header: StudyHeader; index: StudyIndex }) {
  const titleId = useId();
  const all = [...index.days, ...index.hiddenDays];
  const done = all.filter((day) => day.done).length;
  const current = index.days.find((day) => !day.done);
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-md rounded-xl border border-border bg-surface p-xl">
      <div className="flex items-center gap-sm">
        <Badge tone="primary">{m.study_active_plan()}</Badge>
        <span className="flex-1" />
        <Link
          to="/desk/studio"
          search={{ tab: 'piano' }}
          className="flex h-touch items-center gap-xs rounded-full border border-border px-md text-label hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {m.study_open_plan()}
          <CaretRightIcon aria-hidden="true" className="size-icon-sm" />
        </Link>
      </div>
      <h2 id={titleId} className="text-display">
        {header.title}
      </h2>
      <p className="flex flex-wrap gap-lg text-caption text-muted-foreground tabular-nums">
        <span>{m.study_g_total({ total: index.days.length })}</span>
        <span>{m.study_version({ version: header.version })}</span>
        {current?.g && <span>{m.study_current_g({ g: current.g })}</span>}
      </p>
      <div className="flex flex-col gap-xs">
        <div className="flex items-center justify-between gap-md">
          <span className="text-body tabular-nums">{m.study_done_of({ done, total: all.length })}</span>
          <span className="text-caption text-muted-foreground tabular-nums">
            {header.subjects
              .map((item) => {
                const days = all.filter((day) => day.subject === item.id);
                return `${item.name} ${days.filter((day) => day.done).length}/${days.length}`;
              })
              .join(' · ')}
          </span>
        </div>
        <div aria-hidden="true" className="h-2xs overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-accent" style={{ width: `${(done * 100) / Math.max(1, all.length)}%` }} />
        </div>
      </div>
    </section>
  );
}
