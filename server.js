const express = require('express');
const app = express();
const authRoutes = require('./auth'); // Arquivo auth.js
const protectedRoutes = require('./routes'); // Arquivo routes.js (para rotas protegidas)

const PORT = 3000; // Escolha uma porta para rodar o servidor

// Middleware para receber JSON no corpo das requisições
app.use(express.json());

// Rota de login (não protegida)
app.use('/auth', authRoutes); // Todas as rotas de login estarão em /auth

// Rotas protegidas
app.use('/api', protectedRoutes); // Rota base para APIs protegidas

// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
