"use server";
import fs from "fs";
import path from "path";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin-helper";

export async function getAgentsStatus() {
  // Verificação de segurança (Admin apenas)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user || !isAdminEmail(user.email)) {
    return { success: false, error: "Acesso negado. Apenas administradores podem ver o monitor de agentes." };
  }

  const baseDir = process.env.AGENTS_STATE_PATH || path.join(process.cwd(), "equipe de agentes");
  const stateFile = path.join(baseDir, "atividades.json");
  const lockFile = path.join(baseDir, ".trava");

  try {
    const data = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    const hasLock = fs.existsSync(lockFile);
    let lockPid = null;
    if (hasLock) {
      lockPid = fs.readFileSync(lockFile, "utf-8").trim();
    }

    return {
      success: true,
      data: {
        ...data,
        hasLock,
        lockPid,
      }
    };
  } catch (error) {
    console.error("Erro ao ler status dos agentes:", error);
    return { success: false, error: "Falha ao ler o arquivo de atividades." };
  }
}

export async function resetAgentLock() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user || !isAdminEmail(user.email)) {
    return { success: false, error: "Acesso negado." };
  }

  const baseDir = process.env.AGENTS_STATE_PATH || path.join(process.cwd(), "equipe de agentes");
  const lockFile = path.join(baseDir, ".trava");

  try {
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
    }
    return { success: true };
  } catch (error) {
    console.error("Erro ao resetar trava:", error);
    return { success: false, error: "Falha ao remover a trava." };
  }
}
