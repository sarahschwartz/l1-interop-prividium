import { useEffect, useState } from "react";

const PENDING_DURATION_MS = 10 * 60 * 1000; // 10 minutes

export function PendingProgressBar({ addedAt }: { addedAt: string }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startTime = new Date(addedAt).getTime();

    function updateProgress() {
      const elapsed = Date.now() - startTime;
      const pct = Math.max(5, Math.min((elapsed / PENDING_DURATION_MS) * 100, 100));
      setProgress(pct);
    }

    updateProgress();
    const interval = setInterval(updateProgress, 1000);
    return () => clearInterval(interval);
  }, [addedAt]);

  return (
    <div className="pending-progress">
      <div className="pending-progress-bar">
        <div
          className="pending-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="pending-progress-text">Pending</span>
    </div>
  );
}
