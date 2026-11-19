import { useMedia } from '../modules/media/media-provider.tsx';
import { FadeImage } from '../components/fade-image.tsx';
import { useTheme } from '../theme/theme.tsx';

/** The ground behind every desk page. The art shows on the Media page, and on every page when Sfondo is Copertina. */
export function DeskBackdrop({ media }: { media: boolean }) {
  const { art } = useMedia();
  const { backdrop } = useTheme();
  return (
    <div aria-hidden className="desk-backdrop fixed inset-0 -z-10 overflow-hidden">
      {(media || backdrop === 'cover') && art && (
        <FadeImage src={art.dataUrl} alt="" className="size-full object-cover" />
      )}
    </div>
  );
}
