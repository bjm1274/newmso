export default function MainLoading() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[var(--background)]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        <span className="text-sm text-[var(--toss-gray-4)]">로딩 중...</span>
      </div>
    </div>
  );
}
