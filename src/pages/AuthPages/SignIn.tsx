import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import SignInForm from "../../components/auth/SignInForm";

export default function SignIn() {
  return (
    <>
      <PageMeta title="Entrar | inProR Painel" description="Acesse o painel de gestao inProR" />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}
