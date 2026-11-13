import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Panel } from '../../components/panel.tsx';
import { NumberRoll } from '../../components/ui/number-roll.tsx';
import { RegistryButton } from '../../components/registry-button.tsx';
import { Select } from '../../components/ui/select.tsx';
import { PomodoroPanel } from '../pomodoro/desk-panel.tsx';
import { m } from '../../paraglide/messages.js';
import { DayBody } from './day-body.tsx';
import { TodayNote } from './today-note.tsx';
import { studySubjects, useStudyTRPC, type StudyDayBody, type StudyHeader, type StudyIndex } from './use-study.ts';

export function StudyToday() {
  const trpc = useStudyTRPC();
  const queries = useQueryClient();
  const headers = useQuery(trpc.active.queryOptions());
  const index = useQuery(trpc.index.queryOptions());
  const progress = useQuery(trpc.progress.queryOptions());
  const open = useMutation(
    trpc.openToday.mutationOptions({ onSuccess: () => queries.invalidateQueries({ queryKey: trpc.index.queryKey() }) }),
  );
  const opened = useRef(false);
  useEffect(() => {
    if (!opened.current && index.data) {
      opened.current = true;
      open.mutate();
    }
  }, [index.data, open]);
  const key = index.data?.current;
  const body = useQuery(trpc.daysById.queryOptions({ keys: key ? [key] : [] }, { enabled: !!key }));
  if (headers.isError || index.isError || progress.isError || body.isError) return <p>{m.study_error()}</p>;
  if (headers.isPending || index.isPending || progress.isPending || (key && body.isPending))
    return <p>{m.tile_loading()}</p>;
  if (!index.data || !key)
    return (
      <>
        <p className="col-span-6">{m.study_no_plan()}</p>
        <PomodoroPanel className="col-span-6" />
      </>
    );
  const day = body.data?.[0];
  const header = headers.data.find((item) => item.id === day?.planId);
  if (!day || !header) return <p>{m.study_empty()}</p>;
  return (
    <TodayDay
      key={day.key}
      day={day}
      header={header}
      index={index.data}
      records={progress.data}
      headers={headers.data}
    />
  );
}

type RecordRow = { planId: string; kind: string; id: string; value: string };
type StepDraft = { values: Record<string, boolean>; failed: Record<string, boolean>; pending: Set<string> };
const stepDrafts = new Map<string, StepDraft>();
function getStepDraft(key: string) {
  const value = stepDrafts.get(key) ?? { values: {}, failed: {}, pending: new Set<string>() };
  stepDrafts.set(key, value);
  return value;
}
function startStep(draft: StepDraft, id: string, done: boolean) {
  draft.pending.add(id);
  draft.values[id] = done;
}
function failStep(draft: StepDraft, id: string, done: boolean) {
  draft.failed[id] = done;
}
function clearStep(draft: StepDraft, id: string, done: boolean) {
  if (draft.values[id] === done) delete draft.values[id];
}
function TodayDay({
  day,
  header,
  index,
  records,
  headers,
}: {
  day: StudyDayBody;
  header: StudyHeader;
  index: StudyIndex;
  records: RecordRow[];
  headers: StudyHeader[];
}) {
  const trpc = useStudyTRPC();
  const queries = useQueryClient();
  const draft = getStepDraft(day.key);
  const [, refresh] = useState(0);
  const step = useMutation(trpc.setStep.mutationOptions());
  const autonomy = useMutation(
    trpc.setAutonomy.mutationOptions({
      onSuccess: () => queries.invalidateQueries({ queryKey: trpc.progress.queryKey() }),
    }),
  );
  const subject = useMutation(trpc.setSubject.mutationOptions({ onSuccess: () => queries.invalidateQueries() }));
  const open = useMutation(trpc.openToday.mutationOptions({ onSuccess: () => queries.invalidateQueries() }));
  const own = records.filter((item) => item.planId === day.planId);
  const checked = new Set(
    day.blocks
      .flatMap((block) => block.steps)
      .filter(
        (item) =>
          draft.values[item.id] ?? own.some((row) => row.kind === 'step' && row.id === item.id && row.value === 'done'),
      )
      .map((item) => item.id),
  );
  const allSteps = day.blocks.flatMap((block) => block.steps);
  const subjects = studySubjects(headers);
  const current = index.days.find((item) => item.key === day.key);
  const subjectInfo = subjects.find((item) => item.key === current?.subject);
  const titles = new Map([...index.days, ...index.hiddenDays].map((item) => [item.key, item]));
  function saveStep(id: string, done: boolean) {
    if (draft.pending.has(id)) return;
    startStep(draft, id, done);
    refresh((value) => value + 1);
    void step
      .mutateAsync({ key: day.key, id, done })
      .then(
        async () => {
          delete draft.failed[id];
          await queries.invalidateQueries();
          clearStep(draft, id, done);
        },
        () => {
          failStep(draft, id, done);
        },
      )
      .finally(() => {
        draft.pending.delete(id);
        refresh((value) => value + 1);
      });
  }
  return (
    <div className="col-span-12 grid grid-cols-12 items-start gap-lg">
      <Panel className="col-span-8">
        <div className="flex flex-wrap items-center justify-between gap-md">
          <span className="text-caption text-muted-foreground">
            G{current?.g} · {subjectInfo?.label} · {header.phases.find((phase) => phase.id === day.phase)?.title}
          </span>
          {subjectInfo && (
            <div>
              <Select
                label={m.study_select_status()}
                hideLabel
                block={false}
                size="sm"
                value={index.states[subjectInfo.key] ?? 'active'}
                onValueChange={(value) => {
                  if (value === 'active' || value === 'paused' || value === 'passed')
                    subject.mutate({ plan: day.planId, id: subjectInfo.id, state: value });
                }}
                options={[
                  { value: 'active', label: m.study_active() },
                  { value: 'paused', label: m.study_paused() },
                  { value: 'passed', label: m.study_passed() },
                ]}
              />
            </div>
          )}
        </div>
        <h2 className="text-display">{day.title}</h2>
        <p className="text-caption">
          <NumberRoll value={checked.size} /> / {allSteps.length}
        </p>
        <DayBody
          body={day}
          header={header}
          titles={titles}
          checked={checked}
          onStep={saveStep}
          notes={new Map(own.filter((row) => row.kind === 'note').map((row) => [row.id, row.value]))}
        />
        {Object.entries(draft.failed).map(([id, done]) => (
          <div role="alert" key={id}>
            {m.study_save_failed()}{' '}
            <button type="button" className="underline" onClick={() => saveStep(id, done)}>
              {m.study_retry()}
            </button>
          </div>
        ))}
        {day.threads.length > 0 && (
          <fieldset className="flex flex-col gap-sm">
            <legend className="text-title">{m.study_autonomy()}</legend>
            {header.threads
              .filter((thread) => day.threads.includes(thread.id))
              .map((thread) => (
                <div className="flex items-center justify-between gap-md" key={thread.id}>
                  <span>{thread.title}</span>
                  <div>
                    <Select
                      label={thread.title}
                      hideLabel
                      block={false}
                      size="sm"
                      value={own.find((row) => row.kind === 'autonomy' && row.id === thread.id)?.value ?? 'unset'}
                      onValueChange={(value) => {
                        if (value === 'unset' || value === 'red' || value === 'yellow' || value === 'green')
                          autonomy.mutate({ plan: day.planId, id: thread.id, value });
                      }}
                      options={[
                        { value: 'unset', label: m.study_autonomy_unset() },
                        { value: 'red', label: m.study_autonomy_red() },
                        { value: 'yellow', label: m.study_autonomy_yellow() },
                        { value: 'green', label: m.study_autonomy_green() },
                      ]}
                    />
                  </div>
                </div>
              ))}
          </fieldset>
        )}
        <TodayNote
          key={day.key}
          dayKey={day.key}
          initial={own.find((row) => row.kind === 'note' && row.id === day.id)?.value ?? ''}
        />
        {day.done && <RegistryButton label={m.study_next()} action={() => open.mutateAsync()} />}
      </Panel>
      <div className="col-span-4 flex flex-col gap-lg">
        <PomodoroPanel />
        <Panel title={m.study_next_days()}>
          <ul>
            {index.days
              .filter((item) => !item.done && item.key !== day.key)
              .slice(0, 5)
              .map((item) => (
                <li key={item.key} className="border-b border-dashed border-border py-sm text-body">
                  G{item.g} · {item.title}
                </li>
              ))}
          </ul>
          <p>{m.study_done_of({ done: index.days.filter((item) => item.done).length, total: index.days.length })}</p>
          <ul>
            {subjects.map((item) => {
              const days = [...index.days, ...index.hiddenDays].filter((entry) => entry.subject === item.key);
              return (
                <li className="text-caption text-muted-foreground" key={item.key}>
                  {item.label} ·{' '}
                  {m.study_done_of({ done: days.filter((entry) => entry.done).length, total: days.length })}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
