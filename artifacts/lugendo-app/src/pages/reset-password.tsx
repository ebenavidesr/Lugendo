import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useResetPassword } from "@workspace/api-client-react";
import { LugendoCompass } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const strongPassword = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .regex(/[A-Z]/, "Debe contener al menos una mayúscula")
  .regex(/[a-z]/, "Debe contener al menos una minúscula")
  .regex(/[0-9]/, "Debe contener al menos un número")
  .regex(/[^A-Za-z0-9]/, "Debe contener al menos un carácter especial");

const schema = z
  .object({
    password: strongPassword,
    confirmPassword: z.string().min(1, "Confirma tu contraseña"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export default function ResetPassword() {
  const { token = "" } = useParams<{ token?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  const resetPassword = useResetPassword();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = (values: z.infer<typeof schema>) => {
    resetPassword.mutate(
      { data: { token, password: values.password } },
      {
        onSuccess: () => setDone(true),
        onError: () => {
          toast({ variant: "destructive", title: "Enlace inválido o caducado", description: "Solicita un nuevo enlace de recuperación." });
        },
      },
    );
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
            <CardTitle className="text-2xl font-serif">Elige tu nueva contraseña</CardTitle>
            <CardDescription>
              {done ? "Tu contraseña se ha actualizado. Ya puedes iniciar sesión." : "Introduce tu nueva contraseña."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <Button className="w-full" onClick={() => setLocation("/login")} data-testid="button-reset-go-login">
                Ir a iniciar sesión
              </Button>
            ) : !token ? (
              <p className="text-sm text-muted-foreground text-center">
                Este enlace no es válido.{" "}
                <Link href="/forgot-password" className="underline underline-offset-2">Solicita uno nuevo</Link>.
              </p>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nueva contraseña</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" autoFocus {...field} data-testid="input-reset-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmar contraseña</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" {...field} data-testid="input-reset-confirm-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={resetPassword.isPending} data-testid="button-reset-submit">
                    {resetPassword.isPending ? "Guardando…" : "Restablecer contraseña"}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
