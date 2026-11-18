// Configuração do Supabase — preencha com os dados do seu projeto
// (Supabase → Project Settings → API). A "anon public key" pode ficar
// pública: quem protege os dados são as regras do arquivo supabase.sql.
window.IBIUNA_CONFIG = {
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'COLE-AQUI-A-ANON-PUBLIC-KEY',
  // Domínio usado internamente para transformar a matrícula em login.
  // Não precisa existir nem receber e-mails.
  DOMINIO_LOGIN: 'usuarios.pedreiraibiuna.com.br'
};
