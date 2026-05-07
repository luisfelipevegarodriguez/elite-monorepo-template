export default function HomePage(): React.JSX.Element {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">
        🚀 Elite Monorepo
      </h1>
      <p className="text-lg text-gray-600 dark:text-gray-400">
        Next.js 15 · Turborepo · pnpm · GCP Cloud Run
      </p>
      <div className="mt-8 flex gap-4">
        <a
          href="/api/v1/status"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          API Status
        </a>
        <a
          href="https://github.com/luisfelipevegarodriguez/elite-monorepo-template"
          className="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </div>
    </main>
  );
}
