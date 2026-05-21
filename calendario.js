/**
 * CALENDÁRIO COM ANIVERSÁRIOS E FERIADOS
 * Marca em azul: Aniversários dos alunos
 * Marca em verde: Feriados do mês
 */

// Feriados brasileiros fixos e móveis (adaptados para 2024-2026)
const FERIADOS_BRASIL = {
    '2024': {
        '01-01': 'Ano Novo',
        '02-13': 'Terça de Carnaval',
        '02-14': 'Quarta de Cinzas',
        '02-15': 'Quinta-feira de Carnaval',
        '03-29': 'Sexta-feira Santa',
        '04-21': 'Tiradentes',
        '05-01': 'Dia do Trabalho',
        '05-30': 'Corpus Christi',
        '09-07': 'Independência',
        '10-12': 'Nossa Senhora Aparecida',
        '11-02': 'Finados',
        '11-15': 'Proclamação da República',
        '11-20': 'Consciência Negra',
        '12-25': 'Natal'
    },
    '2025': {
        '01-01': 'Ano Novo',
        '03-04': 'Terça de Carnaval',
        '03-05': 'Quarta de Cinzas',
        '03-06': 'Quinta-feira de Carnaval',
        '04-18': 'Sexta-feira Santa',
        '04-21': 'Tiradentes',
        '05-01': 'Dia do Trabalho',
        '05-22': 'Corpus Christi',
        '09-07': 'Independência',
        '10-12': 'Nossa Senhora Aparecida',
        '11-02': 'Finados',
        '11-15': 'Proclamação da República',
        '11-20': 'Consciência Negra',
        '12-25': 'Natal'
    },
    '2026': {
        '01-01': 'Ano Novo',
        '02-17': 'Terça de Carnaval',
        '02-18': 'Quarta de Cinzas',
        '02-19': 'Quinta-feira de Carnaval',
        '04-10': 'Sexta-feira Santa',
        '04-21': 'Tiradentes',
        '05-01': 'Dia do Trabalho',
        '06-11': 'Corpus Christi',
        '09-07': 'Independência',
        '10-12': 'Nossa Senhora Aparecida',
        '11-02': 'Finados',
        '11-15': 'Proclamação da República',
        '11-20': 'Consciência Negra',
        '12-25': 'Natal'
    }
};

// Função para obter feriados de um mês/ano
function obterFeriadosMes(mes, ano) {
    const feriadosMes = {};
    const anoStr = String(ano);
    
    if (FERIADOS_BRASIL[anoStr]) {
        Object.entries(FERIADOS_BRASIL[anoStr]).forEach(([data, nome]) => {
            const [m, d] = data.split('-');
            if (parseInt(m) === mes + 1) { // mes vem como 0-11
                feriadosMes[parseInt(d)] = nome;
            }
        });
    }
    
    return feriadosMes;
}

// Função para extrair dia/mês dos aniversários
function obterAniversariosMes(alunos, mes, ano) {
    const aniversariosMes = {};
    
    alunos.forEach(aluno => {
        if (aluno.data_nascimento) {
            try {
                const data = new Date(aluno.data_nascimento + 'T00:00:00');
                if (data.getMonth() === mes && data.getFullYear() <= ano) {
                    const dia = data.getDate();
                    if (!aniversariosMes[dia]) {
                        aniversariosMes[dia] = [];
                    }
                    aniversariosMes[dia].push(aluno.nome || 'Aluno');
                }
            } catch (e) {
                // ignorar datas inválidas
            }
        }
    });
    
    return aniversariosMes;
}

// Função principal para renderizar o calendário
function renderizarCalendario(alunos) {
    const hoje = new Date();
    const mes = hoje.getMonth();
    const ano = hoje.getFullYear();
    
    // Obter dados do mês
    const feriadosMes = obterFeriadosMes(mes, ano);
    const aniversariosMes = obterAniversariosMes(alunos, mes, ano);
    
    // Criar HTML do calendário
    const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const nomeSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    
    let html = `
        <div class="calendario-header">
            <div class="calendario-titulo">${nomesMeses[mes]} ${ano}</div>
        </div>
        <div class="calendario-semana">
    `;
    
    // Cabeçalho com dias da semana
    nomeSemana.forEach(dia => {
        html += `<div class="calendario-dia-semana">${dia}</div>`;
    });
    html += `</div><div class="calendario-grid">`;
    
    // Primeiros dias vazios
    const primeiroDia = new Date(ano, mes, 1).getDay();
    for (let i = 0; i < primeiroDia; i++) {
        html += `<div class="calendario-dia-vazio"></div>`;
    }
    
    // Dias do mês
    const diasMes = new Date(ano, mes + 1, 0).getDate();
    for (let dia = 1; dia <= diasMes; dia++) {
        let classe = 'calendario-dia';
        let conteudo = dia;
        let tooltip = '';
        
        // Verificar se é hoje
        if (dia === hoje.getDate()) {
            classe += ' hoje';
        }
        
        // Verificar se é feriado
        if (feriadosMes[dia]) {
            classe += ' feriado';
            tooltip = `title="${feriadosMes[dia]}"`;
        }
        
        // Verificar se há aniversário
        if (aniversariosMes[dia]) {
            classe += ' aniversario';
            const nomes = aniversariosMes[dia].join(', ');
            tooltip = `title="🎂 ${nomes}"`;
        }
        
        html += `<div class="${classe}" ${tooltip}>${conteudo}</div>`;
    }
    
    html += `</div>`;
    
    return html;
}

// Legendas do calendário
function obterLegendaCalendario() {
    return `
        <div class="calendario-legenda">
            <div class="legenda-item">
                <span class="legenda-ponto aniversario"></span>
                <span class="legenda-texto">Aniversário</span>
            </div>
            <div class="legenda-item">
                <span class="legenda-ponto feriado"></span>
                <span class="legenda-texto">Feriado</span>
            </div>
        </div>
    `;
}
