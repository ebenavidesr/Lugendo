import { useState } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, useRegister, ApiError } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { LugendoCompass } from "@/components/logo";
import { HelpCircle, Check, X, Eye, EyeOff } from "lucide-react";

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
    acceptTerms:     z.literal(true, { message: "Debes aceptar los términos y condiciones para registrarte" }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

function getRegisterErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.data && typeof err.data === "object" && "error" in err.data) {
    const backendError = (err.data as { error?: unknown }).error;
    if (backendError === "Email already in use") {
      return "Ya existe una cuenta con este email. Inicia sesión o recupera tu contraseña.";
    }
    if (backendError === "Validation failed") {
      return "Revisa los datos del formulario e inténtalo de nuevo.";
    }
  }
  return "No se pudo crear la cuenta. Inténtalo de nuevo.";
}

// Bug recurrente: cuando el navegador autorrellena varios campos de golpe (selector de credenciales/Contactos,
// no tecleo manual), a veces escribe el valor en el DOM sin disparar el evento `input` que react-hook-form
// necesita para actualizar su estado interno — el campo se ve relleno pero react-hook-form sigue creyendo que
// está vacío, y valida (y envía) ese valor obsoleto en vez del que se ve en pantalla. Sincroniza el valor real
// del DOM hacia el estado del formulario justo antes de `handleSubmit`, así el envío siempre valida lo que el
// usuario ve, sin importar si el navegador disparó el evento o no.
function syncDomValueIntoForm(formEl: HTMLFormElement, domName: string, setValue: (name: string, value: string, opts?: { shouldValidate: boolean }) => void, fieldName: string) {
  const el = formEl.elements.namedItem(domName);
  if (el instanceof HTMLInputElement) {
    setValue(fieldName, el.value, { shouldValidate: false });
  }
}

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
  const search = useSearch();
  const isRegister = location === "/register";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Coming from an invitation email (task #161): the email is pre-filled and locked, so the
  // account created here is guaranteed to match the invited address.
  const invitedEmail = new URLSearchParams(search).get("email") ?? "";

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: "", lastName: "", email: invitedEmail, password: "", confirmPassword: "", acceptTerms: false as unknown as true },
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
        onError: (err) => {
          toast({ variant: "destructive", title: "Error al registrarse", description: getRegisterErrorMessage(err) });
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
                <form
                  onSubmit={(e) => {
                    syncDomValueIntoForm(e.currentTarget, "reg-correo", registerForm.setValue, "email");
                    syncDomValueIntoForm(e.currentTarget, "password", registerForm.setValue, "password");
                    syncDomValueIntoForm(e.currentTarget, "confirmPassword", registerForm.setValue, "confirmPassword");
                    return registerForm.handleSubmit(onRegisterSubmit)(e);
                  }}
                  className="space-y-4"
                >
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
                          {/* Bug recurrente: el autocompletado/sugerencias nativas de email-contraseña del navegador (Chrome, Safari/Keychain, móvil) reconocen el formulario completo (nombre+email+contraseña+confirmar) como un registro y capturan el teclado, incluso sin type="email"/autoComplete="email". Mitigación (sin readOnly: en iOS Safari un input readOnly no abre el teclado virtual, y desbloquearlo en onFocus llega tarde para esa decisión): nombre de campo no estándar, autoComplete="off" y atributos para ignorar gestores de contraseñas, y el placeholder ya no contiene "@" ni "email.com". Campo no controlado (sin prop `value`): en Safari de escritorio, el panel de "Contactos"/emails guardados escribe el valor directamente en el DOM sin disparar el evento `input` que React usa para reconciliar un campo controlado, así que un `value={field.value}` fuerza el campo de vuelta a vacío en el siguiente render y bloquea tanto la selección del panel como el tecleo manual posterior. Con `defaultValue` el DOM manda y `onChange`/`onBlur` solo sincronizan el estado de react-hook-form. */}
                          <Input
                            inputMode="text"
                            placeholder="Introduce tu correo"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            ref={field.ref}
                            defaultValue={field.value}
                            onChange={field.onChange}
                            onBlur={(e) => {
                              field.onChange(e.target.value);
                              field.onBlur();
                            }}
                            name="reg-correo"
                            autoComplete="off"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            // Locked when coming from an invitation link (task #161) — the
                            // account created here must match the invited email exactly.
                            disabled={!!invitedEmail}
                            data-testid="input-register-email"
                          />
                        </FormControl>
                        {invitedEmail && (
                          <p className="text-[12px] text-muted-foreground">Este email viene de tu invitación y no se puede cambiar.</p>
                        )}
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
                          <div className="relative">
                            {/* Mismo bug recurrente que el campo Email (ver comentario arriba): campo no controlado para que el autofill/Keychain de Safari no lo bloquee al escribir. */}
                            <Input
                              type={showRegPassword ? "text" : "password"}
                              autoComplete="new-password"
                              className="pr-10"
                              ref={field.ref}
                              defaultValue={field.value}
                              onChange={field.onChange}
                              onBlur={(e) => {
                                field.onChange(e.target.value);
                                field.onBlur();
                              }}
                              name={field.name}
                              data-testid="input-register-password"
                            />
                            <button type="button" tabIndex={-1} onClick={() => setShowRegPassword(v => !v)} className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors" aria-label={showRegPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                              {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
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
                          <div className="relative">
                            <Input
                              type={showRegConfirm ? "text" : "password"}
                              autoComplete="new-password"
                              className="pr-10"
                              ref={field.ref}
                              defaultValue={field.value}
                              onChange={field.onChange}
                              onBlur={(e) => {
                                field.onChange(e.target.value);
                                field.onBlur();
                              }}
                              name={field.name}
                              data-testid="input-register-confirm-password"
                            />
                            <button type="button" tabIndex={-1} onClick={() => setShowRegConfirm(v => !v)} className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors" aria-label={showRegConfirm ? "Ocultar contraseña" : "Mostrar contraseña"}>
                              {showRegConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
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
                <form
                  onSubmit={(e) => {
                    syncDomValueIntoForm(e.currentTarget, "acceso-correo", loginForm.setValue, "email");
                    syncDomValueIntoForm(e.currentTarget, "password", loginForm.setValue, "password");
                    return loginForm.handleSubmit(onLoginSubmit)(e);
                  }}
                  className="space-y-4"
                >
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          {/* Bug recurrente: el autocompletado/sugerencias nativas de email-contraseña del navegador (Chrome, Safari/Keychain, móvil) reconocen el formulario completo (email+contraseña) como un login y capturan el teclado, incluso sin type="email"/autoComplete="email". Mitigación (sin readOnly: en iOS Safari un input readOnly no abre el teclado virtual, y desbloquearlo en onFocus llega tarde para esa decisión): nombre de campo no estándar, autoComplete="off" y atributos para ignorar gestores de contraseñas, y el placeholder ya no contiene "@" ni "email.com". Tampoco se usa autoFocus: forzar el foco en el primer render es justo el momento en que el autofill engine engancha el campo. Campo no controlado (sin prop `value`): en Safari de escritorio, el panel de "Contactos"/emails guardados escribe el valor directamente en el DOM sin disparar el evento `input` que React usa para reconciliar un campo controlado, así que un `value={field.value}` fuerza el campo de vuelta a vacío en el siguiente render y bloquea tanto la selección del panel como el tecleo manual posterior. Con `defaultValue` el DOM manda y `onChange`/`onBlur` solo sincronizan el estado de react-hook-form. */}
                          <Input
                            inputMode="text"
                            placeholder="Introduce tu correo"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            ref={field.ref}
                            defaultValue={field.value}
                            onChange={field.onChange}
                            onBlur={(e) => {
                              field.onChange(e.target.value);
                              field.onBlur();
                            }}
                            name="acceso-correo"
                            autoComplete="off"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            data-testid="input-login-email"
                          />
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
                        <div className="flex items-center justify-between">
                          <FormLabel>Contraseña</FormLabel>
                          <Link href="/forgot-password" className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground">
                            ¿Olvidaste tu contraseña?
                          </Link>
                        </div>
                        <FormControl>
                          <div className="relative">
                            {/* Mismo bug recurrente que el campo Email (ver comentario arriba): campo no controlado para que el autofill/Keychain de Safari no lo bloquee al escribir. */}
                            <Input
                              type={showLoginPassword ? "text" : "password"}
                              autoComplete="current-password"
                              className="pr-10"
                              ref={field.ref}
                              defaultValue={field.value}
                              onChange={field.onChange}
                              onBlur={(e) => {
                                field.onChange(e.target.value);
                                field.onBlur();
                              }}
                              name={field.name}
                              data-testid="input-login-password"
                            />
                            <button type="button" tabIndex={-1} onClick={() => setShowLoginPassword(v => !v)} className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors" aria-label={showLoginPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                              {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
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
