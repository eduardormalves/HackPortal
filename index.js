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
      if (perfil === 'professor') {
        return res.redirect(`/pdashboard?nome=${encodeURIComponent(user.nome)}`);
      } else {
        // Passa o email_edu na query para usar na próxima requisição
        return res.redirect(`/adashboard?email_edu=${encodeURIComponent(user.email_edu)}`);
      }
    } else {
      return res.status(401).send('Login ou senha inválidos.');
    }
  });
});

app.get('/adashboard', (req, res) => {
  const email = req.query.email_edu;
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
    res.render('alunoHacktons');
})

app.get('/pdashboard', (req, res) => {
    res.render('professorDashboard')
})

app.get('/pcadastroh', (req, res) => {
    res.render('professorCadastroH')
})

app.get('/profile', (req, res) => {
    res.render('profile');
})
