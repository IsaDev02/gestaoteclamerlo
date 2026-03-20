const express = require('express');
const router = express.Router();
const autenticarToken = require('./authMiddleware');

// Exemplo de rota protegida
router.get('/cadastro', autenticarToken, (req, res) => {
    // Apenas usuários autenticados podem acessar esta rota
    const { role } = req.user;

    if (role !== 'admin') { // Bloqueando para usuários que não são admin
        return res.status(403).json({ message: 'Acesso restrito ao administrador.' });
    }

    res.json({ message: 'Acesso permitido à tela de Cadastro.' });
});

module.exports = router;
