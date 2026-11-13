import { useMutation } from '@tanstack/react-query';
import { RegistryButton } from '../../components/registry-button.tsx';
import { getToken } from '../../lib/auth.ts';
import { m } from '../../paraglide/messages.js';
import { useStudyTRPC } from './use-study.ts';

export function MaterialAction({
  path,
  folder,
  page,
  download = false,
}: {
  path: string;
  folder?: number;
  page?: number;
  download?: boolean;
}) {
  const trpc = useStudyTRPC();
  const open = useMutation(trpc.openMaterial.mutationOptions());
  async function act() {
    const tab = download ? null : window.open('', '_blank');
    if (!download && !tab) throw new Error('Popup blocked');
    try {
      const file = await open.mutateAsync({ path, folder });
      const token = getToken();
      const response = await fetch(`/files/${file.fileId}${download ? '' : '?inline=1'}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('File unavailable');
      const url = URL.createObjectURL(await response.blob());
      if (tab) tab.location.href = `${url}${page ? `#page=${page}` : ''}`;
      else {
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (error) {
      tab?.close();
      throw error;
    }
  }
  return <RegistryButton secondary label={download ? m.study_download() : m.study_open_material()} action={act} />;
}
