const { createClient } = require("@supabase/supabase-js");

let cachedClient = null;

/** A integração Supabase do Vercel injeta nomes diferentes; aceitamos todos. */
function resolveUrl() {
  return (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_PROJECT_URL ||
    ""
  );
}

function resolveKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_KEY ||
    ""
  );
}

/**
 * Identifica o TIPO da chave sem expor o valor — só isso já diz se o
 * "permission denied" vem de estar usando uma chave pública.
 */
function describeKey(key) {
  if (!key) return "ausente";
  if (key.startsWith("sb_secret_")) return "secret (ok)";
  if (key.startsWith("sb_publishable_")) return "publishable (INVALIDA: use a secret)";
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
      const role = String(payload.role || "");
      if (role === "service_role") return "service_role (ok)";
      if (role) return `${role} (INVALIDA: use a service_role)`;
    } catch {
      // Chave não decodificável: cai no retorno genérico.
    }
  }
  return "formato desconhecido";
}

/** Status da configuração para o /api/health (nunca inclui a chave). */
function getSupabaseStatus() {
  const url = resolveUrl();
  const key = resolveKey();
  return {
    urlConfigurada: Boolean(url),
    urlHost: url ? String(url).replace(/^https?:\/\//, "").split("/")[0] : null,
    tipoDaChave: describeKey(key),
    variaveisEncontradas: [
      process.env.SUPABASE_URL ? "SUPABASE_URL" : null,
      process.env.NEXT_PUBLIC_SUPABASE_URL ? "NEXT_PUBLIC_SUPABASE_URL" : null,
      process.env.SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY" : null,
      process.env.SUPABASE_SECRET_KEY ? "SUPABASE_SECRET_KEY" : null,
      process.env.SUPABASE_KEY ? "SUPABASE_KEY" : null,
    ].filter(Boolean),
  };
}

/**
 * Cliente Supabase usando a service_role key (server-side apenas).
 * A service_role ignora RLS, por isso NUNCA deve ir para o frontend.
 * Criado sob demanda para não quebrar o boot quando as envs ainda não existem.
 */
function getSupabase() {
  if (cachedClient) return cachedClient;

  const url = resolveUrl();
  const serviceKey = resolveKey();

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  cachedClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cachedClient;
}

module.exports = { getSupabase, getSupabaseStatus };
