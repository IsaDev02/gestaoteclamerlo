/**
 * senha_alteracao.js
 * Pede a senha antes de qualquer alteração em fichas de alunos.
 *
 * Uso:
 *   if (!(await exigirSenha())) return;   // dentro de uma função async
 *
 * A senha NÃO fica em texto puro no código: só o hash SHA-256 dela.
 * (Ainda assim é uma proteção de interface — veja a observação de segurança.)
 */
const SENHA_HASH_SHA256 = '896ec6aed8f2351569cac066d3f7a030dd1444b4d71de15d2bae325fc0f91e30';

async function _sha256(texto) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function exigirSenha(mensagem) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif;';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:12px;padding:28px;width:360px;max-width:92vw;box-shadow:0 20px 40px rgba(0,0,0,.25);">
                <h5 style="margin:0 0 6px;font-weight:700;color:#1e293b;">🔒 Autorização necessária</h5>
                <p style="margin:0 0 16px;font-size:.88rem;color:#64748b;">${mensagem || 'Digite a senha para alterar os dados do aluno.'}</p>
                <input type="password" id="_senhaInput" placeholder="Senha" autocomplete="off"
                       style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:.95rem;box-sizing:border-box;">
                <div id="_senhaErro" style="color:#dc3545;font-size:.8rem;margin-top:6px;min-height:18px;"></div>
                <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
                    <button type="button" id="_senhaCancelar" style="padding:8px 16px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:8px;cursor:pointer;">Cancelar</button>
                    <button type="button" id="_senhaOk" style="padding:8px 18px;border:none;background:#3b82f6;color:#fff;font-weight:600;border-radius:8px;cursor:pointer;">Confirmar</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('#_senhaInput');
        const erro = overlay.querySelector('#_senhaErro');
        input.focus();

        const fechar = (ok) => { overlay.remove(); resolve(ok); };

        async function confirmar() {
            const hash = await _sha256(input.value);
            if (hash === SENHA_HASH_SHA256) {
                fechar(true);
            } else {
                erro.textContent = 'Senha incorreta.';
                input.value = '';
                input.focus();
            }
        }

        overlay.querySelector('#_senhaOk').onclick = confirmar;
        overlay.querySelector('#_senhaCancelar').onclick = () => fechar(false);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmar();
            if (e.key === 'Escape') fechar(false);
        });
    });
}
