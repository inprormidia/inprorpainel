// Edge Function: convida um membro da equipe por e-mail.
//
// Roda no servidor porque usa a chave de servico do Supabase, que
// jamais pode ficar no frontend. Ela:
//   1. confere se quem chamou e admin
//   2. envia o convite por e-mail (a pessoa define a propria senha)
//   3. grava o papel agency e liga o login ao membro da equipe
//
// Deploy:
//   supabase functions deploy convidar-membro
//
// A funcao usa as variaveis que o proprio Supabase injeta
// (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY), nao e preciso configurar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const url        = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey    = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1. quem esta chamando precisa ser admin
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Sem credenciais." }, 401);

    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await asCaller.auth.getUser();
    if (userErr || !user) return json({ error: "Sessao invalida." }, 401);

    const { data: papel } = await asCaller
      .from("user_roles").select("role").eq("user_id", user.id).single();
    if (papel?.role !== "admin")
      return json({ error: "Apenas o administrador pode convidar." }, 403);

    // 2. dados do convite
    const { email, member_id, redirect_to } = await req.json();
    if (!email || !member_id)
      return json({ error: "Informe o e-mail e o membro." }, 400);

    const admin = createClient(url, serviceKey);

    // o membro precisa existir
    const { data: membro } = await admin
      .from("team_members").select("id,name,user_id").eq("id", member_id).single();
    if (!membro) return json({ error: "Membro nao encontrado." }, 404);
    if (membro.user_id) return json({ error: "Este membro ja tem acesso." }, 409);

    // 3. convite por e-mail
    const { data: convite, error: inviteErr } = await admin.auth.admin
      .inviteUserByEmail(email, {
        redirectTo: redirect_to ?? undefined,
        data: { name: membro.name },
      });

    let novoUserId = convite?.user?.id ?? null;

    // se a pessoa ja tem conta, aproveita o usuario existente
    if (inviteErr) {
      const jaExiste = /already been registered|already exists/i.test(inviteErr.message);
      if (!jaExiste) return json({ error: inviteErr.message }, 400);

      const { data: lista } = await admin.auth.admin.listUsers();
      novoUserId = lista?.users.find(
        u => u.email?.toLowerCase() === String(email).toLowerCase())?.id ?? null;
      if (!novoUserId) return json({ error: "Nao foi possivel localizar o usuario." }, 400);
    }

    // 4. papel de equipe e vinculo com o membro
    const { error: papelErr } = await admin.from("user_roles")
      .upsert({ user_id: novoUserId, role: "agency", client_id: null },
              { onConflict: "user_id" });
    if (papelErr) return json({ error: papelErr.message }, 400);

    const { error: vinculoErr } = await admin.from("team_members")
      .update({ user_id: novoUserId, email }).eq("id", member_id);
    if (vinculoErr) return json({ error: vinculoErr.message }, 400);

    return json({
      ok: true,
      user_id: novoUserId,
      reenviado: !!inviteErr,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
