const app = require('./config/conf');
const connection = require('./config/db');

app.get('/', (req, res) => {
    res.render('login');
})

app.post('/enviaLogin', (req, res) => {
  const { login, senha, perfil } = req.body;

  let tabela;
  if (perfil === 'professor') {
    tabela = 'professor';
  } else if (perfil === 'aluno') {
    tabela = 'aluno';
  } else {
    return res.status(400).send('Perfil inválido');
  }

  const sql = `SELECT * FROM ?? WHERE email_edu = ? AND senha = ?`;
  connection.query(sql, [tabela, login, senha], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Erro no servidor.');
    }

    if (results.length > 0) {
      const user = results[0];

      // Salva os dados do usuário na sessão
      if (perfil === 'professor') {
        req.session.user = {
          perfil,
          nome: user.nome,
          email_edu: user.email_edu,
          id_professor: user.ID_professor
        };
        return res.redirect('/pdashboard');
      } else {
        req.session.user = {
          perfil,
          nome: user.nome,
          email_edu: user.email_edu
        };
        return res.redirect('/adashboard');
      }
    } else {
      return res.status(401).send('Login ou senha inválidos.');
    }
  });
});

app.post('/cadastrarUsuario', (req, res) => {
  const { nome, email_edu, matricula, data_nascimento, curso, senha, confirmar_senha } = req.body;

  // Verifica se senha e confirmação são iguais
  if (senha !== confirmar_senha) {
    return res.status(400).send('As senhas não coincidem.');
  }

  const sql = `INSERT INTO aluno (nome, email_edu, matricula, nascimento, curso, senha, coins)
               VALUES (?, ?, ?, ?, ?, ?, 0)`;

  const values = [nome, email_edu, matricula, data_nascimento, curso, senha];

  connection.query(sql, values, (error, results) => {
    if (error) {
      console.error('Erro ao cadastrar aluno:', error);
      return res.status(500).send('Erro ao cadastrar. Tente novamente.');
    }

    // Redireciona para login após cadastro
    res.redirect('/');
  });
});


app.get('/adashboard', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'aluno') {
    return res.redirect('/');
  }
  const email = req.session.user.email_edu;
  console.log('Email recebido:', email);

  if (!email) {
    return res.redirect('/');
  }

  const sql = 'SELECT nome, coins FROM aluno WHERE email_edu = ?';
  connection.query(sql, [email], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Erro no servidor.');
    }

    console.log('Resultado do banco:', results);

    if (results.length === 0) {
      return res.redirect('/');
    }

    const user = results[0];
    res.render('alunoDashboard', { nome: user.nome, coins: user.coins });
  });
});

app.get('/ahacktons', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'aluno') {
    return res.redirect('/');
  }

  const email = req.session.user.email_edu;

  // Pega o ID do aluno pelo email
  const sqlAluno = 'SELECT ID_aluno FROM aluno WHERE email_edu = ?';
  connection.query(sqlAluno, [email], (err, alunoResults) => {
    if (err) {
      console.error('Erro ao buscar aluno:', err);
      return res.status(500).send('Erro no servidor.');
    }
    if (alunoResults.length === 0) {
      return res.redirect('/');
    }

    const alunoId = alunoResults[0].ID_aluno;

    // Hacktons em que o aluno está participando (independente do status)
    const sqlEmAndamento = `
      SELECT h.id_hackton, h.nome, h.data_inicio, h.data_fim, h.local, h.status
      FROM hackton h
      INNER JOIN participacao p ON h.id_hackton = p.hackton_id
      WHERE p.aluno_id = ?
      ORDER BY h.data_inicio ASC
    `;

    connection.query(sqlEmAndamento, [alunoId], (errAndamento, hacktonsAndamento) => {
      if (errAndamento) {
        console.error('Erro ao buscar hacktons em andamento:', errAndamento);
        return res.status(500).send('Erro ao carregar hacktons.');
      }

      // Hacktons disponíveis (status 'Em Aberto' e que o aluno não participa)
      const sqlDisponiveis = `
        SELECT h.id_hackton, h.nome, h.data_inicio, h.data_fim, h.local, h.status
        FROM hackton h
        WHERE h.status = 'Em Aberto' 
          AND h.id_hackton NOT IN (
            SELECT hackton_id FROM participacao WHERE aluno_id = ?
          )
        ORDER BY h.data_inicio ASC
      `;

      connection.query(sqlDisponiveis, [alunoId], (errDisp, hacktonsDisponiveis) => {
        if (errDisp) {
          console.error('Erro ao buscar hacktons disponíveis:', errDisp);
          return res.status(500).send('Erro ao carregar hacktons disponíveis.');
        }

        res.render('alunoHacktons', {
          emAndamento: hacktonsAndamento,
          emAberto: hacktonsDisponiveis
        });
      });
    });
  });
});

app.post('/participar/:idHackton', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'aluno') {
    return res.redirect('/');
  }

  const idHackton = req.params.idHackton;
  const email = req.session.user.email_edu;

  // Primeiro, pegar o ID do aluno pelo email
  const sqlAluno = 'SELECT ID_aluno FROM aluno WHERE email_edu = ?';

  connection.query(sqlAluno, [email], (err, alunoResults) => {
    if (err || alunoResults.length === 0) {
      console.error('Erro ao buscar aluno:', err);
      return res.status(500).send('Erro ao buscar aluno.');
    }

    const idAluno = alunoResults[0].ID_aluno;

    // Inserir a participação do aluno no hackton
    const sqlInsert = 'INSERT INTO participacao (aluno_id, hackton_id) VALUES (?, ?)';

    connection.query(sqlInsert, [idAluno, idHackton], (insertErr) => {
      if (insertErr) {
        if (insertErr.code === 'ER_DUP_ENTRY') {
          // Já participou, redireciona para a lista de hacktons
          return res.redirect('/ahacktons');
        }

        console.error('Erro ao registrar participação:', insertErr);
        return res.status(500).send('Erro ao registrar participação.');
      }

      // Atualizar o status do hackton para 'Em Andamento' se estiver 'Em Aberto'
      const sqlUpdateStatus = `
        UPDATE hackton
        SET status = 'Em Andamento'
        WHERE id_hackton = ? AND status = 'Em Aberto'
      `;

      connection.query(sqlUpdateStatus, [idHackton], (updateErr) => {
        if (updateErr) {
          console.error('Erro ao atualizar status do hackton:', updateErr);
          // Pode continuar mesmo assim
        }

        // Redirecionar para a lista de hacktons
        res.redirect('/ahacktons');
      });
    });
  });
});

app.get('/pdashboard', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'professor') {
    return res.redirect('/');
  }
    res.render('professorDashboard')
})

app.get('/pcadastroh', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'professor') {
    return res.redirect('/');
  }
    res.render('professorCadastroH')
})

app.post('/enviaPCadastroH', (req, res) => {
  if (!req.session.user || req.session.user.perfil !== 'professor') {
    return res.redirect('/');
  }

  const { nome, dataInscricaoMax, dataInicio, dataFim, local } = req.body;
  const fk_professor = req.session.user.id_professor; // ou id, conforme salvou no login

  const hoje = new Date().toISOString().split('T')[0];
  let status = 'Fechado';

  if (dataInicio > hoje) {
    status = 'Em Aberto';
  } else if (dataFim >= hoje) {
    status = 'Em Andamento';
  }

  const sql = `
    INSERT INTO hackton (nome, data_inscricao_max, data_inicio, data_fim, local, status, fk_professor)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [nome, dataInscricaoMax, dataInicio, dataFim, local, status, fk_professor];

  connection.query(sql, values, (error) => {
    if (error) {
      console.error('Erro ao cadastrar hackton:', error);
      return res.status(500).send('Erro ao cadastrar hackton.');
    }

    res.redirect('/pdashboard');
  });
})

app.get('/profile', (req, res) => {
  if (!req.session.user || (req.session.user.perfil !== 'professor' && req.session.user.perfil !== 'aluno')) {
    return res.redirect('/');
  }
    res.render('profile');
})
