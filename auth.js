// auth.js - utilitários de autorização para incluir no frontend
// Incluir nas páginas: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
// e depois: <script src="auth.js"></script>
// Exemplo em páginas protegidas: <script> requireRole(['admin','teacher']); </script>
// Exemplo para ajustar visibilidade do menu: <script> applyUiVisibility(); </script>

const SUPABASE_URL = 'https://paadzisqttrkbscehcmh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FQsB5Jx26X9H6eD77heXtw_jzda0lcC';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Retorna a role do usuário atual.
 * Primeiro tenta ler do sessionStorage, caso não exista faz consulta à tabela profiles.
 * Retorna string role (ex: 'teacher', 'admin') ou null.
 */
async function getUserRole() {
  try {
    const cached = sessionStorage.getItem('user_role');
    if (cached) return cached;

    const { data: userData } = await supabaseClient.auth.getUser();
    const user = userData?.user;
    if (!user) return null;

    const { data: profile, error } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (error || !profile) return null;
    sessionStorage.setItem('user_role', profile.role);
    return profile.role;
  } catch (err) {
    console.error('getUserRole erro:', err);
    return null;
  }
}

/**
 * Exige que o usuário tenha uma das roles permitidas.
 * Se não tiver, redireciona para dashboard.html (ou outra página você preferir).
 * Uso: await requireRole(['admin','teacher']);
 */
async function requireRole(allowedRoles = []) {
  const role = await getUserRole();
  if (!role || !allowedRoles.includes(role)) {
    alert('Você não tem permissão para acessar esta página.');
    // Redireciona para dashboard ou para a página inicial
    window.location.href = 'dashboard.html';
  }
}

/**
 * Ajusta visibilidade do menu/links conforme role.
 * Esconde links de páginas às quais o usuário NÃO tem acesso.
 * Chamar no carregamento do dashboard ou de templates de sidebar.
 */
async function applyUiVisibility() {
  const role = await getUserRole();
  // Páginas que professores/admins devem ver:
  const teacherAllowed = ['cadastro.html', 'projetos.html', 'turmas.html'];
  if (!role) {
    // usuário não autenticado: esconder tudo sensível
    teacherAllowed.forEach(href => {
      document.querySelectorAll(`a[href="${href}"]`).forEach(el => el.style.display = 'none');
    });
    return;
  }

  if (!['admin', 'teacher'].includes(role)) {
    // Se não for admin/teacher, esconder links de cadastro/projetos/turmas
    teacherAllowed.forEach(href => {
      document.querySelectorAll(`a[href="${href}"]`).forEach(el => el.style.display = 'none');
    });
  } else {
    // se admin/teacher, garante que links estejam visíveis (caso tenham sido escondidos)
    teacherAllowed.forEach(href => {
      document.querySelectorAll(`a[href="${href}"]`).forEach(el => el.style.display = '');
    });
  }
}

/**
 * Logout - desconecta no Supabase e limpa dados locais
 */
async function logout() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) console.warn('Logout erro:', error.message);
  } catch (err) {
    console.warn('Logout exceção:', err);
  } finally {
    sessionStorage.removeItem('user_role');
    window.location.href = 'index.html';
  }
}

// Tornar funções globais para uso direto nos scripts das páginas
window.getUserRole = getUserRole;
window.requireRole = requireRole;
window.applyUiVisibility = applyUiVisibility;
window.logout = logout;

// Auto-aplica visibilidade quando este script for incluído (opcional, útil no dashboard)
document.addEventListener('DOMContentLoaded', () => {
  // Não faz redirect automático aqui — apenas ajusta UI
  applyUiVisibility().catch(err => console.warn('applyUiVisibility erro:', err));
});
