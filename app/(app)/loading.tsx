// Shown while the next screen loads, so a click always gives instant feedback.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse space-y-3">
      <div className="h-6 w-48 rounded bg-gray-200" />
      <div className="h-20 rounded-lg bg-gray-200/70" />
      <div className="h-64 rounded-lg bg-gray-200/70" />
    </div>
  );
}
