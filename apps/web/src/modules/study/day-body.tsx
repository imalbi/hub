import { WarningCircleIcon } from '@phosphor-icons/react';
import { causeLabel } from './error-form.tsx';
import { MaterialAction } from './material.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Checkbox } from '../../components/ui/checkbox.tsx';
import { m } from '../../paraglide/messages.js';
import type { StudyDay, StudyDayBody as Body, StudyError, StudyHeader } from './use-study.ts';

export function DayBody({
  body,
  header,
  titles,
  checked,
  onStep,
  notes,
  errors,
  onError,
}: {
  body: Body;
  header: StudyHeader;
  titles: Map<string, StudyDay>;
  checked?: Set<string>;
  onStep?: (id: string, done: boolean) => void;
  notes?: Map<string, string>;
  /** Error log entries: the recalled days show theirs. */
  errors?: StudyError[];
  /** Starts an error entry on a step (Oggi only). */
  onError?: (step: Body['blocks'][number]['steps'][number]) => void;
}) {
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
            const recalled = titles.get(`${header.id}/${id}`);
            return (
              <span key={id} className="text-caption text-muted-foreground">
                {m.study_recall()}:{' '}
                {recalled ? `${recalled.g === null ? '' : `G${recalled.g} · `}${recalled.title}` : id}
                {notes?.get(id) && <span className="block">{notes.get(id)}</span>}
                {errors
                  ?.filter((entry) => entry.key === `${header.id}/${id}`)
                  .map((entry) => (
                    <span key={entry.id} className="block">
                      {m.study_errors()}: {entry.reference} · {causeLabel(entry.cause)}
                      {entry.method && ` · ${entry.method}`}
                    </span>
                  ))}
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
                  {onStep ? (
                    <Checkbox
                      aria-label={step.text}
                      checked={checked?.has(step.id) ?? false}
                      onCheckedChange={(done) => onStep(step.id, done)}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="mt-2xs size-icon-sm shrink-0 rounded-full border border-border"
                    />
                  )}
                  <span>
                    {step.text}
                    {step.file && (
                      <span className="block text-caption text-muted-foreground">
                        {step.file.path}
                        {step.file.page && ` · ${m.study_page({ page: step.file.page })}`}
                        <MaterialAction path={step.file.path} page={step.file.page} />
                      </span>
                    )}
                  </span>
                  {onError && (
                    <button
                      type="button"
                      aria-label={m.study_error_step({ step: step.text })}
                      onClick={() => onError(step)}
                      className="ml-auto flex size-icon shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <WarningCircleIcon aria-hidden="true" className="size-icon-sm" />
                    </button>
                  )}
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
