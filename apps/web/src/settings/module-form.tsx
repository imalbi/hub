import { Panel } from '../components/panel.tsx';
import { m } from '../paraglide/messages.js';
import { FieldControl, isWide } from './field-control.tsx';
import { getAt } from './path.ts';
import type { Field, Form, Path } from './schema-fields.ts';

const parentOf = (field: Field) => field.path.slice(0, -1).join('\u0000');
const keyOf = (path: Path) => path.join('\u0000');

/** Essenziale: the root fields, then every section under its own heading, narrow fields two to a row. */
export function ModuleForm({
  form,
  value,
  stored,
  resetCount,
  issueText,
  onEdit,
  onBlock,
  children,
}: {
  form: Form;
  value: unknown;
  stored: unknown;
  resetCount: number;
  issueText: (path: Path) => string | undefined;
  onEdit: (path: Path, next: unknown) => void;
  onBlock: (path: Path, error: string | null) => void;
  /** Shown first, inside the panel (a module’s additional controls). */
  children?: React.ReactNode;
}) {
  const groups = [
    { id: '', section: undefined, fields: form.fields.filter((field) => parentOf(field) === '') },
    ...form.sections.map((section) => ({
      id: keyOf(section.path),
      section,
      fields: form.fields.filter((field) => parentOf(field) === keyOf(section.path)),
    })),
  ].filter((group) => group.fields.length > 0);

  return (
    <Panel title={m.settings_essential()} className="col-span-7">
      {children}
      {groups.length === 0 && <p className="text-body text-muted-foreground">{m.settings_no_essential()}</p>}
      {groups.map(({ id, section, fields }, index) => (
        <section
          key={id}
          aria-label={section?.label}
          className={`flex flex-col gap-lg ${index > 0 ? 'border-t border-dashed border-border pt-xl' : ''}`}
        >
          {section && (
            <header className="flex flex-col gap-3xs">
              <h3 className="text-title">{section.label}</h3>
              {section.description && <p className="text-caption text-muted-foreground">{section.description}</p>}
            </header>
          )}
          <div className="grid grid-cols-2 items-start gap-x-lg gap-y-lg">
            {fields.map((field) => (
              <div
                key={`${keyOf(field.path)}-${resetCount}`}
                className={`min-w-0 ${isWide(field) ? 'col-span-2' : ''}`}
              >
                <FieldControl
                  field={field}
                  value={getAt(value, field.path)}
                  saved={getAt(stored, field.path)}
                  error={issueText(field.path)}
                  onChange={(next) => onEdit(field.path, next)}
                  onBlock={(error) => onBlock(field.path, error)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </Panel>
  );
}
