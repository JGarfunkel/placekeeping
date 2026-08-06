import { Suspense } from "react";
import { ResetPasswordConfirmForm } from "@/components/forms/ResetPasswordConfirmForm";

export default function ResetPasswordConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordConfirmForm />
    </Suspense>
  );
}
