import SelectionForm from "@/components/SelectionForm";
export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center min-h-screen">
      <header className="pt-16 pb-4 text-center">
        <div className="text-5xl mb-3">🧑‍💼</div>
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-orange-400 via-pink-500 to-violet-500 bg-clip-text text-transparent">
          AI文字面接体験
        </h1>
        <p className="mt-2 text-zinc-500 text-base">
          会社タイプを選ぶだけ！AIが面接官になってくれるよ
        </p>
      </header>
      <main className="flex-1 flex items-start justify-center w-full pt-8 pb-16">
        <SelectionForm />
      </main>
    </div>
  );
}
