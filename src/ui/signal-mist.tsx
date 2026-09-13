const BLOBS = [
  { top: "6%", left: "68%", size: 340, opacity: 0.22, delay: "0s", duration: "22s" },
  { top: "28%", left: "-4%", size: 280, opacity: 0.16, delay: "3s", duration: "28s" },
  { top: "58%", left: "78%", size: 260, opacity: 0.14, delay: "7s", duration: "24s" },
  { top: "72%", left: "18%", size: 300, opacity: 0.18, delay: "1.5s", duration: "26s" },
  { top: "12%", left: "28%", size: 180, opacity: 0.12, delay: "5s", duration: "20s" },
  { top: "88%", left: "55%", size: 220, opacity: 0.15, delay: "9s", duration: "30s" },
] as const;

export function SignalMist() {
  return (
    <div className="signal-mist pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {BLOBS.map((blob, index) => (
        <span
          key={index}
          className="signal-mist-blob"
          style={{
            top: blob.top,
            left: blob.left,
            width: blob.size,
            height: blob.size,
            opacity: blob.opacity,
            animationDelay: blob.delay,
            animationDuration: blob.duration,
          }}
        />
      ))}
    </div>
  );
}
