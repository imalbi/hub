import { useMedia } from './media.tsx';
export function DeskBackdrop({ media }: { media: boolean }) {
  const { art } = useMedia();
  return (
    <div aria-hidden className="desk-backdrop fixed inset-0 -z-10 overflow-hidden">
      {media && art && <img src={art.dataUrl} alt="" className="size-full object-cover" />}
    </div>
  );
}
