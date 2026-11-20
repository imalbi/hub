import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

export function FadeImage({
  src,
  alt,
  className,
  opacity = 1,
  loading,
  onError,
}: {
  src: string;
  alt: string;
  className: string;
  opacity?: number;
  loading?: 'eager' | 'lazy';
  onError?: () => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loaded = loadedSrc === src;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (image.current?.complete && (loading !== 'lazy' || image.current.naturalWidth > 0)) setLoadedSrc(src);
  }, [loading, src]);
  return (
    <motion.span
      key={src}
      data-fade-image=""
      className={`block ${className} overflow-hidden`}
      initial={{ opacity: 0 }}
      animate={{ opacity: loaded ? opacity : 0 }}
      transition={{ duration: reduced ? 0 : 0.2, ease: 'easeOut' }}
    >
      <img
        ref={image}
        src={src}
        alt={alt}
        loading={loading}
        className="size-full object-cover"
        data-image-loaded={loaded || undefined}
        onLoad={() => setLoadedSrc(src)}
        onError={() => {
          setLoadedSrc(src);
          onError?.();
        }}
      />
    </motion.span>
  );
}
