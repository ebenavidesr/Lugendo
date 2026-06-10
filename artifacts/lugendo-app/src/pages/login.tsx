import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, useRegister } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { LugendoCompass } from "@/components/logo";
import { HelpCircle, Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

const PASSWORD_RULES = [
  { label: "Mínimo 8 caracteres",        test: (p: string) => p.length >= 8 },
  { label: "Al menos una mayúscula",      test: (p: string) => /[A-Z]/.test(p) },
  { label: "Al menos una minúscula",      test: (p: string) => /[a-z]/.test(p) },
  { label: "Al menos un número",          test: (p: string) => /[0-9]/.test(p) },
  { label: "Al menos un carácter especial (!@#$…)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const strongPassword = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .regex(/[A-Z]/, "Debe contener al menos una mayúscula")
  .regex(/[a-z]/, "Debe contener al menos una minúscula")
  .regex(/[0-9]/, "Debe contener al menos un número")
  .regex(/[^A-Za-z0-9]/, "Debe contener al menos un carácter especial");

const registerSchema = z
  .object({
    firstName:       z.string().min(1, "El nombre es obligatorio"),
    lastName:        z.string().min(1, "Los apellidos son obligatorios"),
    email:           z.string().email("Email inválido"),
    password:        strongPassword,
    confirmPassword: z.string().min(1, "Confirma tu contraseña"),
    inviteCode:      z.string().optional(),
    acceptTerms:     z.literal(true, { message: "Debes aceptar los términos y condiciones para registrarte" }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

function PasswordRequirements({ password }: { password: string }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.label} className="flex items-center gap-2">
            {ok
              ? <Check className="w-3.5 h-3.5 shrink-0 text-green-600" />
              : <X    className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />}
            <span className={ok ? "text-green-700" : "text-muted-foreground"}>{rule.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function Login() {
  const [location, setLocation] = useLocation();
  const isRegister = location === "/register";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "", confirmPassword: "", inviteCode: "", acceptTerms: false as unknown as true },
  });

  const watchedPassword = registerForm.watch("password");

  const onLoginSubmit = (values: z.infer<typeof loginSchema>) => {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: (user) => {
          queryClient.setQueryData(["/api/auth/me"], user);
          toast({ title: "Bienvenido", description: "Sesión iniciada correctamente." });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error al iniciar sesión", description: "Credenciales incorrectas." });
        },
      }
    );
  };

  const onRegisterSubmit = (values: z.infer<typeof registerSchema>) => {
    const { firstName, lastName, confirmPassword: _confirm, ...rest } = values;
    registerMutation.mutate(
      { data: { ...rest, name: `${firstName.trim()} ${lastName.trim()}` } },
      {
        onSuccess: (user) => {
          queryClient.setQueryData(["/api/auth/me"], user);
          toast({ title: "Cuenta creada", description: "¡Bienvenido a Lugendo!" });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Error al registrarse", description: "No se pudo crear la cuenta." });
        },
      }
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
          <p className="mt-2 text-sm font-normal italic" style={{ color: "#7A5C3A" }}>
            your journey starts here
          </p>
        </div>

        <Card className="shadow-xl border-border/50">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-serif">
              {isRegister ? "Crear cuenta" : "Bienvenido"}
            </CardTitle>
            <CardDescription>
              {isRegister
                ? "Introduce tus datos para crear tu cuenta y empezar a programar tus viajes o unirte a un viaje de agencia."
                : "Introduce tus credenciales para acceder."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isRegister ? (
              <Form {...registerForm}>
                <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                  {/* Nombre + Apellidos */}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={registerForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre</FormLabel>
                          <FormControl>
                            <Input placeholder="Ana" autoComplete="given-name" autoFocus {...field} data-testid="input-register-firstname" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Apellidos</FormLabel>
                          <FormControl>
                            <Input placeholder="García" autoComplete="family-name" {...field} data-testid="input-register-lastname" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Email */}
                  <FormField
                    control={registerForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="nombre@email.com" autoComplete="email" autoCapitalize="off" autoCorrect="off" spellCheck={false} {...field} data-testid="input-register-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Contraseña con botón "?" */}
                  <FormField
                    control={registerForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Contraseña</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label="Requisitos de contraseña"
                              >
                                <HelpCircle className="w-4 h-4" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent side="right" align="start" className="w-72 p-4">
                              <p className="text-sm font-medium mb-3">Requisitos de contraseña</p>
                              <PasswordRequirements password={watchedPassword} />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" {...field} data-testid="input-register-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Confirmar contraseña */}
                  <FormField
                    control={registerForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirmar contraseña</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" {...field} data-testid="input-register-confirm-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Código de invitación */}
                  <FormField
                    control={registerForm.control}
                    name="inviteCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Código de invitación{" "}
                          <span className="text-muted-foreground font-normal">(opcional)</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="ABCDEF" autoComplete="off" {...field} data-testid="input-register-invite" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Términos y condiciones */}
                  <FormField
                    control={registerForm.control}
                    name="acceptTerms"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-start gap-3">
                          <FormControl>
                            <Checkbox
                              id="accept-terms"
                              checked={field.value === true}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-accept-terms"
                            />
                          </FormControl>
                          <label
                            htmlFor="accept-terms"
                            className="text-[13px] leading-snug cursor-pointer select-none"
                            style={{ color: "#2D1F0E" }}
                          >
                            He leído y acepto los{" "}
                            <a
                              href="/terminos-y-condiciones.pdf"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium underline underline-offset-2"
                              style={{ color: "#C4793A" }}
                              onClick={e => e.stopPropagation()}
                            >
                              términos y condiciones
                            </a>
                          </label>
                        </div>
                        <FormMessage className="mt-1" />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full mt-2"
                    disabled={registerMutation.isPending}
                    data-testid="button-register-submit"
                  >
                    {registerMutation.isPending ? "Creando cuenta…" : "Crear cuenta"}
                  </Button>
                </form>
              </Form>
            ) : (
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="nombre@email.com" autoComplete="email" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoFocus {...field} data-testid="input-login-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contraseña</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="current-password" {...field} data-testid="input-login-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full mt-6"
                    disabled={loginMutation.isPending}
                    data-testid="button-login-submit"
                  >
                    {loginMutation.isPending ? "Iniciando sesión…" : "Iniciar sesión"}
                  </Button>
                </form>
              </Form>
            )}

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">
                {isRegister ? "¿Ya tienes cuenta? " : "¿No tienes cuenta? "}
              </span>
              <Link href={isRegister ? "/login" : "/register"} className="text-primary font-medium hover:underline">
                {isRegister ? "Inicia sesión" : "Regístrate"}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
