"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, ImageUp, KeyRound, Save, Star, Store, Trash2 } from "lucide-react";
import { apiUrl } from "@/lib/base-path";
import type { ProfileView } from "@/lib/profile";
import {
  ALLOWED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  PHOTO_ACCEPT_ATTRIBUTE,
  formatBytes,
} from "@/lib/seller-rules";

const MAX_DESCRIPTION = 400;

const STATUS_LABELS: Record<string, string> = {
  fila: "Na fila",
  atendimento: "Em atendimento",
  fora: "Fora do turno",
};

export function ProfileForm({ profile }: { profile: ProfileView }) {
  const router = useRouter();
  const [description, setDescription] = useState(profile.description);
  const [photoUrl, setPhotoUrl] = useState(profile.externalPhotoUrl);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    setError(null);
    setMessage(null);

    if (!selected) {
      setFile(null);
      showPreview(null);
      return;
    }

    if (selected.size > MAX_PHOTO_BYTES) {
      setError(`A imagem tem ${formatBytes(selected.size)} e o limite é ${formatBytes(MAX_PHOTO_BYTES)}.`);
      setFile(null);
      showPreview(null);
      return;
    }

    if (!ALLOWED_PHOTO_TYPES.includes(selected.type as (typeof ALLOWED_PHOTO_TYPES)[number])) {
      setError("Envie uma imagem PNG, JPEG, WebP ou GIF.");
      setFile(null);
      showPreview(null);
      return;
    }

    setFile(selected);
    showPreview(selected);
    setPhotoUrl("");
  }

  async function send(path: string, init: RequestInit, body?: FormData) {
    const response = await fetch(apiUrl(path), {
      ...init,
      headers: body ? init.headers : { "Content-Type": "application/json", ...init.headers },
      body: body ?? init.body,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? "Não foi possível salvar.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);

    try {
      await send("/perfil", {
        method: "PATCH",
        body: JSON.stringify({ description, photoUrl: file ? "" : photoUrl.trim() }),
      });

      if (file) {
        const form = new FormData();
        form.append("file", file);
        await send("/perfil/photo", { method: "POST" }, form);
        setFile(null);
        showPreview(null);
      }

      setMessage("Perfil atualizado.");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar.");
    } finally {
      setPending(false);
    }
  }

  async function removePhoto() {
    setError(null);
    setMessage(null);
    setPending(true);

    try {
      await send("/perfil/photo", { method: "DELETE" });
      setFile(null);
      showPreview(null);
      setMessage("Foto removida.");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível remover.");
    } finally {
      setPending(false);
    }
  }

  const currentPhoto = preview ?? profile.photoUrl;
  const remaining = MAX_DESCRIPTION - description.length;

  return (
    <form className="profile-page" onSubmit={handleSubmit}>
      <section className="profile-hero">
        <Photo photo={currentPhoto} initials={profile.initials} tone={profile.tone} />

        <div className="profile-hero-info">
          <p className="eyebrow">MEU PERFIL</p>
          <h1>{profile.name}</h1>
          <p className="profile-email">{profile.email}</p>

          <div className="profile-badges">
            <span className="profile-badge role">{profile.role}</span>
            {profile.seller && (
              <>
                <span className="profile-badge">
                  <Store size={13} /> {profile.seller.storeName}
                </span>
                <span className="profile-badge">
                  <BadgeCheck size={13} /> Crachá {profile.seller.badgeNumber}
                </span>
                <span className="profile-badge">
                  <Star size={13} /> Nível {profile.seller.level}
                </span>
                <span className={`profile-badge status ${profile.seller.status}`}>
                  {STATUS_LABELS[profile.seller.status]}
                </span>
              </>
            )}
          </div>
        </div>

        <Link className="ghost-button profile-password" href="/trocar-senha">
          <KeyRound size={15} /> Alterar senha
        </Link>
      </section>

      {profile.seller && (
        <section className="metric-grid profile-metrics">
          <Metric label="Atendimentos hoje" value={profile.seller.calls} />
          <Metric label="Vendas hoje" value={profile.seller.sales} />
          <Metric label="Conversão" value={profile.seller.conversion} />
        </section>
      )}

      <div className="profile-columns">
        <section className="profile-card">
          <h2>Foto</h2>
          <p className="card-hint">
            {profile.seller
              ? "É a foto que aparece na fila para a equipe."
              : "Aparece no seu avatar, no topo e no menu."}
          </p>

          <label className="file-drop">
            <ImageUp size={18} />
            <span>{file ? file.name : "Escolher imagem"}</span>
            <input
              type="file"
              accept={PHOTO_ACCEPT_ATTRIBUTE}
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <p className="field-hint">PNG, JPEG, WebP ou GIF, até {formatBytes(MAX_PHOTO_BYTES)}.</p>

          <label htmlFor="photoUrl">Ou uma URL de imagem</label>
          <input
            id="photoUrl"
            placeholder="https://..."
            value={photoUrl}
            disabled={Boolean(file)}
            onChange={(event) => setPhotoUrl(event.target.value)}
          />

          {(profile.hasUpload || file) && (
            <button className="secondary-button inline" type="button" disabled={pending} onClick={removePhoto}>
              <Trash2 size={15} /> Remover foto
            </button>
          )}
        </section>

        <section className="profile-card">
          <h2>Descrição</h2>
          <p className="card-hint">
            {profile.seller
              ? "Aparece no seu cartão quando alguém abre o seu perfil na fila."
              : "Uma linha sobre você para quem abrir o seu perfil."}
          </p>

          <textarea
            id="description"
            rows={6}
            maxLength={MAX_DESCRIPTION}
            placeholder={profile.seller ? "Conte como você atende." : "Conte o que você faz na operação."}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <p className="field-hint counter">{remaining} caracteres restantes</p>

          <p className="field-hint">
            Nome e e-mail não são editáveis aqui.{" "}
            {profile.seller
              ? "Nome, crachá e nível ficam com a supervisão."
              : "Fale com quem cadastrou a sua conta."}
          </p>
        </section>
      </div>

      {error && <p className="login-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}

      <div className="profile-save">
        <button className="primary-button" type="submit" disabled={pending}>
          <Save size={16} /> {pending ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}

function Photo({ photo, initials, tone }: { photo: string | null; initials: string; tone: string }) {
  // Sem next/image de propósito: a foto vem de rota autenticada, e o otimizador
  // do Next a buscaria a partir do servidor, sem o cookie — levaria 401.
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="profile-photo" src={photo} alt="Sua foto" />;
  }

  return <div className={`profile-photo placeholder ${tone}`}>{initials}</div>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
    </div>
  );
}
