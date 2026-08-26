"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { KeyRound, Pencil, Plus, Power, PowerOff, Trash2, X } from "lucide-react";
import { apiUrl } from "@/lib/base-path";
import { initialsOf, toneOf } from "@/lib/format";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";
import {
  ALLOWED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  MIN_SELLER_LEVEL,
  PHOTO_ACCEPT_ATTRIBUTE,
  SELLER_LEVELS,
  formatBytes,
  validateSellerName,
} from "@/lib/seller-rules";

export type AdminSeller = {
  id: string;
  name: string;
  badgeNumber: string;
  level: number;
  photoUrl: string | null;
  description: string | null;
  queueStatus: string;
  active: boolean;
  user: { id: string; email: string; active: boolean; mustChangePassword: boolean } | null;
  photo: { mimeType: string; byteSize: number; updatedAt: string } | null;
};

export function SellersAdmin({ initialSellers }: { initialSellers: AdminSeller[] }) {
  const [sellers, setSellers] = useState(initialSellers);
  const [editing, setEditing] = useState<AdminSeller | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function reload() {
    const response = await fetch(apiUrl("/admin/sellers"));
    if (response.ok) setSellers(await response.json());
  }

  /** Devolve o corpo da resposta em caso de sucesso, ou `null` em caso de erro. */
  async function call(path: string, init: RequestInit, body?: FormData) {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(apiUrl(path), {
        ...init,
        // FormData define o próprio Content-Type, com o boundary do multipart.
        headers: body ? init.headers : { "Content-Type": "application/json", ...init.headers },
        body: body ?? init.body,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? "Não foi possível salvar.");
        return null;
      }

      const payload = await response.json().catch(() => ({}));
      await reload();
      return payload as Record<string, unknown>;
    } catch {
      setError("Falha de conexão com o servidor.");
      return null;
    } finally {
      setPending(false);
    }
  }

  /** Upload é uma segunda requisição: só existe depois que o vendedor tem id. */
  async function uploadPhoto(sellerId: string, file: File) {
    const form = new FormData();
    form.append("file", file);

    return call(`/admin/sellers/${sellerId}/photo`, { method: "POST" }, form);
  }

  async function toggleActive(seller: AdminSeller) {
    if (seller.active) {
      await call(`/admin/sellers/${seller.id}`, { method: "DELETE" });
      return;
    }

    await call(`/admin/sellers/${seller.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) });
  }

  function avatarOf(seller: AdminSeller) {
    if (!seller.photo) {
      return <div className={`seller-avatar ${toneOf(seller.badgeNumber)}`}>{initialsOf(seller.name)}</div>;
    }

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={`seller-avatar ${toneOf(seller.badgeNumber)} photo`}
        src={`${apiUrl(`/sellers/${seller.id}/photo`)}?v=${new Date(seller.photo.updatedAt).getTime()}`}
        alt=""
      />
    );
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">CADASTRO</p>
          <h1>Vendedores</h1>
          <p className="heading-subtitle">Cadastre, edite e desative os vendedores da operação.</p>
        </div>
        <button className="primary-button" onClick={() => setCreating(true)}>
          <Plus size={17} /> Novo vendedor
        </button>
      </section>

      {error && (
        <div className="alert" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Fechar aviso">
            <X size={15} />
          </button>
        </div>
      )}

      <div className="admin-table">
        {sellers.map((seller) => (
          <div className={`admin-row ${seller.active ? "" : "muted"}`} key={seller.id}>
            {avatarOf(seller)}
            <div className="seller-info">
              <strong>{seller.name}</strong>
              <span>
                {seller.badgeNumber} <b>·</b> nível {seller.level}
                {seller.user && (
                  <>
                    {" "}
                    <b>·</b> {seller.user.email}
                  </>
                )}
              </span>
            </div>
            {seller.user?.mustChangePassword && seller.active && (
              <span className="admin-badge pending" title="Ainda não trocou a senha definida pelo administrador">
                Senha provisória
              </span>
            )}
            <span className={`admin-badge ${seller.active ? "on" : "off"}`}>
              {seller.active ? "Ativo" : "Inativo"}
            </span>
            <button className="row-action" title="Editar" aria-label="Editar" onClick={() => setEditing(seller)}>
              <Pencil size={16} />
            </button>
            <button
              className="row-action"
              title={seller.active ? "Desativar" : "Reativar"}
              aria-label={seller.active ? "Desativar" : "Reativar"}
              disabled={pending}
              onClick={() => void toggleActive(seller)}
            >
              {seller.active ? <PowerOff size={16} /> : <Power size={16} />}
            </button>
          </div>
        ))}
        {sellers.length === 0 && <div className="empty-state">Nenhum vendedor cadastrado.</div>}
      </div>

      {creating && (
        <SellerDialog
          title="Novo vendedor"
          pending={pending}
          onClose={() => setCreating(false)}
          onSubmit={async (payload, file) => {
            const created = await call("/admin/sellers", { method: "POST", body: JSON.stringify(payload) });
            if (!created) return;

            if (file && typeof created.id === "string") {
              const uploaded = await uploadPhoto(created.id, file);
              if (!uploaded) return; // vendedor criado, foto não: o aviso já está na tela
            }

            setCreating(false);
          }}
        />
      )}

      {editing && (
        <SellerDialog
          title={`Editar ${editing.name}`}
          seller={editing}
          pending={pending}
          onClose={() => setEditing(null)}
          onSubmit={async (payload, file) => {
            const saved = await call(`/admin/sellers/${editing.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            });
            if (!saved) return;

            if (file) {
              const uploaded = await uploadPhoto(editing.id, file);
              if (!uploaded) return;
            }

            setEditing(null);
          }}
          onRemovePhoto={async () => {
            await call(`/admin/sellers/${editing.id}/photo`, { method: "DELETE" });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function SellerDialog({
  title,
  seller,
  pending,
  onClose,
  onSubmit,
  onRemovePhoto,
}: {
  title: string;
  seller?: AdminSeller;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>, file: File | null) => void;
  onRemovePhoto?: () => void;
}) {
  const isEdit = Boolean(seller);
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState(seller?.photoUrl ?? "");

  // A URL de objeto é criada no handler (não em effect) e revogada ao trocar de
  // arquivo ou ao desmontar — senão o blob fica preso na memória da aba.
  const previewRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  function showPreview(selected: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = selected ? URL.createObjectURL(selected) : null;
    setPreview(previewRef.current);
  }

  function pickFile(selected: File | null) {
    setFormError(null);

    if (!selected) {
      setFile(null);
      showPreview(null);
      return;
    }

    // Checagem local só para dar resposta imediata; o servidor revalida pelo
    // conteúdo do arquivo, que é o que vale.
    if (selected.size > MAX_PHOTO_BYTES) {
      setFormError(`A imagem tem ${formatBytes(selected.size)} e o limite é ${formatBytes(MAX_PHOTO_BYTES)}.`);
      setFile(null);
      showPreview(null);
      return;
    }

    if (!ALLOWED_PHOTO_TYPES.includes(selected.type as (typeof ALLOWED_PHOTO_TYPES)[number])) {
      setFormError("Envie uma imagem PNG, JPEG, WebP ou GIF.");
      setFile(null);
      showPreview(null);
      return;
    }

    setFile(selected);
    showPreview(selected);
    setPhotoUrl("");
  }

  // Acesso ao sistema é opcional: um vendedor pode existir só para a fila.
  // Mas se o admin informar e-mail, a senha provisória passa a ser obrigatória.
  const wantsLogin = !isEdit && email.trim().length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);

    const name = String(form.get("name") ?? "");
    const nameCheck = validateSellerName(name);
    if (!nameCheck.ok) {
      setFormError(nameCheck.error);
      return;
    }

    const payload: Record<string, unknown> = {
      name: nameCheck.value,
      badgeNumber: String(form.get("badgeNumber") ?? ""),
      level: Number(form.get("level") ?? MIN_SELLER_LEVEL),
      description: String(form.get("description") ?? ""),
      // Um upload nesta submissão substitui a URL: o servidor zera a outra ponta.
      photoUrl: file ? "" : photoUrl.trim(),
    };

    const password = String(form.get("password") ?? "");
    const typedEmail = String(form.get("email") ?? "").trim();

    if (!isEdit && typedEmail && !password) {
      setFormError("Informe a senha provisória para o e-mail de acesso.");
      return;
    }

    if (!isEdit && password && !typedEmail) {
      setFormError("Informe o e-mail de acesso para poder definir uma senha.");
      return;
    }

    if (password) payload.password = password;
    if (!isEdit && typedEmail) payload.email = typedEmail;

    onSubmit(payload, file);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="profile-modal dialog form-dialog" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <button className="modal-close" type="button" onClick={onClose}>
          <X size={18} />
        </button>
        <h2>{title}</h2>

        <label htmlFor="name">Nome</label>
        <input id="name" name="name" defaultValue={seller?.name} required />

        <label htmlFor="badgeNumber">Crachá</label>
        <input id="badgeNumber" name="badgeNumber" defaultValue={seller?.badgeNumber} required />

        <label htmlFor="level">Nível</label>
        <select id="level" name="level" defaultValue={seller?.level ?? MIN_SELLER_LEVEL} required>
          {SELLER_LEVELS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <label htmlFor="description">Descrição</label>
        <textarea id="description" name="description" rows={2} defaultValue={seller?.description ?? ""} />

        <label htmlFor="photoUrl">Foto</label>
        <input
          id="photoUrl"
          name="photoUrl"
          placeholder="https://..."
          value={photoUrl}
          disabled={Boolean(file)}
          onChange={(event) => setPhotoUrl(event.target.value)}
        />

        <div className="photo-field">
          <input
            id="photoFile"
            type="file"
            accept={PHOTO_ACCEPT_ATTRIBUTE}
            onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
          />
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="photo-preview" src={preview} alt="Prévia da foto escolhida" />
          )}
          {!preview && seller?.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="photo-preview"
              src={`${apiUrl(`/sellers/${seller.id}/photo`)}?v=${new Date(seller.photo.updatedAt).getTime()}`}
              alt="Foto salva"
            />
          )}
        </div>
        <p className="field-hint">
          Cole uma URL ou envie um arquivo — o que for enviado substitui o outro. PNG, JPEG, WebP ou GIF,
          até {formatBytes(MAX_PHOTO_BYTES)}.
          {seller?.photo && ` Salva no banco: ${formatBytes(seller.photo.byteSize)}.`}
        </p>

        {seller?.photo && onRemovePhoto && (
          <button className="secondary-button" type="button" disabled={pending} onClick={onRemovePhoto}>
            <Trash2 size={15} /> Remover foto salva
          </button>
        )}

        {!isEdit && (
          <>
            <label htmlFor="email">E-mail de acesso (opcional)</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </>
        )}

        {(!isEdit || seller?.user) && (
          <>
            <label htmlFor="password">
              <KeyRound size={13} /> {isEdit ? "Nova senha (deixe vazio para manter)" : "Senha de acesso"}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required={wantsLogin}
            />
            <p className="field-hint">
              Esta senha é provisória: no primeiro acesso o vendedor será obrigado a definir a dele.
              {isEdit && " Redefinir aqui encerra as sessões abertas dele."}
            </p>
          </>
        )}

        {formError && <p className="login-error">{formError}</p>}

        <button className="primary-button full" type="submit" disabled={pending}>
          Salvar
        </button>
      </form>
    </div>
  );
}
