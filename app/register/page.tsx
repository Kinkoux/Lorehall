import { getLocale } from "@/lib/locale";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage() {
  const locale = await getLocale();
  return <RegisterForm locale={locale} />;
}
