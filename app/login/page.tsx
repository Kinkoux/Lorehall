import { getLocale } from "@/lib/locale";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const locale = await getLocale();
  // Set here after a password reset — the only place that redirect lands.
  const { reset } = await searchParams;
  return <LoginForm locale={locale} resetDone={reset === "1"} />;
}
