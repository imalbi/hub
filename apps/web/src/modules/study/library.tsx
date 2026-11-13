import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Panel } from '../../components/panel.tsx';
import { Input } from '../../components/ui/input.tsx';
import { Select } from '../../components/ui/select.tsx';
import { m } from '../../paraglide/messages.js';
import { MaterialAction } from './material.tsx';
import { useStudyTRPC } from './use-study.ts';

export function StudyLibrary() {
  const trpc = useStudyTRPC();
  const library = useQuery(trpc.library.queryOptions());
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('');
  if (library.isError) return <p>{m.study_error()}</p>;
  if (library.isPending) return <p>{m.tile_loading()}</p>;
  const folders = [...new Map(library.data.map((item) => [item.folder, item.folderName])).entries()];
  const visible = library.data.filter(
    (item) =>
      (!folder || String(item.folder) === folder) && item.path.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return (
    <Panel title={m.study_library()}>
      <div className="flex flex-wrap items-end gap-md">
        <div className="min-w-0 flex-1">
          <Input label={m.study_search_material()} value={search} onValueChange={setSearch} />
        </div>
        <div>
          <Select
            label={m.study_material_folder()}
            value={folder}
            onValueChange={setFolder}
            options={[
              { value: '', label: m.study_all() },
              ...folders.map(([id, name]) => ({ value: String(id), label: name })),
            ]}
          />
        </div>
      </div>
      {visible.length === 0 ? (
        <p>{m.study_empty()}</p>
      ) : (
        <ul>
          {visible.map((item) => (
            <li
              key={`${item.folder}/${item.path}`}
              className="flex flex-wrap items-center justify-between gap-md border-b border-border py-sm"
            >
              <span>
                {item.path} · {item.folderName}
              </span>
              <span className="flex gap-sm">
                <MaterialAction path={item.path} folder={item.folder} />
                <MaterialAction path={item.path} folder={item.folder} download />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
