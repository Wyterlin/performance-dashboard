const { createClient } = require("@supabase/supabase-js");

let cachedClient = null;

/**
 * Cliente Supabase usando a service_role key (server-side apenas).
 * A service_role ignora RLS, por isso NUNCA deve ir para o frontend.
 * Criado sob demanda para não quebrar o boot quando as envs ainda não existem.
 */
function getSupabase() {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL || "";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";

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

module.exports = { getSupabase };
