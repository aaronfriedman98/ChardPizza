import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in | Char'd Pizza" };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { next } = await searchParams;
  return (
    <main className="min-h-dvh flex items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-4xl font-black tracking-tight text-char">Char&rsquo;d</div>
          <div className="mt-1 text-sm uppercase tracking-[0.3em] text-ember">Admin</div>
        </div>
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
    </main>
  );
}
