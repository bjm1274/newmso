'use client';
export default function HrLoadError({ error, reload }: { error: string | null; reload: () => void }) {
  if (!error) return null;
  return <div role="alert" className="m-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error} <button type="button" onClick={reload} className="ml-2 underline">다시 시도</button></div>;
}
