import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CaretDownIcon } from '@phosphor-icons/react';
import { Badge } from '../../components/ui/badge.tsx';
import { m } from '../../paraglide/messages.js';
import { subjectShade, useStudyTRPC, type StudyDay, type StudyDayBody as Body, type StudyHeader } from './use-study.ts';

/** A week of days: a disclosure that loads day bodies only while open (decision 11), rows open in place, read-only. */
export function PlanGroup({
  title,
  days,
  header,
  titles,
  currentId,
}: {
  title: string;
  days: StudyDay[];
  header: StudyHeader;
  titles: Map<string, StudyDay>;
  currentId?: string;
}) {
  const hasCurrent = days.some((day) => day.id === currentId);
  const [open, setOpen] = useState(hasCurrent);
  const [openDays, setOpenDays] = useState(() => new Set(hasCurrent && currentId ? [currentId] : []));
  const panelId = useId();
  const trpc = useStudyTRPC();
  const bodies = useQuery(trpc.daysById.queryOptions({ ids: days.map((day) => day.id) }, { enabled: open }));
  const byId = new Map(bodies.data?.map((day) => [day.id, day]));
  function toggleDay(id: string) {
    const next = new Set(openDays);
    if (!next.delete(id)) next.add(id);
    setOpenDays(next);
  }
  return (
    <div className="border-b border-dashed border-border last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className="flex min-h-touch w-full cursor-pointer items-center gap-xs rounded-md text-left text-caption text-muted-foreground uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <CaretDownIcon aria-hidden="true" className={`size-icon-sm transition-transform ${open ? '' : '-rotate-90'}`} />
        {title}
      </button>
      {open && (
        <ul id={panelId} className="flex flex-col pb-sm">
          {bodies.isError && <li className="text-body">{m.study_error()}</li>}
          {days.map((day) => (
            <DayRow
              key={day.id}
              day={day}
              header={header}
              titles={titles}
              body={byId.get(day.id)}
              current={day.id === currentId}
              open={openDays.has(day.id)}
              onToggle={() => toggleDay(day.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DayRow({
  day,
  header,
  titles,
  body,
  current,
  open,
  onToggle,
}: {
  day: StudyDay;
  header: StudyHeader;
  titles: Map<string, StudyDay>;
  body?: Body;
  current: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const g = day.g === null ? m.study_paused() : `G${day.g}`;
  const subject = header.subjects.find((item) => item.id === day.subject);
  const bodyId = useId();
  return (
    <li
      className={
        current
          ? 'my-xs rounded-lg border border-accent bg-muted px-md'
          : 'border-b border-dashed border-border px-md last:border-b-0'
      }
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${g} · ${day.title}`}
        onClick={onToggle}
        className="flex min-h-touch w-full cursor-pointer items-center gap-md py-xs text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className={`w-2xl tabular-nums ${current ? 'text-label' : 'text-muted-foreground'}`}>{g}</span>
        <span
          aria-hidden="true"
          className={`flex size-icon shrink-0 items-center justify-center rounded-sm text-caption ${subjectShade(header, day.subject)}`}
        >
          {subject?.name.charAt(0)}
        </span>
        <span className={`min-w-0 flex-1 truncate ${current ? 'text-title' : 'text-body'}`}>{day.title}</span>
        {day.kind === 'mock' && (
          <Badge outline size="sm">
            {m.study_kind_mock()}
          </Badge>
        )}
        {day.kind === 'review' && (
          <Badge outline size="sm">
            {m.study_kind_review()}
          </Badge>
        )}
        {current && (
          <Badge tone="primary" size="sm">
            {m.study_current()}
          </Badge>
        )}
        {day.done && (
          <Badge tone="success" size="sm">
            {m.study_done()}
          </Badge>
        )}
        {day.minutes !== undefined && (
          <span className="w-label-col text-right text-caption text-muted-foreground tabular-nums">
            {m.study_minutes({ minutes: day.minutes })}
          </span>
        )}
        <CaretDownIcon aria-hidden="true" className={`size-icon-sm transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={bodyId} className="border-t border-dashed border-border py-md">
          {body ? <DayBody body={body} header={header} titles={titles} /> : <p>{m.tile_loading()}</p>}
        </div>
      )}
    </li>
  );
}

function DayBody({ body, header, titles }: { body: Body; header: StudyHeader; titles: Map<string, StudyDay> }) {
  const threads = header.threads.filter((thread) => body.threads.includes(thread.id));
  return (
    <div className="flex flex-col gap-md">
      {(threads.length > 0 || body.recall.length > 0) && (
        <div className="flex flex-wrap items-center gap-sm">
          {threads.map((thread) => (
            <Badge key={thread.id} outline>
              {thread.title}
            </Badge>
          ))}
          {body.recall.map((id) => {
            const recalled = titles.get(id);
            return (
              <span key={id} className="text-caption text-muted-foreground">
                {m.study_recall()}:{' '}
                {recalled ? `${recalled.g === null ? '' : `G${recalled.g} · `}${recalled.title}` : id}
              </span>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-xl">
        {body.blocks.map((block) => (
          <section key={block.id} className="flex min-w-0 flex-1 basis-0 flex-col gap-xs">
            <h4 className="text-caption text-muted-foreground uppercase">{block.title}</h4>
            <ul className="flex flex-col gap-xs">
              {block.steps.map((step) => (
                <li key={step.id} className="flex items-start gap-sm text-body">
                  <span aria-hidden="true" className="mt-2xs size-icon-sm shrink-0 rounded-full border border-border" />
                  <span>
                    {step.text}
                    {step.file && (
                      <span className="block text-caption text-muted-foreground">
                        {step.file.path}
                        {step.file.page && ` · ${m.study_page({ page: step.file.page })}`}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="text-body">
        <span className="text-caption text-muted-foreground uppercase">{m.study_check()}</span> {body.check}
      </p>
    </div>
  );
}
