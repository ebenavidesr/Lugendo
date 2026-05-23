import { useState, useMemo } from "react";
import { Plus, Mail, Pencil, UserPlus, KeyRound, Search, Check, X, HelpCircle } from "lucide-react";
import {
  useListUsers, useCreateUser, useUpdateUser,
  useSendInvitations, useListTrips,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { User, UserRole } from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

// ── Password rules (same as traveler register) ────────────────────────────────

const PASSWORD_RULES = [
  { label: "Mínimo 8 caracteres",                    test: (p: string) => p.length >= 8 },
  { label: "Al menos una mayúscula",                  test: (p: string) => /[A-Z]/.test(p) },
  { label: "Al menos una minúscula",                  test: (p: string) => /[a-z]/.test(p) },
  { label: "Al menos un número",                      test: (p: string) => /[0-9]/.test(p) },
  { label: "Al menos un carácter especial (!@#$…)",   test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function isStrongPassword(p: string) {
  return PASSWORD_RULES.every(r => r.test(p));
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
              : <X     className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />}
            <span className={ok ? "text-green-700" : "text-muted-foreground"}>{rule.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const roleBadge: Record<UserRole, { bg: string; color: string; label: string }> = {
  admin:    { bg: "#FDECEA", color: "#C0392B", label: "Admin" },
  manager:  { bg: "#EAE6F5", color: "#3D2F6B", label: "Manager" },
  agent:    { bg: "#FAEEE4", color: "#8B4420", label: "Agente" },
  traveler: { bg: "#ECD5B8", color: "#7A5C3A", label: "Viajero" },
};

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "admin",    label: "Admin" },
  { value: "manager",  label: "Manager" },
  { value: "agent",    label: "Agente" },
  { value: "traveler", label: "Viajero" },
];

function RoleBadge({ role }: { role: UserRole }) {
  const s = roleBadge[role] ?? roleBadge.agent;
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  );
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Create User Dialog ────────────────────────────────────────────────────────

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const createUser = useCreateUser();

  const empty = { firstName: "", lastName: "", email: "", role: "agent" as UserRole, password: "", confirm: "" };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof empty, string>>>({});
  const set = (p: Partial<typeof form>) => setForm(f => ({ ...f, ...p }));

  const passwordStrong = isStrongPassword(form.password);
  const passwordsMatch = form.password === form.confirm;

  const canSubmit =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.email.trim() &&
    form.role &&
    passwordStrong &&
    passwordsMatch &&
    !createUser.isPending;

  const handleSubmit = () => {
    const errs: typeof errors = {};
    if (!form.firstName.trim()) errs.firstName = "El nombre es obligatorio";
    if (!form.lastName.trim()) errs.lastName = "Los apellidos son obligatorios";
    if (!form.email.trim()) errs.email = "El email es obligatorio";
    if (!passwordStrong) errs.password = "La contraseña no cumple los requisitos";
    if (!passwordsMatch) errs.confirm = "Las contraseñas no coinciden";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});

    const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;
    createUser.mutate(
      { data: { name: fullName, email: form.email.trim(), role: form.role, password: form.password } },
      {
        onSuccess: (u) => {
          qc.invalidateQueries({ queryKey: ["/api/users"] });
          toast({ title: `Usuario "${u.name}" creado correctamente` });
          setForm(empty);
          onClose();
        },
        onError: () => toast({ variant: "destructive", title: "Error al crear el usuario. El email puede estar en uso." }),
      }
    );
  };

  const handleClose = () => { setForm(empty); setErrors({}); onClose(); };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <UserPlus className="w-4 h-4" style={{ color: "#C4793A" }} />
            Crear usuario
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Name + Last name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Nombre *</label>
              <Input
                placeholder="Ana"
                value={form.firstName}
                onChange={e => { set({ firstName: e.target.value }); setErrors(er => ({ ...er, firstName: undefined })); }}
                autoFocus
              />
              {errors.firstName && <p className="text-[11px] text-destructive mt-1">{errors.firstName}</p>}
            </div>
            <div>
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Apellidos *</label>
              <Input
                placeholder="García López"
                value={form.lastName}
                onChange={e => { set({ lastName: e.target.value }); setErrors(er => ({ ...er, lastName: undefined })); }}
              />
              {errors.lastName && <p className="text-[11px] text-destructive mt-1">{errors.lastName}</p>}
            </div>
          </div>

          {/* Email + Role */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Email *</label>
              <Input
                type="email"
                placeholder="ana@agencia.com"
                value={form.email}
                onChange={e => { set({ email: e.target.value }); setErrors(er => ({ ...er, email: undefined })); }}
              />
              {errors.email && <p className="text-[11px] text-destructive mt-1">{errors.email}</p>}
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Rol *</label>
              <Select value={form.role} onValueChange={v => set({ role: v as UserRole })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-[12px] font-medium" style={{ color: "#2D1F0E" }}>Contraseña *</label>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" side="right">
                  <p className="text-[12px] font-medium mb-2" style={{ color: "#2D1F0E" }}>Requisitos</p>
                  <PasswordRequirements password={form.password} />
                </PopoverContent>
              </Popover>
            </div>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => { set({ password: e.target.value }); setErrors(er => ({ ...er, password: undefined })); }}
            />
            {errors.password && <p className="text-[11px] text-destructive mt-1">{errors.password}</p>}
            {/* Live requirements bar */}
            {form.password && (
              <div className="mt-2 flex gap-1">
                {PASSWORD_RULES.map(r => (
                  <div
                    key={r.label}
                    className="flex-1 h-1 rounded-full transition-colors"
                    style={{ background: r.test(form.password) ? "#C4793A" : "#ECD5B8" }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Repetir contraseña *</label>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.confirm}
              onChange={e => { set({ confirm: e.target.value }); setErrors(er => ({ ...er, confirm: undefined })); }}
            />
            {form.confirm && !passwordsMatch && (
              <p className="text-[11px] text-destructive mt-1">Las contraseñas no coinciden</p>
            )}
            {form.confirm && passwordsMatch && form.confirm.length > 0 && (
              <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "#2E7D5A" }}>
                <Check className="w-3 h-3" /> Las contraseñas coinciden
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button
            disabled={!canSubmit}
            onClick={handleSubmit}
            style={{ background: "#C4793A", color: "#FAF2EB" }}
          >
            {createUser.isPending ? "Creando…" : "Crear usuario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit User Dialog ──────────────────────────────────────────────────────────

function EditUserDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const updateUser = useUpdateUser();
  const { user: me } = useAuth();

  // Split existing full name into first / last
  const [firstInit, ...restInit] = user.name.split(" ");
  const lastInit = restInit.join(" ");

  const [form, setForm] = useState({
    firstName: firstInit ?? "",
    lastName:  lastInit  ?? "",
    email:     user.email,
    role:      user.role,
    active:    user.active,
    password:  "",
    confirm:   "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const set = (p: Partial<typeof form>) => setForm(f => ({ ...f, ...p }));

  const isSelf = me?.id === user.id;

  // Password validation only when the user is setting a new one
  const changingPwd    = form.password.length > 0;
  const passwordStrong = changingPwd ? isStrongPassword(form.password) : true;
  const passwordsMatch = changingPwd ? form.password === form.confirm  : true;

  const canSave =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.email.trim() &&
    passwordStrong &&
    passwordsMatch &&
    !updateUser.isPending;

  const handleSave = () => {
    const errs: typeof errors = {};
    if (!form.firstName.trim()) errs.firstName = "El nombre es obligatorio";
    if (!form.lastName.trim())  errs.lastName  = "Los apellidos son obligatorios";
    if (!form.email.trim())     errs.email     = "El email es obligatorio";
    if (changingPwd && !passwordStrong) errs.password = "La contraseña no cumple los requisitos";
    if (changingPwd && !passwordsMatch) errs.confirm  = "Las contraseñas no coinciden";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});

    const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;
    const patch: Record<string, unknown> = {};
    if (fullName    !== user.name)   patch.name   = fullName;
    if (form.email  !== user.email)  patch.email  = form.email.trim();
    if (form.role   !== user.role)   patch.role   = form.role;
    if (form.active !== user.active) patch.active = form.active;
    if (changingPwd)                 patch.password = form.password;

    if (Object.keys(patch).length === 0) { onClose(); return; }

    updateUser.mutate(
      { userId: user.id, data: patch },
      {
        onSuccess: (u) => {
          qc.invalidateQueries({ queryKey: ["/api/users"] });
          toast({ title: `Usuario "${u.name}" actualizado` });
          onClose();
        },
        onError: () => toast({ variant: "destructive", title: "Error al actualizar el usuario" }),
      }
    );
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <Pencil className="w-4 h-4" style={{ color: "#3D2F6B" }} />
            Editar usuario
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Nombre + Apellidos */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Nombre *</label>
              <Input
                placeholder="Ana"
                value={form.firstName}
                autoFocus
                onChange={e => { set({ firstName: e.target.value }); setErrors(er => ({ ...er, firstName: undefined })); }}
              />
              {errors.firstName && <p className="text-[11px] text-destructive mt-1">{errors.firstName}</p>}
            </div>
            <div>
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Apellidos *</label>
              <Input
                placeholder="García López"
                value={form.lastName}
                onChange={e => { set({ lastName: e.target.value }); setErrors(er => ({ ...er, lastName: undefined })); }}
              />
              {errors.lastName && <p className="text-[11px] text-destructive mt-1">{errors.lastName}</p>}
            </div>
          </div>

          {/* Email + Rol */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Email *</label>
              <Input
                type="email"
                value={form.email}
                onChange={e => { set({ email: e.target.value }); setErrors(er => ({ ...er, email: undefined })); }}
              />
              {errors.email && <p className="text-[11px] text-destructive mt-1">{errors.email}</p>}
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Rol</label>
              <Select value={form.role} onValueChange={v => set({ role: v as UserRole })} disabled={isSelf}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isSelf && <p className="text-[11px] text-muted-foreground mt-1">No puedes cambiar tu propio rol</p>}
            </div>
          </div>

          {/* Estado */}
          <div>
            <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Estado</label>
            <Select value={form.active ? "active" : "inactive"} onValueChange={v => set({ active: v === "active" })} disabled={isSelf}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Nueva contraseña (opcional) */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <label className="text-[12px] font-medium" style={{ color: "#2D1F0E" }}>
                Nueva contraseña
              </label>
              <span className="text-[11px] text-muted-foreground">(dejar vacío para no cambiar)</span>
              {changingPwd && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" side="right">
                    <p className="text-[12px] font-medium mb-2" style={{ color: "#2D1F0E" }}>Requisitos</p>
                    <PasswordRequirements password={form.password} />
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => { set({ password: e.target.value, confirm: "" }); setErrors(er => ({ ...er, password: undefined, confirm: undefined })); }}
            />
            {errors.password && <p className="text-[11px] text-destructive mt-1">{errors.password}</p>}
            {changingPwd && (
              <div className="mt-2 flex gap-1">
                {PASSWORD_RULES.map(r => (
                  <div
                    key={r.label}
                    className="flex-1 h-1 rounded-full transition-colors"
                    style={{ background: r.test(form.password) ? "#C4793A" : "#ECD5B8" }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Confirmar contraseña — solo visible si se está cambiando */}
          {changingPwd && (
            <div>
              <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Repetir contraseña *</label>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={form.confirm}
                onChange={e => { set({ confirm: e.target.value }); setErrors(er => ({ ...er, confirm: undefined })); }}
              />
              {form.confirm && !passwordsMatch && (
                <p className="text-[11px] text-destructive mt-1">Las contraseñas no coinciden</p>
              )}
              {form.confirm && passwordsMatch && (
                <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "#2E7D5A" }}>
                  <Check className="w-3 h-3" /> Las contraseñas coinciden
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={!canSave}
            onClick={handleSave}
            style={{ background: "#3D2F6B", color: "white" }}
          >
            {updateUser.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Invite Travelers Dialog ───────────────────────────────────────────────────

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const invite = useSendInvitations();
  const { data: trips } = useListTrips();

  const [tripId, setTripId] = useState("");
  const [emails, setEmails] = useState("");

  const handleSend = () => {
    if (!tripId) { toast({ variant: "destructive", title: "Selecciona un viaje" }); return; }
    const list = emails.split(/[\n,]+/).map(e => e.trim()).filter(Boolean);
    if (!list.length) { toast({ variant: "destructive", title: "Introduce al menos un email" }); return; }
    invite.mutate(
      { tripId: parseInt(tripId), data: { emails: list } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["/api/trips"] });
          toast({ title: `${list.length} invitación${list.length > 1 ? "es" : ""} enviada${list.length > 1 ? "s" : ""}` });
          setTripId(""); setEmails(""); onClose();
        },
        onError: () => toast({ variant: "destructive", title: "Error al enviar invitaciones" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <Mail className="w-4 h-4" style={{ color: "#C4793A" }} />
            Invitar viajeros
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div>
            <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Viaje *</label>
            <Select value={tripId} onValueChange={setTripId}>
              <SelectTrigger><SelectValue placeholder="Selecciona un viaje" /></SelectTrigger>
              <SelectContent>
                {trips?.map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}{t.startDate ? ` · ${new Date(t.startDate).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[12px] font-medium block mb-1.5" style={{ color: "#2D1F0E" }}>Emails de los viajeros *</label>
            <Textarea
              placeholder={"ana@ejemplo.com\ncarlo@ejemplo.com"}
              rows={4}
              value={emails}
              onChange={e => setEmails(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground mt-1">Un email por línea o separados por coma</p>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={invite.isPending || !tripId || !emails.trim()}
            onClick={handleSend}
            style={{ background: "#C4793A", color: "#FAF2EB" }}
          >
            {invite.isPending ? "Enviando…" : "Enviar invitaciones"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── User Row ──────────────────────────────────────────────────────────────────

function UserRow({
  user, isAdmin, onEdit, avatarColor,
}: {
  user: User; isAdmin: boolean; onEdit: (u: User) => void; avatarColor: string;
}) {
  return (
    <tr className="border-b border-border/60 hover:bg-[#ECD5B8]/20 transition-colors group">
      <td className="px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium shrink-0"
            style={{ background: avatarColor, color: "#FAF2EB" }}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
          <span className="font-medium" style={{ color: "#2D1F0E" }}>{user.name}</span>
        </div>
      </td>
      <td className="px-5 py-3 text-muted-foreground">{user.email}</td>
      <td className="px-5 py-3"><RoleBadge role={user.role} /></td>
      <td className="px-5 py-3">
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium"
          style={{ background: user.active ? "#E4F3EC" : "#ECD5B8", color: user.active ? "#2E7D5A" : "#7A5C3A" }}
        >
          {user.active ? "Activo" : "Inactivo"}
        </span>
      </td>
      <td className="px-5 py-3 text-muted-foreground">{fmt(user.createdAt)}</td>
      {isAdmin && (
        <td className="px-5 py-3">
          <button
            onClick={() => onEdit(user)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-[6px] hover:bg-[#EAE6F5]"
            title="Editar usuario"
          >
            <Pencil className="w-3.5 h-3.5" style={{ color: "#3D2F6B" }} />
          </button>
        </td>
      )}
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Team() {
  const { data: users, isLoading } = useListUsers();
  const { user: me } = useAuth();
  const isAdmin = me?.role === "admin";

  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, query]);

  const staff     = filtered.filter(u => u.role !== "traveler");
  const travelers = filtered.filter(u => u.role === "traveler");

  const colHeaders = isAdmin
    ? ["Nombre", "Email", "Rol", "Estado", "Alta", ""]
    : ["Nombre", "Email", "Rol", "Estado", "Alta"];

  return (
    <div className="p-6 max-w-5xl space-y-5">
      {/* Dialogs */}
      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {editingUser && <EditUserDialog user={editingUser} onClose={() => setEditingUser(null)} />}
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium" style={{ color: "#2D1F0E" }}>Equipo</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestiona los miembros de la agencia</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium border transition-colors"
            style={{ borderColor: "#E5D4BF", color: "#7A5C3A", background: "white" }}
            onMouseOver={e => (e.currentTarget.style.background = "#FAF2EB")}
            onMouseOut={e => (e.currentTarget.style.background = "white")}
          >
            <Mail className="w-4 h-4" /> Invitar viajeros
          </button>
          {isAdmin && (
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors"
              style={{ background: "#C4793A", color: "#FAF2EB" }}
              onMouseOver={e => (e.currentTarget.style.background = "#8B4420")}
              onMouseOut={e => (e.currentTarget.style.background = "#C4793A")}
            >
              <Plus className="w-4 h-4" /> Crear usuario
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por nombre o email…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-[13px] rounded-[8px] border border-border bg-white focus:outline-none focus:ring-2 focus:ring-[#3D2F6B]/20 focus:border-[#3D2F6B]"
          style={{ color: "#2D1F0E" }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-[11px]"
          >
            ✕
          </button>
        )}
      </div>

      {/* Staff table */}
      <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>
            Personal de agencia <span className="text-muted-foreground font-normal">({staff.length})</span>
          </span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : !staff.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No hay personal registrado</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {colHeaders.map(h => (
                  <th
                    key={h}
                    className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider border-b border-border"
                    style={{ color: "#9C7A58", background: "#FAF2EB" }}
                  >{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map(u => (
                <UserRow key={u.id} user={u} isAdmin={isAdmin} onEdit={setEditingUser} avatarColor="#3D2F6B" />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Travelers table */}
      <div className="bg-card border border-border rounded-[14px] shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <span className="text-[13px] font-medium" style={{ color: "#2D1F0E" }}>
            Viajeros <span className="text-muted-foreground font-normal">({travelers.length})</span>
          </span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : !travelers.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aún no hay viajeros.{" "}
            <button className="font-medium hover:underline" style={{ color: "#C4793A" }} onClick={() => setInviteOpen(true)}>
              Invita a los primeros
            </button>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                {colHeaders.map(h => (
                  <th
                    key={h}
                    className="text-left px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider border-b border-border"
                    style={{ color: "#9C7A58", background: "#FAF2EB" }}
                  >{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {travelers.map(u => (
                <UserRow key={u.id} user={u} isAdmin={isAdmin} onEdit={setEditingUser} avatarColor="#C4793A" />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
