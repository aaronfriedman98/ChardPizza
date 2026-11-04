import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Reset password | Char'd Pizza" };

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-4xl font-black tracking-tight text-char">Char&rsquo;d</div>
          <div className="mt-1 text-sm uppercase tracking-[0.3em] text-ember">Reset password</div>
        </div>
        <ForgotForm />
        <p className="mt-4 text-center text-sm">
          <Link href="/admin/login" className="text-ink/60 hover:text-ink">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
