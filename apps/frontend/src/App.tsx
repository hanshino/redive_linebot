function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center p-8 bg-white rounded-2xl shadow-xl max-w-md">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          🎮 Redive LineBot
        </h1>
        <p className="text-gray-600 mb-6">開發環境已成功啟動！</p>
        <div className="space-y-2 text-sm text-gray-500">
          <p>✅ React + Vite</p>
          <p>✅ Tailwind CSS</p>
          <p>✅ TanStack Query</p>
          <p>✅ Zustand</p>
        </div>
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-400">
            編輯 <code className="bg-gray-200 px-1 rounded">src/App.tsx</code>{" "}
            測試 HMR
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
