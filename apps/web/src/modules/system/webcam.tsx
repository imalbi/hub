import { useEffect, useRef, useState } from 'react';
import { DeviceRow } from '../../components/device-row.tsx';
import { Dialog } from '../../components/ui/dialog.tsx';
import { ActionButton } from '../../components/ui/action-button.tsx';
import { m } from '../../paraglide/messages.js';

type Camera = { stream: MediaStream } | { error: string } | null;

function errorText(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return m.webcam_denied();
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return m.webcam_missing();
  return m.webcam_unavailable();
}

/**
 * The camera and microphone while `active`. Every track stops the moment `active` turns false, the page unmounts or the
 * route changes (the effect cleanup), so a call app can take the device right after the dialog closes.
 */
function useCamera(active: boolean): Camera {
  const [camera, setCamera] = useState<Camera>(null);
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let stream: MediaStream | undefined;
    // `mediaDevices` is missing on a page that is not a secure context.
    const request = navigator.mediaDevices
      ? navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      : Promise.reject(new Error('no media devices'));
    request.then(
      (opened) => {
        // The dialog closed while the browser was still asking: release at once.
        if (cancelled) for (const track of opened.getTracks()) track.stop();
        else {
          stream = opened;
          setCamera({ stream: opened });
        }
        return undefined;
      },
      (error: unknown) => {
        if (!cancelled) setCamera({ error: errorText(error) });
        return undefined;
      },
    );
    return () => {
      cancelled = true;
      for (const track of stream?.getTracks() ?? []) track.stop();
      setCamera(null);
    };
  }, [active]);
  return camera;
}

/** A bar that follows the microphone, written straight to the DOM: a re-render per frame would be waste. */
function LevelBar({ stream }: { stream: MediaStream }) {
  const bar = useRef<HTMLDivElement>(null);
  const meter = useRef<HTMLMeterElement>(null);
  useEffect(() => {
    if (stream.getAudioTracks().length === 0) return undefined;
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const draw = () => {
      analyser.getByteTimeDomainData(samples);
      // Samples sit around 128; the peak distance from it is the level, 0 to 1.
      const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value - 128)), 0) / 128;
      const percent = Math.min(100, Math.round(peak * 200));
      if (bar.current) bar.current.style.width = `${percent}%`;
      if (meter.current) meter.current.value = percent;
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      void context.close();
    };
  }, [stream]);
  return (
    <>
      <meter ref={meter} aria-label={m.webcam_level()} min={0} max={100} value={0} className="sr-only" />
      <div aria-hidden className="h-xs overflow-hidden rounded-full bg-muted">
        <div ref={bar} className="h-full rounded-full bg-foreground" />
      </div>
    </>
  );
}

function Preview({ camera }: { camera: Camera }) {
  if (camera === null) return <p className="text-label text-muted-foreground">{m.webcam_starting()}</p>;
  if ('error' in camera)
    return (
      <p role="alert" className="text-label">
        {camera.error}
      </p>
    );
  return (
    <div className="flex flex-col gap-md pb-md">
      <video
        aria-label={m.webcam_video()}
        autoPlay
        muted
        playsInline
        ref={(node) => {
          if (node && node.srcObject !== camera.stream) node.srcObject = camera.stream;
        }}
        className="aspect-video w-full rounded-md bg-muted object-cover"
      />
      <LevelBar stream={camera.stream} />
    </div>
  );
}

/** The "Webcam" row of Questo PC: a button that opens the live camera in a dialog. */
export function WebcamRow() {
  const [open, setOpen] = useState(false);
  const camera = useCamera(open);
  return (
    <DeviceRow label={m.webcam_title()} state={m.webcam_detail()}>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={m.webcam_dialog_title()}
        closeLabel={m.webcam_close()}
        trigger={
          <ActionButton variant="outline" aria-label={m.webcam_action_name()} className="min-h-touch">
            {m.webcam_action()}
          </ActionButton>
        }
      >
        <Preview camera={camera} />
      </Dialog>
    </DeviceRow>
  );
}
