import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useForgotPassword } from "@workspace/api-client-react";
import { LugendoCompass } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const schema = z.object({
  email: z.string().email("Email inválido"),
});

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const forgotPassword = useForgotPassword();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = (values: z.infer<typeof schema>) => {
    forgotPassword.mutate({ data: values }, { onSuccess: () => setSent(true) });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 font-sans">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <LugendoCompass size={56} variant="light" className="mb-3" />
          <h1 className="font-sans font-medium text-[2rem] leading-none" style={{ letterSpacing: "-0.02em" }}>
            <span style={{ color: "#2D1F0E" }}>Lu</span>
            <span style={{ color: "#C4793A" }}>g</span>
            <span style={{ color: "#2D1F0E" }}>endo</span>
          </h1>
        </div>

        <Card className="shadow-xl border-border/50">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-serif">Recuperar contraseña</CardTitle>
            <CardDescription>
              {sent
                ? "Si existe una cuenta con ese email, te hemos enviado un enlace para restablecer tu contraseña."
                : "Introduce tu email y te enviaremos un enlace para restablecer tu contraseña."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!sent && (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" autoComplete="email" autoFocus {...field} data-testid="input-forgot-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={forgotPassword.isPending} data-testid="button-forgot-submit">
                    {forgotPassword.isPending ? "Enviando…" : "Enviar enlace"}
                  </Button>
                </form>
              </Form>
            )}
            <p className="text-sm text-muted-foreground text-center mt-4">
              <Link href="/login" className="underline underline-offset-2">Volver a iniciar sesión</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
