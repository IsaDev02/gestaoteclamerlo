const jwt = require('jsonwebtoken');
const JWT_SECRET = 'segredo_super_seguros'; // Use a mesma chave secreta

// Middleware para validar o token
const autenticarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).json({ message: 'Acesso negado. Token não fornecido.' });
    }

    const token = authHeader.split(' ')[1]; // Verifica o formato 'Bearer TOKEN'
    if (!token) {
        return res.status(401).json({ message: 'Acesso negado. Token inválido.' });
    }

    try {
        const usuario = jwt.verify(token, JWT_SECRET); // Verifica e decodifica o token
        req.user = usuario; // Adiciona os dados do usuário à requisição
        next(); // Permite o acesso à rota
    } catch (error) {
        return res.status(403).json({ message: 'Token inválido ou expirado.' });
    }
};

module.exports = autenticarToken;
