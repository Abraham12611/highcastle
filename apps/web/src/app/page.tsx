export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 px-6 text-center text-neutral-100">
      <h1 className="text-4xl font-semibold tracking-tight">HighCastle</h1>
      <p className="max-w-prose text-sm text-neutral-400">
        Control-plane shell for the hackathon MVP. Marketing, auth, dashboard and scan UI are
        delivered by lanes L05–L10 on top of this foundation.
      </p>
      <a className="text-sm text-teal-400 underline underline-offset-4" href="/healthz">
        GET /healthz
      </a>
    </main>
  );
}
