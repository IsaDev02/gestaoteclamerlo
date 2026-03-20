const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Conexão com o banco de dados
const db = require('./db'); // Certifique-se de ter configurado seu arquivo de conexão ao banco

// Segredo para gerar o token JWT (use uma variável de ambiente em produção)
const JWT_SECRET = 'segredo_super_seguros';

// Endpoint de login
router.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    try {
        // Verifique se o usuário existe no banco
        const userResult = await db.query('SELECT * FROM USUARIOS WHERE email = $1', [email]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Email ou senha inválidos' });
        }

        const usuario = userResult.rows[0];

        // Verifique a senha
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) {
            return res.status(401).json({ message: 'Email ou senha inválidos' });
        }

        // Gere o token JWT
        const token = jwt.sign(
            { id: usuario.id, role: usuario.role },
            JWT_SECRET, // Chave secreta para assinar o token
            { expiresIn: '8h' } // Tempo de expiração do token (8 horas)
        );

        return res.json({
            message: 'Login realizado com sucesso',
            token: token, // O cliente pode armazenar este token no navegador
            role: usuario.role // Enviamos a role para controle no cliente
        });
    } catch (error) {
        console.error('Erro ao realizar login:', error.message);
        return res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

module.exports = router;
